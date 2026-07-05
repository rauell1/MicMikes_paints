import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import TrackOrder from "./TrackOrder";

function getSessionId(): string {
  const key = "mm-session";
  let id = sessionStorage.getItem(key);
  if (!id) { id = Math.random().toString(36).slice(2, 11); sessionStorage.setItem(key, id); }
  return id;
}

async function trackCartEvent(payload: Record<string, unknown>) {
  try {
    await fetch("/api/cart-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId(), ...payload }),
    });
  } catch { /* non-critical */ }
}

type ColourFamily = "Neutrals" | "Warm Earth" | "Cool Green" | "Blue" | "Red & Terracotta" | "Yellow & Gold";
type Finish = "Matte" | "Eggshell" | "Satin" | "Semi-Gloss";
type Size = "1L" | "4L" | "20L";

type Colour = { id: string; name: string; hex: string; family: ColourFamily; };
type Product = { id: string; slug: string; name: string; blurb: string; category: "Paint" | "Primer" | "Supplies"; baseKes: Record<Size, number>; image: string; };
type CartItem = { productId: string; productName: string; productSlug: string; colourId: string; colourName: string; colourHex: string; size: Size; finish: Finish; quantity: number; unitKes: number; };
type Room = { id: string; name: string; photo: string; wallMask?: string };

const FAMILIES: ColourFamily[] = ["Neutrals","Warm Earth","Cool Green","Blue","Red & Terracotta","Yellow & Gold"];
const ALL_FAMILIES: (ColourFamily | "All")[] = ["All", ...FAMILIES];

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

const FALLBACK_ROOMS: Room[] = [
  { id: "fallback-living", name: "Living Room", photo: "https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1400" },
  { id: "fallback-bedroom", name: "Bedroom", photo: "https://images.pexels.com/photos/271618/pexels-photo-271618.jpeg?auto=compress&cs=tinysrgb&w=1400" },
  { id: "fallback-kitchen", name: "Kitchen", photo: "https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=1400" },
  { id: "fallback-office", name: "Home Office", photo: "https://images.pexels.com/photos/667838/pexels-photo-667838.jpeg?auto=compress&cs=tinysrgb&w=1400" },
];

const FALLBACK_COLOURS: Colour[] = [
  { id: "fc-01", name: "Brilliant White",  hex: "#F8F8F6", family: "Neutrals" },
  { id: "fc-02", name: "Antique White",    hex: "#F5F0E8", family: "Neutrals" },
  { id: "fc-03", name: "Ivory Cream",      hex: "#F4EDD8", family: "Neutrals" },
  { id: "fc-04", name: "Stone Grey",       hex: "#C9C5BE", family: "Neutrals" },
  { id: "fc-05", name: "Warm Pebble",      hex: "#B8B0A4", family: "Neutrals" },
  { id: "fc-06", name: "Slate",            hex: "#8C8882", family: "Neutrals" },
  { id: "fc-07", name: "Desert Sand",      hex: "#D4B896", family: "Warm Earth" },
  { id: "fc-08", name: "Warm Caramel",     hex: "#B8845A", family: "Warm Earth" },
  { id: "fc-09", name: "Dark Walnut",      hex: "#6B4423", family: "Warm Earth" },
  { id: "fc-10", name: "Mint Breeze",      hex: "#C8DDD0", family: "Cool Green" },
  { id: "fc-11", name: "Sage Meadow",      hex: "#8FAF90", family: "Cool Green" },
  { id: "fc-12", name: "Forest Deep",      hex: "#3A6B4A", family: "Cool Green" },
  { id: "fc-13", name: "Sky Mist",         hex: "#C5D8E8", family: "Blue" },
  { id: "fc-14", name: "Ocean Breeze",     hex: "#6B9AB8", family: "Blue" },
  { id: "fc-15", name: "Deep Navy",        hex: "#1E3A5F", family: "Blue" },
  { id: "fc-16", name: "Sunflower",        hex: "#F5D76E", family: "Yellow & Gold" },
  { id: "fc-17", name: "Mango",            hex: "#F4A135", family: "Yellow & Gold" },
  { id: "fc-18", name: "Terracotta",       hex: "#C8623A", family: "Red & Terracotta" },
  { id: "fc-19", name: "Rose Blush",       hex: "#E8B4B0", family: "Red & Terracotta" },
  { id: "fc-20", name: "Crimson",          hex: "#9B2335", family: "Red & Terracotta" },
];

const FALLBACK_PRODUCTS: Product[] = [
  {
    id: "fp-01", slug: "keekorok-premium-emulsion", name: "Keekorok Premium Emulsion",
    blurb: "Superior washable emulsion. Vivid, long-lasting colour for interior walls & ceilings.",
    category: "Paint", image: "",
    baseKes: { "1L": 850, "4L": 2800, "20L": 11500 },
  },
  {
    id: "fp-02", slug: "keekorok-satin-finish", name: "Keekorok Satin Finish",
    blurb: "Silky satin sheen — ideal for living rooms, hallways & feature walls.",
    category: "Paint", image: "",
    baseKes: { "1L": 950, "4L": 3200, "20L": 13500 },
  },
  {
    id: "fp-03", slug: "keekorok-primer-sealer", name: "Keekorok Primer & Sealer",
    blurb: "Multi-surface primer for new plaster, timber & previously painted surfaces.",
    category: "Primer", image: "",
    baseKes: { "1L": 700, "4L": 2200, "20L": 9000 },
  },
];

function VisualizerCanvas({ room, colour, finish }: { room: Room; colour: Colour; finish: Finish }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setLoaded(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      setLoaded(true);
      const alpha = finish === "Matte" ? 0.38 : finish === "Satin" ? 0.32 : 0.26;
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = colour.hex;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
    img.onerror = () => setLoaded(true);
    img.src = room.photo;
  }, [room.photo, colour.hex, finish]);

  return (
    <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "#17171a" }}>
          <div className="text-[13px]" style={{ color: "#888" }}>Loading room…</div>
        </div>
      )}
      <canvas ref={canvasRef} className="w-full h-full object-cover" style={{ display: loaded ? "block" : "none" }} />
      {loaded && (
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 px-[12px] py-[8px] rounded-[12px] text-[12.5px] font-[600]"
            style={{ background: "rgba(255,255,255,0.92)" }}>
            <span className="w-[14px] h-[14px] rounded-full border border-[#ccc]" style={{ backgroundColor: colour.hex }} />
            {colour.name} · {finish}
          </div>
          <div className="px-[10px] py-[7px] rounded-full text-[11px] font-mono2"
            style={{ background: "rgba(43,43,46,0.82)", color: "#F8F4EF" }}>
            {colour.hex}
          </div>
        </div>
      )}
    </div>
  );
}

function PaintedThumb({ room }: { room: Room; colourId?: string | null }) {
  return (
    <div className="w-[40px] h-[30px] rounded-[7px] overflow-hidden flex-shrink-0 border border-[#3a3a3d]">
      <img src={room.photo} alt={room.name} className="w-full h-full object-cover" loading="lazy" />
    </div>
  );
}

/* ── CheckoutDialog ── */
function CheckoutDialog({
  subtotal, total, cartCount, cart, onClose, onSuccess,
}: {
  subtotal: number; total: number; cartCount: number;
  cart: CartItem[];
  onClose: () => void;
  onSuccess: (meta: { invoice: string }) => void;
}) {
  const [step, setStep] = useState<"details"|"payment"|"confirm">("details");
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [phone, setPhone]     = useState("");
  const [county, setCounty]   = useState("");
  const [town, setTown]       = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes]     = useState("");
  const [payMethod, setPayMethod] = useState<"mpesa"|"card">("mpesa");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [mpesaStatus, setMpesaStatus] = useState<"idle"|"pending"|"success"|"failed">("idle");

  const pollMpesaStatus = async (checkoutRequestId: string, invoice: string) => {
    const MAX_ATTEMPTS = 10;
    const INTERVAL_MS = 4000;
    let attempts = 0;
    const poll = async (): Promise<void> => {
      if (attempts >= MAX_ATTEMPTS) { setMpesaStatus("failed"); setError("M-Pesa payment timed out. Please try again or contact us."); return; }
      attempts++;
      try {
        const res = await fetch(`/api/mpesa/status/${checkoutRequestId}`);
        const data = await res.json() as { ResultCode?: string; status?: string };
        const code = data.ResultCode ?? data.status;
        if (code === "0" || code === "success") { setMpesaStatus("success"); onSuccess({ invoice }); }
        else if (code === "1032" || code === "failed" || code === "cancelled") { setMpesaStatus("failed"); setError("M-Pesa payment was cancelled or failed. Please try again."); }
        else { await new Promise(r => setTimeout(r, INTERVAL_MS)); return poll(); }
      } catch { await new Promise(r => setTimeout(r, INTERVAL_MS)); return poll(); }
    };
    return poll();
  };

  const detailsValid = () => {
    if (!name.trim() || !email.trim() || !phone.trim() || !county.trim() || !town.trim() || !address.trim()) {
      setError("Please fill all required fields.");
      return false;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true); setError("");
    try {
      const items = cart.map(i => ({
        productSlug: i.productSlug,
        colourId:    i.colourId || null,
        size:        i.size,
        finish:      i.finish,
        quantity:    i.quantity,
      }));

      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, county, town, address, notes, payMethod, items }),
      });

      if (!orderRes.ok) {
        const body = await orderRes.json().catch(() => ({})) as { error?: string; errors?: Record<string, string> };
        const msg = body.errors ? Object.values(body.errors)[0] : (body.error ?? "Order failed");
        throw new Error(String(msg));
      }

      const orderData = await orderRes.json() as { orderId: string; reference: string; totalKes: number };
      const { orderId, reference: invoice, totalKes: confirmedTotal } = orderData;

      if (payMethod === "mpesa") {
        setMpesaStatus("pending");
        const mpesaRes = await fetch("/api/mpesa/stkpush", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, phone, amountKes: confirmedTotal }),
        });

        if (!mpesaRes.ok) {
          const errBody = await mpesaRes.json().catch(() => ({})) as { error?: string };
          setMpesaStatus("failed");
          throw new Error(errBody.error ?? "Failed to initiate M-Pesa payment. Please try again.");
        }

        const mpesaData = await mpesaRes.json() as { checkoutRequestId?: string; customerMessage?: string };
        const checkoutRequestId = mpesaData.checkoutRequestId;
        if (checkoutRequestId) {
          await pollMpesaStatus(checkoutRequestId, invoice);
        } else {
          onSuccess({ invoice });
        }
      } else {
        onSuccess({ invoice });
      }
    } catch (err) {
      if (mpesaStatus !== "failed") setMpesaStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again or call us.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 fade" onClick={onClose} />
      <div className="relative w-full sm:max-w-[520px] rounded-t-[28px] sm:rounded-[24px] overflow-hidden fade flex flex-col"
        style={{ background: "#F8F4EF", maxHeight: "92dvh" }}>
        <div className="px-6 pt-6 pb-4 border-b flex items-start justify-between gap-3"
          style={{ borderColor: "#e7d9c3", background: "#fffdf8" }}>
          <div>
            <div className="font-display text-[24px]">Checkout</div>
            <div className="text-[12.5px] mm-muted">{cartCount} item{cartCount!==1?"s":""} · {kes(total)}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white border flex items-center justify-center"
            style={{ borderColor: "#e3d5bc" }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="flex gap-2 mb-2">
            {(["details","payment","confirm"] as const).map((s,i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full text-[11px] font-[700] flex items-center justify-center ${step===s ? "text-white" : "text-[#9b9589]"}`}
                  style={{ background: step===s ? "#B84A32" : "#ebe2d2" }}>{i+1}</div>
                <span className={`text-[12px] font-[600] capitalize ${step===s ? "" : "text-[#9b9589]"}`}>{s}</span>
                {i<2 && <span className="text-[#d4c8b0]">›</span>}
              </div>
            ))}
          </div>

          {step === "details" && (
            <div className="space-y-3">
              <div><label className="text-[12px] font-[600] block mb-[5px]">Full name *</label><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Jane Wanjiku" /></div>
              <div><label className="text-[12px] font-[600] block mb-[5px]">Email *</label><input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jane@example.com" /></div>
              <div><label className="text-[12px] font-[600] block mb-[5px]">Phone (M-Pesa) *</label><input className="input" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="07xx xxx xxx" type="tel" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[12px] font-[600] block mb-[5px]">County *</label><input className="input" value={county} onChange={e=>setCounty(e.target.value)} placeholder="e.g. Kiambu" /></div>
                <div><label className="text-[12px] font-[600] block mb-[5px]">Town *</label><input className="input" value={town} onChange={e=>setTown(e.target.value)} placeholder="e.g. Ruiru" /></div>
              </div>
              <div><label className="text-[12px] font-[600] block mb-[5px]">Street / Estate *</label><input className="input" value={address} onChange={e=>setAddress(e.target.value)} placeholder="Bensam Road, Apt 3A" /></div>
              <div><label className="text-[12px] font-[600] block mb-[5px]">Notes (optional)</label><textarea className="input" rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Gate colour, special instructions…" style={{ resize: "none" }} /></div>
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-3">
              <div className="text-[13px] font-[600] mb-1">Payment method</div>
              {(["mpesa","card"] as const).map(m => (
                <button key={m} onClick={() => setPayMethod(m)}
                  className="w-full flex items-center gap-3 px-4 py-[13px] rounded-[14px] border text-left transition"
                  style={{ borderColor: payMethod===m ? "#B84A32" : "#e1d3bd", background: payMethod===m ? "#fff5f2" : "#fff" }}>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${payMethod===m ? "border-[#B84A32]" : "border-[#d4c8b0]"}`}>
                    {payMethod===m && <div className="w-2 h-2 rounded-full m-auto mt-[1px]" style={{ background: "#B84A32" }} />}
                  </div>
                  <div>
                    <div className="font-[600] text-[14px]">{m==="mpesa" ? "M-Pesa STK Push" : "Card (Flutterwave)"}</div>
                    <div className="text-[12px] mm-muted">{m==="mpesa" ? "Prompt sent to your phone" : "Visa / Mastercard"}</div>
                  </div>
                </button>
              ))}
              <div className="mm-card rounded-[14px] p-4 space-y-[6px] text-[13px]">
                <div className="flex justify-between"><span className="mm-muted">Subtotal</span><span className="font-[600]">{kes(subtotal)}</span></div>
                <div className="flex justify-between mm-muted"><span>Delivery</span><span>Free</span></div>
                <div className="flex justify-between text-[15px] font-[700] pt-2 border-t" style={{ borderColor: "#eadcc4" }}><span>Total</span><span>{kes(total)}</span></div>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-3 text-[13.5px]">
              <div className="mm-card rounded-[14px] p-4 space-y-[6px]">
                <div className="font-[600] mb-1">Order summary</div>
                {cart.map(i => (
                  <div key={`${i.productId}|${i.colourId}|${i.size}|${i.finish}`} className="flex justify-between gap-2">
                    <span className="mm-muted truncate">{i.productName} · {i.colourName} · {i.size}</span>
                    <span className="font-[600] flex-shrink-0">{kes(i.unitKes * i.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between mm-muted text-[13px]"><span>Delivery</span><span>Free</span></div>
                <div className="flex justify-between font-[700] text-[15px] pt-2 border-t" style={{ borderColor: "#eadcc4" }}><span>Total</span><span>{kes(total)}</span></div>
              </div>
              <div className="mm-card rounded-[14px] p-4 space-y-[5px]">
                <div className="font-[600] mb-1">Delivery to</div>
                <div>{name}</div>
                <div className="mm-muted">{phone}</div>
                <div className="mm-muted">{town}, {county}</div>
                <div className="mm-muted">{address}</div>
              </div>
              {mpesaStatus === "pending" && (
                <div className="text-[13px] font-[600] px-4 py-3 rounded-[12px] text-center" style={{ background: "#f0f8ff", color: "#2B6CB0" }}>
                  ⏳ Waiting for M-Pesa confirmation on {phone}…
                </div>
              )}
            </div>
          )}

          {error && <div className="text-[13px] font-[600] px-4 py-3 rounded-[12px]" style={{ background: "#fdf0ee", color: "#B84A32" }}>{error}</div>}
        </div>

        <div className="px-6 py-4 border-t flex gap-3" style={{ borderColor: "#e7d9c3", background: "#fffdf8" }}>
          {step !== "details" && (
            <button onClick={() => { setError(""); setStep(step==="confirm" ? "payment" : "details"); }} className="btn btn-ghost flex-1 py-[12px] text-[14px]">← Back</button>
          )}
          {step !== "confirm" ? (
            <button onClick={() => {
              if (step==="details") { if (!detailsValid()) return; setStep("payment"); }
              else { setError(""); setStep("confirm"); }
            }} className="btn btn-primary flex-1 py-[12px] text-[14.5px]">Continue →</button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting || mpesaStatus === "pending"} className="btn btn-dark flex-1 py-[12px] text-[14.5px] disabled:opacity-50">
              {submitting || mpesaStatus === "pending" ? "Processing…" : `Place Order · ${kes(total)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── App ── */
export default function App() {
  const [colours, setColours] = useState<Colour[]>(FALLBACK_COLOURS);
  const [products, setProducts] = useState<Product[]>(FALLBACK_PRODUCTS);
  const [rooms, setRooms] = useState<Room[]>(FALLBACK_ROOMS);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/colours").then(r => r.ok ? r.json() : FALLBACK_COLOURS).catch(() => FALLBACK_COLOURS),
      fetch("/api/colours?type=products").then(r => r.ok ? r.json() : FALLBACK_PRODUCTS).catch(() => FALLBACK_PRODUCTS),
      fetch("/api/colours?type=rooms").then(r => r.ok ? r.json() : FALLBACK_ROOMS).catch(() => FALLBACK_ROOMS),
    ]).then(([c, p, r]) => {
      const cols = Array.isArray(c) && c.length > 0 ? (c as Colour[]) : FALLBACK_COLOURS;
      const prods = Array.isArray(p) && p.length > 0 && (p[0] as Product)?.baseKes ? (p as Product[]) : FALLBACK_PRODUCTS;
      const dbRooms = Array.isArray(r) && r.length > 0 ? (r as Room[]) : FALLBACK_ROOMS;
      setColours(cols); setProducts(prods); setRooms(dbRooms);
    }).finally(() => setDataLoading(false));
  }, []);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try { const raw = localStorage.getItem("micmikes-cart"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("micmikes-cart", JSON.stringify(cart)); } catch {} }, [cart]);

  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unitKes * i.quantity, 0), [cart]);
  const deliveryFee = 0;
  const totalKes = subtotal + deliveryFee;

  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [activePage, setActivePage] = useState("home");
  const [toast, setToast] = useState("");
  const navLockRef = useRef(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2100); };

  const [vizRoomIdx, setVizRoomIdx] = useState(0);
  const [vizColourId, setVizColourId] = useState<string | null>(null);
  const [vizFinish, setVizFinish] = useState<Finish>("Satin");
  const [vizSize, setVizSize] = useState<Size>("4L");
  const vizRoom = rooms[vizRoomIdx] ?? null;
  const vizColour = (vizColourId ? colours.find(c => c.id === vizColourId) : null) ?? colours.find(c => c.name === "Ocean Breeze") ?? colours[0] ?? null;

  const [popularIds, setPopularIds] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/colours?popular=1").then(r => r.ok ? r.json() : [])
      .then(ids => Array.isArray(ids) && setPopularIds(ids.slice(0, 3)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!colours.length) return;
      const cur = colours.findIndex(c => c.id === (vizColour?.id ?? ""));
      const next = e.key === "ArrowRight" ? (cur + 1) % colours.length : (cur - 1 + colours.length) % colours.length;
      setVizColourId(colours[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [colours, vizColour?.id]);

  const [familyFilter, setFamilyFilter] = useState<ColourFamily | "All">("All");
  const filteredColours = familyFilter === "All" ? colours : colours.filter(c => c.family === familyFilter);

  const [shopColourId, setShopColourId] = useState<string | null>(null);
  const shopColour = (shopColourId ? colours.find(c => c.id === shopColourId) : null) ?? colours[0] ?? null;
  const [shopSize, setShopSize] = useState<Size>("4L");
  const [shopFinish, setShopFinish] = useState<Finish>("Matte");

  const addItem = useCallback((item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    const qty = item.quantity ?? 1;
    setCart(prev => {
      const idx = prev.findIndex(p => p.productId === item.productId && p.size === item.size && p.finish === item.finish && p.colourId === item.colourId);
      if (idx > -1) { const copy = [...prev]; copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + qty }; return copy; }
      return [...prev, { ...item, quantity: qty }];
    });
    setCartOpen(true);
    showToast(`Added ${item.colourName} • ${item.size}`);
    trackCartEvent({ eventType: "add", productSlug: item.productSlug, colourId: item.colourId, size: item.size, finish: item.finish, quantity: qty, unitKes: item.unitKes });
  }, []);

  const updateQty = (key: string, q: number) => {
    setCart(cs => cs.map(c => key === `${c.productId}|${c.colourId}|${c.size}|${c.finish}` ? { ...c, quantity: Math.max(1, q) } : c));
  };
  const removeLine = (key: string) => {
    const item = cart.find(c => key === `${c.productId}|${c.colourId}|${c.size}|${c.finish}`);
    if (item) trackCartEvent({ eventType: "remove", productSlug: item.productSlug, colourId: item.colourId, size: item.size, finish: item.finish });
    setCart(cs => cs.filter(c => key !== `${c.productId}|${c.colourId}|${c.size}|${c.finish}`));
  };

  const navigate = useCallback((id: string) => {
    setActivePage(id);
    navLockRef.current = true;
    setTimeout(() => { navLockRef.current = false; }, 600);
    if (window.matchMedia("(min-width: 1024px)").matches) {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    if (!mq.matches) return;
    const ids = ["home", "colours", "visualizer", "shop", "track"];
    const observer = new IntersectionObserver(
      entries => { if (navLockRef.current) return; entries.forEach(e => { if (e.isIntersecting) setActivePage(e.target.id); }); },
      { threshold: 0.35 }
    );
    ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  const [orderSuccess, setOrderSuccess] = useState<{ invoice: string } | null>(null);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F8F4EF", color: "#2B2B2E", fontFamily: `"Inter", system-ui, -apple-system, Segoe UI, Roboto, sans-serif` }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Cormorant:ital,wght@0,300;0,400;1,300&family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap');
        html { scroll-behavior: smooth; }
        .font-display{ font-family:"Playfair Display", Georgia, serif; }
        .font-tag{ font-family:"Cormorant", Georgia, serif; }
        .font-mono2{ font-family:"Roboto Mono", ui-monospace, SFMono-Regular, monospace; }
        * { -webkit-tap-highlight-color: transparent; }
        ::selection{ background:#E9A23B33; }
        ::-webkit-scrollbar{ width:8px; height:8px; }
        ::-webkit-scrollbar-thumb{ background:#d9cfbe; border-radius:999px; }
        .mm-muted{ color:#6f6a62; }
        .mm-card{ background:#fff; border:1px solid #ebe2d2; }
        .mm-shadow{ box-shadow: 0 10px 38px rgba(43,43,46,.075); }
        .btn{ display:inline-flex; align-items:center; justify-content:center; gap:.55rem; border-radius:999px; font-weight:600; transition: transform .12s ease, opacity .15s ease, background .15s ease; }
        .btn:active{ transform: translateY(1px) scale(.992); }
        .btn-primary{ background:#B84A32; color:#fff; }
        .btn-primary:hover{ opacity:.94; }
        .btn-dark{ background:#2B2B2E; color:#F8F4EF; }
        .btn-ghost{ background:#fff; border:1px solid #e4d7c2; color:#2B2B2E; }
        .chip{ border:1px solid #e2d3b7; background:#fff; border-radius:999px; padding:.42rem .78rem; font-size:12.5px; font-weight:600; }
        .chip.active{ background:#2B2B2E; color:#F8F4EF; border-color:#2B2B2E; }
        .input{ width:100%; padding:.76rem .95rem; border-radius:14px; background:#fff; border:1px solid #e1d3bd; font-size:14px; outline:none; }
        .input:focus{ border-color:#4FB9B0; box-shadow:0 0 0 3px rgba(79,185,176,.15); }
        .select{ width:100%; padding:.72rem .9rem; border-radius:14px; background:#fff; border:1px solid #e1d3bd; font-size:14px; }
        .swatch{ width:44px; height:44px; border-radius:999px; border:3px solid #fff; box-shadow:0 3px 13px rgba(0,0,0,.11); transition: transform .12s ease; }
        .swatch:hover{ transform: scale(1.055); }
        .swatch.active{ box-shadow:0 0 0 2.5px #fff, 0 0 0 4.5px #2B2B2E; transform: scale(1.05); }
        @keyframes sheet-in { from{ transform: translateX(100%);} to{ transform: translateX(0);} }
        @keyframes fade-in { from{ opacity:0 } to{ opacity:1 } }
        .sheet-panel{ animation: sheet-in .24s cubic-bezier(.22,1,.36,1); }
        .fade{ animation: fade-in .18s ease-out; }
        @keyframes pgIn { from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:translateY(0); } }
        @media (max-width:1023px){ .pg-enter{ display:block; animation: pgIn .26s cubic-bezier(.22,1,.36,1); } }
        @keyframes shimmer { from{ background-position:200% 0; } to{ background-position:-200% 0; } }
      `}</style>

      <div className="w-full text-[11.5px] sm:text-[12.5px] tracking-wide" style={{ backgroundColor: "#2B2B2E", color: "#F8F4EF" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-[10px] flex items-center justify-center gap-4 text-center">
          <span className="font-tag text-[15px] sm:text-[16px] italic">Bring Walls to Life — Colour That Lasts. Style That Inspires.</span>
          <span className="hidden sm:inline opacity-90">•</span>
          <span className="font-mono2 text-[11px] hidden sm:inline">🎉 Free delivery on all orders</span>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: "rgba(248,244,239,0.93)", backdropFilter: "blur(10px)", borderColor: "#e8dcc7" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-[68px] flex items-center justify-between gap-4">
          <button onClick={() => navigate("home")} className="flex items-center gap-[11px] min-w-0">
            <div className="w-[41px] h-[41px] rounded-[13px] flex items-center justify-center text-white" style={{ backgroundColor: "#B84A32" }} aria-label="MicMikes Paints">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
                <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8z"/>
              </svg>
            </div>
            <div className="text-left leading-tight">
              <div className="font-display text-[18.5px] sm:text-[20px] tracking-[-0.01em]">MicMikes Paints</div>
              <div className="font-tag text-[12.5px] -mt-[2px]" style={{ color: "#7b7468" }}>KEEKOROK</div>
            </div>
          </button>
          <nav className="hidden lg:flex items-center gap-8 text-[14.5px] font-[500]">
            {[["Home","home"],["Colours","colours"],["Visualizer","visualizer"],["Shop","shop"],["Track Order","track"]].map(([label,id]) => (
              <button key={id} onClick={() => navigate(id)} className="hover:opacity-70 transition-opacity relative" style={{ color: activePage === id ? "#B84A32" : undefined }}>
                {label}
                {activePage === id && <span className="absolute -bottom-[22px] left-0 right-0 h-[2px] rounded-full" style={{ background: "#B84A32" }} />}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => setCartOpen(true)} className="btn btn-ghost px-[14px] sm:px-[18px] py-[9px] sm:py-[10px] text-[13px] relative" aria-label="Open cart">
              <span className="hidden sm:inline">Cart</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:ml-1">
                <path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6l-2-3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-[7px] -right-[7px] min-w-[22px] h-[22px] px-[6px] rounded-full text-[11px] font-[700] text-white flex items-center justify-center" style={{ backgroundColor: "#B84A32" }}>{cartCount}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>

        <section id="home" className={`relative ${activePage === "home" ? "block pg-enter" : "hidden lg:block"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-10 sm:pt-16 pb-10 lg:pb-16">
            <div className="grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              <div className="lg:col-span-6">
                <div className="inline-flex items-center gap-2 text-[11px] font-mono2 px-3 py-[6px] rounded-full mb-4 bg-white border" style={{ borderColor: "#e7d7be", color: "#B84A32" }}>KEEKOROK EDITION • NAIROBI • KES</div>
                <h1 className="font-display text-[40px] sm:text-[56px] md:text-[64px] leading-[0.95] tracking-[-0.017em]">Bring Walls<br/>to Life</h1>
                <p className="font-tag text-[22px] sm:text-[26px] mt-3" style={{ color: "#5d5850" }}>Colour That Lasts. Style That Inspires.</p>
                <p className="max-w-[520px] text-[15.5px] leading-relaxed mm-muted mt-5">Keekorok paint system — 20 curated Kenyan shades, M-Pesa checkout, free delivery on all orders. Premium emulsion, eggshell, satin &amp; semi-gloss.</p>
                <div className="flex flex-wrap gap-3 mt-7">
                  <button onClick={() => navigate("colours")} className="btn btn-primary px-[22px] py-[13px] text-[14.5px]">Find Your Perfect Shade →</button>
                  <button onClick={() => navigate("visualizer")} className="btn btn-ghost px-[22px] py-[13px] text-[14.5px]">Open Visualizer</button>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-mono2 mt-5" style={{ color: "#7c756a" }}>
                  <span>✔ M-Pesa STK</span><span>✔ KES pricing</span><span>✔ Free delivery</span><span>✔ 20 Keekorok colours</span>
                </div>
              </div>
              <div className="lg:col-span-6">
                <div className="mm-card rounded-[28px] overflow-hidden mm-shadow">
                  <div className="relative">
                    <img src="https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1400" alt="Keekorok living room" className="w-full h-[340px] sm:h-[430px] object-cover" loading="eager" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(43,43,46,0.08) 0%, rgba(43,43,46,0.22) 100%)"}}/>
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
                      <div className="px-[14px] py-[9px] rounded-[14px] bg-white/95 text-[13px] font-[600]">Ocean Breeze • Satin</div>
                      <div className="px-[12px] py-[8px] rounded-full text-[11px] font-mono2 bg-[#2B2B2E] text-[#F8F4EF]">Keekorok</div>
                    </div>
                  </div>
                  <div className="px-4 sm:px-5 py-4 flex items-center gap-[10px] flex-wrap">
                    {colours.slice(6, 14).map(c => (
                      <button key={c.id} onClick={() => { setVizColourId(c.id); navigate("visualizer"); }} title={c.name} aria-label={c.name} className="swatch" style={{ backgroundColor: c.hex }} />
                    ))}
                    <button onClick={() => navigate("colours")} className="text-[12.5px] font-[600] px-3 py-[8px] rounded-full" style={{ color: "#4FB9B0" }}>+12 more →</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="colours" className={`py-12 sm:py-16 ${activePage === "colours" ? "block pg-enter" : "hidden lg:block"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="max-w-[760px] mb-6">
              <h2 className="font-display text-[30px] sm:text-[36px]">Colour Explorer</h2>
              <p className="mm-muted mt-2">20 Kenyan-inspired Keekorok tones. Tap any swatch — it loads instantly in the visualizer.</p>
            </div>
            <div className="flex flex-wrap gap-[9px] mb-5">
              {ALL_FAMILIES.map(f => (
                <button key={f} onClick={() => setFamilyFilter(f)} className={`chip ${familyFilter === f ? "active" : ""}`}>{f}</button>
              ))}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
              {filteredColours.map(c => (
                <button key={c.id} onClick={() => { setVizColourId(c.id); navigate("visualizer"); }} title={c.name} aria-label={`${c.name} — click to visualize`} className="flex flex-col items-center gap-[6px] group">
                  <div className={`swatch ${vizColour?.id === c.id ? "active" : ""}`} style={{ backgroundColor: c.hex }} />
                  <span className="text-[10.5px] text-center leading-tight mm-muted group-hover:text-[#2B2B2E] transition-colors line-clamp-2">{c.name}</span>
                </button>
              ))}
            </div>
            {popularIds.length > 0 && (
              <div className="mt-8 pt-6 border-t" style={{ borderColor: "#ebe2d2" }}>
                <div className="text-[12px] font-[600] mm-muted mb-3 uppercase tracking-wider">Most Popular This Week</div>
                <div className="flex gap-3 flex-wrap">
                  {popularIds.map(id => {
                    const c = colours.find(x => x.id === id);
                    if (!c) return null;
                    return (
                      <button key={c.id} onClick={() => { setVizColourId(c.id); navigate("visualizer"); }}
                        className="flex items-center gap-2 px-3 py-[8px] rounded-full border bg-white text-[13px] font-[500]" style={{ borderColor: "#e2d3b7" }}>
                        <span className="w-4 h-4 rounded-full border border-[#ddd]" style={{ backgroundColor: c.hex }} />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <section id="visualizer" className={`py-12 sm:py-16 border-t ${activePage === "visualizer" ? "block pg-enter" : "hidden lg:block"}`} style={{ borderColor: "#ebe2d2" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="max-w-[760px] mb-6">
              <h2 className="font-display text-[30px] sm:text-[36px]">Room Visualizer</h2>
              <p className="mm-muted mt-2">See your chosen colour in a real room before you buy. Use ← → keys to cycle shades.</p>
            </div>
            {vizColour && vizRoom ? (
              <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
                <div className="lg:col-span-8">
                  <div className="mm-card rounded-[22px] overflow-hidden mm-shadow">
                    <VisualizerCanvas room={vizRoom} colour={vizColour} finish={vizFinish} />
                    <div className="px-4 py-3 flex gap-2 overflow-x-auto">
                      {rooms.map((r, i) => (
                        <button key={r.id} onClick={() => setVizRoomIdx(i)}
                          className={`flex items-center gap-2 flex-shrink-0 px-3 py-[7px] rounded-full text-[12.5px] font-[500] border transition ${vizRoomIdx === i ? "border-[#2B2B2E] bg-[#2B2B2E] text-[#F8F4EF]" : "border-[#e2d3b7] bg-white"}`}>
                          <PaintedThumb room={r} colourId={vizColourId} />
                          {r.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-4 space-y-4">
                  <div className="mm-card rounded-[20px] p-5">
                    <div className="text-[12px] font-[600] mm-muted uppercase tracking-wider mb-3">Selected Colour</div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full border-4 border-white mm-shadow" style={{ backgroundColor: vizColour.hex }} />
                      <div>
                        <div className="font-[600] text-[15px]">{vizColour.name}</div>
                        <div className="font-mono2 text-[12px] mm-muted">{vizColour.hex}</div>
                        <div className="text-[11.5px] mm-muted">{vizColour.family}</div>
                      </div>
                    </div>
                    <div className="text-[12px] font-[600] mm-muted uppercase tracking-wider mb-2">Finish</div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(["Matte","Eggshell","Satin","Semi-Gloss"] as Finish[]).map(f => (
                        <button key={f} onClick={() => setVizFinish(f)} className={`chip text-[12px] ${vizFinish === f ? "active" : ""}`}>{f}</button>
                      ))}
                    </div>
                    <div className="text-[12px] font-[600] mm-muted uppercase tracking-wider mb-2">Size</div>
                    <div className="flex gap-2 mb-5">
                      {(["1L","4L","20L"] as Size[]).map(s => (
                        <button key={s} onClick={() => setVizSize(s)} className={`chip ${vizSize === s ? "active" : ""}`}>{s}</button>
                      ))}
                    </div>
                    {products.length > 0 && (() => {
                      const prod = products.find(p => p.category === "Paint") ?? products[0];
                      return (
                        <button onClick={() => addItem({ productId: prod.id, productName: prod.name, productSlug: prod.slug, colourId: vizColour.id, colourName: vizColour.name, colourHex: vizColour.hex, size: vizSize, finish: vizFinish, unitKes: prod.baseKes[vizSize] })}
                          className="btn btn-primary w-full py-[13px] text-[14px]">
                          Add to Cart — {kes(prod.baseKes[vizSize])}
                        </button>
                      );
                    })()}
                  </div>
                  <div className="mm-card rounded-[20px] p-5">
                    <div className="text-[12px] font-[600] mm-muted uppercase tracking-wider mb-3">Browse Colours</div>
                    <div className="flex flex-wrap gap-[8px]">
                      {colours.slice(0, 20).map(c => (
                        <button key={c.id} onClick={() => setVizColourId(c.id)} title={c.name}
                          className={`swatch w-[36px] h-[36px] ${vizColour.id === c.id ? "active" : ""}`} style={{ backgroundColor: c.hex }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 mm-muted">{dataLoading ? "Loading visualizer…" : "No colours available yet."}</div>
            )}
          </div>
        </section>

        <section id="shop" className={`py-12 sm:py-16 border-t ${activePage === "shop" ? "block pg-enter" : "hidden lg:block"}`} style={{ borderColor: "#ebe2d2" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="max-w-[760px] mb-6">
              <h2 className="font-display text-[30px] sm:text-[36px]">Shop</h2>
              <p className="mm-muted mt-2">Premium Keekorok paints, primers &amp; supplies. M-Pesa checkout. Free delivery on all orders.</p>
            </div>
            <div className="mm-card rounded-[20px] p-5 mb-6">
              <div className="text-[12px] font-[600] mm-muted uppercase tracking-wider mb-3">Choose Your Colour</div>
              <div className="flex flex-wrap gap-[10px] mb-4">
                {colours.slice(0, 20).map(c => (
                  <button key={c.id} onClick={() => setShopColourId(c.id)} title={c.name} className={`swatch ${shopColour?.id === c.id ? "active" : ""}`} style={{ backgroundColor: c.hex }} />
                ))}
              </div>
              {shopColour && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-white mm-shadow" style={{ backgroundColor: shopColour.hex }} />
                  <span className="font-[600] text-[14px]">{shopColour.name}</span>
                  <span className="font-mono2 text-[12px] mm-muted">{shopColour.hex}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-4 mb-6">
              <div>
                <div className="text-[12px] font-[600] mm-muted uppercase tracking-wider mb-2">Size</div>
                <div className="flex gap-2">
                  {(["1L","4L","20L"] as Size[]).map(s => (
                    <button key={s} onClick={() => setShopSize(s)} className={`chip ${shopSize === s ? "active" : ""}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[12px] font-[600] mm-muted uppercase tracking-wider mb-2">Finish</div>
                <div className="flex flex-wrap gap-2">
                  {(["Matte","Eggshell","Satin","Semi-Gloss"] as Finish[]).map(f => (
                    <button key={f} onClick={() => setShopFinish(f)} className={`chip ${shopFinish === f ? "active" : ""}`}>{f}</button>
                  ))}
                </div>
              </div>
            </div>
            {dataLoading ? (
              <div className="text-center py-12 mm-muted">Loading products…</div>
            ) : products.length === 0 ? (
              <div className="text-center py-12 mm-muted">No products available yet.</div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {products.map(prod => (
                  <div key={prod.id} className="mm-card rounded-[22px] overflow-hidden mm-shadow flex flex-col">
                    <div className="relative h-[200px] sm:h-[220px] bg-[#f0ebe1]">
                      {prod.image ? (
                        <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full" style={{ backgroundColor: shopColour?.hex ?? "#B84A32" }} />
                        </div>
                      )}
                      <div className="absolute top-3 left-3">
                        <span className="text-[11px] font-[600] px-[10px] py-[5px] rounded-full bg-white/90" style={{ color: prod.category === "Paint" ? "#B84A32" : prod.category === "Primer" ? "#4FB9B0" : "#2B2B2E" }}>{prod.category}</span>
                      </div>
                    </div>
                    <div className="p-4 sm:p-5 flex flex-col flex-1">
                      <div className="font-display text-[19px]">{prod.name}</div>
                      <p className="text-[13px] mm-muted mt-1 flex-1">{prod.blurb}</p>
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-[700] text-[18px]">{kes(prod.baseKes[shopSize])}</div>
                          <div className="text-[11.5px] mm-muted">{shopSize} · {shopFinish}</div>
                        </div>
                        <button onClick={() => shopColour && addItem({ productId: prod.id, productName: prod.name, productSlug: prod.slug, colourId: shopColour.id, colourName: shopColour.name, colourHex: shopColour.hex, size: shopSize, finish: shopFinish, unitKes: prod.baseKes[shopSize] })}
                          disabled={!shopColour} className="btn btn-primary px-[18px] py-[11px] text-[13.5px] disabled:opacity-50">
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Track Order section */}
        <div className={activePage === "track" ? "block pg-enter" : "hidden lg:block"}>
          <TrackOrder />
        </div>

      </main>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t"
        style={{ backgroundColor: "rgba(248,244,239,0.97)", backdropFilter: "blur(12px)", borderColor: "#e8dcc7", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex items-stretch h-[64px]">
          {[
            { id: "home",       label: "Home",    icon: <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,                    icon2: <polyline points="9 22 9 12 15 12 15 22"/> },
            { id: "colours",    label: "Colours", icon: <circle cx="12" cy="12" r="10"/>,                                             icon2: <path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/> },
            { id: "visualizer", label: "Visualize",icon: <rect x="3" y="3" width="18" height="18" rx="2"/>,                         icon2: <><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></> },
            { id: "shop",       label: "Shop",    icon: <path d="M6 6h15l-1.5 9h-12z"/>,                                             icon2: <><path d="M6 6l-2-3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></> },
            { id: "track",      label: "Track",   icon: <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>,                 icon2: <circle cx="12" cy="10" r="3"/> },
          ].map(({ id, label, icon, icon2 }) => {
            const active = activePage === id;
            return (
              <button key={id} onClick={() => navigate(id)} className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity"
                style={{ color: active ? "#B84A32" : "#7b7468" }} aria-current={active ? "page" : undefined}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.7"} strokeLinecap="round" strokeLinejoin="round">
                  {icon}{icon2}
                </svg>
                <span className="text-[10px] font-[600]">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 fade" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-[420px] h-full bg-[#F8F4EF] sheet-panel flex flex-col shadow-2xl">
            <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between" style={{ borderColor: "#e7d9c3" }}>
              <div className="font-display text-[22px]">Your Cart</div>
              <button onClick={() => setCartOpen(false)} className="w-9 h-9 rounded-full bg-white border flex items-center justify-center" style={{ borderColor: "#e3d5bc" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">🎨</div>
                  <div className="font-display text-[20px] mb-1">Your cart is empty</div>
                  <p className="mm-muted text-[14px]">Add colours and paints to get started.</p>
                  <button onClick={() => { setCartOpen(false); navigate("colours"); }} className="btn btn-primary mt-5 px-6 py-[11px] text-[14px]">Browse Colours →</button>
                </div>
              ) : (
                cart.map(item => {
                  const key = `${item.productId}|${item.colourId}|${item.size}|${item.finish}`;
                  return (
                    <div key={key} className="mm-card rounded-[18px] p-4 flex gap-3">
                      <div className="w-10 h-10 rounded-full flex-shrink-0 border-2 border-white mm-shadow" style={{ backgroundColor: item.colourHex }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-[600] text-[14px] truncate">{item.productName}</div>
                        <div className="text-[12px] mm-muted truncate">{item.colourName} · {item.size} · {item.finish}</div>
                        <div className="font-[700] text-[14px] mt-[2px]">{kes(item.unitKes * item.quantity)}</div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <button onClick={() => removeLine(key)} className="text-[11px] mm-muted hover:text-red-500 transition-colors">✕</button>
                        <div className="flex items-center gap-1">
                          <button onClick={() => item.quantity > 1 ? updateQty(key, item.quantity - 1) : removeLine(key)} className="w-7 h-7 rounded-full bg-white border flex items-center justify-center text-[15px]" style={{ borderColor: "#e2d3b7" }}>−</button>
                          <span className="w-6 text-center text-[13px] font-[600]">{item.quantity}</span>
                          <button onClick={() => updateQty(key, item.quantity + 1)} className="w-7 h-7 rounded-full bg-white border flex items-center justify-center text-[15px]" style={{ borderColor: "#e2d3b7" }}>+</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {cart.length > 0 && (
              <div className="px-6 py-5 border-t space-y-3" style={{ borderColor: "#e7d9c3" }}>
                <div className="flex justify-between text-[13.5px]"><span className="mm-muted">Subtotal</span><span className="font-[600]">{kes(subtotal)}</span></div>
                <div className="flex justify-between text-[13px] mm-muted"><span>Delivery</span><span>Free</span></div>
                <div className="flex justify-between text-[15px] font-[700] pt-2 border-t" style={{ borderColor: "#eadcc4" }}>
                  <span>Total</span><span>{kes(totalKes)}</span>
                </div>
                <button onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}
                  className="btn btn-dark w-full py-[13px] text-[14.5px]">
                  Checkout · {kes(totalKes)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {checkoutOpen && !orderSuccess && (
        <CheckoutDialog
          subtotal={subtotal}
          total={totalKes}
          cartCount={cartCount}
          cart={cart}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={(meta) => {
            setOrderSuccess(meta);
            setCart([]);
            setCheckoutOpen(false);
          }}
        />
      )}

      {orderSuccess && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 fade" onClick={() => setOrderSuccess(null)} />
          <div className="relative w-full max-w-[420px] rounded-[24px] p-8 text-center fade mm-shadow" style={{ background: "#F8F4EF" }}>
            <div className="text-5xl mb-4">🎉</div>
            <div className="font-display text-[28px] mb-2">Order Placed!</div>
            <p className="mm-muted text-[14.5px] mb-2">Your Keekorok paints are on their way.</p>
            <div className="font-mono2 text-[13px] px-4 py-2 rounded-full bg-white border inline-block mb-4" style={{ borderColor: "#e2d3b7" }}>
              Ref: {orderSuccess.invoice}
            </div>
            <p className="text-[12.5px] mm-muted mb-6">Use your phone number to track this order anytime.</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => { setOrderSuccess(null); navigate("track"); }} className="btn btn-ghost w-full py-[11px] text-[13.5px]">Track My Order 📦</button>
              <button onClick={() => setOrderSuccess(null)} className="btn btn-primary w-full py-[13px] text-[14.5px]">Continue Shopping</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-[84px] left-1/2 -translate-x-1/2 z-[100] px-5 py-[11px] rounded-full text-[13px] font-[600] text-white fade mm-shadow"
          style={{ background: "#2B2B2E", whiteSpace: "nowrap" }}>
          ✓ {toast}
        </div>
      )}

      <ChatWidget />

      <Analytics />
    </div>
  );
}

/* ── Chat Widget (NVIDIA-powered support + recommendations) ── */
type ChatMessage = { role: "user" | "assistant"; content: string };


// Renders **bold**, *italic*, and - bullet lists from AI responses
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;

  function formatInline(line: string): React.ReactNode {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
      return p;
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") {
      nodes.push(<br key={key++} />);
    } else if (/^[-•]\s/.test(trimmed)) {
      nodes.push(
        <span key={key++} style={{ display: "block", paddingLeft: "0.75rem", textIndent: "-0.5rem" }}>
          {"• "}{formatInline(trimmed.slice(2))}
        </span>
      );
    } else {
      nodes.push(<span key={key++}>{formatInline(trimmed)}</span>);
      nodes.push(<br key={key++} />);
    }
  }
  return nodes;
}

function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I'm the MicMikes Paints assistant 🎨 Ask me about colours, finishes, prices, or delivery — or tell me your room and I'll suggest a shade." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(1) }), // drop the canned greeting
      });
      const data = await res.json().catch(() => ({}));
      const reply = res.ok && data.reply
        ? data.reply
        : (data.error || "Sorry, I couldn't reach the assistant. Try WhatsApp: wa.me/254712345678");
      setMessages(m => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Network issue - please try again, or WhatsApp us at wa.me/254712345678." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Close chat" : "Open chat assistant"}
        className="fixed z-[65] right-4 flex items-center justify-center rounded-full mm-shadow transition-transform hover:scale-105"
        style={{
          bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
          width: 56, height: 56, background: "#B84A32", color: "#fff",
        }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed z-[64] right-4 flex flex-col rounded-[20px] overflow-hidden mm-shadow fade"
          style={{
            bottom: "calc(142px + env(safe-area-inset-bottom, 0px))",
            width: "min(380px, calc(100vw - 32px))",
            height: "min(520px, calc(100vh - 220px))",
            background: "#F8F4EF", border: "1px solid #e7d9c3",
          }}
        >
          <div className="px-4 py-3 flex items-center gap-3" style={{ background: "#2B2B2E", color: "#F8F4EF" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[15px]" style={{ background: "#B84A32" }}>🎨</div>
            <div className="leading-tight">
              <div className="text-[13.5px] font-[700]">MicMikes Assistant</div>
              <div className="text-[11px]" style={{ color: "#bdb7a9" }}>Colours, prices, delivery</div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="px-3 py-2 rounded-[14px] text-[13px] leading-relaxed"
                  style={m.role === "user"
                    ? { background: "#B84A32", color: "#fff", borderBottomRightRadius: 4, maxWidth: "82%" }
                    : { background: "#fff", color: "#2B2B2E", border: "1px solid #ece1cf", borderBottomLeftRadius: 4, maxWidth: "82%" }}
                >
                  {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="px-3 py-2.5 rounded-[14px] bg-white border" style={{ borderColor: "#ece1cf" }}>
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B84A32] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B84A32] animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B84A32] animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="p-2.5 flex items-center gap-2" style={{ borderTop: "1px solid #e7d9c3", background: "#fffdf8" }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") send(); }}
              placeholder="Ask about colours, prices…"
              className="flex-1 px-3 py-2 rounded-full text-[13px] bg-white focus:outline-none"
              style={{ border: "1px solid #e2d3b7" }}
              disabled={busy}
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label="Send message"
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
              style={{ background: "#B84A32", color: "#fff" }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
