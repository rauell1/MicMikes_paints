"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─── types ─── */
type AdminColour  = { id: string; code: string; name: string; hex: string; family: string };
type AdminVariant = { id: string; product_id: string; size: string; price_kes: number };
type AdminProduct = { id: string; slug: string; name: string; blurb: string; category: string; image_url: string; variants: AdminVariant[] };
type AdminRoom    = { id: string; name: string; photo_url: string; wall_mask: string; sort_order: number };
type AdminOrder   = { id: string; name: string; email: string; phone: string; county: string; town: string; address: string; latitude?: string; longitude?: string; total_kes: number; status: string; mpesa_ref: string; created_at: string; items: AdminOrderItem[] };
type AdminOrderItem = { product_slug: string; product_name?: string; colour_name: string; colour_hex: string; size: string; finish: string; quantity: number; unit_kes: number };
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

type Tab = "dashboard" | "colours" | "products" | "rooms" | "orders" | "unresolved" | "payments" | "delivery" | "stock" | "customers" | "staff";

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
      <Spinner />
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
            <button type="submit" disabled={loading || !pw} className="w-full py-3 rounded-[12px] text-white text-[14px] font-[600] disabled:opacity-40 transition cursor-pointer"
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
    { id:"unresolved",label:"Unresolved",icon:"⚠️" },
    { id:"payments",  label:"Payments",  icon:"💳" },
    { id:"delivery",  label:"Delivery",  icon:"🚚" },
    { id:"stock",     label:"Stock",     icon:"📋" },
    { id:"customers", label:"Customers", icon:"👤" },
    { id:"staff",     label:"Staff",     icon:"👥" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background:"#F8F4EF", fontFamily:'"Inter",system-ui,sans-serif', color:"#2B2B2E" }}>
      {/* header */}
      <header className="bg-white border-b sticky top-0 z-30" style={{ borderColor:"#ebe2d2" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:"#B84A32" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <span style={{ fontFamily:'"Playfair Display",Georgia,serif', fontWeight:600, fontSize:17 }}>Admin</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{ background:"#f5ede3", color:"#B84A32" }}>MicMikes Paints</span>
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
              className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-[600] border-b-2 transition whitespace-nowrap bg-transparent border-0 cursor-pointer"
              style={{ borderColor: tab===t.id ? "#B84A32" : "transparent", color: tab===t.id ? "#B84A32" : "#6f6a62" }}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">
        {tab === "dashboard" && <DashboardTab showToast={showToast} />}
        {tab === "colours"   && <ColoursTab   showToast={showToast} />}
        {tab === "products"  && <ProductsTab  showToast={showToast} />}
        {tab === "rooms"     && <RoomsTab     showToast={showToast} />}
        {tab === "orders"    && <OrdersTab    showToast={showToast} type="orders" />}
        {tab === "unresolved" && <OrdersTab   showToast={showToast} type="unresolved" />}
        {tab === "payments"  && <PaymentsTab  showToast={showToast} />}
        {tab === "delivery"  && <DeliveryTab  showToast={showToast} />}
        {tab === "stock"     && <StockTab     showToast={showToast} />}
        {tab === "customers" && <CustomersTab showToast={showToast} />}
        {tab === "staff"     && <StaffTab     showToast={showToast} />}
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

/* ─── Dashboard Tab ─── */
function DashboardTab({ showToast }: { showToast: (m:string) => void }) {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [saleModal, setSaleModal] = useState<{ name: string; slug: string } | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const timerRef = useRef<any>(null);

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
  if (!data)   return <p className="text-[13px] text-[#9b9589]">No data available yet.</p>;

  const { revenue, byStatus, topProducts, slowMovers, recentOrders, mpesa, byCounty } = data;

  const statusOrder = ["pending_payment","paid","confirmed","packed","out_for_delivery","delivered","cancelled"];
  const statusColours: Record<string,string> = {
    pending_payment:"#d97706", paid:"#16a34a", confirmed:"#2563eb",
    packed:"#7c3aed", out_for_delivery:"#059669", delivered:"#022c22", cancelled:"#dc2626",
  };
  const statusMap = Object.fromEntries(byStatus.map(r => [r.status, Number(r.count)]));

  const mpesaRate = mpesa.total > 0 ? Math.round((mpesa.success / mpesa.total) * 100) : 0;

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-KE", { day:"numeric", month:"short" }) : "Never";
  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff/60000); const h = Math.floor(m/60); const dy = Math.floor(h/24);
    if (dy > 0) return `${dy}d ago`; if (h > 0) return `${h}h ago`; return `${m}m ago`;
  };

  const pendingOrders = recentOrders.filter(o => o.status === "pending_payment");

  const exportDashboardCSV = () => {
    downloadCSV("micmikes-dashboard.csv", byCounty.map(r => ({
      County: r.county,
      Orders: r.orders,
      Revenue_KES: r.revenue_kes,
    })));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Dashboard</h2>
          <p className="text-[12px] mt-0.5 text-[#9b9589]">Auto-refreshes every 5 min · Last: {lastRefresh.toLocaleTimeString("en-KE")}</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" size="sm" onClick={exportDashboardCSV}>⬇ Export CSV</Btn>
          <Btn variant="outline" onClick={load}>↻ Refresh</Btn>
        </div>
      </div>

      {pendingOrders.length > 0 && (
        <div className="rounded-[16px] p-5 bg-[#fffbf0] border border-[#f5e2a0]">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[13px] font-[700] text-[#92400e]">⚠️ {pendingOrders.length} Orders awaiting payment</span>
          </div>
          <div className="space-y-2">
            {pendingOrders.slice(0, 5).map(o => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-[10px] px-4 py-3 border border-[#ebe2d2]">
                <div>
                  <span className="text-[13px] font-[600]">{o.name}</span>
                  <span className="text-[12px] ml-2 text-[#9b9589]">{o.county} · {kes(o.total_kes)}</span>
                  <span className="text-[11px] ml-2 text-[#9b9589]">{timeAgo(o.created_at)}</span>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          { label:"Today",       value: revenue.today,       sub:"revenue" },
          { label:"This Week",   value: revenue.this_week,   sub:"revenue" },
          { label:"This Month",  value: revenue.this_month,  sub:"revenue" },
          { label:"All Time",    value: revenue.all_time,    sub:"total revenue" },
        ] as any[]).map(card => (
          <div key={card.label} className="bg-white rounded-[16px] p-5 border border-[#ebe2d2]">
            <p className="text-[11px] font-[700] uppercase tracking-wide text-[#9b9589]">{card.label}</p>
            <p className="text-[22px] font-[700] mt-1 text-[#B84A32]" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>
              {kes(card.value)}
            </p>
            <p className="text-[11px] mt-0.5 text-[#9b9589]">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-[16px] p-5 border border-[#ebe2d2]">
          <p className="text-[11px] font-[700] uppercase tracking-wide text-[#9b9589]">Total Orders</p>
          <p className="text-[28px] font-[700] mt-1 text-[#2B2B2E]">{Number(revenue.total_orders).toLocaleString()}</p>
          <p className="text-[11px] mt-0.5 text-[#9b9589]">all time (excl. cancelled)</p>
        </div>
        <div className="bg-white rounded-[16px] p-5 border border-[#ebe2d2]">
          <p className="text-[11px] font-[700] uppercase tracking-wide text-[#9b9589]">Avg Order Value</p>
          <p className="text-[28px] font-[700] mt-1 text-[#2B2B2E]">{kes(revenue.avg_order_value)}</p>
          <p className="text-[11px] mt-0.5 text-[#9b9589]">per paid order</p>
        </div>
        <div className="bg-white rounded-[16px] p-5 border border-[#ebe2d2]">
          <p className="text-[11px] font-[700] uppercase tracking-wide text-[#9b9589]">M-Pesa Success</p>
          <p className="text-[28px] font-[700] mt-1" style={{ color: mpesaRate >= 80 ? "#16a34a" : "#d97706" }}>{mpesaRate}%</p>
          <p className="text-[11px] mt-0.5 text-[#9b9589]">{mpesa.success}/{mpesa.total} transactions</p>
        </div>
        <div className="bg-white rounded-[16px] p-5 relative border border-[#ebe2d2]">
          {lowStockCount > 0 && (
            <span className="absolute top-3 right-3 text-[10px] font-[700] px-2 py-0.5 rounded-full bg-[#dc2626] text-white">
              {lowStockCount} low stock
            </span>
          )}
          <p className="text-[11px] font-[700] uppercase tracking-wide text-[#9b9589]">Pending Orders</p>
          <p className="text-[28px] font-[700] mt-1" style={{ color: statusMap["pending_payment"] > 0 ? "#d97706" : "#2B2B2E" }}>
            {statusMap["pending_payment"] ?? 0}
          </p>
          <p className="text-[11px] mt-0.5 text-[#9b9589]">awaiting payment</p>
        </div>
      </div>

      <div className="bg-white rounded-[16px] p-6 border border-[#ebe2d2]">
        <h3 className="font-[700] text-[15px] mb-4" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>Order Status Breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {statusOrder.map(s => (
            <div key={s} className="rounded-[12px] p-4 text-center bg-[#f8f4ef]">
              <p className="text-[22px] font-[700]" style={{ color: statusColours[s] }}>{statusMap[s] ?? 0}</p>
              <p className="text-[11px] font-[600] mt-1 capitalize text-[#6f6a62]">{s.replace('_', ' ')}</p>
            </div>
          ))}
        </div>
      </div>

      {byCounty.length > 0 && (
        <div className="bg-white rounded-[16px] p-6 border border-[#ebe2d2]">
          <h3 className="font-[700] text-[15px] mb-4" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>Revenue by County</h3>
          <div className="space-y-2">
            {byCounty.slice(0,8).map(r => {
              const max = byCounty[0]?.revenue_kes ?? 1;
              const pct = Math.round((r.revenue_kes / max) * 100);
              return (
                <div key={r.county} className="flex items-center gap-3">
                  <span className="text-[12px] font-[600] w-28 shrink-0">{r.county}</span>
                  <div className="flex-1 h-2 rounded-full bg-[#f0ebe2]">
                    <div className="h-2 rounded-full bg-[#B84A32]" style={{ width:`${pct}%` }} />
                  </div>
                  <span className="text-[12px] font-[600] w-28 text-right shrink-0">{kes(r.revenue_kes)}</span>
                  <span className="text-[11px] w-10 text-right shrink-0 text-[#9b9589]">{r.orders} ord.</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {topProducts.length > 0 && (
        <div className="bg-white rounded-[16px] p-6 border border-[#ebe2d2]">
          <h3 className="font-[700] text-[15px] mb-4" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>Top Products</h3>
          <div className="space-y-3">
            {topProducts.map((p, i) => (
              <div key={p.slug} className="flex items-center gap-3">
                <span className="text-[13px] font-[700] w-5 text-center text-[#9b9589]">{i+1}</span>
                <div className="w-10 h-10 rounded-[8px] object-cover bg-zinc-200 border border-[#ebe2d2]" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-[600] truncate">{p.name}</p>
                  <p className="text-[11px] text-[#9b9589]">{p.units_sold} units · {p.order_count} orders</p>
                </div>
                <span className="text-[13px] font-[700] text-[#B84A32]">{kes(p.revenue_kes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {slowMovers.length > 0 && (
        <div className="bg-white rounded-[16px] p-6 border border-[#ebe2d2]">
          <h3 className="font-[700] text-[15px] mb-4" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>Slow-Moving Products</h3>
          <div className="space-y-3">
            {slowMovers.map(p => (
              <div key={p.slug} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[8px] object-cover bg-zinc-200 border border-[#ebe2d2]" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-[600] truncate">{p.name}</p>
                  <p className="text-[11px] text-[#9b9589]">Last ordered: {fmt(p.last_ordered)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] px-2 py-1 rounded-full bg-[#fff0ee] text-[#a43a25] font-bold">slow</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentOrders.length > 0 && (
        <div className="bg-white rounded-[16px] p-6 border border-[#ebe2d2]">
          <h3 className="font-[700] text-[15px] mb-4" style={{ fontFamily:'"Playfair Display",Georgia,serif' }}>Recent Orders</h3>
          <div className="space-y-2">
            {recentOrders.slice(0, 8).map(o => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-[10px] bg-[#f8f4ef]">
                <div>
                  <span className="text-[13px] font-[600]">{o.name}</span>
                  <span className="text-[12px] ml-2 text-[#9b9589]">{o.county}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge s={o.status} />
                  <span className="text-[13px] font-[700]">{kes(o.total_kes)}</span>
                  <span className="text-[11px] text-[#9b9589]">{timeAgo(o.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Colours Tab ─── */
function ColoursTab({ showToast }: { showToast: (m:string) => void }) {
  const [colours, setColours] = useState<AdminColour[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<Partial<AdminColour> | null>(null);

  const load = async () => {
    setLoading(true);
    try { const data = await api("/api/admin/colours"); setColours(data || []); }
    catch (e) { showToast(`Load failed: ${e}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal?.code || !modal?.name || !modal?.hex || !modal?.family) return;
    try {
      if (modal.id) {
        await api("/api/admin/colours", { method:"PUT", body: JSON.stringify(modal) });
        showToast("Colour updated");
      } else {
        await api("/api/admin/colours", { method:"POST", body: JSON.stringify(modal) });
        showToast("Colour created");
      }
      setModal(null); load();
    } catch (err) { showToast(`${err}`); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this colour?")) return;
    try {
      await api("/api/admin/colours", { method:"DELETE", body: JSON.stringify({ id }) });
      showToast("Colour deleted"); load();
    } catch (err) { showToast(`${err}`); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Colours</h2>
        <Btn onClick={() => setModal({ code:"", name:"", hex:"#", family:"Neutrals" })}>+ Add Colour</Btn>
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden border border-[#ebe2d2]">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead>
            <tr className="bg-[#fcfaf7] border-b text-[#6f6a62] font-[700]" style={{ borderColor:"#ebe2d2" }}>
              <th className="px-6 py-3">Swatch</th>
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Code</th>
              <th className="px-6 py-3">HEX</th>
              <th className="px-6 py-3">Family</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ebe2d2]">
            {colours.map(c => (
              <tr key={c.id} className="hover:bg-[#fcfaf7] transition">
                <td className="px-6 py-3">
                  <div className="w-8 h-8 rounded-full border border-black/10" style={{ background: c.hex }} />
                </td>
                <td className="px-6 py-3 font-[600]">{c.name}</td>
                <td className="px-6 py-3 font-mono text-[12px]">{c.code}</td>
                <td className="px-6 py-3 font-mono text-[12px]">{c.hex}</td>
                <td className="px-6 py-3">{c.family}</td>
                <td className="px-6 py-3 text-right space-x-2">
                  <Btn variant="ghost" size="sm" onClick={() => setModal(c)}>Edit</Btn>
                  <Btn variant="danger" size="sm" onClick={() => remove(c.id)}>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? "Edit Colour" : "Add Colour"} onClose={() => setModal(null)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Colour code"><input className={inp} value={modal.code} onChange={e=>setModal({...modal, code:e.target.value})} placeholder="e.g. MM-W01" required /></Field>
            <Field label="Colour name"><input className={inp} value={modal.name} onChange={e=>setModal({...modal, name:e.target.value})} placeholder="e.g. Brilliant White" required /></Field>
            <Field label="HEX value"><input className={inp} value={modal.hex} onChange={e=>setModal({...modal, hex:e.target.value})} placeholder="#F8F8F6" required /></Field>
            <Field label="Family">
              <select className={sel} value={modal.family} onChange={e=>setModal({...modal, family:e.target.value})} required>
                {FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <div className="pt-2 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn type="submit">Save</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ─── Products Tab ─── */
function ProductsTab({ showToast }: { showToast: (m:string) => void }) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading]   = useState(true);
  const [prodModal, setProdModal] = useState<Partial<AdminProduct> | null>(null);
  const [variantPriceModal, setVariantPriceModal] = useState<AdminVariant | null>(null);

  const load = async () => {
    setLoading(true);
    try { const data = await api("/api/admin/products"); setProducts(data || []); }
    catch (e) { showToast(`Load failed: ${e}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodModal?.name || !prodModal?.category || !prodModal?.blurb) return;
    const body = {
      ...prodModal,
      slug: prodModal.slug || slug(prodModal.name),
    };
    try {
      if (prodModal.id) {
        await api("/api/admin/products", { method:"PUT", body: JSON.stringify(body) });
        showToast("Product updated");
      } else {
        await api("/api/admin/products", { method:"POST", body: JSON.stringify(body) });
        showToast("Product created");
      }
      setProdModal(null); load();
    } catch (err) { showToast(`${err}`); }
  };

  const removeProduct = async (id: string) => {
    if (!confirm("Delete product and all its variants?")) return;
    try {
      await api("/api/admin/products", { method:"DELETE", body: JSON.stringify({ id }) });
      showToast("Product deleted"); load();
    } catch (err) { showToast(`${err}`); }
  };

  const saveVariantPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantPriceModal) return;
    try {
      await api("/api/admin/variants", { method:"PUT", body: JSON.stringify(variantPriceModal) });
      showToast("Price updated"); setVariantPriceModal(null); load();
    } catch (err) { showToast(`${err}`); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Products</h2>
        <Btn onClick={() => setProdModal({ name:"", blurb:"", category:"Paint" })}>+ Add Product</Btn>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {products.map(p => (
          <div key={p.id} className="bg-white rounded-[20px] p-5 border border-[#ebe2d2] flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <span className="text-[11px] font-[700] uppercase tracking-wide px-2 py-0.5 rounded" style={{ background:"#f5ede3", color:"#B84A32" }}>{p.category}</span>
                  <h3 className="font-display text-[18px] mt-1">{p.name}</h3>
                </div>
                <div className="flex gap-1.5">
                  <Btn variant="ghost" size="sm" onClick={() => setProdModal(p)}>Edit</Btn>
                  <Btn variant="danger" size="sm" onClick={() => removeProduct(p.id)}>Delete</Btn>
                </div>
              </div>
              <p className="text-[13px] text-[#6f6a62] leading-relaxed mb-4">{p.blurb}</p>
            </div>
            
            <div className="border-t pt-4" style={{ borderColor:"#f0ebe2" }}>
              <h4 className="text-[11px] font-[700] uppercase tracking-wider mb-2 text-[#9b9589]">Price Variants</h4>
              <div className="grid grid-cols-3 gap-2">
                {p.variants?.map(v => (
                  <button key={v.id} onClick={() => setVariantPriceModal(v)}
                    className="text-left p-2.5 rounded-[10px] bg-[#fcfaf7] border border-[#ebe2d2] hover:border-[#B84A32] transition group cursor-pointer">
                    <span className="block text-[11px] font-[600] text-[#9b9589]">{v.size}</span>
                    <span className="block text-[13px] font-[700] mt-0.5">{kes(v.price_kes)}</span>
                    <span className="block text-[10px] text-[#B84A32] opacity-0 group-hover:opacity-100 transition-opacity mt-1">✎ Edit price</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {prodModal && (
        <Modal title={prodModal.id ? "Edit Product" : "Add Product"} onClose={() => setProdModal(null)}>
          <form onSubmit={saveProduct} className="space-y-4">
            <Field label="Product name"><input className={inp} value={prodModal.name} onChange={e=>setProdModal({...prodModal, name:e.target.value})} placeholder="e.g. Satin Silk Finish" required /></Field>
            <Field label="Category">
              <select className={sel} value={prodModal.category} onChange={e=>setProdModal({...prodModal, category:e.target.value})} required>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Blurb / Description"><textarea className={inp} rows={3} value={prodModal.blurb} onChange={e=>setProdModal({...prodModal, blurb:e.target.value})} placeholder="Short description..." required /></Field>
            <div className="pt-2 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setProdModal(null)}>Cancel</Btn>
              <Btn type="submit">Save</Btn>
            </div>
          </form>
        </Modal>
      )}

      {variantPriceModal && (
        <Modal title={`Edit Price — ${variantPriceModal.size}`} onClose={() => setVariantPriceModal(null)}>
          <form onSubmit={saveVariantPrice} className="space-y-4">
            <Field label="Price (KES)"><input type="number" className={inp} value={variantPriceModal.price_kes} onChange={e=>setVariantPriceModal({...variantPriceModal, price_kes:Number(e.target.value)})} placeholder="1500" min="0" required /></Field>
            <div className="pt-2 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setVariantPriceModal(null)}>Cancel</Btn>
              <Btn type="submit">Save Price</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ─── Rooms Tab ─── */
function RoomsTab({ showToast }: { showToast: (m:string) => void }) {
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<Partial<AdminRoom> | null>(null);

  const load = async () => {
    setLoading(true);
    try { const data = await api("/api/admin/rooms"); setRooms(data || []); }
    catch (e) { showToast(`Load failed: ${e}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal?.name || !modal?.photo_url) return;
    try {
      if (modal.id) {
        await api("/api/admin/rooms", { method:"PUT", body: JSON.stringify(modal) });
        showToast("Room updated");
      } else {
        await api("/api/admin/rooms", { method:"POST", body: JSON.stringify(modal) });
        showToast("Room created");
      }
      setModal(null); load();
    } catch (err) { showToast(`${err}`); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this room?")) return;
    try {
      await api("/api/admin/rooms", { method:"DELETE", body: JSON.stringify({ id }) });
      showToast("Room deleted"); load();
    } catch (err) { showToast(`${err}`); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Rooms (Visualizer Backgrounds)</h2>
        <Btn onClick={() => setModal({ name:"", photo_url:"", wall_mask:"", sort_order:10 })}>+ Add Room</Btn>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map(r => (
          <div key={r.id} className="bg-white rounded-[20px] overflow-hidden border border-[#ebe2d2] flex flex-col justify-between mm-shadow">
            <div className="h-44 bg-zinc-100 relative">
              <img src={r.photo_url} alt={r.name} className="w-full h-full object-cover" />
            </div>
            <div className="p-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-[600] text-[14px]">{r.name}</h3>
                <span className="text-[11px] text-[#9b9589]">Order: {r.sort_order}</span>
              </div>
              <div className="flex gap-2">
                <Btn variant="ghost" size="sm" onClick={() => setModal(r)}>Edit</Btn>
                <Btn variant="danger" size="sm" onClick={() => remove(r.id)}>Delete</Btn>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal.id ? "Edit Room" : "Add Room"} onClose={() => setModal(null)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Room name"><input className={inp} value={modal.name} onChange={e=>setModal({...modal, name:e.target.value})} placeholder="e.g. Living Room" required /></Field>
            <Field label="Photo URL"><input className={inp} value={modal.photo_url} onChange={e=>setModal({...modal, photo_url:e.target.value})} placeholder="https://..." required /></Field>
            <Field label="Wall Mask URL (optional)"><input className={inp} value={modal.wall_mask ?? ""} onChange={e=>setModal({...modal, wall_mask:e.target.value})} placeholder="https://..." /></Field>
            <Field label="Sort order"><input type="number" className={inp} value={modal.sort_order} onChange={e=>setModal({...modal, sort_order:Number(e.target.value)})} placeholder="10" required /></Field>
            <div className="pt-2 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn type="submit">Save</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ─── Orders Tab ─── */
function OrdersTab({ showToast, type = "orders" }: { showToast: (m:string) => void; type?: "orders" | "unresolved" }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [search, setSearch]   = useState("");
  const [stkPhone, setStkPhone] = useState("");

  const load = async () => {
    setLoading(true);
    try { const data = await api(`/api/admin/${type}`); setOrders(data || []); }
    catch (e) { showToast(`Load failed: ${e}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [type]);

  useEffect(() => {
    if (selectedOrder) {
      setStkPhone(selectedOrder.phone);
    } else {
      setStkPhone("");
    }
  }, [selectedOrder]);

  const updateStatus = async (id: string, s: string) => {
    try {
      await api("/api/admin/orders", { method:"PUT", body: JSON.stringify({ id, status: s }) });
      showToast("Order status updated");
      load();
      if (selectedOrder?.id === id) {
        setSelectedOrder(prev => prev ? { ...prev, status: s } : null);
      }
    } catch (err) { showToast(`${err}`); }
  };

  const sendStkPush = async (order: AdminOrder, phoneNo: string) => {
    try {
      showToast("Sending M-Pesa STK push...");
      const res = await api("/api/mpesa/stkpush", {
        method: "POST",
        body: JSON.stringify({
          orderId: order.id,
          phone: phoneNo,
          amountKes: order.total_kes
        })
      });
      showToast(res.customerMessage || "STK Push sent successfully!");
    } catch (err) {
      showToast(`STK Push failed: ${err}`);
    }
  };

  const filtered = orders.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.phone.includes(search) ||
    o.mpesa_ref?.toLowerCase().includes(search.toLowerCase())
  );

  const exportOrdersCSV = () => {
    downloadCSV(type === "unresolved" ? "micmikes-unresolved-orders.csv" : "micmikes-orders.csv", orders.map(o => ({
      Order_Number: o.mpesa_ref,
      Customer_Name: o.name,
      Email: o.email,
      Phone: o.phone,
      County: o.county,
      Town: o.town,
      Total_KES: o.total_kes,
      Status: o.status,
      Placed_At: o.created_at,
    })));
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>
            {type === "unresolved" ? "Unresolved Orders" : "Orders"}
          </h2>
          {type === "unresolved" && (
            <p className="text-[12px] text-[#9b9589] mt-0.5">Unpaid orders placed more than 24 hours ago. They are automatically deleted after 30 days.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" size="sm" onClick={exportOrdersCSV}>⬇ Export CSV</Btn>
          <Btn variant="outline" onClick={load}>↻ Refresh</Btn>
        </div>
      </div>

      {type === "unresolved" && orders.length > 0 && (
        <div className="rounded-[12px] p-4 bg-[#fff0ee] border border-[#f5c8be] flex items-start gap-2.5">
          <span className="text-[16px] leading-none">⚠️</span>
          <div className="text-[12.5px] text-[#a43a25]">
            <p className="font-[600]">Automatic Deletion Warning</p>
            <p className="mt-0.5 opacity-90">The orders below have been unpaid for more than 24 hours. They will be permanently removed from the system 30 days after their placement date unless confirmed or cancelled.</p>
          </div>
        </div>
      )}

      <div className="w-full max-w-md">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name, phone or ref…" />
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden border border-[#ebe2d2] mm-shadow">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead>
            <tr className="bg-[#fcfaf7] border-b text-[#6f6a62] font-[700]" style={{ borderColor:"#ebe2d2" }}>
              <th className="px-6 py-3">Reference</th>
              <th className="px-6 py-3">Customer</th>
              <th className="px-6 py-3">County / Town</th>
              <th className="px-6 py-3">Total</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ebe2d2]">
            {filtered.map(o => (
              <tr key={o.id} className="hover:bg-[#fcfaf7] transition">
                <td className="px-6 py-3 font-mono font-[700] text-[#B84A32]">{o.mpesa_ref}</td>
                <td className="px-6 py-3">
                  <div className="font-[600]">{o.name}</div>
                  <div className="text-[11px] text-[#9b9589]">{o.phone}</div>
                </td>
                <td className="px-6 py-3">{o.county} · {o.town}</td>
                <td className="px-6 py-3 font-[700]">{kes(o.total_kes)}</td>
                <td className="px-6 py-3"><StatusBadge s={o.status} /></td>
                <td className="px-6 py-3 text-right">
                  <Btn variant="ghost" size="sm" onClick={() => setSelectedOrder(o)}>View Items</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <Modal title={`Order Details — ${selectedOrder.mpesa_ref}`} onClose={() => setSelectedOrder(null)} wide>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-bold text-[14px]">Customer Details</h4>
              <div className="bg-[#f8f4ef] p-4 rounded-[12px] space-y-1.5 text-[13px]">
                <div className="flex justify-between"><span className="text-[#6f6a62]">Name:</span><span className="font-[600]">{selectedOrder.name}</span></div>
                <div className="flex justify-between"><span className="text-[#6f6a62]">Email:</span><span>{selectedOrder.email}</span></div>
                <div className="flex justify-between"><span className="text-[#6f6a62]">Phone:</span><span className="font-[600]">{selectedOrder.phone}</span></div>
                <div className="flex justify-between"><span className="text-[#6f6a62]">Delivery Location:</span><span>{selectedOrder.town}, {selectedOrder.county}</span></div>
                <div className="flex justify-between"><span className="text-[#6f6a62]">Street / Estate:</span><span>{selectedOrder.address || "N/A"}</span></div>
                {selectedOrder.latitude && selectedOrder.longitude && (
                  <div className="flex justify-between items-center bg-[#fff] p-2 rounded-lg border border-[#ebe2d2] mt-1.5">
                    <span className="text-[12px] font-[600] text-[#a43a25] flex items-center gap-1">📍 Delivery Pin:</span>
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedOrder.latitude},${selectedOrder.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#B84A32] hover:underline font-[700] text-[12px]"
                    >
                      View on Google Maps ↗
                    </a>
                  </div>
                )}
              </div>
              <h4 className="font-bold text-[14px]">Order Actions</h4>
              <div className="flex flex-wrap gap-2 pt-2">
                {selectedOrder.status === "pending_payment" && (
                  <div className="w-full space-y-2 border border-[#f5c8be] bg-[#fff0ee] p-4 rounded-[12px] mb-3">
                    <p className="text-[12.5px] font-[700] text-[#a43a25] flex items-center gap-1.5">
                      <span>📲</span> Send M-Pesa STK Push
                    </p>
                    <p className="text-[11.5px] text-[#6f6a62]">Trigger a payment request prompt on the customer's phone for this order (KES {selectedOrder.total_kes}).</p>
                    <div className="flex gap-2 pt-1">
                      <input 
                        type="text" 
                        value={stkPhone} 
                        onChange={(e) => setStkPhone(e.target.value)}
                        placeholder="2547XXXXXXXX" 
                        className="flex-1 px-3 py-1.5 rounded-[10px] border border-[#d8ccb8] text-[13px] bg-white focus:outline-none focus:border-[#B84A32] transition" 
                      />
                      <Btn 
                        size="sm" 
                        onClick={() => sendStkPush(selectedOrder, stkPhone)}
                      >
                        Send Prompt
                      </Btn>
                    </div>
                  </div>
                )}
                <Btn variant="outline" size="sm" onClick={() => updateStatus(selectedOrder.id, "confirmed")}>Confirm Order</Btn>
                <Btn variant="outline" size="sm" onClick={() => updateStatus(selectedOrder.id, "packed")}>Mark Packed</Btn>
                <Btn variant="outline" size="sm" onClick={() => updateStatus(selectedOrder.id, "out_for_delivery")}>Ship Out</Btn>
                <Btn variant="outline" size="sm" onClick={() => updateStatus(selectedOrder.id, "delivered")}>Mark Delivered</Btn>
                <Btn variant="danger" size="sm" onClick={() => updateStatus(selectedOrder.id, "cancelled")}>Cancel Order</Btn>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-bold text-[14px]">Items summary</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedOrder.items?.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-[#fcfaf7] border border-[#ebe2d2] rounded-[12px] text-[12.5px]">
                    <div className="w-6 h-6 rounded-full border border-black/10 flex-shrink-0" style={{ backgroundColor: item.colour_hex }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-[600] truncate">{item.product_name || item.product_slug}</div>
                      <div className="text-[11px] text-[#9b9589]">{item.colour_name} · {item.size} · {item.finish} ×{item.quantity}</div>
                    </div>
                    <span className="font-[700] text-graphite">{kes(item.unit_kes * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 flex justify-between font-bold text-[15px]" style={{ borderColor:"#ebe2d2" }}>
                <span>Total Amount:</span>
                <span className="text-[#B84A32]">{kes(selectedOrder.total_kes)}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ─── Payments Tab ─── */
type AdminPayment = {
  id: string;
  order_number: string;
  name: string;
  phone: string;
  amount_kes: number;
  status: string;
  mpesa_receipt: string | null;
  failure_reason: string | null;
  raw_response: any;
  created_at: string;
};

function PaymentsTab({ showToast }: { showToast: (m:string) => void }) {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [selectedPayment, setSelectedPayment] = useState<AdminPayment | null>(null);

  const load = async () => {
    setLoading(true);
    try { const data = await api("/api/admin/payments"); setPayments(data || []); }
    catch (e) { showToast(`Load failed: ${e}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = payments.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.phone?.includes(search) ||
    p.order_number?.toLowerCase().includes(search.toLowerCase()) ||
    p.mpesa_receipt?.toLowerCase().includes(search.toLowerCase())
  );

  const exportPaymentsCSV = () => {
    downloadCSV("micmikes-payments.csv", payments.map(p => ({
      Transaction_ID: p.id,
      Order_Number: p.order_number,
      Customer_Name: p.name,
      Phone: p.phone,
      Amount_KES: p.amount_kes,
      Status: p.status,
      Mpesa_Receipt: p.mpesa_receipt,
      Failure_Reason: p.failure_reason,
      Date: p.created_at,
    })));
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      initiated: "bg-blue-50 text-blue-700 border-blue-200",
      pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
      success: "bg-green-50 text-green-700 border-green-200",
      failed: "bg-red-50 text-red-700 border-red-200",
      cancelled: "bg-red-50 text-red-700 border-red-200",
      expired: "bg-gray-50 text-gray-700 border-gray-200"
    };
    return (
      <span className={`text-[11px] font-[600] px-2 py-0.5 rounded-full border ${map[s] ?? "bg-gray-50 text-gray-700"}`}>
        {s}
      </span>
    );
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>M-Pesa Payments</h2>
          <p className="text-[12px] text-[#9b9589] mt-0.5">Real-time payment logs of STK pushes and transactions.</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" size="sm" onClick={exportPaymentsCSV}>⬇ Export CSV</Btn>
          <Btn variant="outline" onClick={load}>↻ Refresh</Btn>
        </div>
      </div>

      <div className="w-full max-w-md">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name, phone, receipt or order ref…" />
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden border border-[#ebe2d2] mm-shadow">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead>
            <tr className="bg-[#fcfaf7] border-b text-[#6f6a62] font-[700]" style={{ borderColor:"#ebe2d2" }}>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">Order Ref</th>
              <th className="px-6 py-3">Customer</th>
              <th className="px-6 py-3">M-Pesa Phone</th>
              <th className="px-6 py-3">Receipt / Ref</th>
              <th className="px-6 py-3">Amount</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ebe2d2]">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-[#fcfaf7] transition">
                <td className="px-6 py-3 text-[#6f6a62]">
                  {new Date(p.created_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-6 py-3 font-mono font-[700] text-[#B84A32]">{p.order_number}</td>
                <td className="px-6 py-3 font-[600]">{p.name || "N/A"}</td>
                <td className="px-6 py-3 font-mono">{p.phone}</td>
                <td className="px-6 py-3">
                  {p.mpesa_receipt ? (
                    <span className="font-mono font-[700] text-[#16a34a]">{p.mpesa_receipt}</span>
                  ) : p.failure_reason ? (
                    <span className="text-red-600 text-[12px]" title={p.failure_reason}>
                      ⚠️ {p.failure_reason.length > 25 ? p.failure_reason.slice(0, 25) + "..." : p.failure_reason}
                    </span>
                  ) : (
                    <span className="text-[#9b9589]">—</span>
                  )}
                </td>
                <td className="px-6 py-3 font-[700]">{kes(p.amount_kes)}</td>
                <td className="px-6 py-3">{statusBadge(p.status)}</td>
                <td className="px-6 py-3 text-right">
                  <Btn variant="ghost" size="sm" onClick={() => setSelectedPayment(p)}>View Details</Btn>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-[#9b9589]">
                  No payment attempts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedPayment && (
        <Modal title={`Payment Details — ${selectedPayment.order_number}`} onClose={() => setSelectedPayment(null)} wide>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-bold text-[14px]">Transaction Details</h4>
              <div className="bg-[#f8f4ef] p-4 rounded-[12px] space-y-1.5 text-[13px]">
                <div className="flex justify-between"><span className="text-[#6f6a62]">Date/Time:</span><span>{new Date(selectedPayment.created_at).toLocaleString("en-KE")}</span></div>
                <div className="flex justify-between"><span className="text-[#6f6a62]">Order Number:</span><span className="font-[600] text-[#B84A32]">{selectedPayment.order_number}</span></div>
                <div className="flex justify-between"><span className="text-[#6f6a62]">Customer Name:</span><span>{selectedPayment.name || "N/A"}</span></div>
                <div className="flex justify-between"><span className="text-[#6f6a62]">M-Pesa Phone:</span><span className="font-mono">{selectedPayment.phone}</span></div>
                <div className="flex justify-between"><span className="text-[#6f6a62]">Amount:</span><span className="font-[700]">{kes(selectedPayment.amount_kes)}</span></div>
                <div className="flex justify-between"><span className="text-[#6f6a62]">Status:</span><span>{statusBadge(selectedPayment.status)}</span></div>
                {selectedPayment.mpesa_receipt && (
                  <div className="flex justify-between"><span className="text-[#6f6a62]">M-Pesa Receipt:</span><span className="font-mono font-[700] text-[#16a34a]">{selectedPayment.mpesa_receipt}</span></div>
                )}
                {selectedPayment.failure_reason && (
                  <div className="flex justify-between"><span className="text-[#6f6a62]">Failure Reason:</span><span className="text-red-600 font-[600]">{selectedPayment.failure_reason}</span></div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-bold text-[14px]">Safaricom Raw Response / Payload</h4>
              <div className="bg-[#f8f4ef] border border-[#ebe2d2] p-4 rounded-[12px] overflow-auto max-h-60 font-mono text-[11px] text-gray-800 whitespace-pre-wrap break-all">
                {selectedPayment.raw_response ? (
                  <pre>{JSON.stringify(selectedPayment.raw_response, null, 2)}</pre>
                ) : (
                  <span className="text-[#9b9589] italic">No raw payload logged for this attempt.</span>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ─── Delivery Tab ─── */
function DeliveryTab({ showToast }: { showToast: (m:string) => void }) {
  const [rates, setRates] = useState<DeliveryRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<Partial<DeliveryRate> | null>(null);
  const [search, setSearch]   = useState("");
  const [selectedCounty, setSelectedCounty] = useState("");

  const load = async () => {
    setLoading(true);
    try { const data = await api("/api/admin/delivery-rates"); setRates(data || []); }
    catch (e) { showToast(`Load failed: ${e}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal?.county || modal.rate_kes === undefined) return;
    try {
      if (modal.id) {
        await api("/api/admin/delivery-rates", { method:"PUT", body: JSON.stringify(modal) });
        showToast("Rate updated");
      } else {
        await api("/api/admin/delivery-rates", { method:"POST", body: JSON.stringify(modal) });
        showToast("Rate created");
      }
      setModal(null); load();
    } catch (err) { showToast(`${err}`); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this delivery zone?")) return;
    try {
      await api("/api/admin/delivery-rates", { method:"DELETE", body: JSON.stringify({ id }) });
      showToast("Rate deleted"); load();
    } catch (err) { showToast(`${err}`); }
  };

  const uniqueCounties = Array.from(new Set(rates.map(r => r.county))).sort();

  const filteredRates = rates.filter(r => {
    const matchesSearch = r.town?.toLowerCase().includes(search.toLowerCase()) || r.county?.toLowerCase().includes(search.toLowerCase());
    const matchesCounty = selectedCounty === "" || r.county === selectedCounty;
    return matchesSearch && matchesCounty;
  });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Delivery Zones & Rates</h2>
          <p className="text-[12px] text-[#9b9589] mt-0.5">Manage delivery rates across Kenyan counties and towns.</p>
        </div>
        <Btn onClick={() => setModal({ county:"", town:"", rate_kes:0 })}>+ Add Rate</Btn>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by town or county…" />
        </div>
        <div className="w-56">
          <select 
            value={selectedCounty} 
            onChange={(e) => setSelectedCounty(e.target.value)}
            className="w-full px-3 py-2 rounded-[12px] border border-[#d8ccb8] text-[13px] bg-white focus:outline-none focus:border-[#B84A32] transition"
          >
            <option value="">All Counties</option>
            {uniqueCounties.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden border border-[#ebe2d2] mm-shadow">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead>
            <tr className="bg-[#fcfaf7] border-b text-[#6f6a62] font-[700]" style={{ borderColor:"#ebe2d2" }}>
              <th className="px-6 py-3">County</th>
              <th className="px-6 py-3">Locality / Town</th>
              <th className="px-6 py-3">Rate (KES)</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ebe2d2]">
            {filteredRates.map(r => (
              <tr key={r.id} className="hover:bg-[#fcfaf7] transition">
                <td className="px-6 py-3 font-[600]">{r.county}</td>
                <td className="px-6 py-3">{r.town || <span className="text-[#9b9589] italic">Any location</span>}</td>
                <td className="px-6 py-3 font-[700]">{r.rate_kes === 0 ? "Free" : kes(r.rate_kes)}</td>
                <td className="px-6 py-3 text-right space-x-2">
                  <Btn variant="ghost" size="sm" onClick={() => setModal(r)}>Edit</Btn>
                  <Btn variant="danger" size="sm" onClick={() => remove(r.id)}>Delete</Btn>
                </td>
              </tr>
            ))}
            {filteredRates.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-[#9b9589]">
                  No delivery zones found matching the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? "Edit Delivery Rate" : "Add Delivery Rate"} onClose={() => setModal(null)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="County Name (e.g. Nairobi)"><input className={inp} value={modal.county} onChange={e=>setModal({...modal, county:e.target.value})} placeholder="e.g. Nairobi" required /></Field>
            <Field label="Locality / Town (optional)"><input className={inp} value={modal.town || ""} onChange={e=>setModal({...modal, town:e.target.value})} placeholder="e.g. Westlands" /></Field>
            <Field label="Delivery Rate (KES)"><input type="number" className={inp} value={modal.rate_kes} onChange={e=>setModal({...modal, rate_kes:Number(e.target.value)})} placeholder="500" min="0" required /></Field>
            <div className="pt-2 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn type="submit">Save Rate</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ─── Stock Tab ─── */
function StockTab({ showToast }: { showToast: (m:string) => void }) {
  const [stock, setStock] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<StockEntry | null>(null);

  const load = async () => {
    setLoading(true);
    try { const data = await api("/api/admin/stock"); setStock(data || []); }
    catch (e) { showToast(`Load failed: ${e}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    try {
      await api("/api/admin/stock", {
        method:"PUT",
        body: JSON.stringify({ id: modal.id, stock: modal.stock, low_stock_threshold: modal.low_stock_threshold }),
      });
      showToast("Stock updated"); setModal(null); load();
    } catch (err) { showToast(`${err}`); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Stock levels</h2>
        <Btn variant="outline" onClick={load}>↻ Refresh</Btn>
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden border border-[#ebe2d2] mm-shadow">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead>
            <tr className="bg-[#fcfaf7] border-b text-[#6f6a62] font-[700]" style={{ borderColor:"#ebe2d2" }}>
              <th className="px-6 py-3">Product</th>
              <th className="px-6 py-3">Size</th>
              <th className="px-6 py-3">Colour / Shade</th>
              <th className="px-6 py-3 text-center">Available Stock</th>
              <th className="px-6 py-3 text-center">Threshold</th>
              <th className="px-6 py-3 text-center">Status</th>
              <th className="px-6 py-3 text-right">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ebe2d2]">
            {stock.map(s => {
              const isLow = s.stock <= s.low_stock_threshold;
              return (
                <tr key={s.id} className="hover:bg-[#fcfaf7] transition">
                  <td className="px-6 py-3 font-[600]">{s.product_name}</td>
                  <td className="px-6 py-3 font-mono text-[12px]">{s.size}</td>
                  <td className="px-6 py-3">{s.colour_name || <span className="text-[#9b9589] italic">Default (no shade)</span>}</td>
                  <td className="px-6 py-3 text-center font-[700]">{s.stock} units</td>
                  <td className="px-6 py-3 text-center text-[#6f6a62]">{s.low_stock_threshold}</td>
                  <td className="px-6 py-3 text-center">
                    {isLow ? (
                      <span className="text-[11px] font-[600] px-2.5 py-0.5 rounded-full bg-[#fff0ee] text-[#a43a25] border border-[#f5c8be]">Low Stock</span>
                    ) : (
                      <span className="text-[11px] font-[600] px-2.5 py-0.5 rounded-full bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]">Good</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Btn variant="ghost" size="sm" onClick={() => setModal(s)}>Adjust</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={`Adjust Stock — ${modal.product_name}`} onClose={() => setModal(null)}>
          <form onSubmit={save} className="space-y-4">
            <div className="bg-[#f8f4ef] p-4 rounded-[12px] text-[13px] mb-2 space-y-1">
              <div><span className="text-[#6f6a62]">Variant:</span> <span className="font-[600]">{modal.size} · {modal.colour_name || "Size-only"}</span></div>
            </div>
            <Field label="Available Stock Qty"><input type="number" className={inp} value={modal.stock} onChange={e=>setModal({...modal, stock:Number(e.target.value)})} placeholder="10" min="0" required /></Field>
            <Field label="Low Stock Threshold Alert"><input type="number" className={inp} value={modal.low_stock_threshold} onChange={e=>setModal({...modal, low_stock_threshold:Number(e.target.value)})} placeholder="5" min="0" required /></Field>
            <div className="pt-2 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn type="submit">Update Stock</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ─── Customers Tab ─── */
function CustomersTab({ showToast }: { showToast: (m:string) => void }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");

  const load = async () => {
    setLoading(true);
    try { const data = await api("/api/admin/customers"); setCustomers(data || []); }
    catch (e) { showToast(`Load failed: ${e}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = customers.filter(c =>
    (c.name?.toLowerCase() || "").includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    (c.email?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const exportCustomersCSV = () => {
    downloadCSV("micmikes-customers.csv", customers.map(c => ({
      Customer_Name: c.name,
      Email: c.email,
      Phone: c.phone,
      County: c.county,
      Town: c.town,
      Order_Count: c.order_count,
      Total_Spent_KES: c.total_spent_kes,
      Last_Order_At: c.last_order_at,
    })));
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Customers</h2>
        <div className="flex gap-2">
          <Btn variant="outline" size="sm" onClick={exportCustomersCSV}>⬇ Export CSV</Btn>
          <Btn variant="outline" onClick={load}>↻ Refresh</Btn>
        </div>
      </div>

      <div className="w-full max-w-md">
        <SearchBar value={search} onChange={setSearch} placeholder="Search customers by name, phone or email…" />
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden border border-[#ebe2d2] mm-shadow">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead>
            <tr className="bg-[#fcfaf7] border-b text-[#6f6a62] font-[700]" style={{ borderColor:"#ebe2d2" }}>
              <th className="px-6 py-3">Customer Name</th>
              <th className="px-6 py-3">Contact Details</th>
              <th className="px-6 py-3">Location</th>
              <th className="px-6 py-3 text-center">Orders Placed</th>
              <th className="px-6 py-3 text-right">Total Spent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ebe2d2]">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-[#fcfaf7] transition">
                <td className="px-6 py-3">
                  <div className="font-[600]">{c.name || <span className="text-[#9b9589] italic">Guest buyer</span>}</div>
                </td>
                <td className="px-6 py-3">
                  <div className="font-mono text-[12px]">{c.phone}</div>
                  <div className="text-[11px] text-[#9b9589]">{c.email}</div>
                </td>
                <td className="px-6 py-3 text-[#6f6a62]">{c.town}, {c.county}</td>
                <td className="px-6 py-3 text-center font-[600]">{c.order_count} orders</td>
                <td className="px-6 py-3 text-right font-[700] text-[#B84A32]">{kes(c.total_spent_kes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [form, setForm]     = useState({ name:"", email:"", phone:"", role:"staff" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api("/api/users?_r=list"); setUsers(d.users ?? []); }
    catch (e) { showToast(`${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setForm({ name:"", email:"", phone:"", role:"staff" }); setModal("new"); };
  const openEdit = (u: StaffUser) => { setForm({ name:u.name, email:u.email??"", phone:u.phone??"", role:u.role }); setModal(u); };

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
    return !q || u.name.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q)) || (u.phone && u.phone.includes(q));
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
        <p className="text-[13px] py-8 text-center text-[#9b9589]">No staff members yet.</p>
      )}

      <div className="space-y-2">
        {filtered.map(u => (
          <div key={u.id} className="bg-white rounded-[14px] px-4 py-3 flex flex-wrap items-center gap-3 hover:shadow-sm transition border border-[#ebe2d2]">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[14px] font-[700] bg-[#f5ede3] text-[#B84A32]">
              {u.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-[700]">{u.name}</p>
              <div className="flex flex-wrap gap-3 mt-0.5">
                {u.email && <span className="text-[11px] text-[#9b9589]">{u.email}</span>}
                {u.phone && <span className="text-[11px] text-[#9b9589]">{u.phone}</span>}
              </div>
            </div>
            <span className="text-[11px] font-[600] px-2 py-0.5 rounded-full capitalize bg-[#f5ede3] text-[#B84A32]">{u.role}</span>
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
              <input className={inp} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
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
