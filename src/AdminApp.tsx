import { useCallback, useEffect, useRef, useState } from "react";

/* ─── types ─── */
type AdminColour  = { id: string; code: string; name: string; hex: string; family: string };
type AdminVariant = { id: string; product_id: string; size: string; price_kes: number };
type AdminProduct = { id: string; slug: string; name: string; blurb: string; category: string; image_url: string; variants: AdminVariant[] };
type AdminRoom    = { id: string; name: string; photo_url: string; wall_mask: string; sort_order: number };
type AdminOrder   = { id: string; name: string; email: string; phone: string; county: string; town: string; total_kes: number; status: string; mpesa_ref: string; created_at: string; items: AdminOrderItem[] };
type AdminOrderItem = { product_slug: string; colour_name: string; colour_hex: string; size: string; finish: string; quantity: number; unit_kes: number };
type DeliveryRate = { id: string; county: string; town: string | null; rate_kes: number; updated_at: string };
type StockEntry  = { id: string; product_id: string; product_name: string; product_slug: string; size: string; colour_id: string | null; colour_name: string | null; stock: number; low_stock_threshold: number };
type CustomerRow = { id: string; name: string; email: string; phone: string; county: string; town: string; order_count: number; total_spent_kes: number; last_order_at: string };

type DashboardData = {
  revenue: { today: number; this_week: number; this_month: number; all_time: number; total_orders: number; avg_order_value: number };
  byStatus: { status: string; count: number }[];
  topProducts: { name: string; slug: string; image_url: string; category: string; units_sold: number; revenue_kes: number; order_count: number }[];
  slowMovers: { name: string; slug: string; category: string; image_url: string; last_ordered: string | null }[];
  recentOrders: { id: string; name: string; email: string; phone: string; county: string; town: string; total_kes: number; status: string; mpesa_ref: string; created_at: string }[];
  mpesa: { total: number; success: number; cancelled: number; failed: number };
  byCounty: { county: string; orders: number; revenue_kes: number }[];
};

type Tab = "dashboard" | "colours" | "products" | "rooms" | "orders" | "delivery" | "stock" | "customers" | "staff";

const FAMILIES   = ["Neutrals","Warm Earth","Cool Green","Blue","Red & Terracotta","Yellow & Gold"];
const CATEGORIES = ["Paint","Primer","Supplies"];
const STATUSES   = ["pending","paid","processing","shipped","delivered","cancelled"];
const kes  = (n: number) => `KES ${Number(n).toLocaleString("en-KE")}`;
const slug = (s: string) => s.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (res.status === 401) { window.location.reload(); throw new Error("Session expired"); }
  if (!res.ok) { const t = await res.text(); throw new Error(t || `${res.status}`); }
  if (res.status === 204) return null;
  return res.json();
}

/* ─── CSV export helper ─── */
function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => {
      const v = String(r[h] ?? "").replace(/"/g, '""');
      return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v}"` : v;
    }).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* ─── WhatsApp helper ─── */
function waLink(phone: string, msg: string) {
  const clean = phone.replace(/\D/g, "");
  const intl  = clean.startsWith("0") ? "254" + clean.slice(1) : clean;
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
}

/* ─── shared UI ─── */
const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div style={{ width:32, height:32, border:"3px solid #ebe2d2", borderTopColor:"#B84A32", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
  </div>
);

function Btn({ children, onClick, variant="primary", size="md", disabled, type="button" }: {
  children: React.ReactNode; onClick?: () => void; variant?: "primary"|"ghost"|"danger"|"outline";
  size?: "sm"|"md"; disabled?: boolean; type?: "button"|"submit";
}) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-[10px] font-[600] transition-all disabled:opacity-40 cursor-pointer";
  const sz   = size==="sm" ? "px-3 py-1.5 text-[12px]" : "px-4 py-2 text-[13px]";
  const v    = variant==="primary" ? "bg-[#B84A32] text-white hover:bg-[#9f3c28]"
             : variant==="danger"  ? "bg-[#fff0ee] text-[#a43a25] hover:bg-[#ffe0db] border border-[#f5c8be]"
             : variant==="outline" ? "border border-[#d8ccb8] text-[#2B2B2E] hover:bg-[#f5f0e8]"
             : "text-[#6f6a62] hover:bg-[#f0ebe2]";
  return <button type={type} className={`${base} ${sz} ${v}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-[700] uppercase tracking-wide mb-1" style={{ color:"#6f6a62" }}>{label}</span>
      {children}
      {hint && <span className="block text-[11px] mt-1" style={{ color:"#9b9589" }}>{hint}</span>}
    </label>
  );
}

const inp = "w-full px-3 py-2 rounded-[10px] border border-[#d8ccb8] text-[13px] bg-white focus:outline-none focus:border-[#B84A32] transition";
const sel = "w-full px-3 py-2 rounded-[10px] border border-[#d8ccb8] text-[13px] bg-white focus:outline-none focus:border-[#B84A32] transition";

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative bg-white rounded-[20px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${wide ? "w-full max-w-2xl" : "w-full max-w-md"}`}
        style={{ border:"1px solid #ebe2d2" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor:"#ebe2d2" }}>
          <h3 className="font-[700] text-[16px]" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f5f0e8] text-[#6f6a62]">✕</button>
        </div>
        <div className="overflow-y-auto px-6 py-5 flex-1">{children}</div>
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string,string> = {
    pending:"bg-yellow-50 text-yellow-700 border-yellow-200",
    paid:"bg-green-50 text-green-700 border-green-200",
    processing:"bg-blue-50 text-blue-700 border-blue-200",
    shipped:"bg-purple-50 text-purple-700 border-purple-200",
    delivered:"bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled:"bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`text-[11px] font-[600] px-2 py-0.5 rounded-full border ${map[s] ?? "bg-gray-50 text-gray-700"}`}>{s}</span>;
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v:string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9589] text-[13px]">🔍</span>
      <input
        className={inp + " pl-8"}
        placeholder={placeholder ?? "Search…"}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════ */
export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/login", { credentials: "include" })
      .then(r => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#F8F4EF" }}>
      <div style={{ width:32, height:32, border:"3px solid #ebe2d2", borderTopColor:"#B84A32", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
    </div>
  );
  if (!authed) return <LoginPage onSuccess={() => setAuthed(true)} />;
  return <Dashboard onLogout={async () => {
    await fetch("/api/admin/login", { method:"DELETE", credentials:"include" }).catch(() => {});
    setAuthed(false);
  }} />;
}

/* ─── Login ─── */
function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw]       = useState("");
  const [err, setErr]     = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setLoading(true);
    try {
      const r = await fetch("/api/admin/login", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ password: pw }),
      });
      if (!r.ok) throw new Error();
      onSuccess();
    } catch { setErr("Wrong password - try again"); }
    finally   { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background:"#F8F4EF", fontFamily:'"Inter",system-ui,sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background:"#B84A32" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <h1 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:26, fontWeight:600, color:"#2B2B2E" }}>MicMikes Admin</h1>
          <p className="text-[13px] mt-1" style={{ color:"#6f6a62" }}>Manage colours, products & rooms</p>
        </div>
        <div className="bg-white rounded-[20px] p-7 shadow-lg" style={{ border:"1px solid #ebe2d2" }}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Admin password">
              <input type="password" className={inp} value={pw} onChange={e=>setPw(e.target.value)} autoFocus placeholder="Enter password" />
            </Field>
            {err && <p className="text-[12px] px-3 py-2 rounded-lg" style={{ background:"#fff0ee", color:"#a43a25" }}>{err}</p>}
            <button type="submit" disabled={loading || !pw} className="w-full py-3 rounded-[12px] text-white text-[14px] font-[600] disabled:opacity-40 transition"
              style={{ background:"#B84A32" }}>
              {loading ? "Signing in…" : "Sign in →"}
            </button>
          </form>
        </div>
        <p className="text-center text-[12px] mt-6" style={{ color:"#9b9589" }}>
          <a href="/" className="hover:underline">← Back to site</a>
        </p>
      </div>
    </div>
  );
}

/* ─── Dashboard shell ─── */
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState("");
  const showToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); }, []);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id:"dashboard", label:"Dashboard", icon:"📊" },
    { id:"colours",   label:"Colours",   icon:"🎨" },
    { id:"products",  label:"Products",  icon:"🪣" },
    { id:"rooms",     label:"Rooms",     icon:"🏠" },
    { id:"orders",    label:"Orders",    icon:"📦" },
    { id:"delivery",  label:"Delivery",  icon:"🚚" },
    { id:"stock",     label:"Stock",     icon:"📋" },
    { id:"customers", label:"Customers", icon:"👤" },
    { id:"staff",     label:"Staff",     icon:"👥" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background:"#F8F4EF", fontFamily:'"Inter",system-ui,sans-serif', color:"#2B2B2E" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; }
      `}</style>

      {/* header */}
      <header className="bg-white border-b sticky top-0 z-30" style={{ borderColor:"#ebe2d2" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:"#B84A32" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <span style={{ fontFamily:'"Playfair Display",Georgia,serif', fontWeight:600, fontSize:17 }}>Admin</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background:"#f5ede3", color:"#B84A32", fontWeight:600 }}>MicMikes Paints</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" target="_blank" rel="noopener noreferrer">
              <Btn variant="outline" size="sm">View site ↗</Btn>
            </a>
            <Btn variant="ghost" size="sm" onClick={onLogout}>Log out</Btn>
          </div>
        </div>
      </header>

      {/* tab nav */}
      <div className="bg-white border-b" style={{ borderColor:"#ebe2d2" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-[600] border-b-2 transition whitespace-nowrap"
              style={{ borderColor: tab===t.id ? "#B84A32" : "transparent", color: tab===t.id ? "#B84A32" : "#6f6a62" }}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">
        {tab==="dashboard" && <DashboardTab showToast={showToast} />}
        {tab==="colours"   && <ColoursTab   showToast={showToast} />}
        {tab==="products"  && <ProductsTab  showToast={showToast} />}
        {tab==="rooms"     && <RoomsTab     showToast={showToast} />}
        {tab==="orders"    && <OrdersTab    showToast={showToast} />}
        {tab==="delivery"  && <DeliveryTab  showToast={showToast} />}
        {tab==="stock"     && <StockTab     showToast={showToast} />}
        {tab==="customers" && <CustomersTab showToast={showToast} />}
        {tab==="staff"     && <StaffTab     showToast={showToast} />}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full text-white text-[13px] font-[600] shadow-lg"
          style={{ background:"#2B2B2E", animation:"slideUp 0.2s ease" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════
   DASHBOARD TAB
════════════════════════════════════════════════ */
function DashboardTab({ showToast }: { showToast: (m:string) => void }) {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [saleModal, setSaleModal] = useState<{ name: string; slug: string } | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, stockData] = await Promise.all([
        api("/api/admin/dashboard"),
        api("/api/admin/stock").catch(() => [] as StockEntry[]),
      ]);
      setData(d);
      setLastRefresh(new Date());
      const entries: StockEntry[] = stockData ?? [];
      setLowStockCount(entries.filter(s => s.stock <= s.low_stock_threshold).length);
    } catch (e) { showToast(`Dashboard error: ${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 5 * 60 * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  if (loading) return <Spinner />;
  if (!data)   return <p className="text-[13px]" style={{color:"#9b9589"}}>No data available yet.</p>;

  const { revenue, byStatus, topProducts, slowMovers, recentOrders, mpesa, byCounty } = data;

  const statusOrder = ["pending","paid","processing","shipped","delivered","cancelled"];
  const statusColours: Record<string,string> = {
    pending:"#d97706", paid:"#16a34a", processing:"#2563eb",
    shipped:"#7c3aed", delivered:"#059669", cancelled:"#dc2626",
  };
  const statusMap = Object.fromEntries(byStatus.map(r => [r.status, Number(r.count)]));

  const mpesaRate = mpesa.total > 0 ? Math.round((mpesa.success / mpesa.total) * 100) : 0;

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-KE", { day:"numeric", month:"short" }) : "Never";
  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff/60000); const h = Math.floor(m/60); const dy = Math.floor(h/24);
    if (dy > 0) return `${dy}d ago`; if (h > 0) return `${h}h ago`; return `${m}m ago`;
  };

  const pendingOrders = recentOrders.filter(o => o.status === "pending");

  const exportDashboardCSV = () => {
    downloadCSV("micmikes-dashboard.csv", byCounty.map(r => ({
      County: r.county,
      Orders: r.orders,
      Revenue_KES: r.revenue_kes,
    })));
  };

  return (
    <div className="space-y-8">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Dashboard</h2>
          <p className="text-[12px] mt-0.5" style={{ color:"#9b9589" }}>Auto-refreshes every 5 min · Last: {lastRefresh.toLocaleTimeString("en-KE")}</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" size="sm" onClick={exportDashboardCSV}>⬇ Export CSV</Btn>
          <Btn variant="outline" onClick={load}>↻ Refresh</Btn>
        </div>
      </div>

      {/* Pending Orders Triage */}
      {pendingOrders.length > 0 && (
        <div className="rounded-[16px] p-5" style={{ background:"#fffbf0", border:"1px solid #f5e2a0" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[13px] font-[700]" style={{ color:"#92400e" }}>⚠️ {pendingOrders.length} Pending Order{pendingOrders.length > 1 ? "s" : ""} need attention</span>
          </div>
          <div className="space-y-2">
            {pendingOrders.slice(0, 5).map(o => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-[10px] px-4 py-3" style={{ border:"1px solid #ebe2d2" }}>
                <div>
                  <span className="text-[13px] font-[600]">{o.name}</span>
                  <span className="text-[12px] ml-2" style={{ color:"#9b9589" }}>{o.county} · {kes(o.total_kes)}</span>
                  <span className="text-[11px] ml-2" style={{ color:"#9b9589" }}>{timeAgo(o.created_at)}</span>
                </div>
                <div className="flex gap-2">
                  <a href={waLink(o.phone, `Hi ${o.name}, your MicMikes Paints order of ${kes(o.total_kes)} is confirmed. Please send M-Pesa to 0700000000 Ref: ${o.id.slice(0,8).toUpperCase()}`)} target="_blank" rel="noopener noreferrer">
                    <Btn variant="outline" size="sm">💬 WhatsApp</Btn>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          { label:"Today",       value: revenue.today,       sub:"revenue" },
          { label:"This Week",   value: revenue.this_week,   sub:"revenue" },
          { label:"This Month",  value: revenue.this_month,  sub:"revenue" },
          { label:"All Time",    value: revenue.all_time,    sub:"total revenue" },
        ] as {label:string;value:number;sub:string}[]).map(card => (
          <div key={card.label} className="bg-white rounded-[16px] p-5" style={{ border:"1px solid #ebe2d2" }}>
            <p className="text-[11px] font-[700] uppercase tracking-wide" style={{ color:"#9b9589" }}>{card.label}</p>
            <p className="text-[22px] font-[700] mt-1" style={{ color:"#B84A32", fontFamily:'"Playfair Display",Georgia,serif' }}>
              {kes(card.value)}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-[16px] p-5" style={{ border:"1px solid #ebe2d2" }}>
          <p className="text-[11px] font-[700] uppercase tracking-wide" style={{ color:"#9b9589" }}>Total Orders</p>
          <p className="text-[28px] font-[700] mt-1" style={{ color:"#2B2B2E" }}>{Number(revenue.total_orders).toLocaleString()}</p>
          <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>all time (excl. cancelled)</p>
        </div>
        <div className="bg-white rounded-[16px] p-5" style={{ border:"1px solid #ebe2d2" }}>
          <p className="text-[11px] font-[700] uppercase tracking-wide" style={{ color:"#9b9589" }}>Avg Order Value</p>
          <p className="text-[28px] font-[700] mt-1" style={{ color:"#2B2B2E" }}>{kes(revenue.avg_order_value)}</p>
          <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>per paid order</p>
        </div>
        <div className="bg-white rounded-[16px] p-5" style={{ border:"1px solid #ebe2d2" }}>
          <p className="text-[11px] font-[700] uppercase tracking-wide" style={{ color:"#9b9589" }}>M-Pesa Success</p>
          <p className="text-[28px] font-[700] mt-1" style={{ color: mpesaRate >= 80 ? "#16a34a" : "#d97706" }}>{mpesaRate}%</p>
          <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>{mpesa.success}/{mpesa.total} transactions</p>
        </div>
        <div className="bg-white rounded-[16px] p-5 relative" style={{ border:"1px solid #ebe2d2" }}>
          {lowStockCount > 0 && (
            <span
              className="absolute top-3 right-3 text-[10px] font-[700] px-2 py-0.5 rounded-full"
              style={{ background:"#dc2626", color:"#fff" }}
              title={`${lowStockCount} variant${lowStockCount > 1 ? "s" : ""} below stock threshold`}
            >
              {lowStockCount} low stock
            </span>
          )}
          <p className="text-[11px] font-[700] uppercase tracking-wide" style={{ color:"#9b9589" }}>Pending Orders</p>
          <p className="text-[28px] font-[700] mt-1" style={{ color: statusMap["pending"] > 0 ? "#d97706" : "#2B2B2E" }}>
            {statusMap["pending"] ?? 0}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>awaiting payment</p>
        </div>
      </div>

      {/* Order Status Breakdown */}
      <div className="bg-white rounded-[16px] p-6" style={{ border:"1px solid #ebe2d2" }}>
        <h3 className="font-[700] text-[15px] mb-4" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>Order Status Breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {statusOrder.map(s => (
            <div key={s} className="rounded-[12px] p-4 text-center" style={{ background:"#f8f4ef" }}>
              <p className="text-[22px] font-[700]" style={{ color: statusColours[s] }}>{statusMap[s] ?? 0}</p>
              <p className="text-[11px] font-[600] mt-1 capitalize" style={{ color:"#6f6a62" }}>{s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue by County */}
      {byCounty.length > 0 && (
        <div className="bg-white rounded-[16px] p-6" style={{ border:"1px solid #ebe2d2" }}>
          <h3 className="font-[700] text-[15px] mb-4" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>Revenue by County</h3>
          <div className="space-y-2">
            {byCounty.slice(0,8).map(r => {
              const max = byCounty[0]?.revenue_kes ?? 1;
              const pct = Math.round((r.revenue_kes / max) * 100);
              return (
                <div key={r.county} className="flex items-center gap-3">
                  <span className="text-[12px] font-[600] w-28 shrink-0">{r.county}</span>
                  <div className="flex-1 h-2 rounded-full" style={{ background:"#f0ebe2" }}>
                    <div className="h-2 rounded-full" style={{ width:`${pct}%`, background:"#B84A32" }} />
                  </div>
                  <span className="text-[12px] font-[600] w-28 text-right shrink-0">{kes(r.revenue_kes)}</span>
                  <span className="text-[11px] w-10 text-right shrink-0" style={{ color:"#9b9589" }}>{r.orders} ord.</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Products */}
      {topProducts.length > 0 && (
        <div className="bg-white rounded-[16px] p-6" style={{ border:"1px solid #ebe2d2" }}>
          <h3 className="font-[700] text-[15px] mb-4" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>Top Products</h3>
          <div className="space-y-3">
            {topProducts.map((p, i) => (
              <div key={p.slug} className="flex items-center gap-3">
                <span className="text-[13px] font-[700] w-5 text-center" style={{ color:"#9b9589" }}>{i+1}</span>
                <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-[8px] object-cover" style={{ border:"1px solid #ebe2d2" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-[600] truncate">{p.name}</p>
                  <p className="text-[11px]" style={{ color:"#9b9589" }}>{p.units_sold} units · {p.order_count} orders</p>
                </div>
                <span className="text-[13px] font-[700]" style={{ color:"#B84A32" }}>{kes(p.revenue_kes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slow Movers */}
      {slowMovers.length > 0 && (
        <div className="bg-white rounded-[16px] p-6" style={{ border:"1px solid #ebe2d2" }}>
          <h3 className="font-[700] text-[15px] mb-4" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>Slow-Moving Products</h3>
          <div className="space-y-3">
            {slowMovers.map(p => (
              <div key={p.slug} className="flex items-center gap-3">
                <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-[8px] object-cover" style={{ border:"1px solid #ebe2d2" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-[600] truncate">{p.name}</p>
                  <p className="text-[11px]" style={{ color:"#9b9589" }}>Last ordered: {fmt(p.last_ordered)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] px-2 py-1 rounded-full" style={{ background:"#fff0ee", color:"#a43a25", fontWeight:600 }}>slow</span>
                  <Btn size="sm" variant="outline" onClick={() => setSaleModal({ name: p.name, slug: p.slug })}>🏷 Mark on Sale</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Orders */}
      {recentOrders.length > 0 && (
        <div className="bg-white rounded-[16px] p-6" style={{ border:"1px solid #ebe2d2" }}>
          <h3 className="font-[700] text-[15px] mb-4" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>Recent Orders</h3>
          <div className="space-y-2">
            {recentOrders.slice(0, 8).map(o => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-[10px]" style={{ background:"#f8f4ef" }}>
                <div>
                  <span className="text-[13px] font-[600]">{o.name}</span>
                  <span className="text-[12px] ml-2" style={{ color:"#9b9589" }}>{o.county}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge s={o.status} />
                  <span className="text-[13px] font-[700]">{kes(o.total_kes)}</span>
                  <span className="text-[11px]" style={{ color:"#9b9589" }}>{timeAgo(o.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mark on Sale Modal */}
      {saleModal && (
        <SaleModal
          product={saleModal}
          onClose={() => setSaleModal(null)}
          onSaved={(pct) => { setSaleModal(null); showToast(`${saleModal.name} marked ${pct}% off`); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

/* ─── Mark on Sale modal ─── */
function SaleModal({ product, onClose, onSaved, showToast }: {
  product: { name: string; slug: string };
  onClose: () => void;
  onSaved: (pct: number) => void;
  showToast: (m: string) => void;
}) {
  const [pct, setPct]     = useState(10);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pct <= 0 || pct >= 100) { showToast("Enter a discount between 1–99%"); return; }
    setSaving(true);
    try {
      await api(`/api/admin/products/${product.slug}/sale`, {
        method: "PATCH",
        body: JSON.stringify({ discount_pct: pct }),
      });
      onSaved(pct);
    } catch (err) { showToast(`${err}`); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={`Mark on Sale — ${product.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        <div className="rounded-[12px] p-4" style={{ background:"#f8f4ef" }}>
          <p className="text-[12px]" style={{ color:"#6f6a62" }}>
            This will apply a percentage discount to <strong>all variants</strong> of this product.
            The original price is stored so you can reverse it later.
          </p>
        </div>
        <Field label="Discount %" hint="e.g. 15 = 15% off all variant prices">
          <input
            className={inp}
            type="number"
            min={1} max={99}
            value={pct}
            onChange={e => setPct(Number(e.target.value))}
          />
        </Field>
        {pct > 0 && pct < 100 && (
          <p className="text-[12px] px-3 py-2 rounded-[8px]" style={{ background:"#f0fdf4", color:"#16a34a", fontWeight:600 }}>
            ✓ {pct}% off will be applied to all {product.name} variants
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Btn type="submit" disabled={saving}>{saving ? "Applying…" : `Apply ${pct}% discount`}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </form>
    </Modal>
  );
}

/* ════════════════════════════════════════════════
   COLOURS TAB
════════════════════════════════════════════════ */
function ColoursTab({ showToast }: { showToast: (m:string) => void }) {
  const [colours, setColours] = useState<AdminColour[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<"new"|AdminColour|null>(null);
  const [search, setSearch]   = useState("");
  const [filterFamily, setFilterFamily] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setColours(await api("/api/admin/colours")); }
    catch (e) { showToast(`${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = colours.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.family.toLowerCase().includes(q);
    const matchFamily = !filterFamily || c.family === filterFamily;
    return matchSearch && matchFamily;
  });

  const grouped = FAMILIES.map(f => ({ family:f, items: filtered.filter(c => c.family===f) })).filter(g => g.items.length > 0);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:22, fontWeight:600 }}>Colours <span className="text-[#9b9589] text-[16px] font-normal">({colours.length})</span></h2>
        <Btn onClick={() => setModal("new")}>+ Add colour</Btn>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, code, family…" />
        </div>
        <select className={sel + " w-auto"} value={filterFamily} onChange={e => setFilterFamily(e.target.value)}>
          <option value="">All families</option>
          {FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {filtered.length === 0 && (
        <p className="text-[13px] py-8 text-center" style={{ color:"#9b9589" }}>No colours match your search.</p>
      )}

      {grouped.map(g => (
        <div key={g.family}>
          <h3 className="text-[12px] font-[700] uppercase tracking-wide mb-3" style={{ color:"#9b9589" }}>{g.family}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {g.items.map(c => (
              <button key={c.id} onClick={() => setModal(c)}
                className="bg-white rounded-[14px] p-3 text-left hover:shadow-md transition" style={{ border:"1px solid #ebe2d2" }}>
                <div className="w-full h-12 rounded-[8px] mb-2" style={{ background: c.hex, border:"1px solid rgba(0,0,0,0.08)" }} />
                <p className="text-[12px] font-[700] truncate">{c.name}</p>
                <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>{c.code}</p>
              </button>
            ))}
          </div>
        </div>
      ))}

      {modal && (
        <ColourModal
          colour={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); showToast(modal === "new" ? "Colour added" : "Colour updated"); }}
          onDeleted={() => { setModal(null); load(); showToast("Colour deleted"); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function ColourModal({ colour, onClose, onSaved, onDeleted, showToast }: {
  colour: AdminColour | null; onClose: () => void; onSaved: () => void; onDeleted: () => void; showToast: (m:string) => void;
}) {
  const [form, setForm] = useState({ code: colour?.code ?? "", name: colour?.name ?? "", hex: colour?.hex ?? "#ffffff", family: colour?.family ?? FAMILIES[0] });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      if (colour) await api(`/api/admin/colours/${colour.id}`, { method:"PATCH", body: JSON.stringify(form) });
      else        await api("/api/admin/colours", { method:"POST", body: JSON.stringify(form) });
      onSaved();
    } catch (err) { showToast(`${err}`); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!colour || !confirm(`Delete ${colour.name}?`)) return;
    try { await api(`/api/admin/colours/${colour.id}`, { method:"DELETE" }); onDeleted(); }
    catch (err) { showToast(`${err}`); }
  };

  return (
    <Modal title={colour ? "Edit Colour" : "New Colour"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Code"><input className={inp} value={form.code} onChange={set("code")} placeholder="e.g. MM-001" required /></Field>
        <Field label="Name"><input className={inp} value={form.name} onChange={set("name")} placeholder="e.g. Masai Red" required /></Field>
        <Field label="Family">
          <select className={sel} value={form.family} onChange={set("family")}>
            {FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Hex colour">
          <div className="flex gap-2 items-center">
            <input type="color" value={form.hex} onChange={set("hex")} className="w-10 h-10 rounded cursor-pointer border border-[#d8ccb8]" />
            <input className={inp} value={form.hex} onChange={set("hex")} placeholder="#B84A32" />
          </div>
        </Field>
        <div className="flex gap-2 pt-2">
          <Btn type="submit" disabled={saving}>{saving ? "Saving…" : colour ? "Save changes" : "Add colour"}</Btn>
          {colour && <Btn variant="danger" onClick={del}>Delete</Btn>}
        </div>
      </form>
    </Modal>
  );
}

/* ════════════════════════════════════════════════
   PRODUCTS TAB
════════════════════════════════════════════════ */
function ProductsTab({ showToast }: { showToast: (m:string) => void }) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState<"new"|AdminProduct|null>(null);
  const [search, setSearch]     = useState("");
  const [filterCat, setFilterCat] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts(await api("/api/admin/products")); }
    catch (e) { showToast(`${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    const matchCat = !filterCat || p.category === filterCat;
    return matchSearch && matchCat;
  });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:22, fontWeight:600 }}>Products <span className="text-[#9b9589] text-[16px] font-normal">({products.length})</span></h2>
        <Btn onClick={() => setModal("new")}>+ Add product</Btn>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, slug, category…" />
        </div>
        <select className={sel + " w-auto"} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 && (
        <p className="text-[13px] py-8 text-center" style={{ color:"#9b9589" }}>No products match your search.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(p => (
          <button key={p.id} onClick={() => setModal(p)}
            className="bg-white rounded-[16px] p-4 text-left hover:shadow-md transition" style={{ border:"1px solid #ebe2d2" }}>
            <img src={p.image_url} alt={p.name} className="w-full h-32 object-cover rounded-[10px] mb-3" style={{ border:"1px solid #ebe2d2" }} />
            <p className="text-[14px] font-[700]">{p.name}</p>
            <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>{p.category} · {p.variants.length} variant{p.variants.length!==1?"s":""}</p>
            <p className="text-[12px] mt-1 line-clamp-2" style={{ color:"#6f6a62" }}>{p.blurb}</p>
          </button>
        ))}
      </div>

      {modal && (
        <ProductModal
          product={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); showToast(modal === "new" ? "Product added" : "Product updated"); }}
          onDeleted={() => { setModal(null); load(); showToast("Product deleted"); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function ProductModal({ product, onClose, onSaved, onDeleted, showToast }: {
  product: AdminProduct | null; onClose: () => void; onSaved: () => void; onDeleted: () => void; showToast: (m:string) => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? "", slug: product?.slug ?? "", blurb: product?.blurb ?? "",
    category: product?.category ?? CATEGORIES[0], image_url: product?.image_url ?? "",
  });
  const [variants, setVariants] = useState<Omit<AdminVariant,"product_id">[]>(product?.variants ?? []);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const autoSlug = () => setForm(f => ({ ...f, slug: slug(f.name) }));

  const addVariant = () => setVariants(v => [...v, { id: `new-${Date.now()}`, size:"1L", price_kes:0 }]);
  const updateVariant = (i: number, k: "size"|"price_kes", v: string|number) =>
    setVariants(arr => arr.map((x,j) => j===i ? { ...x, [k]:v } : x));
  const removeVariant = (i: number) => setVariants(arr => arr.filter((_,j) => j!==i));

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const body = { ...form, variants };
      if (product) await api(`/api/admin/products/${product.id}`, { method:"PATCH", body: JSON.stringify(body) });
      else         await api("/api/admin/products", { method:"POST", body: JSON.stringify(body) });
      onSaved();
    } catch (err) { showToast(`${err}`); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!product || !confirm(`Delete ${product.name}?`)) return;
    try { await api(`/api/admin/products/${product.id}`, { method:"DELETE" }); onDeleted(); }
    catch (err) { showToast(`${err}`); }
  };

  return (
    <Modal title={product ? "Edit Product" : "New Product"} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">
          <input className={inp} value={form.name} onChange={set("name")} onBlur={() => !product && autoSlug()} required />
        </Field>
        <Field label="Slug" hint="Auto-generated from name. URL-safe.">
          <input className={inp} value={form.slug} onChange={set("slug")} required />
        </Field>
        <Field label="Category">
          <select className={sel} value={form.category} onChange={set("category")}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Blurb">
          <textarea className={inp} rows={3} value={form.blurb} onChange={set("blurb")} />
        </Field>
        <Field label="Image URL">
          <input className={inp} value={form.image_url} onChange={set("image_url")} placeholder="https://…" />
        </Field>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-[700] uppercase tracking-wide" style={{ color:"#6f6a62" }}>Variants (size & price)</span>
            <Btn size="sm" variant="outline" onClick={addVariant}>+ Add</Btn>
          </div>
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={v.id} className="flex gap-2 items-center">
                <input className={inp} value={v.size} placeholder="e.g. 4L" onChange={e => updateVariant(i,"size",e.target.value)} />
                <input className={inp} type="number" value={v.price_kes} placeholder="Price KES" onChange={e => updateVariant(i,"price_kes",Number(e.target.value))} />
                <button type="button" onClick={() => removeVariant(i)} className="text-[#a43a25] hover:text-[#7a2510] text-[18px] leading-none">×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Btn type="submit" disabled={saving}>{saving ? "Saving…" : product ? "Save changes" : "Add product"}</Btn>
          {product && <Btn variant="danger" onClick={del}>Delete</Btn>}
        </div>
      </form>
    </Modal>
  );
}

/* ════════════════════════════════════════════════
   ROOMS TAB
════════════════════════════════════════════════ */
function RoomsTab({ showToast }: { showToast: (m:string) => void }) {
  const [rooms, setRooms]   = useState<AdminRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState<"new"|AdminRoom|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRooms(await api("/api/admin/rooms")); }
    catch (e) { showToast(`${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:22, fontWeight:600 }}>Rooms <span className="text-[#9b9589] text-[16px] font-normal">({rooms.length})</span></h2>
        <Btn onClick={() => setModal("new")}>+ Add room</Btn>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map(r => (
          <button key={r.id} onClick={() => setModal(r)}
            className="bg-white rounded-[16px] overflow-hidden text-left hover:shadow-md transition" style={{ border:"1px solid #ebe2d2" }}>
            <img src={r.photo_url} alt={r.name} className="w-full h-40 object-cover" />
            <div className="p-4">
              <p className="text-[14px] font-[700]">{r.name}</p>
              <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>Sort: {r.sort_order}</p>
            </div>
          </button>
        ))}
      </div>
      {modal && (
        <RoomModal
          room={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); showToast(modal === "new" ? "Room added" : "Room updated"); }}
          onDeleted={() => { setModal(null); load(); showToast("Room deleted"); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function RoomModal({ room, onClose, onSaved, onDeleted, showToast }: {
  room: AdminRoom | null; onClose: () => void; onSaved: () => void; onDeleted: () => void; showToast: (m:string) => void;
}) {
  const [form, setForm] = useState({
    name: room?.name ?? "", photo_url: room?.photo_url ?? "",
    wall_mask: room?.wall_mask ?? "", sort_order: room?.sort_order ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: k==="sort_order" ? Number(e.target.value) : e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      if (room) await api(`/api/admin/rooms/${room.id}`, { method:"PATCH", body: JSON.stringify(form) });
      else      await api("/api/admin/rooms", { method:"POST", body: JSON.stringify(form) });
      onSaved();
    } catch (err) { showToast(`${err}`); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!room || !confirm(`Delete ${room.name}?`)) return;
    try { await api(`/api/admin/rooms/${room.id}`, { method:"DELETE" }); onDeleted(); }
    catch (err) { showToast(`${err}`); }
  };

  return (
    <Modal title={room ? "Edit Room" : "New Room"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Room name"><input className={inp} value={form.name} onChange={set("name")} required /></Field>
        <Field label="Photo URL"><input className={inp} value={form.photo_url} onChange={set("photo_url")} /></Field>
        <Field label="Wall mask URL" hint="SVG/PNG overlay for colour preview"><input className={inp} value={form.wall_mask} onChange={set("wall_mask")} /></Field>
        <Field label="Sort order"><input className={inp} type="number" value={form.sort_order} onChange={set("sort_order")} /></Field>
        <div className="flex gap-2 pt-2">
          <Btn type="submit" disabled={saving}>{saving ? "Saving…" : room ? "Save changes" : "Add room"}</Btn>
          {room && <Btn variant="danger" onClick={del}>Delete</Btn>}
        </div>
      </form>
    </Modal>
  );
}

/* ════════════════════════════════════════════════
   ORDERS TAB
════════════════════════════════════════════════ */
function OrdersTab({ showToast }: { showToast: (m:string) => void }) {
  const [orders, setOrders]     = useState<AdminOrder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("");
  const [search, setSearch]     = useState("");
  const [detail, setDetail]     = useState<AdminOrder|null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("paid");
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setOrders(await api("/api/admin/orders")); }
    catch (e) { showToast(`${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter(o => {
    const matchStatus = !filter || o.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || o.name.toLowerCase().includes(q) || o.phone.includes(q) || o.mpesa_ref.toLowerCase().includes(q) || o.county.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => {
    if (selected.size === filtered.length) { setSelected(new Set()); }
    else { setSelected(new Set(filtered.map(o => o.id))); }
  };
  const clearSelection = () => setSelected(new Set());

  const bulkUpdate = async () => {
    if (!selected.size) return;
    setBulkSaving(true);
    try {
      await api("/api/admin/orders/bulk-status", {
        method: "PATCH",
        body: JSON.stringify({ ids: Array.from(selected), status: bulkStatus }),
      });
      showToast(`${selected.size} order${selected.size > 1 ? "s" : ""} → ${bulkStatus}`);
      clearSelection();
      await load();
    } catch (err) { showToast(`${err}`); }
    finally { setBulkSaving(false); }
  };

  const exportOrdersCSV = () => {
    downloadCSV("micmikes-orders.csv", filtered.map(o => ({
      ID: o.id,
      Name: o.name,
      Phone: o.phone,
      Email: o.email,
      County: o.county,
      Town: o.town,
      Total_KES: o.total_kes,
      Status: o.status,
      Mpesa_Ref: o.mpesa_ref,
      Created: o.created_at,
    })));
  };

  const fmt = (d: string) => new Date(d).toLocaleString("en-KE", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:22, fontWeight:600 }}>Orders <span className="text-[#9b9589] text-[16px] font-normal">({orders.length})</span></h2>
        <Btn variant="outline" size="sm" onClick={exportOrdersCSV}>⬇ Export CSV</Btn>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={setSearch} placeholder="Name, phone, M-Pesa ref, county…" />
        </div>
        <select className={sel + " w-auto"} value={filter} onChange={e => { setFilter(e.target.value); clearSelection(); }}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-[12px]" style={{ background:"#f0fdf4", border:"1px solid #bbf7d0" }}>
          <span className="text-[13px] font-[600]" style={{ color:"#16a34a" }}>{selected.size} selected</span>
          <select className={sel + " w-auto"} value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <Btn size="sm" onClick={bulkUpdate} disabled={bulkSaving}>{bulkSaving ? "Updating…" : "Apply to selected"}</Btn>
          <Btn size="sm" variant="ghost" onClick={clearSelection}>Clear</Btn>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-[13px] py-8 text-center" style={{ color:"#9b9589" }}>No orders match your filters.</p>
      )}

      <div className="space-y-2">
        {/* select-all row */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2">
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleAll} className="w-4 h-4 accent-[#B84A32]" />
            <span className="text-[11px] font-[600] uppercase tracking-wide" style={{ color:"#9b9589" }}>Select all ({filtered.length})</span>
          </div>
        )}

        {filtered.map(o => (
          <div key={o.id} className="bg-white rounded-[14px] px-4 py-3 flex flex-wrap items-center gap-3 hover:shadow-sm transition"
            style={{ border:"1px solid #ebe2d2" }}>
            <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleOne(o.id)}
              className="w-4 h-4 accent-[#B84A32] shrink-0" />
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetail(o)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-[700]">{o.name}</span>
                <StatusBadge s={o.status} />
                <span className="text-[13px] font-[700]" style={{ color:"#B84A32" }}>{kes(o.total_kes)}</span>
              </div>
              <div className="flex flex-wrap gap-3 mt-0.5">
                <span className="text-[11px]" style={{ color:"#9b9589" }}>{o.phone}</span>
                <span className="text-[11px]" style={{ color:"#9b9589" }}>{o.county}{o.town ? `, ${o.town}` : ""}</span>
                {o.mpesa_ref && <span className="text-[11px]" style={{ color:"#9b9589" }}>M-Pesa: {o.mpesa_ref}</span>}
                <span className="text-[11px]" style={{ color:"#9b9589" }}>{fmt(o.created_at)}</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <a href={waLink(o.phone, `Hi ${o.name}, your MicMikes Paints order (${kes(o.total_kes)}) status: ${o.status}. Questions? Reply here.`)}
                target="_blank" rel="noopener noreferrer">
                <Btn variant="outline" size="sm">💬 WA</Btn>
              </a>
              <Btn variant="outline" size="sm" onClick={() => setDetail(o)}>View</Btn>
            </div>
          </div>
        ))}
      </div>

      {detail && <OrderDetailModal order={detail} onClose={() => setDetail(null)} onUpdated={() => { setDetail(null); load(); showToast("Order updated"); }} showToast={showToast} />}
    </div>
  );
}

function OrderDetailModal({ order, onClose, onUpdated, showToast }: {
  order: AdminOrder; onClose: () => void; onUpdated: () => void; showToast: (m:string) => void;
}) {
  const [status, setStatus] = useState(order.status);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/admin/orders/${order.id}`, { method:"PATCH", body: JSON.stringify({ status }) });
      onUpdated();
    } catch (err) { showToast(`${err}`); }
    finally { setSaving(false); }
  };

  const printReceipt = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Receipt – ${order.id.slice(0,8).toUpperCase()}</title>
      <style>body{font-family:sans-serif;padding:24px;max-width:400px;margin:auto}h1{font-size:18px}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #eee;text-align:left}@media print{button{display:none}}</style>
      </head><body>
      <h1>MicMikes Paints</h1>
      <p><strong>Order:</strong> ${order.id.slice(0,8).toUpperCase()}<br/>
      <strong>Date:</strong> ${new Date(order.created_at).toLocaleString("en-KE")}<br/>
      <strong>Customer:</strong> ${order.name}<br/>
      <strong>Phone:</strong> ${order.phone}<br/>
      <strong>County:</strong> ${order.county}${order.town ? `, ${order.town}` : ""}<br/>
      ${order.mpesa_ref ? `<strong>M-Pesa Ref:</strong> ${order.mpesa_ref}<br/>` : ""}
      <strong>Status:</strong> ${order.status}</p>
      <table><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
      ${order.items.map(i => `<tr><td>${i.product_slug} ${i.size} ${i.colour_name ?? ""}</td><td>${i.quantity}</td><td>KES ${i.unit_kes.toLocaleString()}</td><td>KES ${(i.quantity*i.unit_kes).toLocaleString()}</td></tr>`).join("")}
      </table>
      <p style="margin-top:16px"><strong>Total: KES ${order.total_kes.toLocaleString("en-KE")}</strong></p>
      <button onclick="window.print()">🖨 Print</button>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <Modal title={`Order – ${order.id.slice(0,8).toUpperCase()}`} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div><span style={{ color:"#9b9589" }}>Customer</span><br /><strong>{order.name}</strong></div>
          <div><span style={{ color:"#9b9589" }}>Phone</span><br /><strong>{order.phone}</strong></div>
          <div><span style={{ color:"#9b9589" }}>County</span><br /><strong>{order.county}{order.town ? `, ${order.town}` : ""}</strong></div>
          <div><span style={{ color:"#9b9589" }}>M-Pesa Ref</span><br /><strong>{order.mpesa_ref || "—"}</strong></div>
          <div><span style={{ color:"#9b9589" }}>Total</span><br /><strong style={{ color:"#B84A32" }}>{kes(order.total_kes)}</strong></div>
          <div><span style={{ color:"#9b9589" }}>Created</span><br /><strong>{new Date(order.created_at).toLocaleString("en-KE")}</strong></div>
        </div>

        <div>
          <p className="text-[11px] font-[700] uppercase tracking-wide mb-2" style={{ color:"#9b9589" }}>Items</p>
          <div className="space-y-2">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-[10px]" style={{ background:"#f8f4ef" }}>
                <div className="w-5 h-5 rounded-full shrink-0" style={{ background: item.colour_hex, border:"1px solid rgba(0,0,0,0.1)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-[600]">{item.product_slug} · {item.size}</p>
                  <p className="text-[11px]" style={{ color:"#9b9589" }}>{item.colour_name} · {item.finish}</p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] font-[600]">×{item.quantity}</p>
                  <p className="text-[11px]" style={{ color:"#9b9589" }}>{kes(item.unit_kes)} each</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px]">
            <Field label="Update status">
              <select className={sel} value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Btn onClick={save} disabled={saving || status === order.status}>{saving ? "Saving…" : "Save status"}</Btn>
          <a href={waLink(order.phone, `Hi ${order.name}, your MicMikes Paints order status is now: ${status}. Total: ${kes(order.total_kes)}.`)} target="_blank" rel="noopener noreferrer">
            <Btn variant="outline">💬 WhatsApp</Btn>
          </a>
          <Btn variant="outline" onClick={printReceipt}>🖨 Print receipt</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════════════════
   DELIVERY TAB
════════════════════════════════════════════════ */
function DeliveryTab({ showToast }: { showToast: (m:string) => void }) {
  const [rates, setRates]     = useState<DeliveryRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<"new"|DeliveryRate|null>(null);
  const [search, setSearch]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setRates(await api("/api/admin/delivery-rates")); }
    catch (e) { showToast(`${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = rates.filter(r => {
    const q = search.toLowerCase();
    return !q || r.county.toLowerCase().includes(q) || (r.town ?? "").toLowerCase().includes(q);
  });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:22, fontWeight:600 }}>Delivery Rates <span className="text-[#9b9589] text-[16px] font-normal">({rates.length})</span></h2>
        <Btn onClick={() => setModal("new")}>+ Add rate</Btn>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search county or town…" />

      {filtered.length === 0 && (
        <p className="text-[13px] py-8 text-center" style={{ color:"#9b9589" }}>No delivery rates match your search.</p>
      )}

      <div className="space-y-2">
        {filtered.map(r => (
          <div key={r.id} className="bg-white rounded-[12px] px-4 py-3 flex items-center gap-3 hover:shadow-sm transition cursor-pointer"
            style={{ border:"1px solid #ebe2d2" }} onClick={() => setModal(r)}>
            <div className="flex-1">
              <span className="text-[13px] font-[600]">{r.county}</span>
              {r.town && <span className="text-[12px] ml-2" style={{ color:"#9b9589" }}>– {r.town}</span>}
            </div>
            <span className="text-[13px] font-[700]" style={{ color:"#B84A32" }}>{kes(r.rate_kes)}</span>
            <span className="text-[11px]" style={{ color:"#9b9589" }}>Updated {new Date(r.updated_at).toLocaleDateString("en-KE")}</span>
          </div>
        ))}
      </div>

      {modal && (
        <DeliveryModal
          rate={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); showToast(modal === "new" ? "Rate added" : "Rate updated"); }}
          onDeleted={() => { setModal(null); load(); showToast("Rate deleted"); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function DeliveryModal({ rate, onClose, onSaved, onDeleted, showToast }: {
  rate: DeliveryRate | null; onClose: () => void; onSaved: () => void; onDeleted: () => void; showToast: (m:string) => void;
}) {
  const [form, setForm] = useState({ county: rate?.county ?? "", town: rate?.town ?? "", rate_kes: rate?.rate_kes ?? 0 });
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      if (rate) await api(`/api/admin/delivery-rates/${rate.id}`, { method:"PATCH", body: JSON.stringify(form) });
      else      await api("/api/admin/delivery-rates", { method:"POST", body: JSON.stringify(form) });
      onSaved();
    } catch (err) { showToast(`${err}`); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!rate || !confirm(`Delete rate for ${rate.county}?`)) return;
    try { await api(`/api/admin/delivery-rates/${rate.id}`, { method:"DELETE" }); onDeleted(); }
    catch (err) { showToast(`${err}`); }
  };

  return (
    <Modal title={rate ? "Edit Delivery Rate" : "New Delivery Rate"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="County"><input className={inp} value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value }))} required placeholder="e.g. Nairobi" /></Field>
        <Field label="Town (optional)" hint="Leave blank for county-wide rate"><input className={inp} value={form.town} onChange={e => setForm(f => ({ ...f, town: e.target.value }))} placeholder="e.g. Westlands" /></Field>
        <Field label="Rate (KES)"><input className={inp} type="number" value={form.rate_kes} onChange={e => setForm(f => ({ ...f, rate_kes: Number(e.target.value) }))} required /></Field>
        <div className="flex gap-2 pt-2">
          <Btn type="submit" disabled={saving}>{saving ? "Saving…" : rate ? "Save changes" : "Add rate"}</Btn>
          {rate && <Btn variant="danger" onClick={del}>Delete</Btn>}
        </div>
      </form>
    </Modal>
  );
}

/* ════════════════════════════════════════════════
   STOCK TAB
════════════════════════════════════════════════ */
function StockTab({ showToast }: { showToast: (m:string) => void }) {
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [modal, setModal]     = useState<StockEntry|null>(null);
  const [filter, setFilter]   = useState<"all"|"low">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try { setEntries(await api("/api/admin/stock")); }
    catch (e) { showToast(`${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.product_name.toLowerCase().includes(q) || e.size.toLowerCase().includes(q) || (e.colour_name ?? "").toLowerCase().includes(q);
    const matchFilter = filter === "all" || e.stock <= e.low_stock_threshold;
    return matchSearch && matchFilter;
  });

  const lowCount = entries.filter(e => e.stock <= e.low_stock_threshold).length;

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:22, fontWeight:600 }}>Stock</h2>
          {lowCount > 0 && (
            <p className="text-[12px] mt-0.5 font-[600]" style={{ color:"#dc2626" }}>⚠ {lowCount} variant{lowCount > 1 ? "s" : ""} below threshold</p>
          )}
        </div>
        <Btn variant="outline" size="sm" onClick={load}>↻ Refresh</Btn>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={setSearch} placeholder="Product, size, colour…" />
        </div>
        <div className="flex rounded-[10px] overflow-hidden border border-[#d8ccb8]">
          <button className={`px-4 py-2 text-[12px] font-[600] transition ${filter==="all" ? "bg-[#B84A32] text-white" : "bg-white text-[#6f6a62] hover:bg-[#f5f0e8]"}`}
            onClick={() => setFilter("all")}>All</button>
          <button className={`px-4 py-2 text-[12px] font-[600] transition ${filter==="low" ? "bg-[#B84A32] text-white" : "bg-white text-[#6f6a62] hover:bg-[#f5f0e8]"}`}
            onClick={() => setFilter("low")}>Low stock only</button>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-[13px] py-8 text-center" style={{ color:"#9b9589" }}>
          {filter === "low" ? "No variants below threshold — great!" : "No stock entries yet."}
        </p>
      )}

      <div className="space-y-2">
        {filtered.map(e => {
          const isLow = e.stock <= e.low_stock_threshold;
          return (
            <div key={e.id} className="bg-white rounded-[12px] px-4 py-3 flex flex-wrap items-center gap-3 cursor-pointer hover:shadow-sm transition"
              style={{ border:`1px solid ${isLow ? "#fecaca" : "#ebe2d2"}`, background: isLow ? "#fff5f5" : "white" }}
              onClick={() => setModal(e)}>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-[600]">{e.product_name}</p>
                <p className="text-[11px]" style={{ color:"#9b9589" }}>
                  {e.size}{e.colour_name ? ` · ${e.colour_name}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[15px] font-[700]" style={{ color: isLow ? "#dc2626" : "#2B2B2E" }}>{e.stock}</p>
                <p className="text-[10px]" style={{ color:"#9b9589" }}>threshold: {e.low_stock_threshold}</p>
              </div>
              {isLow && <span className="text-[10px] font-[700] px-2 py-0.5 rounded-full" style={{ background:"#dc2626", color:"#fff" }}>LOW</span>}
            </div>
          );
        })}
      </div>

      {modal && (
        <StockModal
          entry={modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); showToast("Stock updated"); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function StockModal({ entry, onClose, onSaved, showToast }: {
  entry: StockEntry; onClose: () => void; onSaved: () => void; showToast: (m:string) => void;
}) {
  const [stock, setStock]         = useState(entry.stock);
  const [threshold, setThreshold] = useState(entry.low_stock_threshold);
  const [saving, setSaving]       = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await api(`/api/admin/stock/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stock, low_stock_threshold: threshold }),
      });
      onSaved();
    } catch (err) { showToast(`${err}`); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={`Stock — ${entry.product_name} ${entry.size}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="rounded-[12px] p-4" style={{ background:"#f8f4ef" }}>
          <p className="text-[12px]" style={{ color:"#6f6a62" }}>
            <strong>{entry.product_name}</strong> · {entry.size}{entry.colour_name ? ` · ${entry.colour_name}` : ""}
          </p>
        </div>
        <Field label="Current stock (units)">
          <input className={inp} type="number" min={0} value={stock} onChange={e => setStock(Number(e.target.value))} required />
        </Field>
        <Field label="Low stock threshold" hint="Alert shows on dashboard when stock falls to or below this number">
          <input className={inp} type="number" min={0} value={threshold} onChange={e => setThreshold(Number(e.target.value))} required />
        </Field>
        <div className="flex gap-2 pt-1">
          <Btn type="submit" disabled={saving}>{saving ? "Saving…" : "Save stock"}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </form>
    </Modal>
  );
}

/* ════════════════════════════════════════════════
   CUSTOMERS TAB
════════════════════════════════════════════════ */
function CustomersTab({ showToast }: { showToast: (m:string) => void }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [sortBy, setSortBy]       = useState<"total_spent_kes"|"order_count"|"last_order_at">("total_spent_kes");

  const load = useCallback(async () => {
    setLoading(true);
    try { setCustomers(await api("/api/admin/customers")); }
    catch (e) { showToast(`${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = customers
    .filter(c => {
      const q = search.toLowerCase();
      return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.county.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === "last_order_at") return new Date(b.last_order_at).getTime() - new Date(a.last_order_at).getTime();
      return (b[sortBy] as number) - (a[sortBy] as number);
    });

  const exportCSV = () => {
    downloadCSV("micmikes-customers.csv", filtered.map(c => ({
      Name: c.name,
      Phone: c.phone,
      Email: c.email,
      County: c.county,
      Town: c.town,
      Orders: c.order_count,
      Total_Spent_KES: c.total_spent_kes,
      Last_Order: c.last_order_at,
    })));
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:22, fontWeight:600 }}>Customers <span className="text-[#9b9589] text-[16px] font-normal">({customers.length})</span></h2>
        <Btn variant="outline" size="sm" onClick={exportCSV}>⬇ Export CSV</Btn>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={setSearch} placeholder="Name, phone, county…" />
        </div>
        <select className={sel + " w-auto"} value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
          <option value="total_spent_kes">Sort: Top spenders</option>
          <option value="order_count">Sort: Most orders</option>
          <option value="last_order_at">Sort: Recent first</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <p className="text-[13px] py-8 text-center" style={{ color:"#9b9589" }}>No customers found.</p>
      )}

      <div className="space-y-2">
        {filtered.map(c => (
          <div key={c.id} className="bg-white rounded-[14px] px-4 py-3 flex flex-wrap items-center gap-3 hover:shadow-sm transition"
            style={{ border:"1px solid #ebe2d2" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[14px] font-[700]"
              style={{ background:"#f5ede3", color:"#B84A32" }}>
              {c.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-[700]">{c.name}</p>
              <div className="flex flex-wrap gap-3 mt-0.5">
                <span className="text-[11px]" style={{ color:"#9b9589" }}>{c.phone}</span>
                <span className="text-[11px]" style={{ color:"#9b9589" }}>{c.county}{c.town ? `, ${c.town}` : ""}</span>
                <span className="text-[11px]" style={{ color:"#9b9589" }}>Last order: {new Date(c.last_order_at).toLocaleDateString("en-KE", { day:"numeric", month:"short", year:"numeric" })}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[13px] font-[700]" style={{ color:"#B84A32" }}>{kes(c.total_spent_kes)}</p>
              <p className="text-[11px]" style={{ color:"#9b9589" }}>{c.order_count} order{c.order_count !== 1 ? "s" : ""}</p>
            </div>
            <a href={waLink(c.phone, `Hi ${c.name}, thank you for shopping with MicMikes Paints! 🎨`)} target="_blank" rel="noopener noreferrer">
              <Btn variant="outline" size="sm">💬 WA</Btn>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Staff (RBAC users) ─── */
type StaffUser = { id: string; name: string; email: string; phone: string; role: string };

function StaffTab({ showToast }: { showToast: (m: string) => void }) {
  const [users, setUsers]   = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal]   = useState<"new" | StaffUser | null>(null);
  const [form, setForm]     = useState({ name:"", email:"", phone:"", role:"staff", password:"" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api("/api/users?_r=list&role=staff"); setUsers(d.users ?? []); }
    catch (e) { showToast(`${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setForm({ name:"", email:"", phone:"", role:"staff", password:"" }); setModal("new"); };
  const openEdit = (u: StaffUser) => { setForm({ name:u.name, email:u.email??"", phone:u.phone??"", role:u.role, password:"" }); setModal(u); };

  const save = async () => {
    const isEdit = modal !== "new" && modal !== null;
    try {
      if (isEdit) {
        await api("/api/users?_r=update", { method:"PATCH", body: JSON.stringify({ id: (modal as StaffUser).id, ...form }) });
        showToast("Staff updated");
      } else {
        await api("/api/users?_r=create", { method:"POST", body: JSON.stringify(form) });
        showToast("Staff added");
      }
      setModal(null);
      load();
    } catch (e) { showToast(`${e}`); }
  };

  const remove = async (u: StaffUser) => {
    if (!confirm(`Delete ${u.name}?`)) return;
    try { await api(`/api/users?_r=delete&id=${u.id}`, { method:"DELETE" }); showToast("Deleted"); load(); }
    catch (e) { showToast(`${e}`); }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.phone?.includes(q);
  });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:22, fontWeight:600 }}>
          Staff <span className="text-[#9b9589] text-[16px] font-normal">({users.length})</span>
        </h2>
        <Btn onClick={openNew}>+ Add staff</Btn>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search name, email, phone…" />

      {filtered.length === 0 && (
        <p className="text-[13px] py-8 text-center" style={{ color:"#9b9589" }}>No staff members yet.</p>
      )}

      <div className="space-y-2">
        {filtered.map(u => (
          <div key={u.id} className="bg-white rounded-[14px] px-4 py-3 flex flex-wrap items-center gap-3 hover:shadow-sm transition"
            style={{ border:"1px solid #ebe2d2" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[14px] font-[700]"
              style={{ background:"#f5ede3", color:"#B84A32" }}>
              {u.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-[700]">{u.name}</p>
              <div className="flex flex-wrap gap-3 mt-0.5">
                {u.email && <span className="text-[11px]" style={{ color:"#9b9589" }}>{u.email}</span>}
                {u.phone && <span className="text-[11px]" style={{ color:"#9b9589" }}>{u.phone}</span>}
              </div>
            </div>
            <span className="text-[11px] font-[600] px-2 py-0.5 rounded-full capitalize"
              style={{ background:"#f5ede3", color:"#B84A32" }}>{u.role}</span>
            <div className="flex gap-2 shrink-0">
              <Btn variant="outline" size="sm" onClick={() => openEdit(u)}>Edit</Btn>
              <Btn variant="danger" size="sm" onClick={() => remove(u)}>Delete</Btn>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal === "new" ? "Add Staff" : "Edit Staff"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="Name">
              <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </Field>
            <Field label="Email">
              <input className={inp} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <input className={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </Field>
            <Field label="Role">
              <select className={sel} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            {modal === "new" && (
              <Field label="Password" hint="Required for login">
                <input className={inp} type="password" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </Field>
            )}
            <div className="flex gap-2 pt-1">
              <Btn onClick={save}>{modal === "new" ? "Add staff" : "Save changes"}</Btn>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
