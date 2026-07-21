"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import TrackOrder from "@/components/TrackOrder";
import RoomPhotoUpload from "@/components/RoomPhotoUpload";

function getSessionId(): string {
  const key = "mm-session";
  let id = typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
  if (!id && typeof window !== "undefined") {
    id = Math.random().toString(36).slice(2, 11);
    sessionStorage.setItem(key, id);
  }
  return id || "default-session";
}

async function trackCartEvent(payload: Record<string, unknown>) {
  try {
    await fetch("/api/events/cart", {
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

type Variant = {
  variantId: string;
  size: Size;
  listKes: number;
  saleKes: number | null;
  stockTracking: boolean;
  available: number | null;
};

type PaintSpecs = {
  washability: number | null;
  coverage: number | null;
  dryingMinutes: number | null;
};

type Product = {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  shortDescription?: string;
  longDescription?: string;
  category: "Paint" | "Primer" | "Supplies" | "Service";
  productType?: string;
  categoryName?: string;
  isFeatured?: boolean;
  isNewRelease?: boolean;
  isExteriorGrade?: boolean;
  roomTags?: string[];
  image: string;
  imageAlt?: string;
  baseKes: Record<Size, number>;
  variants: Variant[];
  specs?: PaintSpecs | null;
};

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
    category: "Paint", productType: "paint", categoryName: "Paint",
    isFeatured: true, isNewRelease: true, isExteriorGrade: false,
    roomTags: ["Living Room", "Bedroom", "Hallway"], image: "", imageAlt: "",
    baseKes: { "1L": 850, "4L": 2800, "20L": 11500 },
    variants: [
      { variantId: "fv-1-1", size: "1L", listKes: 850, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-1-2", size: "4L", listKes: 2800, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-1-3", size: "20L", listKes: 11500, saleKes: null, stockTracking: false, available: null }
    ],
    specs: { washability: 5, coverage: 12, dryingMinutes: 180 }
  },
  {
    id: "fp-02", slug: "keekorok-satin-finish", name: "Keekorok Satin Finish",
    blurb: "Silky satin sheen - ideal for living rooms, hallways & feature walls.",
    category: "Paint", productType: "paint", categoryName: "Paint",
    isFeatured: true, isNewRelease: false, isExteriorGrade: false,
    roomTags: ["Living Room", "Dining Room", "Kids Room"], image: "", imageAlt: "",
    baseKes: { "1L": 950, "4L": 3200, "20L": 13500 },
    variants: [
      { variantId: "fv-2-1", size: "1L", listKes: 950, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-2-2", size: "4L", listKes: 3200, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-2-3", size: "20L", listKes: 13500, saleKes: null, stockTracking: false, available: null }
    ],
    specs: { washability: 4, coverage: 14, dryingMinutes: 120 }
  },
  {
    id: "fp-03", slug: "keekorok-primer-sealer", name: "Keekorok Primer & Sealer",
    blurb: "Multi-surface primer for new plaster, timber & previously painted surfaces.",
    category: "Primer", productType: "primer", categoryName: "Primer",
    isFeatured: false, isNewRelease: false, isExteriorGrade: true,
    roomTags: ["Exterior", "Walls", "Ceilings"], image: "", imageAlt: "",
    baseKes: { "1L": 700, "4L": 2200, "20L": 9000 },
    variants: [
      { variantId: "fv-3-1", size: "1L", listKes: 700, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-3-2", size: "4L", listKes: 2200, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-3-3", size: "20L", listKes: 9000, saleKes: null, stockTracking: false, available: null }
    ],
    specs: { washability: 3, coverage: 10, dryingMinutes: 90 }
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
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16/9", background: "#17171a" }}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-[13px]" style={{ color: "#888" }}>Loading room…</div>
        </div>
      )}
      <canvas ref={canvasRef} style={{
        display: loaded ? "block" : "none",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        position: "absolute",
        top: 0, left: 0,
      }} />
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
  const [county, setCounty]   = useState("Nairobi");
  const [town, setTown]       = useState("Nairobi");
  const [address, setAddress] = useState("Sales Point Collection");
  const [notes, setNotes]     = useState("");
  const payMethod = "mpesa" as const;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [mpesaStatus, setMpesaStatus] = useState<"idle"|"pending"|"success"|"failed">("idle");
  const [agreedToTerms, setAgreedToTerms]       = useState(false);
  const [marketingOptIn, setMarketingOptIn]     = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);

  // Geolocation & Delivery Zones states
  const [deliveryZones, setDeliveryZones] = useState<{ county: string; town: string | null; rate_kes: number }[]>([]);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "getting" | "success" | "error">("idle");

  useEffect(() => {
    fetch("/api/delivery-zones")
      .then(res => res.json())
      .then(data => setDeliveryZones(data || []))
      .catch(err => console.error("Error loading zones:", err));
  }, []);

  const availableCounties = Array.from(new Set(deliveryZones.map(z => z.county))).sort();
  const availableTowns = deliveryZones
    .filter(z => z.county === county && z.town !== null)
    .map(z => z.town as string)
    .sort();

  const getDeliveryFee = () => {
    return 0;
  };

  const deliveryFee = 0;
  const checkoutTotal = subtotal;

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setLocStatus("error");
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLocStatus("getting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setLocStatus("success");
      },
      (err) => {
        console.error("Geolocation error:", err);
        setLocStatus("error");
        alert("Unable to retrieve location. Please ensure site permissions are granted.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

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
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError("Please fill all required fields.");
      return false;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return false;
    }
    if (!agreedToTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy to proceed.");
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
        body: JSON.stringify({ name, email, phone, county, town, address, notes, payMethod, items, latitude, longitude, agreedToTerms, marketingOptIn, analyticsConsent }),
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
            <div className="text-[12.5px] mm-muted">{cartCount} item{cartCount!==1?"s":""} · {kes(checkoutTotal)}</div>
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
              <div><label className="text-[12px] font-[600] block mb-[5px]">Notes (optional)</label><textarea className="input" rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Gate colour, special instructions…" style={{ resize: "none" }} /></div>

              <div className="space-y-3 mt-4 pt-3 border-t border-[#ebe2d2]">
                <label className="flex items-start gap-2.5 text-[12px] cursor-pointer font-[500]">
                  <input type="checkbox" checked={agreedToTerms} onChange={e=>setAgreedToTerms(e.target.checked)} className="mt-0.5 rounded border-[#e2d3b7] text-[#B84A32] focus:ring-[#B84A32] w-4 h-4 cursor-pointer" />
                  <span className="leading-snug text-graphite">
                    I agree to the <a href="/terms" target="_blank" className="text-[#B84A32] font-[700] hover:underline">Terms of Service</a> and <a href="/privacy" target="_blank" className="text-[#B84A32] font-[700] hover:underline">Privacy Policy</a>, and consent to the processing of my details under the Kenya Data Protection Act. *
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-[12px] cursor-pointer font-[500]">
                  <input type="checkbox" checked={marketingOptIn} onChange={e=>setMarketingOptIn(e.target.checked)} className="mt-0.5 rounded border-[#e2d3b7] text-[#B84A32] focus:ring-[#B84A32] w-4 h-4 cursor-pointer" />
                  <span className="leading-snug mm-muted">
                    Yes, I consent to receiving updates on new shades and promotions via SMS or email.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-[12px] cursor-pointer font-[500]">
                  <input type="checkbox" checked={analyticsConsent} onChange={e=>setAnalyticsConsent(e.target.checked)} className="mt-0.5 rounded border-[#e2d3b7] text-[#B84A32] focus:ring-[#B84A32] w-4 h-4 cursor-pointer" />
                  <span className="leading-snug mm-muted">
                    I consent to performance and analytics cookie tracking to improve my experience.
                  </span>
                </label>
              </div>
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-3">
              <div className="text-[13px] font-[600] mb-1">Payment method</div>
              <div className="w-full flex items-center gap-3 px-4 py-[13px] rounded-[14px] border text-left"
                style={{ borderColor: "#B84A32", background: "#fff5f2" }}>
                <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[15px]" style={{ background: "#B84A32", color: "#fff" }}>M</div>
                <div>
                  <div className="font-[600] text-[14px]">M-Pesa STK Push</div>
                  <div className="text-[12px] mm-muted">A payment prompt will be sent to your phone</div>
                </div>
              </div>
              <div className="mm-card rounded-[14px] p-4 space-y-[6px] text-[13px]">
                <div className="flex justify-between"><span className="mm-muted">Subtotal</span><span className="font-[600]">{kes(subtotal)}</span></div>
                <div className="flex justify-between text-[15px] font-[700] pt-2 border-t" style={{ borderColor: "#eadcc4" }}><span>Total</span><span>{kes(checkoutTotal)}</span></div>
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
                <div className="flex justify-between font-[700] text-[15px] pt-2 border-t" style={{ borderColor: "#eadcc4" }}><span>Total</span><span>{kes(checkoutTotal)}</span></div>
              </div>
              <div className="mm-card rounded-[14px] p-4 space-y-[5px]">
                <div className="font-[600] mb-1">Collection details</div>
                <div>{name}</div>
                <div className="mm-muted">{phone}</div>
                <div className="mm-muted">Sales Point Collection</div>
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
              {submitting || mpesaStatus === "pending" ? "Processing…" : `Place Order · ${kes(checkoutTotal)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductCard({ prod, colours, addItem, onOpenQuickView }: { prod: Product; colours: Colour[]; addItem: (item: any) => void; onOpenQuickView: (prod: Product) => void }) {
  const sizes = prod.variants && prod.variants.length > 0 ? prod.variants.map(v => v.size) : (["1L", "4L", "20L"] as Size[]);
  const uniqueSizes = Array.from(new Set(sizes)) as Size[];
  
  const [size, setSize] = useState<Size>(uniqueSizes.includes("4L") ? "4L" : uniqueSizes[0] || "4L");
  const [finish] = useState<Finish>("Matte");

  const activeVariant = prod.variants?.find(v => v.size === size) || {
    variantId: prod.id,
    size,
    listKes: prod.baseKes[size] || 0,
    saleKes: null,
    stockTracking: false,
    available: null
  };

  const priceKes = activeVariant.saleKes !== null ? activeVariant.saleKes : activeVariant.listKes;
  const isManaged = activeVariant.stockTracking && activeVariant.available !== null;
  const availableQty = activeVariant.available;
  const isSoldOut = isManaged && availableQty !== null && availableQty <= 0;
  const isLowStock = isManaged && availableQty !== null && availableQty > 0 && availableQty <= 5;

  const showDiscount = activeVariant.saleKes !== null && activeVariant.listKes > activeVariant.saleKes;
  const discountPercent = showDiscount ? Math.round(((activeVariant.listKes - activeVariant.saleKes!) / activeVariant.listKes) * 100) : 0;

  const [colourId, setColourId] = useState<string | null>(colours[0]?.id || null);
  const selectedColour = colours.find(c => c.id === colourId) || colours[0] || null;

  // Social proof rating calculations
  const rating = prod.isFeatured ? 4.9 : (prod.isNewRelease ? 4.8 : 4.6);
  const reviewsCount = prod.isFeatured ? 36 : (prod.isNewRelease ? 12 : 18);

  const handleQuickAdd = () => {
    if (!selectedColour) return;
    addItem({
      productId: prod.id,
      productName: prod.name,
      productSlug: prod.slug,
      colourId: selectedColour.id,
      colourName: selectedColour.name,
      colourHex: selectedColour.hex,
      size,
      finish,
      unitKes: priceKes
    });
  };

  return (
    <div className="mm-card rounded-[22px] overflow-hidden mm-shadow flex flex-col group relative bg-white hover:-translate-y-1.5 hover:shadow-xl transition-all duration-300">
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1">
        <span className="text-[11px] font-[700] px-[10px] py-[5px] rounded-full bg-white/95 text-graphite mm-shadow">
          {prod.categoryName || prod.category}
        </span>
        {prod.isFeatured && (
          <span className="text-[11px] font-[700] px-[10px] py-[5px] rounded-full text-white bg-[#B84A32] mm-shadow">
            Featured
          </span>
        )}
        {prod.isNewRelease && (
          <span className="text-[11px] font-[700] px-[10px] py-[5px] rounded-full text-white bg-[#4FB9B0] mm-shadow">
            New
          </span>
        )}
        {prod.isExteriorGrade && (
          <span className="text-[11px] font-[700] px-[10px] py-[5px] rounded-full text-white bg-slate-700 mm-shadow">
            Exterior
          </span>
        )}
      </div>

      {isManaged && (
        <div className="absolute top-3 right-3 z-10">
          {isSoldOut ? (
            <span className="text-[11px] font-[700] px-[10px] py-[5px] rounded-full bg-red-50 text-red-700 mm-shadow">
              Sold Out
            </span>
          ) : isLowStock ? (
            <span className="text-[11px] font-[700] px-[10px] py-[5px] rounded-full bg-amber-50 text-amber-700 mm-shadow animate-pulse">
              Only {availableQty} left
            </span>
          ) : (
            <span className="text-[11px] font-[700] px-[10px] py-[5px] rounded-full bg-emerald-50 text-emerald-700 mm-shadow">
              In Stock
            </span>
          )}
        </div>
      )}

      <div className="relative h-[200px] sm:h-[220px] bg-[#f5efe5] overflow-hidden cursor-pointer" onClick={() => onOpenQuickView(prod)}>
        {prod.image ? (
          <img src={prod.image} alt={prod.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            <div className="w-16 h-16 rounded-full mm-shadow transition-transform duration-300 group-hover:scale-110" style={{ backgroundColor: selectedColour?.hex ?? "#B84A32" }} />
            <div className="absolute bottom-2 text-center text-[10px] mm-muted">Default Colour: {selectedColour?.name}</div>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5 flex flex-col flex-1">
        <div className="cursor-pointer" onClick={() => onOpenQuickView(prod)}>
          <div className="font-display text-[19px] text-graphite font-bold hover:text-[#B84A32] transition-colors">{prod.name}</div>
          
          {/* Star Rating & Social Proof */}
          <div className="flex items-center gap-1 mt-1 mb-2">
            <div className="flex text-amber-400 text-[13.5px]">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i}>{i < Math.floor(rating) ? "★" : "☆"}</span>
              ))}
            </div>
            <span className="text-[11.5px] font-[700] text-graphite ml-1">{rating.toFixed(1)}</span>
            <span className="text-[11px] text-[#9b9589] ml-1">({reviewsCount} reviews)</span>
          </div>

          <p className="text-[13px] mm-muted mt-1 line-clamp-2 h-[38px]">{prod.blurb}</p>
        </div>

        {/* Sizes */}
        <div className="mt-4">
          <div className="text-[11px] font-[700] mm-muted uppercase tracking-wider mb-1.5">Size</div>
          <div className="flex gap-1.5 flex-wrap">
            {uniqueSizes.map(s => (
              <button key={s} onClick={() => setSize(s)} className={`chip py-[3px] px-[9px] text-[11.5px] ${size === s ? "active" : ""}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Shade Picker */}
        {prod.category === "Paint" && colours.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] font-[700] mm-muted uppercase tracking-wider mb-1.5">
              Shade: <span className="text-graphite font-bold">{selectedColour?.name}</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {colours.slice(0, 8).map(c => (
                <button
                  key={c.id}
                  onClick={() => setColourId(c.id)}
                  title={c.name}
                  className="w-6 h-6 rounded-full border-2 transition-all cursor-pointer flex-shrink-0 hover:scale-115"
                  style={{
                    backgroundColor: c.hex,
                    borderColor: colourId === c.id ? "#B84A32" : "rgba(0,0,0,0.12)",
                    transform: colourId === c.id ? "scale(1.1)" : "none",
                  }}
                />
              ))}
              {colours.length > 8 && (
                <button 
                  onClick={() => onOpenQuickView(prod)}
                  className="w-6 h-6 rounded-full bg-slate-100 border border-[#e1d3bd] flex items-center justify-center text-[9px] font-[700] text-[#6f6a62] cursor-pointer hover:bg-slate-200 transition-colors"
                  title="More colours in detail view"
                >
                  +{colours.length - 8}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-[700] text-[17px] text-graphite">{kes(priceKes)}</span>
              {showDiscount && (
                <span className="text-[11.5px] line-through text-slate-400">{kes(activeVariant.listKes)}</span>
              )}
            </div>
            {showDiscount && (
              <div className="text-[10px] font-[700]" style={{ color: "#B84A32" }}>Save {discountPercent}%</div>
            )}
            <div className="text-[11px] mm-muted">{size} · {finish}</div>
          </div>

          <div className="flex flex-col gap-1.5 items-end">
            <button
              onClick={handleQuickAdd}
              disabled={isSoldOut || !selectedColour}
              className="btn btn-primary px-[15px] py-[8.5px] text-[13px] font-[600] disabled:opacity-50 hover:bg-[#a13c27] transition-all cursor-pointer rounded-[12px] flex items-center gap-1.5 shadow-sm"
            >
              <span>🛒</span>
              <span>{isSoldOut ? "Sold Out" : "Quick Add"}</span>
            </button>
            <button
              onClick={() => onOpenQuickView(prod)}
              className="text-[11.5px] font-[600] text-[#4FB9B0] hover:text-[#3da097] hover:underline bg-transparent border-0 cursor-pointer p-0 mt-0.5"
            >
              View Details →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickViewModal({ prod, colours, onClose, addItem }: { prod: Product; colours: Colour[]; onClose: () => void; addItem: (item: any) => void }) {
  const sizes = prod.variants && prod.variants.length > 0 ? prod.variants.map(v => v.size) : (["1L", "4L", "20L"] as Size[]);
  const uniqueSizes = Array.from(new Set(sizes)) as Size[];
  
  const [size, setSize] = useState<Size>(uniqueSizes.includes("4L") ? "4L" : uniqueSizes[0] || "4L");
  const [finish, setFinish] = useState<Finish>("Matte");
  const [quantity, setQuantity] = useState(1);
  const [colourId, setColourId] = useState<string | null>(colours[0]?.id || null);
  const selectedColour = colours.find(c => c.id === colourId) || colours[0] || null;

  const activeVariant = prod.variants?.find(v => v.size === size) || {
    variantId: prod.id,
    size,
    listKes: prod.baseKes[size] || 0,
    saleKes: null,
    stockTracking: false,
    available: null
  };

  const priceKes = activeVariant.saleKes !== null ? activeVariant.saleKes : activeVariant.listKes;
  const isManaged = activeVariant.stockTracking && activeVariant.available !== null;
  const availableQty = activeVariant.available;
  const isSoldOut = isManaged && availableQty !== null && availableQty <= 0;
  const isLowStock = isManaged && availableQty !== null && availableQty > 0 && availableQty <= 5;

  const showDiscount = activeVariant.saleKes !== null && activeVariant.listKes > activeVariant.saleKes;
  const discountPercent = showDiscount ? Math.round(((activeVariant.listKes - activeVariant.saleKes!) / activeVariant.listKes) * 100) : 0;

  const handleAdd = () => {
    if (!selectedColour) return;
    addItem({
      productId: prod.id,
      productName: prod.name,
      productSlug: prod.slug,
      colourId: selectedColour.id,
      colourName: selectedColour.name,
      colourHex: selectedColour.hex,
      size,
      finish,
      unitKes: priceKes,
      quantity
    });
    onClose();
  };

  const groupedColours = FAMILIES.reduce((acc, fam) => {
    const list = colours.filter(c => c.family === fam);
    if (list.length > 0) acc.push({ family: fam, list });
    return acc;
  }, [] as { family: ColourFamily; list: Colour[] }[]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm fade overflow-y-auto">
      <div className="bg-white rounded-[24px] mm-card mm-shadow w-full max-w-4xl overflow-hidden relative flex flex-col md:flex-row my-8">
        <button onClick={onClose} className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/85 flex items-center justify-center text-graphite hover:bg-white mm-shadow border-0 cursor-pointer font-bold" aria-label="Close details">
          ✕
        </button>

        <div className="w-full md:w-1/2 bg-[#f5efe5] min-h-[260px] md:min-h-[420px] relative flex items-center justify-center">
          {prod.image ? (
            <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
              <div className="w-24 h-24 rounded-full border-4 border-white mm-shadow mb-3" style={{ backgroundColor: selectedColour?.hex ?? "#B84A32" }} />
              <div className="text-[12px] mm-muted">Configured Swatch Color: {selectedColour?.name}</div>
            </div>
          )}

          <div className="absolute top-4 left-4 flex flex-wrap gap-1">
            <span className="text-[11px] font-[700] px-[10px] py-[5px] rounded-full bg-white/95 text-graphite mm-shadow">
              {prod.categoryName || prod.category}
            </span>
          </div>
        </div>

        <div className="w-full md:w-1/2 p-6 sm:p-8 flex flex-col justify-between max-h-[85vh] overflow-y-auto">
          <div>
            <div className="text-[12px] font-[600] text-[#4FB9B0] uppercase tracking-wider">{prod.categoryName || prod.category}</div>
            <h3 className="font-display text-[26px] sm:text-[30px] font-bold text-graphite leading-tight mt-1">{prod.name}</h3>
            
            {isManaged && (
              <div className="mt-2">
                {isSoldOut ? (
                  <span className="inline-flex items-center text-[12px] font-[700] text-red-650 bg-red-50 px-2 py-1 rounded">
                    Sold out in this size
                  </span>
                ) : isLowStock ? (
                  <span className="inline-flex items-center text-[12px] font-[700] text-amber-650 bg-amber-50 px-2 py-1 rounded animate-pulse">
                    Only {availableQty} units left in this size
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[12px] font-[700] text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                    In Stock (available to order)
                  </span>
                )}
              </div>
            )}

            <p className="text-[13.5px] mm-muted mt-3 leading-relaxed">{prod.longDescription || prod.blurb}</p>

            {prod.roomTags && prod.roomTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {prod.roomTags.map(tag => (
                  <span key={tag} className="text-[11px] font-[600] px-2.5 py-1 bg-slate-100 rounded-full text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {prod.specs && (
              <div className="mt-5 p-4 rounded-[16px] bg-[#F8F4EF] border border-[#e8dcc7] grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] uppercase font-[600] mm-muted">Washability</div>
                  <div className="flex gap-[2px] mt-1">
                    {[1,2,3,4,5].map(dot => (
                      <div key={dot} className={`w-[7px] h-[7px] rounded-full ${dot <= (prod.specs?.washability ?? 0) ? "bg-[#B84A32]" : "bg-[#ebe2d2]"}`} />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-[600] mm-muted">Coverage</div>
                  <div className="font-[700] text-[13px] text-graphite mt-0.5">{prod.specs.coverage ? `${prod.specs.coverage} m²/L` : "N/A"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-[600] mm-muted">Drying Time</div>
                  <div className="font-[700] text-[13px] text-graphite mt-0.5">{prod.specs.dryingMinutes ? `${Math.round(prod.specs.dryingMinutes / 60 * 10) / 10} hrs` : "N/A"}</div>
                </div>
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <div className="text-[12px] font-[600] mm-muted uppercase tracking-wider mb-2">Select Paint Colour</div>
                <div className="space-y-3 max-h-[140px] overflow-y-auto pr-1 border border-slate-100 p-2.5 rounded-lg">
                  {groupedColours.map(group => (
                    <div key={group.family}>
                      <div className="text-[10.5px] font-[700] mm-muted mb-1">{group.family}</div>
                      <div className="flex flex-wrap gap-2">
                        {group.list.map(c => (
                          <button
                            key={c.id}
                            onClick={() => setColourId(c.id)}
                            title={c.name}
                            className={`swatch w-[24px] h-[24px] border-2 ${colourId === c.id ? "active" : ""}`}
                            style={{ backgroundColor: c.hex }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedColour && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: selectedColour.hex }} />
                    <span className="font-[600] text-[13px]">{selectedColour.name}</span>
                    <span className="text-[11px] font-mono2 mm-muted">{selectedColour.hex}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-4">
                <div>
                  <div className="text-[12px] font-[600] mm-muted uppercase tracking-wider mb-2">Size</div>
                  <div className="flex gap-2">
                    {uniqueSizes.map(s => (
                      <button key={s} onClick={() => setSize(s)} className={`chip ${size === s ? "active" : ""}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[12px] font-[600] mm-muted uppercase tracking-wider mb-2">Finish</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(["Matte", "Eggshell", "Satin", "Semi-Gloss"] as Finish[]).map(f => (
                      <button key={f} onClick={() => setFinish(f)} className={`chip ${finish === f ? "active" : ""}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[12px] font-[600] mm-muted uppercase tracking-wider mb-2">Quantity</div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-[#e4d7c2] rounded-full overflow-hidden bg-white">
                    <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="px-3 py-1.5 hover:bg-slate-50 font-bold border-0 bg-transparent cursor-pointer" disabled={quantity <= 1}>-</button>
                    <span className="px-4 py-1.5 text-center font-[700] text-[14px] min-w-[36px]">{quantity}</span>
                    <button onClick={() => setQuantity(q => q + 1)} className="px-3 py-1.5 hover:bg-slate-50 font-bold border-0 bg-transparent cursor-pointer">+</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-[700] text-[24px] text-graphite">{kes(priceKes * quantity)}</span>
                {showDiscount && (
                  <span className="text-[14px] line-through text-slate-400">{kes(activeVariant.listKes * quantity)}</span>
                )}
              </div>
              {showDiscount && (
                <div className="text-[12px] font-[700] text-red-650" style={{ color: "#B84A32" }}>Save {discountPercent}% on each unit</div>
              )}
              <div className="text-[12px] mm-muted">{size} · {finish} · {quantity} unit{quantity > 1 ? "s" : ""}</div>
            </div>

            <button
              onClick={handleAdd}
              disabled={isSoldOut || !selectedColour}
              className="btn btn-primary px-[26px] py-[13px] text-[15px] disabled:opacity-50"
            >
              {isSoldOut ? "Sold Out" : "Add to Cart"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── App / Home ── */
export default function Home() {
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
    if (typeof window === "undefined") return [];
    try { const raw = localStorage.getItem("micmikes-cart"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("micmikes-cart", JSON.stringify(cart)); } catch {}
  }, [cart]);

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

  const [showCookieBanner, setShowCookieBanner] = useState(false);
  useEffect(() => {
    const hasCmp = !!(process.env.NEXT_PUBLIC_COOKIEYES_KEY || process.env.NEXT_PUBLIC_COOKIEBOT_ID);
    if (hasCmp) return;

    if (typeof window !== "undefined") {
      const consent = localStorage.getItem("micmikes-privacy-consent");
      if (!consent) {
        setShowCookieBanner(true);
      }
    }
  }, []);

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

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Featured");
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (searchTerm.trim() !== "") {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(term) ||
        (p.shortDescription && p.shortDescription.toLowerCase().includes(term)) ||
        (p.roomTags && p.roomTags.some(t => t.toLowerCase().includes(term))) ||
        (p.productType && p.productType.toLowerCase().includes(term))
      );
    }

    if (categoryFilter !== "All") {
      result = result.filter(p => {
        const cat = p.categoryName || p.category;
        return cat.toLowerCase() === categoryFilter.toLowerCase();
      });
    }

    result.sort((a, b) => {
      const getProductPrice = (p: Product) => {
        const v = p.variants?.[0];
        if (!v) return p.baseKes?.["4L"] || 0;
        return v.saleKes !== null ? v.saleKes : v.listKes;
      };

      if (sortBy === "PriceAsc") {
        return getProductPrice(a) - getProductPrice(b);
      }
      if (sortBy === "PriceDesc") {
        return getProductPrice(b) - getProductPrice(a);
      }
      if (sortBy === "Newest") {
        return (b.isNewRelease ? 1 : 0) - (a.isNewRelease ? 1 : 0);
      }
      if (sortBy === "Name") {
        return a.name.localeCompare(b.name);
      }
      const featuredScoreA = (a.isFeatured ? 2 : 0) + (a.isNewRelease ? 1 : 0);
      const featuredScoreB = (b.isFeatured ? 2 : 0) + (b.isNewRelease ? 1 : 0);
      return featuredScoreB - featuredScoreA;
    });

    return result;
  }, [products, searchTerm, categoryFilter, sortBy]);

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
      <div className="w-full text-[11.5px] sm:text-[12.5px] tracking-wide" style={{ backgroundColor: "#2B2B2E", color: "#F8F4EF" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-[10px] flex items-center justify-center gap-4 text-center">
          <span className="font-tag text-[15px] sm:text-[16px] italic">Bring Walls to Life - Colour That Lasts. Style That Inspires.</span>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: "rgba(248,244,239,0.93)", backdropFilter: "blur(10px)", borderColor: "#e8dcc7" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-[68px] flex items-center justify-between gap-4">
          <button onClick={() => navigate("home")} className="flex items-center gap-[11px] min-w-0 bg-transparent border-0 cursor-pointer">
            <div className="w-[41px] h-[41px] rounded-[13px] flex items-center justify-center text-white" style={{ backgroundColor: "#B84A32" }} aria-label="MicMikes Paints">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
                <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8z"/>
              </svg>
            </div>
            <div className="text-left leading-tight">
              <div className="font-display text-[18.5px] sm:text-[20px] tracking-[-0.01em] text-graphite font-bold">MicMikes Paints</div>
              <div className="font-tag text-[12.5px] -mt-[2px]" style={{ color: "#7b7468" }}>KEEKOROK</div>
            </div>
          </button>
          <nav className="hidden lg:flex items-center gap-8 text-[14.5px] font-[500]">
            {[["Home","home"],["Colours","colours"],["Visualizer","visualizer"],["Shop","shop"],["Track Order","track"]].map(([label,id]) => (
              <button key={id} onClick={() => navigate(id)} className="hover:opacity-70 transition-opacity relative bg-transparent border-0 cursor-pointer text-graphite" style={{ color: activePage === id ? "#B84A32" : undefined }}>
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

      <main id="mm-main-scroll" className="flex-1 overflow-y-auto" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
        <section id="home" className={`relative ${activePage === "home" ? "block pg-enter" : "hidden lg:block"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-10 sm:pt-16 pb-10 lg:pb-16">
            <div className="grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              <div className="lg:col-span-6">
                <div className="inline-flex items-center gap-2 text-[11px] font-mono2 px-3 py-[6px] rounded-full mb-4 bg-white border" style={{ borderColor: "#e7d7be", color: "#B84A32" }}>KEEKOROK EDITION • NAIROBI • KES</div>
                <h1 className="font-display text-[40px] sm:text-[56px] md:text-[64px] leading-[0.95] tracking-[-0.017em] text-graphite">Bring Walls<br/>to Life</h1>
                <p className="font-tag text-[22px] sm:text-[26px] mt-3" style={{ color: "#5d5850" }}>Colour That Lasts. Style That Inspires.</p>
                <p className="max-w-[520px] text-[15.5px] leading-relaxed mm-muted mt-5">Keekorok paint system - 20 curated Kenyan shades, M-Pesa checkout. Premium emulsion, eggshell, satin &amp; semi-gloss.</p>
                <div className="flex flex-wrap gap-3 mt-7">
                  <button onClick={() => navigate("colours")} className="btn btn-primary px-[22px] py-[13px] text-[14.5px]">Find Your Perfect Shade →</button>
                  <button onClick={() => navigate("visualizer")} className="btn btn-ghost px-[22px] py-[13px] text-[14.5px]">Open Visualizer</button>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-mono2 mt-5" style={{ color: "#7c756a" }}>
                  <span>✔ M-Pesa STK</span><span>✔ KES pricing</span><span>✔ 20 Keekorok colours</span>
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
                      <button key={c.id} onClick={() => { setVizColourId(c.id); navigate("visualizer"); }} title={c.name} aria-label={c.name} className="swatch border-0 cursor-pointer" style={{ backgroundColor: c.hex }} />
                    ))}
                    <button onClick={() => navigate("colours")} className="text-[12.5px] font-[600] px-3 py-[8px] rounded-full bg-transparent border-0 cursor-pointer" style={{ color: "#4FB9B0" }}>+12 more →</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="colours" className={`py-12 sm:py-16 ${activePage === "colours" ? "block pg-enter" : "hidden lg:block"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="max-w-[760px] mb-6">
              <h2 className="font-display text-[30px] sm:text-[36px] text-graphite">Colour Explorer</h2>
              <p className="mm-muted mt-2">20 Kenyan-inspired Keekorok tones. Tap any swatch - it loads instantly in the visualizer.</p>
            </div>
            <div className="flex flex-wrap gap-[9px] mb-5">
              {ALL_FAMILIES.map(f => (
                <button key={f} onClick={() => setFamilyFilter(f)} className={`chip ${familyFilter === f ? "active" : ""}`}>{f}</button>
              ))}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
              {filteredColours.map(c => (
                <button key={c.id} onClick={() => { setVizColourId(c.id); navigate("visualizer"); }} title={c.name} aria-label={`${c.name} - click to visualize`} className="flex flex-col items-center gap-[6px] group bg-transparent border-0 cursor-pointer">
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
                        className="flex items-center gap-2 px-3 py-[8px] rounded-full border bg-white text-[13px] font-[500] cursor-pointer" style={{ borderColor: "#e2d3b7" }}>
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
              <h2 className="font-display text-[30px] sm:text-[36px] text-graphite">Room Visualizer</h2>
              <p className="mm-muted mt-2">See your chosen colour in a real room before you buy. Use ← → keys to cycle shades.</p>
            </div>
            {vizColour && vizRoom ? (
              <div className="grid lg:grid-cols-12 gap-6 lg:gap-8" style={{ minWidth: 0 }}>
                <div className="lg:col-span-8" style={{ minWidth: 0, width: "100%" }}>
                  <div className="mm-card rounded-[22px] overflow-hidden mm-shadow" style={{ maxWidth: "100%", width: "100%" }}>
                    <VisualizerCanvas room={vizRoom} colour={vizColour} finish={vizFinish} />
                    <div className="px-4 py-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                      {rooms.map((r, i) => (
                        <button key={r.id} onClick={() => setVizRoomIdx(i)}
                          className={`flex items-center gap-2 flex-shrink-0 px-3 py-[7px] rounded-full text-[12.5px] font-[500] border transition cursor-pointer ${vizRoomIdx === i ? "border-[#2B2B2E] bg-[#2B2B2E] text-[#F8F4EF]" : "border-[#e2d3b7] bg-white"}`}>
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
                          Add to Cart - {kes(prod.baseKes[vizSize])}
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
              <h2 className="font-display text-[30px] sm:text-[36px] text-graphite font-bold">Shop</h2>
              <p className="mm-muted mt-2">Premium Keekorok paints, primers &amp; supplies. M-Pesa checkout.</p>
            </div>

            {/* Trust strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 sm:p-5 rounded-[20px] mb-8 bg-white border border-[#ebe2d2] mm-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-50 text-amber-700 flex-shrink-0">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                  </svg>
                </div>
                <div>
                  <div className="font-[700] text-[13px] text-graphite">100% Kenyan-Made</div>
                  <div className="text-[11px] mm-muted">Crafted for local homes</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-50 text-emerald-700 flex-shrink-0">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4M12 11V6M7.5 6a4.5 4.5 0 0 1 9 0"/>
                  </svg>
                </div>
                <div>
                  <div className="font-[700] text-[13px] text-graphite">M-Pesa Checkout</div>
                  <div className="text-[11px] mm-muted">Safe, instant payments</div>
                </div>
              </div>



              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#B84A32]/10 text-[#B84A32] flex-shrink-0">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                  </svg>
                </div>
                <div>
                  <div className="font-[700] text-[13px] text-graphite">Genuine Stock</div>
                  <div className="text-[11px] mm-muted">Direct from our factory</div>
                </div>
              </div>
            </div>

            {/* Discovery Toolbar */}
            <div className="mm-card rounded-[20px] p-4 sm:p-5 mb-8 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
              {/* Search */}
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search products by name, tags..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="input pr-4"
                  style={{ paddingLeft: "2.75rem" }}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.3-4.3"/>
                  </svg>
                </div>
              </div>

              {/* Category Filter */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[11px] font-[700] uppercase tracking-wider mm-muted hidden sm:inline">Category:</span>
                {["All", "Paint", "Primer", "Supplies"].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`chip py-[5px] px-[12px] text-[12.5px] ${categoryFilter === cat ? "active" : ""}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Sorting */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-[700] uppercase tracking-wider mm-muted hidden sm:inline">Sort:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="select max-w-[180px] py-[6px] px-[12px] rounded-[999px]"
                  style={{ height: "38px" }}
                >
                  <option value="Featured">Featured</option>
                  <option value="PriceAsc">Price: Low to High</option>
                  <option value="PriceDesc">Price: High to Low</option>
                  <option value="Newest">New Arrivals</option>
                  <option value="Name">Name A-Z</option>
                </select>
              </div>
            </div>

            {dataLoading ? (
              <div className="text-center py-12 mm-muted">Loading products…</div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12 mm-muted">No products found matching your search.</div>
            ) : (
              <>
                {/* Featured collections row */}
                {searchTerm === "" && categoryFilter === "All" && filteredProducts.filter(p => p.isFeatured).length > 0 && (
                  <div className="mb-10">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-display text-[20px] sm:text-[24px] text-graphite font-bold">Featured Masterpieces</h3>
                      <span className="text-[11px] font-[700] text-[#B84A32] uppercase tracking-wider">Curated Premium Picks</span>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin">
                      {filteredProducts.filter(p => p.isFeatured).map(prod => (
                        <div key={`featured-${prod.id}`} className="w-[280px] sm:w-[320px] flex-shrink-0">
                          <ProductCard prod={prod} colours={colours} addItem={addItem} onOpenQuickView={setQuickViewProduct} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New arrivals row */}
                {searchTerm === "" && categoryFilter === "All" && filteredProducts.filter(p => p.isNewRelease).length > 0 && (
                  <div className="mb-10">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-display text-[20px] sm:text-[24px] text-graphite font-bold">New Arrivals</h3>
                      <span className="text-[11px] font-[700] text-[#4FB9B0] uppercase tracking-wider">Fresh From Our Factory</span>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin">
                      {filteredProducts.filter(p => p.isNewRelease).map(prod => (
                        <div key={`new-${prod.id}`} className="w-[280px] sm:w-[320px] flex-shrink-0">
                          <ProductCard prod={prod} colours={colours} addItem={addItem} onOpenQuickView={setQuickViewProduct} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Main Catalog Header */}
                <div className="flex items-center justify-between mb-6 mt-4 border-t pt-6" style={{ borderColor: "#ebe2d2" }}>
                  <h3 className="font-display text-[20px] sm:text-[24px] text-graphite font-bold">Explore Our Full Range</h3>
                  <span className="text-[12px] mm-muted font-mono2">{filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Main Grid */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {filteredProducts.map(prod => (
                    <ProductCard key={prod.id} prod={prod} colours={colours} addItem={addItem} onOpenQuickView={setQuickViewProduct} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Modal display */}
        {quickViewProduct && (
          <QuickViewModal
            prod={quickViewProduct}
            colours={colours}
            onClose={() => setQuickViewProduct(null)}
            addItem={addItem}
          />
        )}

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
            { id: "visualizer", label: "Visualize",icon: <rect x="3" y="3" width="18" height="18" rx="2"/>,                         icon2: <><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>, },
            { id: "shop",       label: "Shop",    icon: <path d="M6 6h15l-1.5 9h-12z"/>,                                             icon2: <><path d="M6 6l-2-3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></> },
            { id: "track",      label: "Track",   icon: <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>,                 icon2: <circle cx="12" cy="10" r="3"/> },
          ].map(({ id, label, icon, icon2 }) => {
            const active = activePage === id;
            return (
              <button key={id} onClick={() => navigate(id)} className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity bg-transparent border-0 cursor-pointer"
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
              <button onClick={() => setCartOpen(false)} className="w-9 h-9 rounded-full bg-white border flex items-center justify-center cursor-pointer" style={{ borderColor: "#e3d5bc" }}>
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
                    <div key={key} className="mm-card rounded-[18px] p-4 flex gap-3 bg-white">
                      <div className="w-10 h-10 rounded-full flex-shrink-0 border-2 border-white mm-shadow" style={{ backgroundColor: item.colourHex }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-[600] text-[14px] truncate text-graphite">{item.productName}</div>
                        <div className="text-[12px] mm-muted truncate">{item.colourName} · {item.size} · {item.finish}</div>
                        <div className="font-[700] text-[14px] mt-[2px] text-graphite">{kes(item.unitKes * item.quantity)}</div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <button onClick={() => removeLine(key)} className="text-[11px] mm-muted hover:text-red-500 transition-colors bg-transparent border-0 cursor-pointer">✕</button>
                        <div className="flex items-center gap-1">
                          <button onClick={() => item.quantity > 1 ? updateQty(key, item.quantity - 1) : removeLine(key)} className="w-7 h-7 rounded-full bg-white border flex items-center justify-center text-[15px] cursor-pointer" style={{ borderColor: "#e2d3b7" }}>−</button>
                          <span className="w-6 text-center text-[13px] font-[600]">{item.quantity}</span>
                          <button onClick={() => updateQty(key, item.quantity + 1)} className="w-7 h-7 rounded-full bg-white border flex items-center justify-center text-[15px] cursor-pointer" style={{ borderColor: "#e2d3b7" }}>+</button>
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
            <div className="font-display text-[28px] mb-2 text-graphite">Order Placed!</div>
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

      <ScrollToTop />
      <ChatWidget />

      <footer className="border-t mt-8 pb-[84px] lg:pb-8" style={{ borderColor: "#e8dcc7", background: "#F8F4EF" }}>
        <div className="max-w-7xl mx-auto px-8 py-8 flex flex-wrap items-center justify-between gap-4 text-[13px]" style={{ color: "#7b7468" }}>
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-bold" style={{ color: "#2B2B2E" }}>MicMikes Paints</span>
            <span>·</span><span>Keekorok Edition</span><span>·</span><span>Nairobi, Kenya</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="https://wa.me/254712345678" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity flex items-center gap-1.5 text-graphite decoration-none">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.558 4.14 1.533 5.879L.057 23.63a.75.75 0 0 0 .921.919l5.86-1.485A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.937 0-3.745-.524-5.3-1.436l-.379-.226-3.93.997.996-3.847-.248-.396A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
              WhatsApp
            </a>
            <span>✔ M-Pesa</span><span>·</span><span>✔ 20 Colours</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 sm:mt-0">
            <span>© {new Date().getFullYear()} MicMikes Paints</span>
            <span>·</span>
            <a href="/privacy" className="hover:underline transition-all text-[#7b7468] font-[600]">Privacy Policy</a>
            <span>·</span>
            <a href="/terms" className="hover:underline transition-all text-[#7b7468] font-[600]">Terms of Service</a>
          </div>
        </div>
      </footer>

      {showCookieBanner && (
        <div className="fixed bottom-[80px] lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:max-w-[400px] z-[90] p-5 rounded-[20px] border flex flex-col gap-3 fade mm-shadow"
          style={{ background: "#ffffff", borderColor: "#e8dcc7" }}>
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">🍪</span>
            <div>
              <div className="font-display text-[16px] font-bold text-graphite">Cookie & Privacy Notice</div>
              <p className="text-[12.5px] mm-muted leading-relaxed mt-1">
                We collect personal data to process payments (M-Pesa) and arrange delivery in compliance with the Kenya Data Protection Act.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5 mt-1">
            <button 
              onClick={() => {
                localStorage.setItem("micmikes-privacy-consent", "all");
                setShowCookieBanner(false);
              }} 
              className="btn btn-primary flex-1 py-2 text-[12.5px]"
            >
              Accept All
            </button>
            <button 
              onClick={() => {
                localStorage.setItem("micmikes-privacy-consent", "essential");
                setShowCookieBanner(false);
              }} 
              className="btn btn-ghost flex-1 py-2 text-[12.5px]"
            >
              Essential Only
            </button>
          </div>
          <div className="text-center">
            <a href="/privacy" className="text-[11px] text-[#B84A32] font-[600] hover:underline">Read Our Privacy Policy</a>
          </div>
        </div>
      )}

      <Analytics />
    </div>
  );
}

/* ── Scroll to top ── */
function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = document.getElementById("mm-main-scroll");
    if (!el) return;
    const onScroll = () => setVisible(el.scrollTop > 400);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button
      onClick={() => document.getElementById("mm-main-scroll")?.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      className="fixed z-[63] right-4 flex items-center justify-center rounded-full mm-shadow transition-all hover:scale-105 border-0 cursor-pointer"
      style={{ bottom: "calc(148px + env(safe-area-inset-bottom,0px))", width: 40, height: 40, background: "#2B2B2E", color: "#F8F4EF", opacity: 0.85 }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 15l-6-6-6 6"/></svg>
    </button>
  );
}

/* ── Chat Widget (NVIDIA-powered support + recommendations) ── */
type ChatMessage = { role: "user" | "assistant"; content: string };

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
    { role: "assistant", content: "Hi! I'm the MicMikes Paints assistant 🎨 Ask me about colours, finishes, prices - or tell me your room and I'll suggest a shade." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 15;
    setShowScrollBtn(!isAtBottom);
  };

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, busy]);

  const send = async (customText?: string) => {
    const text = (customText !== undefined ? customText : input).trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    if (customText === undefined) {
      setInput("");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(1) }),
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
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Close chat" : "Open chat assistant"}
        className="fixed z-[65] right-4 flex items-center justify-center rounded-full mm-shadow transition-transform hover:scale-105 border-0 cursor-pointer"
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

          <div className="flex-1 relative flex flex-col min-h-0">
            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5">
              {messages.map((m, i) => (
                <div key={i} className="flex flex-col">
                  <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className="px-3 py-2 rounded-[14px] text-[13px] leading-relaxed"
                      style={m.role === "user"
                        ? { background: "#B84A32", color: "#fff", borderBottomRightRadius: 4, maxWidth: "82%" }
                        : { background: "#fff", color: "#2B2B2E", border: "1px solid #ece1cf", borderBottomLeftRadius: 4, maxWidth: "82%" }}
                    >
                      {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
                    </div>
                  </div>
                  {i === 0 && messages.length <= 1 && (
                    <div className="flex flex-wrap gap-1 mt-1 justify-start">
                      {[
                        "What colours suit a bright living room?",
                        "How much does 4L Satin cost?",
                        "Do you deliver to Mombasa?"
                      ].map((text, idx) => (
                        <button
                          key={idx}
                          onClick={() => send(text)}
                          disabled={busy}
                          style={{
                            borderRadius: "9999px",
                            border: "1px solid #e2d3b7",
                            backgroundColor: "#ffffff",
                            color: "#B84A32",
                            fontSize: "12px",
                            padding: "6px 12px",
                            margin: "4px",
                            cursor: "pointer",
                          }}
                          className="hover:opacity-80 active:scale-95 transition-all text-left"
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                  )}
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
            {showScrollBtn && (
              <button
                onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
                aria-label="Scroll to bottom"
                className="absolute bottom-3 right-3 flex items-center justify-center rounded-full shadow-md transition-all hover:scale-105 active:scale-95 border-0 cursor-pointer"
                style={{
                  width: 32,
                  height: 32,
                  background: "#2B2B2E",
                  color: "#F8F4EF",
                  opacity: 0.9,
                  zIndex: 10,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
              </button>
            )}
          </div>

          <div className="p-2.5 flex flex-col" style={{ borderTop: "1px solid #e7d9c3", background: "#fffdf8" }}>
            <div style={{ padding: "0 10px 6px" }}>
              <RoomPhotoUpload onResult={(result) => {
                const msg = result.recommendation
                  ?? `Suggested shades: ${result.suggestedShades?.join(", ") ?? "see our catalogue"}`;
                setMessages(m => [...m, { role: "assistant", content: `🏠 Room analysis:\n${msg}` }]);
              }} />
            </div>
            <div className="flex items-center gap-2 w-full">
              <input
                value={input}
                onChange={e => setInput(e.target.value.slice(0, 300))}
                maxLength={300}
                onKeyDown={e => { if (e.key === "Enter") send(); }}
                placeholder="Ask about colours, prices…"
                className="flex-1 px-3 py-2 rounded-full text-[13px] bg-white focus:outline-none"
                style={{ border: "1px solid #e2d3b7" }}
                disabled={busy}
              />
              <button
                onClick={() => send()}
                disabled={busy || !input.trim()}
                aria-label="Send message"
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 border-0 cursor-pointer"
                style={{ background: "#B84A32", color: "#fff" }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
            {input.length > 0 && (
              <div className="text-right text-[11px] px-3 select-none mm-muted" style={{ color: "#9b8a7a", marginTop: "4px" }}>
                {input.length}/300
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
