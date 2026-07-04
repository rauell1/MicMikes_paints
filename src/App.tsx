import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";

/* ── session id for cart event tracking ── */
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

/* ──────────────────────────────────────────────────────────
   MicMikes Paints — Keekorok Edition
   Single-page, mobile-first, production landing
   ────────────────────────────────────────────────────────── */

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

/* ── VisualizerCanvas ── */
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

/* ── PaintedThumb ── */
function PaintedThumb({ room }: { room: Room; colourId: string | null }) {
  return (
    <div className="w-[40px] h-[30px] rounded-[7px] overflow-hidden flex-shrink-0 border border-[#3a3a3d]">
      <img src={room.photo} alt={room.name} className="w-full h-full object-cover" loading="lazy" />
    </div>
  );
}

/* ── CheckoutDialog ── */
function CheckoutDialog({
  subtotal, deliveryFee, total, cartCount, cart, onClose, onSuccess,
}: {
  subtotal: number; deliveryFee: number; total: number; cartCount: number;
  cart: CartItem[];
  onClose: () => void;
  onSuccess: (meta: { invoice: string }) => void;
}) {
  const [step, setStep] = useState<"details"|"payment"|"confirm">("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [payMethod, setPayMethod] = useState<"mpesa"|"card">("mpesa");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [mpesaStatus, setMpesaStatus] = useState<"idle"|"pending"|"success"|"failed">("idle");

  const invoice = `INV-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

  const pollMpesaStatus = async (checkoutRequestId: string) => {
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

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim() || !address.trim()) { setError("Please fill all required fields."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, address, notes, payMethod, cart, subtotal, deliveryFee, total, invoice }),
      });
      if (!res.ok) throw new Error("Order failed");
      if (payMethod === "mpesa") {
        setMpesaStatus("pending");
        const mpesaRes = await fetch("/api/mpesa/stkpush", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, amount: total, invoice }),
        });
        if (mpesaRes.ok) {
          const mpesaData = await mpesaRes.json() as { CheckoutRequestID?: string };
          const checkoutRequestId = mpesaData.CheckoutRequestID;
          if (checkoutRequestId) { await pollMpesaStatus(checkoutRequestId); }
          else { onSuccess({ invoice }); }
        } else { setMpesaStatus("failed"); setError("Failed to initiate M-Pesa payment. Please try again."); }
      } else { onSuccess({ invoice }); }
    } catch { setError("Something went wrong. Please try again or call us."); }
    finally { setSubmitting(false); }
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
              <div><label className="text-[12px] font-[600] block mb-[5px]">Phone (M-Pesa) *</label><input className="input" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="07xx xxx xxx" type="tel" /></div>
              <div><label className="text-[12px] font-[600] block mb-[5px]">Delivery address *</label><input className="input" value={address} onChange={e=>setAddress(e.target.value)} placeholder="Street, estate, Nairobi" /></div>
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
                <div className="flex justify-between mm-muted"><span>Delivery</span><span>{deliveryFee===0?"Free":kes(deliveryFee)}</span></div>
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
                <div className="flex justify-between font-[700] text-[15px] pt-2 border-t" style={{ borderColor: "#eadcc4" }}><span>Total</span><span>{kes(total)}</span></div>
              </div>
              <div className="mm-card rounded-[14px] p-4 space-y-[5px]">
                <div className="font-[600] mb-1">Delivery to</div>
                <div>{name}</div><div className="mm-muted">{phone}</div><div className="mm-muted">{address}</div>
              </div>
              <div className="text-[12px] mm-muted">Invoice: <span className="font-mono2">{invoice}</span></div>
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
            <button onClick={() => setStep(step==="confirm" ? "payment" : "details")} className="btn btn-ghost flex-1 py-[12px] text-[14px]">← Back</button>
          )}
          {step !== "confirm" ? (
            <button onClick={() => {
              if (step==="details") { if (!name.trim()||!phone.trim()||!address.trim()) { setError("Please fill all required fields."); return; } setError(""); setStep("payment"); }
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
  const [colours, setColours] = useState<Colour[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/colours").then(r => r.json()),
      fetch("/api/products").then(r => r.json()),
      fetch("/api/rooms").then(r => r.json()),
    ]).then(([c, p, r]) => {
      setColours(c as Colour[]);
      setProducts(p as Product[]);
      const dbRooms = Array.isArray(r) && r.length > 0 ? (r as Room[]) : FALLBACK_ROOMS;
      setRooms(dbRooms);
    }).catch(console.error).finally(() => setDataLoading(false));
  }, []);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try { const raw = localStorage.getItem("micmikes-cart"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("micmikes-cart", JSON.stringify(cart)); } catch {} }, [cart]);

  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unitKes * i.quantity, 0), [cart]);
  const deliveryFee = subtotal === 0 ? 0 : (subtotal >= 15000 ? 0 : 350);
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
  const vizColour = (vizColourId ? colours.find(c => c.id === vizColourId) : null) ?? colours.find(c => c.name === "Indian Ocean") ?? colours[0] ?? null;

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
    const ids = ["home", "colours", "visualizer", "shop"];
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
        @media (max-width:1023px){ .pg-enter{ animation: pgIn .26s cubic-bezier(.22,1,.36,1); } }
        @keyframes shimmer { from{ background-position:200% 0; } to{ background-position:-200% 0; } }
      `}</style>

      {/* 1. Announcement bar */}
      <div className="w-full text-[11.5px] sm:text-[12.5px] tracking-wide" style={{ backgroundColor: "#2B2B2E", color: "#F8F4EF" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-[10px] flex items-center justify-center gap-4 text-center">
          <span className="font-tag text-[15px] sm:text-[16px] italic">Bring Walls to Life — Colour That Lasts. Style That Inspires.</span>
          <span className="hidden sm:inline opacity-90">•</span>
          <span className="font-mono2 text-[11px] hidden sm:inline">Free delivery in Nairobi over KES 15,000</span>
        </div>
      </div>

      {/* 2. Sticky header */}
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: "rgba(248,244,239,0.93)", backdropFilter: "blur(10px)", borderColor: "#e8dcc7" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-[68px] flex items-center justify-between gap-4">
          <button onClick={() => navigate("home")} className="flex items-center gap-[11px] min-w-0">
            <div className="w-[41px] h-[41px] rounded-[13px] flex items-center justify-center text-white" style={{ backgroundColor: "#B84A32" }} aria-label="MicMikes Paints">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

          <nav className="hidden lg:flex items-center gap-8 text-[14.5px] font-[500]" aria-label="Primary">
            {[["Home","home"],["Colours","colours"],["Visualizer","visualizer"],["Shop","shop"]].map(([label,id]) => (
              <button key={id} onClick={() => navigate(id)}
                className="hover:opacity-70 transition-opacity relative"
                style={{ color: activePage === id ? "#B84A32" : undefined }}>
                {label}
                {activePage === id && <span className="absolute -bottom-[22px] left-0 right-0 h-[2px] rounded-full" style={{ background: "#B84A32" }} />}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => setCartOpen(true)} className="btn btn-ghost px-[14px] sm:px-[18px] py-[9px] sm:py-[10px] text-[13px] relative" aria-label="Open cart">
              <span className="hidden sm:inline">Cart</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sm:ml-1">
                <path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6l-2-3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-[7px] -right-[7px] min-w-[22px] h-[22px] px-[6px] rounded-full text-[11px] font-[700] text-white flex items-center justify-center"
                  style={{ backgroundColor: "#B84A32" }}>{cartCount}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>

        {/* 3. Hero */}
        <section id="home" className={`relative ${activePage === "home" ? "pg-enter" : "hidden lg:block"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-10 sm:pt-16 pb-10 lg:pb-16">
            <div className="grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              <div className="lg:col-span-6">
                <div className="inline-flex items-center gap-2 text-[11px] font-mono2 px-3 py-[6px] rounded-full mb-4 bg-white border" style={{ borderColor: "#e7d7be", color: "#B84A32" }}>
                  KEEKOROK EDITION • NAIROBI • KES
                </div>
                <h1 className="font-display text-[40px] sm:text-[56px] md:text-[64px] leading-[0.95] tracking-[-0.017em]">
                  Bring Walls<br/>to Life
                </h1>
                <p className="font-tag text-[22px] sm:text-[26px] mt-3" style={{ color: "#5d5850" }}>Colour That Lasts. Style That Inspires.</p>
                <p className="max-w-[520px] text-[15.5px] leading-relaxed mm-muted mt-5">
                  Keekorok paint system — 20 curated Kenyan shades, M-Pesa checkout, next-day Nairobi delivery. Premium emulsion, eggshell, satin &amp; semi-gloss.
                </p>
                <div className="flex flex-wrap gap-3 mt-7">
                  <button onClick={() => navigate("colours")} className="btn btn-primary px-[22px] py-[13px] text-[14.5px]">Find Your Perfect Shade →</button>
                  <button onClick={() => navigate("visualizer")} className="btn btn-ghost px-[22px] py-[13px] text-[14.5px]">Open Visualizer</button>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-mono2 mt-5" style={{ color: "#7c756a" }}>
                  <span>✔ M-Pesa STK</span><span>✔ KES pricing</span><span>✔ Free delivery ≥ 15k</span><span>✔ 20 Keekorok colours</span>
                </div>
              </div>
              <div className="lg:col-span-6">
                <div className="mm-card rounded-[28px] overflow-hidden mm-shadow">
                  <div className="relative">
                    <img src="https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1400" alt="Keekorok living room" className="w-full h-[340px] sm:h-[430px] object-cover" loading="eager" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(43,43,46,0.08) 0%, rgba(43,43,46,0.22) 100%)" }}/>
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
                      <div className="px-[14px] py-[9px] rounded-[14px] bg-white/95 text-[13px] font-[600]">Indian Ocean • Satin</div>
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

        {/* 4. Colour Explorer */}
        <section id="colours" className={`py-12 sm:py-16 ${activePage === "colours" ? "pg-enter" : "hidden lg:block"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="max-w-[760px] mb-6">
              <h2 className="font-display text-[30px] sm:text-[36px]">Colour Explorer</h2>
              <p className="mm-muted mt-2">20 Kenyan-inspired Keekorok tones. Tap any swatch — it loads instantly in the visualizer.</p>
            </div>
            <div className="flex flex-wrap gap-[9px] mb-5" role="tablist" aria-label="Colour family">
              {ALL_FAMILIES.map(f => (
                <button key={f} role="tab" aria-selected={familyFilter === f} onClick={() => setFamilyFilter(f as ColourFamily | "All")} className={`chip ${familyFilter === f ? "active" : ""}`}>{f}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-[14px] sm:gap-4">
              {dataLoading ? Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="mm-card rounded-[18px] overflow-hidden">
                  <div className="h-[108px] sm:h-[120px]" style={{ background: "linear-gradient(90deg,#ebe2d2 25%,#f5ede0 50%,#ebe2d2 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
                  <div className="p-[12px] space-y-2"><div className="h-3 rounded-full w-3/4" style={{ background: "#ebe2d2" }} /><div className="h-2 rounded-full w-1/2" style={{ background: "#ebe2d2" }} /></div>
                </div>
              )) : filteredColours.map(c => (
                <button key={c.id} onClick={() => { setVizColourId(c.id); setShopColourId(c.id); showToast(`${c.name} selected`); }}
                  className="mm-card rounded-[18px] overflow-hidden text-left hover:mm-shadow transition-shadow focus:outline-none focus:ring-[3px] focus:ring-[#4FB9B055]"
                  aria-label={`${c.name} ${c.hex}`}>
                  <div className="h-[108px] sm:h-[120px]" style={{ backgroundColor: c.hex }} />
                  <div className="p-[12px]">
                    <div className="font-[600] text-[14px] leading-tight">{c.name}</div>
                    <div className="flex items-center justify-between mt-[6px] text-[11.5px]">
                      <span className="mm-muted">{c.family}</span>
                      <span className="font-mono2">{c.hex}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Room Visualizer */}
        <section id="visualizer" className={`py-12 sm:py-16 ${activePage === "visualizer" ? "pg-enter" : "hidden lg:block"}`} style={{ backgroundColor: "#2B2B2E", color: "#F8F4EF" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
              <div>
                <h2 className="font-display text-[30px] sm:text-[36px]">Room Visualizer</h2>
                <p className="mt-2" style={{ color: "#d5cfc3" }}>Pick a room, pick Keekorok — before / after, matte / satin / gloss.</p>
              </div>
              <div className="text-[11px] px-3 py-[6px] rounded-full" style={{ background: "#3b3b3d", color: "#e9dcc7" }}>← → keys switch colours</div>
            </div>
            <div className="grid lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8">
                <div className="rounded-[26px] overflow-hidden mm-shadow" style={{ background: "#17171a" }}>
                  {vizRoom && vizColour
                    ? <VisualizerCanvas room={vizRoom} colour={vizColour} finish={vizFinish} />
                    : <div className="h-[380px] flex items-center justify-center text-[#888]">Loading rooms…</div>
                  }
                </div>
              </div>
              <div className="lg:col-span-4">
                <div className="rounded-[22px] p-5 mm-shadow" style={{ background: "#202023", border: "1px solid #3a3a3d" }}>
                  <div className="text-[12px] font-[600] mb-[10px]" style={{ color: "#d5cfc3" }}>Room</div>
                  <div className="grid gap-2 mb-5">
                    {rooms.map((r, idx) => (
                      <button key={r.id} onClick={() => setVizRoomIdx(idx)} className="text-left flex items-center gap-3 px-3 py-[10px] rounded-[14px] border transition"
                        style={{ background: vizRoomIdx === idx ? "#2f2f33" : "transparent", borderColor: vizRoomIdx === idx ? "#4FB9B0" : "#3a3a3d", color: "#F8F4EF" }}>
                        <PaintedThumb room={r} colourId={vizColour?.id ?? null} />
                        <div><div className="font-[600] text-[14px]">{r.name}</div><div className="text-[11px]" style={{ color: "#bdb7a9" }}>Kenyan interior</div></div>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-baseline justify-between mb-[10px]">
                    <div className="text-[12px] font-[600]" style={{ color: "#d5cfc3" }}>Colour — {vizColour?.name ?? "—"}</div>
                    <div className="text-[10.5px] font-mono2" style={{ color: "#8f897d" }}>{vizColour?.hex}</div>
                  </div>
                  <div className="mb-4 space-y-[10px]">
                    {FAMILIES.map(fam => {
                      const famColours = colours.filter(c => c.family === fam);
                      if (!famColours.length) return null;
                      return (
                        <div key={fam}>
                          <div className="text-[10px] uppercase tracking-[0.08em] mb-[5px]" style={{ color: "#8f897d" }}>{fam}</div>
                          <div className="grid grid-cols-8 lg:grid-cols-7 gap-[8px]">
                            {famColours.map(c => (
                              <button key={c.id} onClick={() => { setVizColourId(c.id); trackCartEvent({ eventType: "swatch_click", colourId: c.id }); }}
                                className="relative w-full aspect-square rounded-[10px] border-[2px] transition"
                                style={{ backgroundColor: c.hex, borderColor: vizColour?.id === c.id ? "#E9A23B" : "transparent", transform: vizColour?.id === c.id ? "scale(1.06)" : "none" }}
                                aria-label={c.name} title={c.name}>
                                {popularIds.includes(c.id) && (
                                  <span className="absolute -top-[3px] -right-[3px] w-[11px] h-[11px] rounded-full text-[7px] leading-[11px] text-center"
                                    style={{ background: "#E9A23B", color: "#2B1a05" }} title="Popular this week">★</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[12px] font-[600] mb-[8px]" style={{ color: "#d5cfc3" }}>Finish</div>
                  <div className="flex gap-2 mb-[6px]">
                    {(["Matte","Satin","Semi-Gloss"] as Finish[]).map(f => (
                      <button key={f} onClick={() => setVizFinish(f)} className="flex-1 py-[9px] rounded-[12px] text-[12.5px] font-[600] border"
                        style={{ backgroundColor: vizFinish === f ? "#4FB9B0" : "transparent", color: vizFinish === f ? "#0b2c29" : "#F8F4EF", borderColor: vizFinish === f ? "#4FB9B0" : "#444448" }}>{f}</button>
                    ))}
                  </div>
                  <div className="text-[11px] mb-5" style={{ color: "#9d968a" }}>
                    {vizFinish === "Matte" ? "Soft, velvety — hides wall imperfections" : vizFinish === "Satin" ? "Silky low sheen — easy to clean, most popular" : "Durable gloss — kitchens, doors & high-touch walls"}
                  </div>
                  <div className="text-[12px] font-[600] mb-[8px]" style={{ color: "#d5cfc3" }}>Size</div>
                  <div className="flex gap-2 mb-5">
                    {(["1L","4L","20L"] as Size[]).map(s => (
                      <button key={s} onClick={() => setVizSize(s)} className="flex-1 py-[8px] rounded-[12px] text-[12px] font-[600] border"
                        style={{ backgroundColor: vizSize === s ? "#2f2f33" : "transparent", color: "#F8F4EF", borderColor: vizSize === s ? "#E9A23B" : "#444448" }}>
                        <div>{s}</div>
                        <div className="text-[10px] font-[400]" style={{ color: "#bdb7a9" }}>{products[0] ? kes(products[0].baseKes[s]) : "—"}</div>
                      </button>
                    ))}
                  </div>
                  <button disabled={!vizColour || !products[0]}
                    onClick={() => { const p = products[0]; if (!p || !vizColour) return; addItem({ productId: p.id, productName: p.name, productSlug: p.slug, colourId: vizColour.id, colourName: vizColour.name, colourHex: vizColour.hex, size: vizSize, finish: vizFinish, unitKes: p.baseKes[vizSize] }); }}
                    className="btn w-full py-[13px] text-[14.5px] disabled:opacity-40" style={{ background: "#E9A23B", color: "#2B1a05" }}>
                    Add {vizColour?.name ?? "colour"} · {vizSize} — {products[0] ? kes(products[0].baseKes[vizSize]) : ""}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Shop */}
        <section id="shop" className={`py-12 sm:py-16 ${activePage === "shop" ? "pg-enter" : "hidden lg:block"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="flex items-end justify-between gap-3 mb-6">
              <div>
                <h2 className="font-display text-[30px] sm:text-[36px]">Keekorok Shop</h2>
                <p className="mm-muted mt-2">Paints, primer &amp; supplies · M-Pesa checkout · priced in KES</p>
              </div>
            </div>
            {/* Colour picker */}
            {colours.length > 0 && (
              <div className="mb-6 p-4 sm:p-5 mm-card rounded-[20px]">
                <div className="text-[13px] font-[600] mb-3">Choose your colour</div>
                <div className="flex flex-wrap gap-[10px]">
                  {colours.map(c => (
                    <button key={c.id} onClick={() => setShopColourId(c.id)} title={c.name} aria-label={c.name}
                      className={`swatch ${shopColour?.id === c.id ? "active" : ""}`} style={{ backgroundColor: c.hex }} />
                  ))}
                </div>
                {shopColour && (
                  <div className="mt-3 text-[13px]">
                    <span className="font-[600]">{shopColour.name}</span>
                    <span className="mm-muted ml-2">{shopColour.family}</span>
                    <span className="font-mono2 ml-2 text-[12px]">{shopColour.hex}</span>
                  </div>
                )}
              </div>
            )}
            {/* Products grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {dataLoading ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="mm-card rounded-[20px] overflow-hidden">
                  <div className="h-[200px]" style={{ background: "linear-gradient(90deg,#ebe2d2 25%,#f5ede0 50%,#ebe2d2 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
                  <div className="p-5 space-y-3"><div className="h-4 rounded-full w-2/3" style={{ background: "#ebe2d2" }} /><div className="h-3 rounded-full w-full" style={{ background: "#ebe2d2" }} /><div className="h-3 rounded-full w-3/4" style={{ background: "#ebe2d2" }} /></div>
                </div>
              )) : products.map(p => (
                <div key={p.id} className="mm-card rounded-[20px] overflow-hidden mm-shadow flex flex-col">
                  <div className="relative">
                    <img src={p.image} alt={p.name} className="w-full h-[200px] object-cover" loading="lazy" />
                    <div className="absolute top-3 left-3">
                      <span className="text-[11px] font-[700] px-[10px] py-[5px] rounded-full" style={{ background: "#2B2B2E", color: "#F8F4EF" }}>{p.category}</span>
                    </div>
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <div className="font-display text-[20px] mb-1">{p.name}</div>
                    <div className="text-[13.5px] mm-muted mb-4 flex-1">{p.blurb}</div>
                    {p.category === "Paint" && (
                      <>
                        <div className="flex gap-2 mb-3">
                          {(["Matte","Eggshell","Satin","Semi-Gloss"] as Finish[]).map(f => (
                            <button key={f} onClick={() => setShopFinish(f)} className="flex-1 py-[7px] rounded-[10px] text-[11.5px] font-[600] border transition"
                              style={{ backgroundColor: shopFinish === f ? "#2B2B2E" : "#fff", color: shopFinish === f ? "#F8F4EF" : "#2B2B2E", borderColor: shopFinish === f ? "#2B2B2E" : "#e2d3b7" }}>{f}</button>
                          ))}
                        </div>
                        <div className="flex gap-2 mb-4">
                          {(["1L","4L","20L"] as Size[]).map(s => (
                            <button key={s} onClick={() => setShopSize(s)} className="flex-1 py-[8px] rounded-[10px] text-[12px] font-[600] border transition"
                              style={{ backgroundColor: shopSize === s ? "#F8F4EF" : "#fff", borderColor: shopSize === s ? "#B84A32" : "#e2d3b7" }}>
                              <div>{s}</div><div className="text-[11px] mm-muted">{kes(p.baseKes[s])}</div>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <button onClick={() => addItem({ productId: p.id, productName: p.name, productSlug: p.slug, colourId: shopColour?.id ?? "default", colourName: shopColour?.name ?? "Standard", colourHex: shopColour?.hex ?? "#888", size: p.category === "Paint" ? shopSize : "1L", finish: p.category === "Paint" ? shopFinish : "Matte", unitKes: p.baseKes[p.category === "Paint" ? shopSize : "1L"] })}
                      className="btn btn-primary w-full py-[12px] text-[14px]">
                      Add to Cart — {kes(p.baseKes[p.category === "Paint" ? shopSize : "1L"])}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* 7. Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t flex" aria-label="Mobile navigation"
        style={{ backgroundColor: "rgba(248,244,239,0.97)", backdropFilter: "blur(12px)", borderColor: "#e8dcc7", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {[
          { id: "home", label: "Home", icon: <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>, icon2: <polyline points="9 22 9 12 15 12 15 22"/> },
          { id: "colours", label: "Colours", icon: <circle cx="12" cy="12" r="10"/>, icon2: <><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="12" cy="7" r="1.5" fill="currentColor"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/><circle cx="12" cy="15" r="1.5" fill="currentColor"/></> },
          { id: "visualizer", label: "Visualize", icon: <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>, icon2: <><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></> },
          { id: "shop", label: "Shop", icon: <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>, icon2: <><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></> },
        ].map(({ id, label, icon, icon2 }) => (
          <button key={id} onClick={() => navigate(id)} className="flex-1 flex flex-col items-center justify-center py-[10px] gap-[4px] transition-colors"
            style={{ color: activePage === id ? "#B84A32" : "#9b9589" }} aria-current={activePage === id ? "page" : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {icon}{icon2}
            </svg>
            <span className="text-[10.5px] font-[600]">{label}</span>
            {activePage === id && <span className="absolute top-0 left-[50%] translate-x-[-50%] w-6 h-[2.5px] rounded-full" style={{ background: "#B84A32" }} />}
          </button>
        ))}
      </nav>

      {/* 8. Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 fade" onClick={() => setCartOpen(false)} />
          <div className="relative w-full sm:max-w-[420px] h-full sheet-panel flex flex-col" style={{ background: "#F8F4EF" }}>
            <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between" style={{ borderColor: "#e8dcc7" }}>
              <div className="font-display text-[22px]">Your Cart</div>
              <button onClick={() => setCartOpen(false)} className="w-9 h-9 rounded-full bg-white border flex items-center justify-center" style={{ borderColor: "#e3d5bc" }} aria-label="Close cart">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-16 text-[14px] mm-muted">Your cart is empty.<br/>Browse colours or the shop to add items.</div>
              ) : cart.map(item => {
                const key = `${item.productId}|${item.colourId}|${item.size}|${item.finish}`;
                return (
                  <div key={key} className="mm-card rounded-[16px] p-4 flex gap-3">
                    <div className="w-[44px] h-[44px] rounded-[10px] flex-shrink-0 border" style={{ backgroundColor: item.colourHex, borderColor: "#e2d3b7" }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-[600] text-[14px] truncate">{item.productName}</div>
                      <div className="text-[12px] mm-muted">{item.colourName} · {item.size} · {item.finish}</div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateQty(key, item.quantity - 1)} className="w-7 h-7 rounded-full bg-white border flex items-center justify-center text-[16px] font-[600]" style={{ borderColor: "#e2d3b7" }} aria-label="Decrease quantity">−</button>
                          <span className="text-[14px] font-[600] w-5 text-center">{item.quantity}</span>
                          <button onClick={() => updateQty(key, item.quantity + 1)} className="w-7 h-7 rounded-full bg-white border flex items-center justify-center text-[16px] font-[600]" style={{ borderColor: "#e2d3b7" }} aria-label="Increase quantity">+</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-[700] text-[14px]">{kes(item.unitKes * item.quantity)}</span>
                          <button onClick={() => removeLine(key)} className="text-[#B84A32] hover:opacity-70 transition-opacity" aria-label="Remove item">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {cart.length > 0 && (
              <div className="px-6 py-5 border-t space-y-3" style={{ borderColor: "#e8dcc7" }}>
                <div className="flex justify-between text-[13px]"><span className="mm-muted">Subtotal</span><span className="font-[600]">{kes(subtotal)}</span></div>
                <div className="flex justify-between text-[13px] mm-muted"><span>Delivery</span><span>{deliveryFee === 0 ? "Free" : kes(deliveryFee)}</span></div>
                <div className="flex justify-between text-[16px] font-[700]"><span>Total</span><span>{kes(totalKes)}</span></div>
                <button onClick={() => { setCartOpen(false); setCheckoutOpen(true); }} className="btn btn-primary w-full py-[14px] text-[15px]">
                  Checkout · {kes(totalKes)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. Checkout dialog */}
      {checkoutOpen && !orderSuccess && (
        <CheckoutDialog
          subtotal={subtotal} deliveryFee={deliveryFee} total={totalKes} cartCount={cartCount} cart={cart}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={(meta) => { setCart([]); setCheckoutOpen(false); setOrderSuccess(meta); }}
        />
      )}

      {/* 10. Order success */}
      {orderSuccess && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 fade" onClick={() => setOrderSuccess(null)} />
          <div className="relative w-full max-w-[440px] rounded-[24px] p-8 text-center fade" style={{ background: "#F8F4EF" }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#e8f5e9" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className="font-display text-[28px] mb-2">Order placed!</div>
            <p className="mm-muted text-[14px] mb-4">Thank you for your order. We'll confirm via SMS and deliver to your address.</p>
            <div className="text-[12px] mm-muted mb-6">Invoice: <span className="font-mono2">{orderSuccess.invoice}</span></div>
            <button onClick={() => setOrderSuccess(null)} className="btn btn-primary px-8 py-[12px] text-[15px]">Continue Shopping</button>
          </div>
        </div>
      )}

      {/* 11. Toast */}
      {toast && (
        <div className="fixed bottom-[90px] left-[50%] translate-x-[-50%] z-[70] px-5 py-[11px] rounded-[999px] text-[13.5px] font-[600] shadow-lg fade pointer-events-none whitespace-nowrap"
          style={{ background: "#2B2B2E", color: "#F8F4EF" }}>
          {toast}
        </div>
      )}

      <Analytics />
    </div>
  );
}
