import { useCallback, useEffect, useState } from "react";

/* ─── types ─── */
type AdminColour  = { id: string; code: string; name: string; hex: string; family: string };
type AdminVariant = { id: string; product_id: string; size: string; price_kes: number };
type AdminProduct = { id: string; slug: string; name: string; blurb: string; category: string; image_url: string; variants: AdminVariant[] };
type AdminRoom    = { id: string; name: string; photo_url: string; wall_mask: string; sort_order: number };
type AdminOrder   = { id: string; name: string; email: string; phone: string; county: string; town: string; total_kes: number; status: string; mpesa_ref: string; created_at: string; items: AdminOrderItem[] };
type AdminOrderItem = { product_slug: string; colour_name: string; colour_hex: string; size: string; finish: string; quantity: number; unit_kes: number };
type DeliveryRate = { id: string; county: string; town: string | null; rate_kes: number; updated_at: string };

type DashboardData = {
  revenue: { today: number; this_week: number; this_month: number; all_time: number; total_orders: number; avg_order_value: number };
  byStatus: { status: string; count: number }[];
  topProducts: { name: string; slug: string; image_url: string; category: string; units_sold: number; revenue_kes: number; order_count: number }[];
  slowMovers: { name: string; slug: string; category: string; image_url: string; last_ordered: string | null }[];
  recentOrders: { id: string; name: string; email: string; phone: string; county: string; town: string; total_kes: number; status: string; mpesa_ref: string; created_at: string }[];
  mpesa: { total: number; success: number; cancelled: number; failed: number };
  byCounty: { county: string; orders: number; revenue_kes: number }[];
};

type Tab = "dashboard" | "colours" | "products" | "rooms" | "orders" | "delivery";

const FAMILIES = ["Neutrals","Warm Earth","Cool Green","Blue","Red & Terracotta","Yellow & Gold"];
const CATEGORIES = ["Paint","Primer","Supplies"];
const STATUSES   = ["pending","paid","processing","shipped","delivered","cancelled"];
const kes = (n: number) => `KES ${Number(n).toLocaleString("en-KE")}`;
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

/* ─── shared UI pieces ─── */
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
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background:"#F8F4EF", fontFamily:'"Inter",system-ui,sans-serif', color:"#2B2B2E" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
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
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full text-white text-[13px] font-[600] shadow-lg"
          style={{ background:"#2B2B2E" }}>
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api("/api/admin/dashboard");
      setData(d);
      setLastRefresh(new Date());
    } catch (e) { showToast(`Dashboard error: ${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div className="space-y-8">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Dashboard</h2>
          <p className="text-[12px] mt-0.5" style={{ color:"#9b9589" }}>Last refreshed {lastRefresh.toLocaleTimeString("en-KE")}</p>
        </div>
        <Btn variant="outline" onClick={load}>↻ Refresh</Btn>
      </div>

      {/* ── Revenue KPIs ── */}
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

      {/* ── Secondary KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-[16px] p-5" style={{ border:"1px solid #ebe2d2" }}>
          <p className="text-[11px] font-[700] uppercase tracking-wide" style={{ color:"#9b9589" }}>Total Orders</p>
          <p className="text-[28px] font-[700] mt-1" style={{ color:"#2B2B2E" }}>{Number(revenue.total_orders).toLocaleString()}</p>
          <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>all time (excl. cancelled)</p>
        </div>
        <div className="bg-white rounded-[16px] p-5" style={{ border:"1px solid #ebe2d2" }}>
          <p className="text-[11px] font-[700] uppercase tracking-wide" style={{ color:"#9b9589" }}>Avg Order Value</p>
          <p className="text-[22px] font-[700] mt-1" style={{ color:"#2B2B2E" }}>{kes(revenue.avg_order_value ?? 0)}</p>
          <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>per order</p>
        </div>
        <div className="bg-white rounded-[16px] p-5" style={{ border:"1px solid #ebe2d2" }}>
          <p className="text-[11px] font-[700] uppercase tracking-wide" style={{ color:"#9b9589" }}>M-Pesa Success</p>
          <p className="text-[28px] font-[700] mt-1" style={{ color: mpesaRate >= 80 ? "#16a34a" : mpesaRate >= 50 ? "#d97706" : "#dc2626" }}>
            {mpesaRate}%
          </p>
          <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>{mpesa.success}/{mpesa.total} payments · 30 days</p>
        </div>
        <div className="bg-white rounded-[16px] p-5" style={{ border:"1px solid #ebe2d2" }}>
          <p className="text-[11px] font-[700] uppercase tracking-wide" style={{ color:"#9b9589" }}>Pending Orders</p>
          <p className="text-[28px] font-[700] mt-1" style={{ color: (statusMap["pending"] ?? 0) > 0 ? "#d97706" : "#16a34a" }}>
            {statusMap["pending"] ?? 0}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>awaiting payment</p>
        </div>
      </div>

      {/* ── Orders by Status + M-Pesa breakdown ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-[16px] p-6" style={{ border:"1px solid #ebe2d2" }}>
          <h3 className="font-[700] text-[14px] mb-4">Orders by Status</h3>
          <div className="space-y-3">
            {statusOrder.map(s => {
              const count = statusMap[s] ?? 0;
              const total = byStatus.reduce((a,r) => a + Number(r.count), 0) || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={s}>
                  <div className="flex items-center justify-between mb-1">
                    <StatusBadge s={s} />
                    <span className="text-[12px] font-[600]" style={{ color:"#2B2B2E" }}>{count} <span style={{color:"#9b9589",fontWeight:400}}>({pct}%)</span></span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background:"#f0ebe2" }}>
                    <div className="h-1.5 rounded-full transition-all" style={{ width:`${pct}%`, background: statusColours[s] ?? "#9b9589" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-[16px] p-6" style={{ border:"1px solid #ebe2d2" }}>
          <h3 className="font-[700] text-[14px] mb-4">Revenue by County</h3>
          {byCounty.length === 0
            ? <p className="text-[13px]" style={{color:"#9b9589"}}>No county data yet.</p>
            : (
              <div className="space-y-3">
                {byCounty.map((row, i) => {
                  const max = Number(byCounty[0].revenue_kes) || 1;
                  const pct = Math.round((Number(row.revenue_kes) / max) * 100);
                  return (
                    <div key={row.county}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-[600]">{i+1}. {row.county}</span>
                        <span className="text-[12px]" style={{color:"#6f6a62"}}>{kes(row.revenue_kes)} · {row.orders} orders</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background:"#f0ebe2" }}>
                        <div className="h-1.5 rounded-full" style={{ width:`${pct}%`, background:"#B84A32" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>
      </div>

      {/* ── Top Products ── */}
      <div className="bg-white rounded-[16px] p-6" style={{ border:"1px solid #ebe2d2" }}>
        <h3 className="font-[700] text-[14px] mb-4">🔥 Top Selling Products <span className="font-[400] text-[12px]" style={{color:"#9b9589"}}>(last 90 days)</span></h3>
        {topProducts.length === 0
          ? <p className="text-[13px]" style={{color:"#9b9589"}}>No sales data yet — orders will appear here once placed.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{borderBottom:"1px solid #ebe2d2"}}>
                    <th className="text-left pb-2 font-[700]" style={{color:"#9b9589"}}>#</th>
                    <th className="text-left pb-2 font-[700]" style={{color:"#9b9589"}}>Product</th>
                    <th className="text-right pb-2 font-[700]" style={{color:"#9b9589"}}>Units</th>
                    <th className="text-right pb-2 font-[700]" style={{color:"#9b9589"}}>Orders</th>
                    <th className="text-right pb-2 font-[700]" style={{color:"#9b9589"}}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={p.slug} style={{borderBottom:"1px solid #f5f0e8"}}>
                      <td className="py-2.5 pr-3 font-[700]" style={{color:"#9b9589"}}>{i+1}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <img src={p.image_url} alt={p.name} className="w-8 h-8 rounded-[6px] object-cover bg-[#f5f0e8]" />
                          <div>
                            <div className="font-[600]">{p.name}</div>
                            <div style={{color:"#9b9589"}}>{p.category}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-[600]">{Number(p.units_sold).toLocaleString()}</td>
                      <td className="py-2.5 text-right" style={{color:"#6f6a62"}}>{Number(p.order_count).toLocaleString()}</td>
                      <td className="py-2.5 text-right font-[700]" style={{color:"#B84A32"}}>{kes(p.revenue_kes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      {/* ── Slow Movers ── */}
      <div className="bg-white rounded-[16px] p-6" style={{ border:"1px solid #ebe2d2" }}>
        <h3 className="font-[700] text-[14px] mb-1">🐌 Slow / Dead Stock <span className="font-[400] text-[12px]" style={{color:"#9b9589"}}>(no orders in 60+ days)</span></h3>
        <p className="text-[12px] mb-4" style={{color:"#9b9589"}}>Consider running promotions or discounts on these items.</p>
        {slowMovers.length === 0
          ? <p className="text-[13px]" style={{color:"#16a34a"}}>✓ All products have recent orders — great!</p>
          : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {slowMovers.map(p => (
                <div key={p.slug} className="flex items-center gap-3 p-3 rounded-[12px]" style={{background:"#fff8f5", border:"1px solid #f5c8be"}}>
                  <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-[8px] object-cover flex-shrink-0 bg-[#f5f0e8]" />
                  <div className="min-w-0">
                    <div className="font-[600] text-[12px] truncate">{p.name}</div>
                    <div className="text-[11px]" style={{color:"#9b9589"}}>{p.category}</div>
                    <div className="text-[11px] font-[600]" style={{color:"#a43a25"}}>
                      Last: {fmt(p.last_ordered)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>

      {/* ── Recent Orders ── */}
      <div className="bg-white rounded-[16px] p-6" style={{ border:"1px solid #ebe2d2" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-[700] text-[14px]">Recent Orders</h3>
          <span className="text-[11px]" style={{color:"#9b9589"}}>Latest 10</span>
        </div>
        {recentOrders.length === 0
          ? <p className="text-[13px]" style={{color:"#9b9589"}}>No orders yet.</p>
          : (
            <div className="space-y-2">
              {recentOrders.map(o => (
                <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-[12px]" style={{background:"#fafaf8", border:"1px solid #ebe2d2"}}>
                  <StatusBadge s={o.status} />
                  <div className="flex-1 min-w-0">
                    <span className="font-[600] text-[13px]">{o.name}</span>
                    <span className="text-[12px] ml-2" style={{color:"#6f6a62"}}>{o.county}{o.town ? `, ${o.town}` : ""}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px]">
                    {o.mpesa_ref
                      ? <span className="font-mono px-2 py-0.5 rounded-[6px]" style={{background:"#f0fdf4",color:"#16a34a",border:"1px solid #bbf7d0"}}>{o.mpesa_ref}</span>
                      : <span className="font-mono px-2 py-0.5 rounded-[6px]" style={{background:"#fefce8",color:"#a16207",border:"1px solid #fde68a"}}>no ref</span>
                    }
                    <span className="font-[700]" style={{color:"#B84A32"}}>{kes(o.total_kes)}</span>
                    <span style={{color:"#9b9589"}}>{timeAgo(o.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   COLOURS TAB
════════════════════════════════════════════════ */
const blankColour = (): Omit<AdminColour,"id"> => ({ code:"", name:"", hex:"#B84A32", family:"Neutrals" });

function ColoursTab({ showToast }: { showToast: (m: string) => void }) {
  const [colours, setColours] = useState<AdminColour[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminColour | null>(null);
  const [adding,  setAdding]  = useState(false);
  const [draft,   setDraft]   = useState(blankColour());
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState<string|null>(null);
  const [search,  setSearch]  = useState("");
  const [fam,     setFam]     = useState("All");

  const load = useCallback(async () => {
    try { setColours(await api("/api/admin/colours")); }
    catch (e) { showToast(`Error: ${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (c: AdminColour) => { setEditing(c); setDraft({ code:c.code, name:c.name, hex:c.hex, family:c.family }); };
  const openAdd  = () => { setAdding(true); setDraft(blankColour()); };
  const closeModal = () => { setEditing(null); setAdding(false); };

  const save = async () => {
    setSaving(true);
    try {
      if (adding) {
        const row = await api("/api/admin/colours", { method:"POST", body: JSON.stringify(draft) });
        setColours(prev => [...prev, row]);
        showToast(`✓ Added ${row.name}`);
      } else if (editing) {
        const row = await api("/api/admin/colours", { method:"PUT", body: JSON.stringify({ id: editing.id, ...draft }) });
        setColours(prev => prev.map(c => c.id===row.id ? row : c));
        showToast(`✓ Saved ${row.name}`);
      }
      closeModal();
    } catch (e) { showToast(`Error: ${e}`); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    try {
      await api("/api/admin/colours", { method:"DELETE", body: JSON.stringify({ id }) });
      setColours(prev => prev.filter(c => c.id!==id));
      showToast("✓ Colour deleted");
    } catch (e) { showToast(`Error: ${e}`); }
    setConfirm(null);
  };

  const filtered = colours
    .filter(c => fam==="All" || c.family===fam)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.hex.toLowerCase().includes(search.toLowerCase()));

  const byFamily = FAMILIES.reduce<Record<string, AdminColour[]>>((acc, f) => {
    acc[f] = filtered.filter(c => c.family===f);
    return acc;
  }, {});

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Colours</h2>
          <p className="text-[13px] mt-0.5" style={{ color:"#6f6a62" }}>{colours.length} colours across {FAMILIES.length} families</p>
        </div>
        <Btn onClick={openAdd}>+ Add colour</Btn>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <input className={inp + " max-w-[220px]"} placeholder="Search name or hex…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className={sel + " w-auto"} value={fam} onChange={e=>setFam(e.target.value)}>
          <option value="All">All families</option>
          {FAMILIES.map(f => <option key={f}>{f}</option>)}
        </select>
      </div>

      {fam==="All" ? (
        FAMILIES.map(f => byFamily[f].length ? (
          <div key={f} className="mb-8">
            <h3 className="text-[12px] font-[700] uppercase tracking-widest mb-3" style={{ color:"#9b9589" }}>{f}</h3>
            <ColourGrid colours={byFamily[f]} onEdit={openEdit} onDelete={id=>setConfirm(id)} />
          </div>
        ) : null)
      ) : (
        <ColourGrid colours={filtered} onEdit={openEdit} onDelete={id=>setConfirm(id)} />
      )}

      {(editing||adding) && (
        <Modal title={adding ? "Add colour" : `Edit - ${editing!.name}`} onClose={closeModal}>
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-[14px]" style={{ background:"#f5f0e8" }}>
              <div className="relative">
                <div className="w-16 h-16 rounded-[14px] shadow-md" style={{ background: draft.hex }} />
                <input type="color" value={draft.hex}
                  onChange={e => setDraft(d => ({...d, hex: e.target.value}))}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" title="Pick colour" />
              </div>
              <div>
                <div className="font-[700] text-[15px]">{draft.name||"New colour"}</div>
                <div className="text-[13px] font-mono mt-0.5" style={{ color:"#6f6a62" }}>{draft.hex.toUpperCase()}</div>
                <div className="text-[11px] mt-0.5" style={{ color:"#9b9589" }}>Click swatch to pick colour</div>
              </div>
            </div>
            <Field label="Hex code">
              <input className={inp} value={draft.hex} onChange={e=>setDraft(d=>({...d,hex:e.target.value}))} placeholder="#B84A32" maxLength={7} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Display name">
                <input className={inp} value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="Masai Red" />
              </Field>
              <Field label="Code (e.g. col_10)">
                <input className={inp} value={draft.code} onChange={e=>setDraft(d=>({...d,code:e.target.value}))} placeholder="col_10" />
              </Field>
            </div>
            <Field label="Family">
              <select className={sel} value={draft.family} onChange={e=>setDraft(d=>({...d,family:e.target.value}))}>
                {FAMILIES.map(f=><option key={f}>{f}</option>)}
              </select>
            </Field>
            <div className="flex gap-2 pt-2">
              <Btn onClick={closeModal} variant="outline">Cancel</Btn>
              <Btn onClick={save} disabled={saving||!draft.name||!draft.hex}>
                {saving ? "Saving…" : adding ? "Add colour" : "Save changes"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title="Delete colour?" onClose={()=>setConfirm(null)}>
          <p className="text-[13px] mb-5" style={{ color:"#6f6a62" }}>
            This will remove the colour from the palette. Any product-colour associations will also be deleted.
          </p>
          <div className="flex gap-2">
            <Btn variant="outline" onClick={()=>setConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={()=>del(confirm!)}>Delete</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ColourGrid({ colours, onEdit, onDelete }: {
  colours: AdminColour[]; onEdit: (c: AdminColour)=>void; onDelete:(id:string)=>void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {colours.map(c => (
        <div key={c.id} className="bg-white rounded-[14px] overflow-hidden shadow-sm group" style={{ border:"1px solid #ebe2d2" }}>
          <div className="h-20 w-full" style={{ background: c.hex }} />
          <div className="p-3">
            <div className="font-[600] text-[12px] leading-tight truncate">{c.name}</div>
            <div className="text-[11px] font-mono mt-0.5" style={{ color:"#6f6a62" }}>{c.hex.toUpperCase()}</div>
            <div className="text-[10px] mt-0.5" style={{ color:"#9b9589" }}>{c.code} · {c.family}</div>
            <div className="flex gap-1 mt-2">
              <button onClick={()=>onEdit(c)} className="flex-1 py-1 rounded-[7px] text-[11px] font-[600] transition hover:bg-[#f5ede3]" style={{ border:"1px solid #e3d5bc", color:"#6f6a62" }}>Edit</button>
              <button onClick={()=>onDelete(c.id)} className="px-2 py-1 rounded-[7px] text-[11px] font-[600] transition hover:bg-[#fff0ee]" style={{ border:"1px solid #f5c8be", color:"#a43a25" }}>✕</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════
   PRODUCTS TAB
════════════════════════════════════════════════ */
const blankProduct = (): Omit<AdminProduct,"id"|"variants"> => ({
  slug:"", name:"", blurb:"", category:"Paint", image_url:"",
});

function ProductsTab({ showToast }: { showToast: (m:string)=>void }) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState<AdminProduct|null>(null);
  const [adding,   setAdding]   = useState(false);
  const [draft,    setDraft]    = useState<Omit<AdminProduct,"id"|"variants">>(blankProduct());
  const [prices,   setPrices]   = useState<Record<string,number>>({});
  const [saving,   setSaving]   = useState(false);
  const [confirm,  setConfirm]  = useState<string|null>(null);

  const load = useCallback(async () => {
    try { setProducts(await api("/api/admin/products")); }
    catch (e) { showToast(`Error: ${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (p: AdminProduct) => {
    setEditing(p);
    setDraft({ slug:p.slug, name:p.name, blurb:p.blurb, category:p.category, image_url:p.image_url });
    const priceMap: Record<string,number> = {};
    p.variants.forEach(v => { priceMap[v.id] = v.price_kes; });
    setPrices(priceMap);
  };
  const openAdd  = () => { setAdding(true); setDraft(blankProduct()); setPrices({}); };
  const closeModal = () => { setEditing(null); setAdding(false); };

  const save = async () => {
    setSaving(true);
    try {
      if (adding) {
        const d = { ...draft, slug: draft.slug || slug(draft.name) };
        const row = await api("/api/admin/products", { method:"POST", body: JSON.stringify(d) });
        setProducts(prev => [...prev, { ...row, variants:[] }]);
        showToast(`✓ Added ${row.name}`);
      } else if (editing) {
        const row = await api("/api/admin/products", { method:"PUT", body: JSON.stringify({ id:editing.id, ...draft }) });
        await Promise.all(
          editing.variants.map(v =>
            prices[v.id] !== undefined && prices[v.id] !== v.price_kes
              ? api("/api/admin/variants", { method:"PUT", body: JSON.stringify({ id:v.id, price_kes: prices[v.id] }) })
              : Promise.resolve()
          )
        );
        const updatedVariants = editing.variants.map(v => ({ ...v, price_kes: prices[v.id] ?? v.price_kes }));
        setProducts(prev => prev.map(p => p.id===editing.id ? { ...row, variants: updatedVariants } : p));
        showToast(`✓ Saved ${row.name}`);
      }
      closeModal();
    } catch (e) { showToast(`Error: ${e}`); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    try {
      await api("/api/admin/products", { method:"DELETE", body: JSON.stringify({ id }) });
      setProducts(prev => prev.filter(p => p.id!==id));
      showToast("✓ Product deleted");
    } catch (e) { showToast(`Error: ${e}`); }
    setConfirm(null);
  };

  if (loading) return <Spinner />;

  const byCategory = CATEGORIES.reduce<Record<string,AdminProduct[]>>((acc,c)=>{
    acc[c] = products.filter(p=>p.category===c); return acc;
  },{});

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Products</h2>
          <p className="text-[13px] mt-0.5" style={{ color:"#6f6a62" }}>{products.length} products · prices in KES</p>
        </div>
        <Btn onClick={openAdd}>+ Add product</Btn>
      </div>

      {CATEGORIES.map(cat => byCategory[cat].length ? (
        <div key={cat} className="mb-8">
          <h3 className="text-[12px] font-[700] uppercase tracking-widest mb-3" style={{ color:"#9b9589" }}>{cat}</h3>
          <div className="space-y-3">
            {byCategory[cat].map(p => (
              <div key={p.id} className="bg-white rounded-[16px] p-4 flex gap-4 items-start" style={{ border:"1px solid #ebe2d2" }}>
                <img src={p.image_url} alt={p.name} className="w-20 h-14 object-cover rounded-[10px] flex-shrink-0 bg-[#f5f0e8]" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-[700] text-[14px]">{p.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background:"#f5ede3", color:"#B84A32" }}>{p.category}</span>
                  </div>
                  <p className="text-[12px] mt-1 line-clamp-2" style={{ color:"#6f6a62" }}>{p.blurb}</p>
                  <div className="flex gap-3 mt-2">
                    {p.variants.map(v => (
                      <span key={v.id} className="text-[11px] font-[600]" style={{ color:"#2B2B2E" }}>
                        {v.size}: <span style={{ color:"#B84A32" }}>{kes(v.price_kes)}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Btn size="sm" variant="outline" onClick={()=>openEdit(p)}>Edit</Btn>
                  <Btn size="sm" variant="danger" onClick={()=>setConfirm(p.id)}>✕</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null)}

      {(editing||adding) && (
        <Modal title={adding ? "Add product" : `Edit - ${editing!.name}`} onClose={closeModal} wide>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Product name">
                <input className={inp} value={draft.name}
                  onChange={e=>setDraft(d=>({...d, name:e.target.value, slug: slug(e.target.value)}))}
                  placeholder="Keekorok Matte Emulsion" />
              </Field>
              <Field label="Slug (URL key)" hint="Auto-generated from name">
                <input className={inp} value={draft.slug} onChange={e=>setDraft(d=>({...d,slug:e.target.value}))} placeholder="keekorok-matte-emulsion" />
              </Field>
            </div>
            <Field label="Short description">
              <textarea className={inp + " resize-none"} rows={2} value={draft.blurb}
                onChange={e=>setDraft(d=>({...d,blurb:e.target.value}))} placeholder="Ultra-smooth zero-sheen interior wall paint…" />
            </Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Category">
                <select className={sel} value={draft.category} onChange={e=>setDraft(d=>({...d,category:e.target.value}))}>
                  {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Image URL">
                <input className={inp} value={draft.image_url} onChange={e=>setDraft(d=>({...d,image_url:e.target.value}))} placeholder="https://…" />
              </Field>
            </div>
            {draft.image_url && (
              <img src={draft.image_url} alt="" className="w-full h-40 object-cover rounded-[12px]" onError={e=>(e.currentTarget.style.display="none")} />
            )}
            {editing && editing.variants.length > 0 && (
              <div>
                <div className="text-[12px] font-[700] uppercase tracking-wide mb-3" style={{ color:"#6f6a62" }}>Pricing (KES)</div>
                <div className="grid grid-cols-3 gap-3">
                  {editing.variants.map(v => (
                    <Field key={v.id} label={v.size}>
                      <input type="number" className={inp} value={prices[v.id] ?? v.price_kes}
                        onChange={e=>setPrices(p=>({...p,[v.id]:parseInt(e.target.value)||0}))}
                        min={0} step={50} />
                    </Field>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Btn variant="outline" onClick={closeModal}>Cancel</Btn>
              <Btn onClick={save} disabled={saving||!draft.name}>
                {saving ? "Saving…" : adding ? "Add product" : "Save changes"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title="Delete product?" onClose={()=>setConfirm(null)}>
          <p className="text-[13px] mb-5" style={{ color:"#6f6a62" }}>This will permanently delete the product and all its size variants.</p>
          <div className="flex gap-2">
            <Btn variant="outline" onClick={()=>setConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={()=>del(confirm!)}>Delete</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════
   ROOMS TAB
════════════════════════════════════════════════ */
const blankRoom = (): Omit<AdminRoom,"id"> => ({ name:"", photo_url:"", wall_mask:"", sort_order:99 });

function RoomsTab({ showToast }: { showToast: (m:string)=>void }) {
  const [rooms,   setRooms]   = useState<AdminRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminRoom|null>(null);
  const [adding,  setAdding]  = useState(false);
  const [draft,   setDraft]   = useState<Omit<AdminRoom,"id">>(blankRoom());
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState<string|null>(null);

  const load = useCallback(async () => {
    try { setRooms(await api("/api/admin/rooms")); }
    catch (e) { showToast(`Error: ${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (r: AdminRoom) => { setEditing(r); setDraft({ name:r.name, photo_url:r.photo_url, wall_mask:r.wall_mask??"", sort_order:r.sort_order }); };
  const openAdd  = () => { setAdding(true); setDraft(blankRoom()); };
  const closeModal = () => { setEditing(null); setAdding(false); };

  const save = async () => {
    setSaving(true);
    try {
      if (adding) {
        const row = await api("/api/admin/rooms", { method:"POST", body: JSON.stringify(draft) });
        setRooms(prev=>[...prev,row]);
        showToast(`✓ Added ${row.name}`);
      } else if (editing) {
        const row = await api("/api/admin/rooms", { method:"PUT", body: JSON.stringify({ id:editing.id, ...draft }) });
        setRooms(prev=>prev.map(r=>r.id===row.id?row:r));
        showToast(`✓ Saved ${row.name}`);
      }
      closeModal();
    } catch (e) { showToast(`Error: ${e}`); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    try {
      await api("/api/admin/rooms", { method:"DELETE", body: JSON.stringify({ id }) });
      setRooms(prev=>prev.filter(r=>r.id!==id));
      showToast("✓ Room deleted");
    } catch (e) { showToast(`Error: ${e}`); }
    setConfirm(null);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Rooms</h2>
          <p className="text-[13px] mt-0.5" style={{ color:"#6f6a62" }}>{rooms.length} rooms · shown in the visualizer</p>
        </div>
        <Btn onClick={openAdd}>+ Add room</Btn>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map(r => (
          <div key={r.id} className="bg-white rounded-[16px] overflow-hidden" style={{ border:"1px solid #ebe2d2" }}>
            <div className="relative">
              <img src={r.photo_url} alt={r.name} className="w-full h-44 object-cover bg-[#f5f0e8]" />
              {r.wall_mask && (
                <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents:"none" }} preserveAspectRatio="none">
                  <polygon points={r.wall_mask.split(" ").map(pt => {
                    const [x,y]=pt.split(","); return `${parseFloat(x)*100}%,${parseFloat(y)*100}%`;
                  }).join(" ")} fill="rgba(184,74,50,0.25)" stroke="#B84A32" strokeWidth="1.5" />
                </svg>
              )}
              <div className="absolute top-2 left-2 px-2 py-1 rounded-full text-[10px] font-[700]"
                style={{ background:"rgba(255,255,255,.9)", color:"#2B2B2E" }}>
                #{r.sort_order} · {r.wall_mask ? "Mask set" : "No mask"}
              </div>
            </div>
            <div className="p-4">
              <div className="font-[700] text-[14px]">{r.name}</div>
              <p className="text-[11px] mt-1 truncate" style={{ color:"#9b9589" }}>{r.photo_url}</p>
              <div className="flex gap-1 mt-3">
                <Btn size="sm" variant="outline" onClick={()=>openEdit(r)}>Edit</Btn>
                <Btn size="sm" variant="danger" onClick={()=>setConfirm(r.id)}>Delete</Btn>
              </div>
            </div>
          </div>
        ))}
      </div>

      {(editing||adding) && (
        <Modal title={adding ? "Add room" : `Edit - ${editing!.name}`} onClose={closeModal} wide>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Room name">
                <input className={inp} value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="Nairobi Living Room" />
              </Field>
              <Field label="Sort order" hint="Lower = shown first">
                <input type="number" className={inp} value={draft.sort_order} onChange={e=>setDraft(d=>({...d,sort_order:parseInt(e.target.value)||0}))} min={1} />
              </Field>
            </div>
            <Field label="Photo URL">
              <input className={inp} value={draft.photo_url} onChange={e=>setDraft(d=>({...d,photo_url:e.target.value}))} placeholder="https://images.pexels.com/…" />
            </Field>
            {draft.photo_url && (
              <div className="relative rounded-[12px] overflow-hidden">
                <img src={draft.photo_url} alt="" className="w-full h-48 object-cover" onError={e=>(e.currentTarget.style.display="none")} />
                {draft.wall_mask && (
                  <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents:"none" }} preserveAspectRatio="none">
                    <polygon points={draft.wall_mask.split(" ").map(pt=>{
                      const [x,y]=pt.split(","); return `${parseFloat(x)*100}%,${parseFloat(y)*100}%`;
                    }).join(" ")} fill="rgba(184,74,50,0.22)" stroke="#B84A32" strokeWidth="2" />
                  </svg>
                )}
              </div>
            )}
            <Field
              label="Wall mask polygon"
              hint='Space-separated x,y pairs as 0-1 fractions. Example: "0,0.08 1,0.08 1,0.65 0,0.65"'
            >
              <input className={inp} value={draft.wall_mask} onChange={e=>setDraft(d=>({...d,wall_mask:e.target.value}))} placeholder="0,0.08 1,0.08 1,0.65 0,0.65" />
            </Field>
            <div className="flex gap-2 pt-2">
              <Btn variant="outline" onClick={closeModal}>Cancel</Btn>
              <Btn onClick={save} disabled={saving||!draft.name||!draft.photo_url}>
                {saving ? "Saving…" : adding ? "Add room" : "Save changes"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title="Delete room?" onClose={()=>setConfirm(null)}>
          <p className="text-[13px] mb-5" style={{ color:"#6f6a62" }}>This will permanently delete the room from the visualizer.</p>
          <div className="flex gap-2">
            <Btn variant="outline" onClick={()=>setConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={()=>del(confirm!)}>Delete</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════
   ORDERS TAB
════════════════════════════════════════════════ */
function OrdersTab({ showToast }: { showToast: (m:string)=>void }) {
  const [orders,  setOrders]  = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<AdminOrder|null>(null);
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const load = useCallback(async () => {
    try { setOrders(await api("/api/admin/orders")); }
    catch (e) { showToast(`Error: ${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    setSaving(true);
    try {
      await api("/api/admin/orders", { method:"PUT", body: JSON.stringify({ id, status }) });
      setOrders(prev => prev.map(o => o.id===id ? {...o, status} : o));
      if (viewing?.id===id) setViewing(prev => prev ? {...prev, status} : null);
      showToast(`✓ Status updated to ${status}`);
    } catch (e) { showToast(`Error: ${e}`); }
    finally { setSaving(false); }
  };

  const filtered = orders
    .filter(o => filterStatus==="all" || o.status===filterStatus)
    .filter(o => !search || o.name.toLowerCase().includes(search.toLowerCase())
      || o.email?.toLowerCase().includes(search.toLowerCase())
      || o.phone?.includes(search)
      || o.mpesa_ref?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Orders</h2>
          <p className="text-[13px] mt-0.5" style={{ color:"#6f6a62" }}>{orders.length} total orders</p>
        </div>
        <Btn variant="outline" onClick={load}>↻ Refresh</Btn>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <input className={inp + " max-w-[220px]"} placeholder="Search name, email, M-Pesa ref…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className={sel + " w-auto"} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {filtered.map(o => (
          <div key={o.id} className="bg-white rounded-[14px] p-4 flex flex-wrap items-center gap-3 cursor-pointer hover:border-[#B84A32] transition"
            style={{ border:"1px solid #ebe2d2" }} onClick={()=>setViewing(o)}>
            <StatusBadge s={o.status} />
            <div className="flex-1 min-w-[160px]">
              <span className="font-[600] text-[13px]">{o.name}</span>
              <span className="text-[12px] ml-2" style={{color:"#6f6a62"}}>{o.county}{o.town ? `, ${o.town}` : ""}</span>
            </div>
            <div className="flex items-center gap-3 text-[12px]">
              {o.mpesa_ref
                ? <span className="font-mono px-2 py-0.5 rounded-[6px]" style={{background:"#f0fdf4",color:"#16a34a",border:"1px solid #bbf7d0"}}>{o.mpesa_ref}</span>
                : <span className="text-[11px]" style={{color:"#9b9589"}}>no M-Pesa ref</span>
              }
              <span className="font-[700]" style={{color:"#B84A32"}}>{kes(o.total_kes)}</span>
              <span style={{color:"#9b9589"}}>{new Date(o.created_at).toLocaleDateString("en-KE",{day:"numeric",month:"short",year:"2-digit"})}</span>
            </div>
          </div>
        ))}
        {filtered.length===0 && <p className="text-[13px] py-8 text-center" style={{color:"#9b9589"}}>No orders match your filters.</p>}
      </div>

      {viewing && (
        <Modal title={`Order — ${viewing.name}`} onClose={()=>setViewing(null)} wide>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              {([
                ["Name", viewing.name],
                ["Email", viewing.email],
                ["Phone", viewing.phone],
                ["Location", [viewing.town, viewing.county, "Kenya"].filter(Boolean).join(", ")],
                ["M-Pesa Ref", viewing.mpesa_ref || "—"],
                ["Date", new Date(viewing.created_at).toLocaleString("en-KE")],
              ] as [string,string][]).map(([label, val]) => (
                <div key={label} className="p-3 rounded-[10px]" style={{background:"#f8f4ef"}}>
                  <div className="text-[10px] font-[700] uppercase tracking-wide mb-1" style={{color:"#9b9589"}}>{label}</div>
                  <div className="font-[500]" style={{color: label==="M-Pesa Ref" && viewing.mpesa_ref ? "#16a34a" : "#2B2B2E"}}>{val}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="text-[11px] font-[700] uppercase tracking-wide mb-3" style={{color:"#9b9589"}}>Items</div>
              <div className="space-y-2">
                {viewing.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-[10px]" style={{background:"#fafaf8",border:"1px solid #ebe2d2"}}>
                    <div className="w-6 h-6 rounded-full flex-shrink-0 border-2 border-white shadow" style={{background: item.colour_hex}} />
                    <div className="flex-1 text-[12px]">
                      <span className="font-[600]">{item.product_slug}</span>
                      <span className="ml-1" style={{color:"#6f6a62"}}>· {item.colour_name} · {item.size} · {item.finish} × {item.quantity}</span>
                    </div>
                    <span className="font-[700] text-[13px]" style={{color:"#B84A32"}}>{kes(item.unit_kes * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-3 pt-3" style={{borderTop:"1px solid #ebe2d2"}}>
                <span className="font-[700]">Total</span>
                <span className="font-[700] text-[16px]" style={{color:"#B84A32"}}>{kes(viewing.total_kes)}</span>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-[700] uppercase tracking-wide mb-2" style={{color:"#9b9589"}}>Update Status</div>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map(s => (
                  <button key={s} disabled={saving || viewing.status===s}
                    onClick={() => updateStatus(viewing.id, s)}
                    className="px-3 py-1.5 rounded-full text-[12px] font-[600] border transition disabled:opacity-50"
                    style={{
                      background: viewing.status===s ? statusBg(s) : "white",
                      color: viewing.status===s ? statusFg(s) : "#6f6a62",
                      borderColor: viewing.status===s ? statusFg(s)+"40" : "#d8ccb8",
                    }}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function statusBg(s: string) {
  const m: Record<string,string> = { pending:"#fefce8",paid:"#f0fdf4",processing:"#eff6ff",shipped:"#faf5ff",delivered:"#ecfdf5",cancelled:"#fff1f2" };
  return m[s] ?? "#f5f5f5";
}
function statusFg(s: string) {
  const m: Record<string,string> = { pending:"#a16207",paid:"#16a34a",processing:"#2563eb",shipped:"#7c3aed",delivered:"#059669",cancelled:"#dc2626" };
  return m[s] ?? "#6b7280";
}

/* ════════════════════════════════════════════════
   DELIVERY TAB
════════════════════════════════════════════════ */
type DeliveryDraft = { county: string; town: string; rate_kes: number };
const blankRate = (): DeliveryDraft => ({ county: "", town: "", rate_kes: 0 });

function DeliveryTab({ showToast }: { showToast: (m:string)=>void }) {
  const [rates,       setRates]       = useState<DeliveryRate[]>([]);
  const [orders,      setOrders]      = useState<AdminOrder[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [editing,     setEditing]     = useState<DeliveryRate|null>(null);
  const [adding,      setAdding]      = useState(false);
  const [draft,       setDraft]       = useState<DeliveryDraft>(blankRate());
  const [saving,      setSaving]      = useState(false);
  const [confirm,     setConfirm]     = useState<string|null>(null);
  const [viewingOrder, setViewingOrder] = useState<AdminOrder|null>(null);

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([
        api("/api/admin/delivery-rates"),
        api("/api/admin/orders"),
      ]);
      setRates(r);
      setOrders(o);
    } catch (e) { showToast(`Error: ${e}`); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (r: DeliveryRate) => {
    setEditing(r);
    setDraft({ county: r.county, town: r.town ?? "", rate_kes: r.rate_kes });
  };
  const openAdd  = () => { setAdding(true); setDraft(blankRate()); };
  const closeModal = () => { setEditing(null); setAdding(false); };

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...draft, town: draft.town.trim() || null };
      if (adding) {
        const row = await api("/api/admin/delivery-rates", { method:"POST", body: JSON.stringify(body) });
        setRates(prev => [...prev, row]);
        showToast(`✓ Added ${row.county}${row.town ? ` / ${row.town}` : ""}`);
      } else if (editing) {
        const row = await api("/api/admin/delivery-rates", { method:"PUT", body: JSON.stringify({ id: editing.id, ...body }) });
        setRates(prev => prev.map(r => r.id===row.id ? row : r));
        showToast(`✓ Updated ${row.county}`);
      }
      closeModal();
    } catch (e) { showToast(`Error: ${e}`); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    try {
      await api("/api/admin/delivery-rates", { method:"DELETE", body: JSON.stringify({ id }) });
      setRates(prev => prev.filter(r => r.id!==id));
      showToast("✓ Rate deleted");
    } catch (e) { showToast(`Error: ${e}`); }
    setConfirm(null);
  };

  const updateOrderStatus = async (id: string, status: string) => {
    setSaving(true);
    try {
      await api("/api/admin/orders", { method:"PUT", body: JSON.stringify({ id, status }) });
      setOrders(prev => prev.map(o => o.id===id ? {...o, status} : o));
      if (viewingOrder?.id===id) setViewingOrder(prev => prev ? {...prev, status} : null);
      showToast(`✓ Status updated to ${status}`);
    } catch (e) { showToast(`Error: ${e}`); }
    finally { setSaving(false); }
  };

  const byCounty = rates.reduce<Record<string, DeliveryRate[]>>((acc, r) => {
    (acc[r.county] ??= []).push(r); return acc;
  }, {});

  const inTransit = orders.filter(o => o.status === "shipped" || o.status === "delivered");

  if (loading) return <Spinner />;

  return (
    <div className="space-y-10">

      {/* ── In Transit / Delivered Orders ── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:24, fontWeight:600 }}>Delivery Tracking</h2>
            <p className="text-[13px] mt-0.5" style={{ color:"#6f6a62" }}>
              {inTransit.filter(o=>o.status==="shipped").length} in transit &nbsp;·&nbsp;
              {inTransit.filter(o=>o.status==="delivered").length} delivered
            </p>
          </div>
          <Btn variant="outline" onClick={load}>↻ Refresh</Btn>
        </div>

        {inTransit.length === 0 ? (
          <div className="bg-white rounded-[16px] p-8 text-center" style={{ border:"1px solid #ebe2d2" }}>
            <p className="text-[32px] mb-2">🚚</p>
            <p className="font-[600] text-[14px]">No orders in transit or delivered yet</p>
            <p className="text-[13px] mt-1" style={{color:"#9b9589"}}>Orders marked as <strong>shipped</strong> or <strong>delivered</strong> will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {inTransit.map(o => (
              <div key={o.id}
                className="bg-white rounded-[14px] p-4 flex flex-wrap items-center gap-3 cursor-pointer hover:border-[#B84A32] transition"
                style={{ border:"1px solid #ebe2d2" }}
                onClick={() => setViewingOrder(o)}>
                <StatusBadge s={o.status} />
                <div className="flex-1 min-w-[160px]">
                  <span className="font-[600] text-[13px]">{o.name}</span>
                  <span className="text-[12px] ml-2" style={{color:"#6f6a62"}}>{o.county}{o.town ? `, ${o.town}` : ""}</span>
                </div>
                <div className="flex items-center gap-3 text-[12px]">
                  {o.mpesa_ref
                    ? <span className="font-mono px-2 py-0.5 rounded-[6px]" style={{background:"#f0fdf4",color:"#16a34a",border:"1px solid #bbf7d0"}}>{o.mpesa_ref}</span>
                    : <span className="text-[11px]" style={{color:"#9b9589"}}>no M-Pesa ref</span>
                  }
                  <span className="font-[700]" style={{color:"#B84A32"}}>{kes(o.total_kes)}</span>
                  <span style={{color:"#9b9589"}}>{new Date(o.created_at).toLocaleDateString("en-KE",{day:"numeric",month:"short",year:"2-digit"})}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Delivery Rates ── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h2 style={{ fontFamily:'"Playfair Display",Georgia,serif', fontSize:22, fontWeight:600 }}>Delivery Rates</h2>
            <p className="text-[13px] mt-0.5" style={{ color:"#6f6a62" }}>{rates.length} rates · county-level defaults + town overrides</p>
          </div>
          <Btn onClick={openAdd}>+ Add rate</Btn>
        </div>

        {Object.keys(byCounty).length === 0 && (
          <div className="text-center py-16">
            <p className="text-[15px] font-[600] mb-2">No delivery rates yet</p>
            <p className="text-[13px] mb-4" style={{color:"#9b9589"}}>Add a county rate to get started. Town-level rates override the county default.</p>
            <Btn onClick={openAdd}>+ Add first rate</Btn>
          </div>
        )}

        <div className="space-y-6">
          {Object.entries(byCounty).map(([county, countyRates]) => (
            <div key={county} className="bg-white rounded-[16px] overflow-hidden" style={{ border:"1px solid #ebe2d2" }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{background:"#f8f4ef", borderBottom:"1px solid #ebe2d2"}}>
                <h3 className="font-[700] text-[14px]">{county}</h3>
                <span className="text-[11px]" style={{color:"#9b9589"}}>{countyRates.length} rate{countyRates.length>1?"s":""}</span>
              </div>
              <table className="w-full text-[13px]">
                <tbody>
                  {countyRates.map(r => (
                    <tr key={r.id} style={{borderBottom:"1px solid #f5f0e8"}}>
                      <td className="px-5 py-3">
                        {r.town
                          ? <span>{r.town}</span>
                          : <span className="text-[11px] px-2 py-0.5 rounded-full font-[600]" style={{background:"#f5ede3",color:"#B84A32"}}>County default</span>
                        }
                      </td>
                      <td className="px-5 py-3 font-[700]" style={{color: r.rate_kes===0 ? "#16a34a" : "#2B2B2E"}}>
                        {r.rate_kes === 0 ? "Free" : kes(r.rate_kes)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Btn size="sm" variant="outline" onClick={()=>openEdit(r)}>Edit</Btn>
                          <Btn size="sm" variant="danger" onClick={()=>setConfirm(r.id)}>✕</Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      {/* ── Order detail modal (from delivery tracking) ── */}
      {viewingOrder && (
        <Modal title={`Order — ${viewingOrder.name}`} onClose={()=>setViewingOrder(null)} wide>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              {([
                ["Name", viewingOrder.name],
                ["Email", viewingOrder.email],
                ["Phone", viewingOrder.phone],
                ["Location", [viewingOrder.town, viewingOrder.county, "Kenya"].filter(Boolean).join(", ")],
                ["M-Pesa Ref", viewingOrder.mpesa_ref || "—"],
                ["Date", new Date(viewingOrder.created_at).toLocaleString("en-KE")],
              ] as [string,string][]).map(([label, val]) => (
                <div key={label} className="p-3 rounded-[10px]" style={{background:"#f8f4ef"}}>
                  <div className="text-[10px] font-[700] uppercase tracking-wide mb-1" style={{color:"#9b9589"}}>{label}</div>
                  <div className="font-[500]" style={{color: label==="M-Pesa Ref" && viewingOrder.mpesa_ref ? "#16a34a" : "#2B2B2E"}}>{val}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[11px] font-[700] uppercase tracking-wide mb-3" style={{color:"#9b9589"}}>Items</div>
              <div className="space-y-2">
                {viewingOrder.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-[10px]" style={{background:"#fafaf8",border:"1px solid #ebe2d2"}}>
                    <div className="w-6 h-6 rounded-full flex-shrink-0 border-2 border-white shadow" style={{background: item.colour_hex}} />
                    <div className="flex-1 text-[12px]">
                      <span className="font-[600]">{item.product_slug}</span>
                      <span className="ml-1" style={{color:"#6f6a62"}}>· {item.colour_name} · {item.size} · {item.finish} × {item.quantity}</span>
                    </div>
                    <span className="font-[700] text-[13px]" style={{color:"#B84A32"}}>{kes(item.unit_kes * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-3 pt-3" style={{borderTop:"1px solid #ebe2d2"}}>
                <span className="font-[700]">Total</span>
                <span className="font-[700] text-[16px]" style={{color:"#B84A32"}}>{kes(viewingOrder.total_kes)}</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-[700] uppercase tracking-wide mb-2" style={{color:"#9b9589"}}>Update Status</div>
              <div className="flex flex-wrap gap-2">
                {(["shipped","delivered","cancelled"] as string[]).map(s => (
                  <button key={s} disabled={saving || viewingOrder.status===s}
                    onClick={() => updateOrderStatus(viewingOrder.id, s)}
                    className="px-3 py-1.5 rounded-full text-[12px] font-[600] border transition disabled:opacity-50"
                    style={{
                      background: viewingOrder.status===s ? statusBg(s) : "white",
                      color: viewingOrder.status===s ? statusFg(s) : "#6f6a62",
                      borderColor: viewingOrder.status===s ? statusFg(s)+"40" : "#d8ccb8",
                    }}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Rate add/edit modal ── */}
      {(editing||adding) && (
        <Modal title={adding ? "Add delivery rate" : `Edit — ${editing!.county}${editing!.town ? ` / ${editing!.town}` : ""}`} onClose={closeModal}>
          <div className="space-y-4">
            <Field label="County" hint="e.g. Nairobi, Kiambu, Mombasa">
              <input className={inp} value={draft.county} onChange={e=>setDraft(d=>({...d,county:e.target.value}))} placeholder="Nairobi" />
            </Field>
            <Field label="Town (optional)" hint="Leave blank to set a county-wide default rate">
              <input className={inp} value={draft.town} onChange={e=>setDraft(d=>({...d,town:e.target.value}))} placeholder="Westlands" />
            </Field>
            <Field label="Rate (KES)" hint="Enter 0 for free delivery">
              <input type="number" className={inp} value={draft.rate_kes}
                onChange={e=>setDraft(d=>({...d,rate_kes:parseInt(e.target.value)||0}))}
                min={0} step={50} />
            </Field>
            <div className="flex gap-2 pt-2">
              <Btn variant="outline" onClick={closeModal}>Cancel</Btn>
              <Btn onClick={save} disabled={saving||!draft.county}>
                {saving ? "Saving…" : adding ? "Add rate" : "Save changes"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title="Delete rate?" onClose={()=>setConfirm(null)}>
          <p className="text-[13px] mb-5" style={{color:"#6f6a62"}}>This delivery rate will be removed. Orders to this area will use the county default or show no rate.</p>
          <div className="flex gap-2">
            <Btn variant="outline" onClick={()=>setConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={()=>del(confirm!)}>Delete</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
