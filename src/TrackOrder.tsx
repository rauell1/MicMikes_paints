import { useState } from "react";

type OrderItem = {
  productSlug: string;
  colourName: string;
  colourHex: string;
  size: string;
  finish: string;
  quantity: number;
  unitKes: number;
};

type TrackedOrder = {
  id: string;
  reference: string;
  created_at: string;
  status: string;
  total_kes: number;
  delivery_kes: number;
  county: string;
  town: string;
  items: OrderItem[];
};

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string; icon: string }> = {
  pending:    { bg: "#fefce8", color: "#a16207", label: "Pending",    icon: "⏳" },
  paid:       { bg: "#f0fdf4", color: "#15803d", label: "Paid",       icon: "✅" },
  processing: { bg: "#eff6ff", color: "#1d4ed8", label: "Processing", icon: "🔄" },
  shipped:    { bg: "#faf5ff", color: "#7e22ce", label: "Shipped",    icon: "🚚" },
  delivered:  { bg: "#ecfdf5", color: "#065f46", label: "Delivered",  icon: "🎉" },
  cancelled:  { bg: "#fef2f2", color: "#b91c1c", label: "Cancelled",  icon: "✕"  },
};

const STEPS = ["pending", "paid", "processing", "shipped", "delivered"];

const SUCCESSFUL_STATUSES  = new Set(["paid", "processing", "shipped", "delivered"]);
const UNSUCCESSFUL_STATUSES = new Set(["pending", "cancelled"]);

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { bg: "#f3f4f6", color: "#374151", label: status, icon: "•" };
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-[700] px-[10px] py-[4px] rounded-full"
      style={{ background: s.bg, color: s.color }}>
      {s.icon} {s.label}
    </span>
  );
}

function ProgressBar({ status }: { status: string }) {
  if (status === "cancelled") return null;
  const idx = STEPS.indexOf(status);
  if (idx === -1) return null;
  return (
    <div className="flex items-center gap-0 mt-4 mb-1">
      {STEPS.map((step, i) => {
        const done    = i <= idx;
        const current = i === idx;
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-[700] border-2 transition-all"
                style={{
                  background: done ? "#B84A32" : "#fff",
                  borderColor: done ? "#B84A32" : "#e2d3b7",
                  color: done ? "#fff" : "#9b9589",
                  boxShadow: current ? "0 0 0 3px rgba(184,74,50,.18)" : undefined,
                }}>
                {done ? "✓" : i + 1}
              </div>
              <span className="text-[9.5px] mt-[3px] font-[600] capitalize text-center"
                style={{ color: done ? "#B84A32" : "#9b9589" }}>{step}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-[2px] mx-1 rounded-full mb-4"
                style={{ background: i < idx ? "#B84A32" : "#e2d3b7" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function OrderCard({ order }: { order: TrackedOrder }) {
  const date = new Date(order.created_at).toLocaleDateString("en-KE", {
    day: "numeric", month: "long", year: "numeric",
  });
  return (
    <div className="mm-card rounded-[20px] overflow-hidden mm-shadow">
      {/* Header */}
      <div className="px-5 py-4 border-b flex flex-wrap items-start justify-between gap-3"
        style={{ borderColor: "#ebe2d2", background: "#fffdf8" }}>
        <div>
          <div className="font-mono2 text-[12.5px] font-[600]" style={{ color: "#B84A32" }}>{order.reference}</div>
          <div className="text-[12px] mm-muted mt-[2px]">{date} · {order.town}, {order.county}</div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Progress */}
      <div className="px-5 pt-4 pb-2">
        <ProgressBar status={order.status} />
      </div>

      {/* Items */}
      <div className="px-5 pb-3 space-y-2">
        {order.items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 text-[13px]">
            <div className="w-7 h-7 rounded-full border-2 border-white mm-shadow flex-shrink-0"
              style={{ backgroundColor: item.colourHex }} />
            <div className="flex-1 min-w-0">
              <span className="font-[600] capitalize">{item.productSlug.replace(/-/g, " ")}</span>
              <span className="mm-muted"> · {item.colourName} · {item.size} · {item.finish} × {item.quantity}</span>
            </div>
            <div className="font-[700] flex-shrink-0">{kes(item.unitKes * item.quantity)}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t flex justify-between text-[13px]" style={{ borderColor: "#ebe2d2" }}>
        {order.delivery_kes > 0 ? (
          <span className="mm-muted">Delivery: {kes(order.delivery_kes)}</span>
        ) : (
          <span className="mm-muted">Free delivery</span>
        )}
        <span className="font-[700] text-[15px]">Total: {kes(order.total_kes)}</span>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle, color }: { icon: string; title: string; subtitle: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xl">{icon}</span>
      <div>
        <h3 className="font-display text-[18px] font-[600]" style={{ color }}>{title}</h3>
        <p className="text-[12px] mm-muted">{subtitle}</p>
      </div>
    </div>
  );
}

export default function TrackOrder() {
  const [phone, setPhone]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [orders, setOrders]     = useState<TrackedOrder[] | null>(null);
  const [error, setError]       = useState("");
  const [searched, setSearched] = useState(false);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true); setError(""); setOrders(null);
    try {
      const res = await fetch(`/api/orders?phone=${encodeURIComponent(phone.trim())}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Could not find orders");
      }
      const data = await res.json() as TrackedOrder[];
      setOrders(data);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const successfulOrders   = orders?.filter(o => SUCCESSFUL_STATUSES.has(o.status))  ?? [];
  const unsuccessfulOrders = orders?.filter(o => UNSUCCESSFUL_STATUSES.has(o.status)) ?? [];

  return (
    <section id="track" className="py-12 sm:py-16 border-t" style={{ borderColor: "#ebe2d2" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="max-w-[580px] mx-auto">
          <h2 className="font-display text-[30px] sm:text-[36px] mb-1">Track Your Order</h2>
          <p className="mm-muted text-[14px] mb-6">Enter the M-Pesa phone number you used at checkout.</p>

          <form onSubmit={lookup} className="flex gap-2 mb-8">
            <input
              className="input flex-1"
              type="tel"
              placeholder="e.g. 0712 345 678"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !phone.trim()}
              className="btn btn-primary px-5 py-[11px] text-[14px] flex-shrink-0 disabled:opacity-50">
              {loading ? "Searching…" : "Search"}
            </button>
          </form>

          {error && (
            <div className="text-[13px] font-[600] px-4 py-3 rounded-[12px] mb-6"
              style={{ background: "#fdf0ee", color: "#B84A32" }}>{error}</div>
          )}

          {searched && orders && orders.length === 0 && (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">📦</div>
              <div className="font-display text-[20px] mb-1">No orders found</div>
              <p className="mm-muted text-[13.5px]">We couldn't find any orders for that number. Check the number and try again, or call us.</p>
            </div>
          )}

          {/* ── Successful orders ── */}
          {successfulOrders.length > 0 && (
            <div className="mb-8">
              <SectionHeader
                icon="✅"
                title="Successful Orders"
                subtitle={`${successfulOrders.length} order${successfulOrders.length > 1 ? "s" : ""} confirmed`}
                color="#065f46"
              />
              <div className="space-y-5">
                {successfulOrders.map(order => <OrderCard key={order.id} order={order} />)}
              </div>
            </div>
          )}

          {/* ── Pending / Unsuccessful orders ── */}
          {unsuccessfulOrders.length > 0 && (
            <div className="mb-4">
              <SectionHeader
                icon="⏳"
                title="Pending / Unsuccessful"
                subtitle={`${unsuccessfulOrders.length} order${unsuccessfulOrders.length > 1 ? "s" : ""} · payment not yet confirmed or cancelled`}
                color="#a16207"
              />
              <div className="space-y-5">
                {unsuccessfulOrders.map(order => <OrderCard key={order.id} order={order} />)}
              </div>
              {unsuccessfulOrders.some(o => o.status === "pending") && (
                <div className="mt-4 px-4 py-3 rounded-[14px] text-[13px]" style={{ background: "#fefce8", border: "1px solid #fde68a", color: "#92400e" }}>
                  <strong>Awaiting payment?</strong> Complete your M-Pesa payment and your order status will update automatically within minutes.
                </div>
              )}
            </div>
          )}

          <p className="text-center text-[12.5px] mm-muted mt-8">
            Need help? Call <a href="tel:+254700000000" className="font-[600] hover:underline" style={{ color: "#B84A32" }}>+254 700 000 000</a>
          </p>
        </div>
      </div>
    </section>
  );
}
