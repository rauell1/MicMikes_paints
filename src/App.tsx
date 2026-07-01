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
   Next.js + Tailwind + shadcn/ui visual language
   "Bring Walls to Life — Colour That Lasts. Style That Inspires."
   ────────────────────────────────────────────────────────── */

type ColourFamily = "Neutrals" | "Warm Earth" | "Cool Green" | "Blue" | "Red & Terracotta" | "Yellow & Gold";
type Finish = "Matte" | "Eggshell" | "Satin" | "Semi-Gloss";
type Size = "1L" | "4L" | "20L";

type Colour = {
  id: string;
  name: string;
  hex: string;
  family: ColourFamily;
};
type Product = {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  category: "Paint" | "Primer" | "Supplies";
  baseKes: Record<Size, number>;
  image: string;
};
type CartItem = {
  productId: string;
  productName: string;
  productSlug: string;
  colourId: string;
  colourName: string;
  colourHex: string;
  size: Size;
  finish: Finish;
  quantity: number;
  unitKes: number;
};

type Room = { id: string; name: string; photo: string; wallMask?: string };

const FAMILIES: ColourFamily[] = ["Neutrals","Warm Earth","Cool Green","Blue","Red & Terracotta","Yellow & Gold"];
const ALL_FAMILIES: (ColourFamily | "All")[] = ["All", ...FAMILIES];

const kes = (n:number)=> `KES ${n.toLocaleString("en-KE")}`;
const uid = ()=> Math.random().toString(36).slice(2,9);

/* ── App ── */
export default function App(){
  /* remote data from Neon via /api routes */
  const [colours, setColours] = useState<Colour[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(()=>{
    Promise.all([
      fetch("/api/colours").then(r=>r.json()),
      fetch("/api/products").then(r=>r.json()),
      fetch("/api/rooms").then(r=>r.json()),
    ]).then(([c, p, r])=>{
      setColours(c as Colour[]);
      setProducts(p as Product[]);
      setRooms(r as Room[]);
    }).catch(console.error).finally(()=>setDataLoading(false));
  }, []);

  /* cart (persist to localStorage) */
  const [cart, setCart] = useState<CartItem[]>(()=>{
    try { const raw = localStorage.getItem("micmikes-cart"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(()=>{ try { localStorage.setItem("micmikes-cart", JSON.stringify(cart)); } catch {} }, [cart]);

  const cartCount = useMemo(()=> cart.reduce((s,i)=> s+i.quantity,0), [cart]);
  const subtotal  = useMemo(()=> cart.reduce((s,i)=> s+i.unitKes*i.quantity,0), [cart]);
  const deliveryFee = subtotal===0 ? 0 : (subtotal >= 15000 ? 0 : 350);
  const totalKes = subtotal + deliveryFee;

  /* UI state */
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [activePage, setActivePage] = useState("home");
  const [toast, setToast] = useState("");

  const showToast = (m:string)=>{ setToast(m); setTimeout(()=>setToast(""), 2100); };

  /* visualizer state */
  const [vizRoomIdx, setVizRoomIdx] = useState(0);
  const [vizColourId, setVizColourId] = useState<string | null>(null);
  const [vizFinish, setVizFinish] = useState<Finish>("Satin");
  const vizRoom = rooms[vizRoomIdx] ?? null;
  const vizColour = (vizColourId ? colours.find(c=>c.id===vizColourId) : null) ?? colours.find(c=>c.name==="Indian Ocean") ?? colours[0] ?? null;

  /* colour explorer */
  const [familyFilter, setFamilyFilter] = useState<ColourFamily | "All">("All");
  const filteredColours = familyFilter === "All" ? colours : colours.filter(c=>c.family === familyFilter);

  /* shop config state */
  const [shopColourId, setShopColourId] = useState<string | null>(null);
  const shopColour = (shopColourId ? colours.find(c=>c.id===shopColourId) : null) ?? colours[0] ?? null;
  const [shopSize, setShopSize] = useState<Size>("4L");
  const [shopFinish, setShopFinish] = useState<Finish>("Matte");

  /* cart actions */
  const addItem = useCallback((item: Omit<CartItem,"quantity"> & { quantity?:number })=>{
    const qty = item.quantity ?? 1;
    setCart(prev=>{
      const idx = prev.findIndex(p =>
        p.productId===item.productId &&
        p.size===item.size &&
        p.finish===item.finish &&
        p.colourId===item.colourId
      );
      if(idx>-1){
        const copy=[...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + qty };
        return copy;
      }
      return [...prev, { ...item, quantity: qty }];
    });
    setCartOpen(true);
    showToast(`Added ${item.colourName} • ${item.size}`);
    trackCartEvent({ eventType:"add", productSlug:item.productSlug, colourId:item.colourId, size:item.size, finish:item.finish, quantity:qty, unitKes:item.unitKes });
  }, []);
  const updateQty = (key:string, q:number)=>{
    setCart(cs=> cs.map(c=> key===`${c.productId}|${c.colourId}|${c.size}|${c.finish}` ? {...c, quantity: Math.max(1,q)} : c));
  };
  const removeLine = (key:string)=>{
    const item = cart.find(c=> key===`${c.productId}|${c.colourId}|${c.size}|${c.finish}`);
    if(item) trackCartEvent({ eventType:"remove", productSlug:item.productSlug, colourId:item.colourId, size:item.size, finish:item.finish });
    setCart(cs=> cs.filter(c=> key !== `${c.productId}|${c.colourId}|${c.size}|${c.finish}`));
  };

  /* navigate — tab on mobile, smooth scroll on desktop */
  const navigate = useCallback((id: string) => {
    setActivePage(id);
    if (window.matchMedia("(min-width: 1024px)").matches) {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, []);

  /* sync active tab with scroll position on desktop */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    if (!mq.matches) return;
    const ids = ["home", "colours", "visualizer", "shop"];
    const observer = new IntersectionObserver(
      entries => { entries.forEach(e => { if (e.isIntersecting) setActivePage(e.target.id); }); },
      { threshold: 0.35 }
    );
    ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor:"#F8F4EF", color:"#2B2B2E", fontFamily:`"Inter", system-ui, -apple-system, Segoe UI, Roboto, sans-serif` }}>
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
        /* shadcn-like sheet/dialog */
        @keyframes sheet-in { from{ transform: translateX(100%);} to{ transform: translateX(0);} }
        @keyframes fade-in { from{ opacity:0 } to{ opacity:1 } }
        .sheet-panel{ animation: sheet-in .24s cubic-bezier(.22,1,.36,1); }
        .fade{ animation: fade-in .18s ease-out; }
        /* page transitions */
        @keyframes pgIn { from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:translateY(0); } }
        @media (max-width:1023px){ .pg-enter{ animation: pgIn .26s cubic-bezier(.22,1,.36,1); } }
        @keyframes shimmer { from{ background-position:200% 0; } to{ background-position:-200% 0; } }
      `}</style>

      {/* 1. Announcement bar */}
      <div className="w-full text-[11.5px] sm:text-[12.5px] tracking-wide" style={{ backgroundColor:"#2B2B2E", color:"#F8F4EF" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-[10px] flex items-center justify-center gap-4 text-center">
          <span className="font-tag text-[15px] sm:text-[16px] italic">Bring Walls to Life — Colour That Lasts. Style That Inspires.</span>
          <span className="hidden sm:inline opacity-90">•</span>
          <span className="font-mono2 text-[11px] hidden sm:inline">Free delivery in Nairobi over KES 15,000</span>
        </div>
      </div>

      {/* 2. Sticky header */}
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor:"rgba(248,244,239,0.93)", backdropFilter:"blur(10px)", borderColor:"#e8dcc7" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-[68px] flex items-center justify-between gap-4">
          {/* Logo */}
          <button onClick={()=>navigate("home")} className="flex items-center gap-[11px] min-w-0">
            <div className="w-[41px] h-[41px] rounded-[13px] flex items-center justify-center text-white" style={{ backgroundColor:"#B84A32" }} aria-label="MicMikes Paints">
              {/* Palette icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
                <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
                <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
                <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8z"/>
              </svg>
            </div>
            <div className="text-left leading-tight">
              <div className="font-display text-[18.5px] sm:text-[20px] tracking-[-0.01em]">MicMikes Paints</div>
              <div className="font-tag text-[12.5px] -mt-[2px]" style={{ color:"#7b7468" }}>KEEKOROK</div>
            </div>
          </button>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-8 text-[14.5px] font-[500]" aria-label="Primary">
            {[
              ["Home","home"],
              ["Colours","colours"],
              ["Visualizer","visualizer"],
              ["Shop","shop"],
            ].map(([label,id])=>(
              <button key={id} onClick={()=>navigate(id)} className="hover:opacity-70 transition-opacity">{label}</button>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={()=>setCartOpen(true)}
              className="btn btn-ghost px-[14px] sm:px-[18px] py-[9px] sm:py-[10px] text-[13px] relative"
              aria-label="Open cart"
            >
              <span className="hidden sm:inline">Cart</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sm:ml-1">
                <path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6l-2-3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>
              </svg>
              {cartCount>0 && (
                <span className="absolute -top-[7px] -right-[7px] min-w-[22px] h-[22px] px-[6px] rounded-full text-[11px] font-[700] text-white flex items-center justify-center"
                  style={{ backgroundColor:"#B84A32" }}
                >{cartCount}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-[72px] lg:pb-0" style={{ paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))" }}>
        {/* 3. Hero */}
        <section id="home" className={`relative ${activePage==="home" ? "pg-enter" : "hidden lg:block"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-10 sm:pt-16 pb-10 lg:pb-16">
            <div className="grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              <div className="lg:col-span-6">
                <div className="inline-flex items-center gap-2 text-[11px] font-mono2 px-3 py-[6px] rounded-full mb-4 bg-white border" style={{ borderColor:"#e7d7be", color:"#B84A32" }}>
                  KEEKOROK EDITION • NAIROBI • KES
                </div>
                <h1 className="font-display text-[40px] sm:text-[56px] md:text-[64px] leading-[0.95] tracking-[-0.017em]">
                  Bring Walls<br/>to Life
                </h1>
                <p className="font-tag text-[22px] sm:text-[26px] mt-3" style={{ color:"#5d5850" }}>
                  Colour That Lasts. Style That Inspires.
                </p>
                <p className="max-w-[520px] text-[15.5px] leading-relaxed mm-muted mt-5">
                  Keekorok paint system — 20 curated Kenyan shades, M-Pesa checkout, next-day Nairobi delivery. Premium emulsion, eggshell, satin & semi-gloss.
                </p>
                <div className="flex flex-wrap gap-3 mt-7">
                  <button onClick={()=>navigate("colours")} className="btn btn-primary px-[22px] py-[13px] text-[14.5px]">
                    Find Your Perfect Shade →
                  </button>
                  <button onClick={()=>navigate("visualizer")} className="btn btn-ghost px-[22px] py-[13px] text-[14.5px]">
                    Open Visualizer
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-mono2 mt-5" style={{ color:"#7c756a" }}>
                  <span>✔ M-Pesa STK</span>
                  <span>✔ KES pricing</span>
                  <span>✔ Free delivery ≥ 15k</span>
                  <span>✔ 20 Keekorok colours</span>
                </div>
              </div>

              {/* Hero visual */}
              <div className="lg:col-span-6">
                <div className="mm-card rounded-[28px] overflow-hidden mm-shadow">
                  <div className="relative">
                    <img
                      src="https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1400"
                      alt="Keekorok living room"
                      className="w-full h-[340px] sm:h-[430px] object-cover"
                      loading="eager"
                    />
                    <div className="absolute inset-0" style={{
                      background:"linear-gradient(180deg, rgba(43,43,46,0.08) 0%, rgba(43,43,46,0.22) 100%)"
                    }}/>
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
                      <div className="px-[14px] py-[9px] rounded-[14px] bg-white/95 text-[13px] font-[600]">
                        Indian Ocean • Satin
                      </div>
                      <div className="px-[12px] py-[8px] rounded-full text-[11px] font-mono2 bg-[#2B2B2E] text-[#F8F4EF]">Keekorok</div>
                    </div>
                  </div>
                  <div className="px-4 sm:px-5 py-4 flex items-center gap-[10px] flex-wrap">
                    {colours.slice(6,14).map(c=>(
                      <button
                        key={c.id}
                        onClick={()=>{ setVizColourId(c.id); navigate("visualizer"); }}
                        title={c.name}
                        aria-label={c.name}
                        className="swatch"
                        style={{ backgroundColor:c.hex }}
                      />
                    ))}
                    <button onClick={()=>navigate("colours")} className="text-[12.5px] font-[600] px-3 py-[8px] rounded-full" style={{ color:"#4FB9B0" }}>
                      +12 more →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Colour Explorer */}
        <section id="colours" className={`py-12 sm:py-16 ${activePage==="colours" ? "pg-enter" : "hidden lg:block"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="max-w-[760px] mb-6">
              <h2 className="font-display text-[30px] sm:text-[36px]">Colour Explorer</h2>
              <p className="mm-muted mt-2">20 Kenyan-inspired Keekorok tones. Tap any swatch — it loads instantly in the visualizer below.</p>
            </div>

            {/* family tabs (shadcn Tabs look) */}
            <div className="flex flex-wrap gap-[9px] mb-5" role="tablist" aria-label="Colour family">
              {ALL_FAMILIES.map(f=>(
                <button
                  key={f}
                  role="tab"
                  aria-selected={familyFilter===f}
                  onClick={()=>setFamilyFilter(f as any)}
                  className={`chip ${familyFilter===f ? "active" : ""}`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-[14px] sm:gap-4">
              {dataLoading ? Array.from({length:10}).map((_,i)=>(
                <div key={i} className="mm-card rounded-[18px] overflow-hidden">
                  <div className="h-[108px] sm:h-[120px]" style={{ background:"linear-gradient(90deg,#ebe2d2 25%,#f5ede0 50%,#ebe2d2 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.4s infinite" }} />
                  <div className="p-[12px] space-y-2">
                    <div className="h-3 rounded-full w-3/4" style={{ background:"#ebe2d2" }} />
                    <div className="h-2 rounded-full w-1/2" style={{ background:"#ebe2d2" }} />
                  </div>
                </div>
              )) : filteredColours.map(c=>(
                <button
                  key={c.id}
                  onClick={()=>{ setVizColourId(c.id); setShopColourId(c.id); showToast(`${c.name} selected`); }}
                  className="mm-card rounded-[18px] overflow-hidden text-left hover:mm-shadow transition-shadow focus:outline-none focus:ring-[3px] focus:ring-[#4FB9B055]"
                  aria-label={`${c.name} ${c.hex}`}
                >
                  <div className="h-[108px] sm:h-[120px]" style={{ backgroundColor:c.hex }} />
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

        {/* 6. Room Visualizer */}
        <section id="visualizer" className={`py-12 sm:py-16 ${activePage==="visualizer" ? "pg-enter" : "hidden lg:block"}`} style={{ backgroundColor:"#2B2B2E", color:"#F8F4EF" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
              <div>
                <h2 className="font-display text-[30px] sm:text-[36px]">Room Visualizer</h2>
                <p className="mt-2" style={{ color:"#d5cfc3" }}>Pick a room, pick Keekorok — before / after, matte / satin / gloss.</p>
              </div>
              <div className="text-[11px] font-mono2 px-3 py-[6px] rounded-full" style={{ background:"#3b3b3d", color:"#e9dcc7" }}>
                paint = uColor * (lum*2) + uSheen*pow(lum,8)
              </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-6">
              {/* canvas */}
              <div className="lg:col-span-8">
                <div className="rounded-[26px] overflow-hidden mm-shadow" style={{ background:"#17171a" }}>
                  {vizRoom && vizColour
                    ? <VisualizerCanvas room={vizRoom} colour={vizColour} finish={vizFinish} />
                    : <div className="h-[380px] flex items-center justify-center text-[#888]">Loading rooms…</div>
                  }
                </div>
                <div className="mt-4">
                  {vizRoom && vizColour && <BeforeAfterSlider room={vizRoom} colour={vizColour} finish={vizFinish} />}
                </div>
              </div>

              {/* controls */}
              <div className="lg:col-span-4">
                <div className="rounded-[22px] p-5 mm-shadow" style={{ background:"#202023", border:"1px solid #3a3a3d" }}>
                  <div className="text-[12px] font-[600] mb-[10px]" style={{ color:"#d5cfc3" }}>Room</div>
                  <div className="grid gap-2 mb-5">
                    {rooms.map((r,idx)=>(
                      <button
                        key={r.id}
                        onClick={()=>setVizRoomIdx(idx)}
                        className="text-left flex items-center gap-3 px-3 py-[10px] rounded-[14px] border transition"
                        style={{
                          background: vizRoomIdx===idx ? "#2f2f33" : "transparent",
                          borderColor: vizRoomIdx===idx ? "#4FB9B0" : "#3a3a3d",
                          color:"#F8F4EF"
                        }}
                      >
                        <img src={r.photo} alt={r.name} className="w-16 h-11 object-cover rounded-lg" loading="lazy" />
                        <div>
                          <div className="font-[600] text-[14px]">{r.name}</div>
                          <div className="text-[11px]" style={{ color:"#bdb7a9" }}>Kenyan interior</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="text-[12px] font-[600] mb-[10px]" style={{ color:"#d5cfc3" }}>Colour — {vizColour?.name ?? "—"}</div>
                  <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-6 gap-[9px] mb-4">
                    {colours.map(c=>(
                      <button
                        key={c.id}
                        onClick={()=>setVizColourId(c.id)}
                        className={`w-full aspect-square rounded-[12px] border-[2px] transition`}
                        style={{
                          backgroundColor:c.hex,
                          borderColor: vizColour?.id===c.id ? "#E9A23B" : "transparent",
                          transform: vizColour?.id===c.id ? "scale(1.04)" : "none"
                        }}
                        aria-label={c.name}
                        title={c.name}
                      />
                    ))}
                  </div>

                  <div className="text-[12px] font-[600] mb-[8px]" style={{ color:"#d5cfc3" }}>Finish</div>
                  <div className="flex gap-2 mb-5">
                    {(["Matte","Satin","Semi-Gloss"] as Finish[]).map(f=>(
                      <button
                        key={f}
                        onClick={()=>setVizFinish(f)}
                        className="flex-1 py-[9px] rounded-[12px] text-[12.5px] font-[600] border"
                        style={{
                          backgroundColor: vizFinish===f ? "#4FB9B0" : "transparent",
                          color: vizFinish===f ? "#0b2c29" : "#F8F4EF",
                          borderColor: vizFinish===f ? "#4FB9B0" : "#444448"
                        }}
                      >{f}</button>
                    ))}
                  </div>

                  <button
                    disabled={!vizColour || !products[0]}
                    onClick={()=>{
                      const p = products[0];
                      if(!p || !vizColour) return;
                      addItem({
                        productId: p.id,
                        productName: p.name,
                        productSlug: p.slug,
                        colourId: vizColour.id,
                        colourName: vizColour.name,
                        colourHex: vizColour.hex,
                        size:"4L",
                        finish: (vizFinish==="Semi-Gloss" ? "Semi-Gloss" : vizFinish==="Satin" ? "Satin" : "Matte"),
                        unitKes: p.baseKes["4L"],
                      });
                    }}
                    className="btn w-full py-[13px] text-[14.5px] disabled:opacity-40"
                    style={{ background:"#E9A23B", color:"#2B1a05" }}
                  >
                    Add {vizColour?.name ?? "colour"} to Cart
                  </button>

                  <div className="text-[11px] mt-3" style={{ color:"#bdb7a8" }}>
                    uColor {vizColour?.hex ?? "—"} · uSheen {vizFinish==="Matte" ? "0.00" : vizFinish==="Satin" ? "0.16" : "0.30"} · mask feather 2–3px
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Shop */}
        <section id="shop" className={`py-12 sm:py-16 ${activePage==="shop" ? "pg-enter" : "hidden lg:block"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="flex items-end justify-between gap-3 mb-6">
              <div>
                <h2 className="font-display text-[30px] sm:text-[36px]">Keekorok Shop</h2>
                <p className="mm-muted mt-2">Paints, primer & supplies · M-Pesa checkout · priced in KES</p>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[12px]">
                <span className="chip">Colour: {shopColour?.name ?? "—"}</span>
                <span className="chip">{shopSize}</span>
                <span className="chip">{shopFinish}</span>
              </div>
            </div>

            {/* global pickers — size/finish hidden for supplies-only selection */}
            <div className="mm-card rounded-[18px] p-4 mb-6 grid md:grid-cols-3 gap-4">
              <div>
                <div className="text-[12px] font-[600] mb-[6px]">Colour</div>
                <select
                  className="select"
                  value={shopColour?.id ?? ""}
                  onChange={e=> setShopColourId(e.target.value)}
                >
                  {colours.map(c=> <option key={c.id} value={c.id}>{c.name} — {c.hex}</option>)}
                </select>
              </div>
              <div>
                <div className="text-[12px] font-[600] mb-[6px]">Size</div>
                <select className="select" value={shopSize} onChange={e=>setShopSize(e.target.value as Size)}>
                  <option>1L</option><option>4L</option><option>20L</option>
                </select>
                <div className="text-[11px] mt-[4px]" style={{ color:"#9b9589" }}>Applies to paints & primer</div>
              </div>
              <div>
                <div className="text-[12px] font-[600] mb-[6px]">Finish</div>
                <select className="select" value={shopFinish} onChange={e=>setShopFinish(e.target.value as Finish)}>
                  <option>Matte</option><option>Eggshell</option><option>Satin</option><option>Semi-Gloss</option>
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
              {products.map(p=>{
                const isSupply = p.category==="Supplies";
                const price = isSupply ? (p.baseKes["1L"] ?? 0) : p.baseKes[shopSize];
                return (
                  <div key={p.id} className="mm-card rounded-[22px] overflow-hidden mm-shadow flex flex-col">
                    <div className="relative">
                      <img src={p.image} alt={p.name} className="w-full h-[196px] object-cover" loading="lazy" decoding="async" />
                      <div className="absolute top-3 left-3 text-[11px] px-[10px] py-[5px] rounded-full bg-white/93 font-[600]">
                        {p.category}
                      </div>
                      {!isSupply && shopColour && (
                        <div className="absolute bottom-3 left-3 flex items-center gap-2 px-[10px] py-[6px] rounded-[12px] bg-white/95 text-[11.5px] font-[600]">
                          <span className="w-[15px] h-[15px] rounded-full inline-block border border-[#e7d8c0]" style={{ backgroundColor: shopColour.hex }} />
                          {shopColour.name}
                        </div>
                      )}
                    </div>
                    <div className="p-[18px] flex flex-col flex-1">
                      <div className="font-display text-[20px] leading-tight">{p.name}</div>
                      <div className="text-[13.5px] mm-muted mt-[6px] min-h-[42px]">{p.blurb}</div>
                      <div className="mt-auto pt-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] mm-muted">{isSupply ? "set" : `${shopSize} • ${shopFinish}`}</div>
                          <div className="text-[19px] font-[700]">{kes(price)}</div>
                        </div>
                        <button
                          disabled={!shopColour && !isSupply}
                          onClick={()=>{
                            if(!shopColour && !isSupply) return;
                            addItem({
                              productId: p.id,
                              productName: p.name,
                              productSlug: p.slug,
                              colourId: shopColour?.id ?? "none",
                              colourName: isSupply ? "—" : (shopColour?.name ?? ""),
                              colourHex: isSupply ? "#e8e3db" : (shopColour?.hex ?? "#ccc"),
                              size: shopSize,
                              finish: isSupply ? "Matte" : shopFinish,
                              unitKes: price,
                            });
                          }}
                          className="btn btn-primary px-[16px] py-[11px] text-[13.5px] disabled:opacity-40"
                        >
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-[12px] mm-muted mt-6 text-center">
              M-Pesa STK Push primary · Card via Flutterwave fallback · Invoice INV-YYYYMMDD-XXXX
            </div>
          </div>
        </section>
      </main>

      {/* 10. Footer — sticky to bottom via flex flex-col on root */}
      <footer className={`mt-auto ${activePage==="shop" ? "" : "hidden lg:block"}`} style={{ backgroundColor:"#2B2B2E", color:"#F8F4EF" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 grid md:grid-cols-4 gap-10 text-[13.5px]">
          <div>
            <div className="font-display text-[22px]">MicMikes Paints</div>
            <div className="font-tag text-[17px]" style={{ color:"#d5c9b5" }}>Keekorok Edition</div>
            <div className="mt-3 leading-relaxed" style={{ color:"#c4bcaf" }}>
              Bring Walls to Life — Colour That Lasts. Style That Inspires.
            </div>
          </div>
          <div className="space-y-[10px]" style={{ color:"#d6cdc0" }}>
            <div className="font-[600] text-[#F8F4EF] mb-1">Explore</div>
            <button onClick={()=>navigate("colours")} className="block hover:opacity-80 text-left">Colours</button>
            <button onClick={()=>navigate("visualizer")} className="block hover:opacity-80 text-left">Visualizer</button>
            <button onClick={()=>navigate("shop")} className="block hover:opacity-80 text-left">Shop</button>
          </div>
          <div className="space-y-[10px]" style={{ color:"#d6cdc0" }}>
            <div className="font-[600] text-[#F8F4EF] mb-1">Keekorok</div>
            <div>Nairobi, Kenya</div>
            <div className="text-[12.5px]">Westlands · Karen · CBD</div>
            <div className="text-[12.5px]">Mon–Sat 8am–6pm</div>
          </div>
          <div className="space-y-[10px]" style={{ color:"#d6cdc0" }}>
            <div className="font-[600] text-[#F8F4EF] mb-1">Connect</div>
            <a href="https://wa.me/254712345678" target="_blank" rel="noopener noreferrer" className="block hover:opacity-80">WhatsApp</a>
            <a href="mailto:orders@micmikespaints.co.ke" className="block hover:opacity-80">orders@micmikespaints.co.ke</a>
            <a href="tel:+254712345678" className="block hover:opacity-80">+254 712 345 678</a>
            <div className="text-[11px] font-mono2 mt-3" style={{ color:"#b8aea0" }}>React · Neon PG · Drizzle ORM<br/>Vercel · designed by rauell.systems</div>
            <div className="text-[11px]" style={{ color:"#b8aea0" }}>© 2026 MicMikes Paints</div>
          </div>
        </div>
        <div className="border-t" style={{ borderColor:"#3b3b3c" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-[14px] text-[11px]" style={{ color:"#a79d8c" }}>
            Payments encrypted end-to-end. Protected under Kenya’s Data Protection Act. · KES pricing · Invoice INV-YYYYMMDD-XXXX
          </div>
        </div>
      </footer>

      {/* 8. Cart Drawer — shadcn Sheet style */}
      {cartOpen && (
        <div className="fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-black/45 fade" onClick={()=>setCartOpen(false)} />
          <aside
            className="absolute right-0 top-0 h-full w-full sm:max-w-[440px] bg-[#F8F4EF] sheet-panel flex flex-col"
            role="dialog" aria-modal="true" aria-label="Shopping cart"
          >
            {/* Sheet header */}
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b" style={{ borderColor:"#e7d9c3", background:"#fffdf8" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-[24px]">Your Cart</div>
                  <div className="text-[12.5px] mm-muted">{cartCount} item{cartCount!==1?"s":""} · {kes(subtotal)}</div>
                </div>
                <button onClick={()=>setCartOpen(false)} className="w-9 h-9 rounded-full bg-white border flex items-center justify-center" style={{ borderColor:"#e3d5bc" }} aria-label="Close cart">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {/* Sheet content — scroll area */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-[14px]">
              {cart.length===0 ? (
                <div className="text-center py-14">
                  <div className="text-[16px] font-[600] mb-2">Cart is empty</div>
                  <p className="mm-muted text-[13.5px] mb-5">Add Keekorok colours to get started.</p>
                  <button onClick={()=>{ setCartOpen(false); navigate("shop"); }} className="btn btn-primary px-5 py-[11px] text-[13.5px]">Shop Keekorok</button>
                </div>
              ) : cart.map(item=>{
                const key = `${item.productId}|${item.colourId}|${item.size}|${item.finish}`;
                return (
                  <div key={key} className="mm-card rounded-[16px] p-[13px] flex items-center gap-[13px]">
                    <div className="w-[52px] h-[52px] rounded-[12px] border border-[#eadcc4] flex-shrink-0" style={{ backgroundColor: item.colourHex }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-[600] text-[14px] leading-tight truncate">{item.productName}</div>
                      <div className="text-[12.5px] mm-muted">
                        {item.colourName} · {item.finish} · {item.size}
                      </div>
                      <div className="text-[11.5px] font-mono2 mt-[3px]">{kes(item.unitKes)} / tin</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-[6px] mb-[6px]">
                        <button
                          onClick={()=> updateQty(key, item.quantity-1)}
                          className="w-8 h-8 rounded-full bg-[#f1e7d5] flex items-center justify-center"
                          aria-label="Decrease quantity"
                        >−</button>
                        <div className="w-[26px] text-center text-[13.5px] font-[600]">{item.quantity}</div>
                        <button
                          onClick={()=> updateQty(key, item.quantity+1)}
                          className="w-8 h-8 rounded-full bg-[#f1e7d5] flex items-center justify-center"
                          aria-label="Increase quantity"
                        >+</button>
                      </div>
                      <div className="text-[13.5px] font-[700]">{kes(item.unitKes*item.quantity)}</div>
                      <button onClick={()=> removeLine(key)} className="text-[11.5px] mm-muted hover:underline mt-[2px]">Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sheet footer */}
            <div className="border-t px-5 sm:px-6 py-5" style={{ borderColor:"#e7d9c3", background:"#fffdf8" }}>
              <div className="space-y-[7px] text-[13.5px]">
                <div className="flex justify-between"><span className="mm-muted">Subtotal</span><span className="font-[600]">{kes(subtotal)}</span></div>
                <div className="flex justify-between mm-muted"><span>Delivery</span><span>{deliveryFee===0 ? "Free" : kes(deliveryFee)}</span></div>
                <div className="flex justify-between text-[17px] font-[700] pt-[8px] border-t" style={{ borderColor:"#eadcc4" }}>
                  <span>Total</span><span>{kes(totalKes)}</span></div>
              </div>
              <button
                disabled={cart.length===0}
                onClick={()=>{ setCartOpen(false); setCheckoutOpen(true); }}
                className="btn btn-dark w-full mt-4 py-[13px] text-[15px] disabled:opacity-50"
              >Checkout →</button>
              <div className="text-[11px] mm-muted text-center mt-[10px]">
                Free delivery in Nairobi over KES 15,000
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* 9. Checkout modal — shadcn Dialog style */}
      {checkoutOpen && (
        <CheckoutDialog
          subtotal={subtotal}
          deliveryFee={deliveryFee}
          total={totalKes}
          cartCount={cartCount}
          cart={cart}
          onClose={()=>setCheckoutOpen(false)}
          onSuccess={(orderMeta)=>{
            setCheckoutOpen(false);
            setCart([]);
            localStorage.removeItem("micmikes-cart");
            showToast(`Order ${orderMeta.invoice} confirmed ✓`);
          }}
        />
      )}

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-[60]" aria-label="Main navigation">
        <div style={{
          background:"rgba(248,244,239,0.97)",
          backdropFilter:"blur(24px) saturate(180%)",
          WebkitBackdropFilter:"blur(24px) saturate(180%)",
          borderTop:"1px solid rgba(232,220,199,0.7)",
          paddingBottom:"env(safe-area-inset-bottom, 0px)",
        }}>
          <div className="flex items-stretch h-[60px]">
            {([
              { id:"home",       label:"Home",      icon:(
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>
                </svg>
              )},
              { id:"colours",    label:"Colours",   icon:(
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8z"/>
                  <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" stroke="none"/>
                  <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" stroke="none"/>
                  <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" stroke="none"/>
                </svg>
              )},
              { id:"visualizer", label:"Visualize", icon:(
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              )},
              { id:"shop",       label:"Shop",      icon:(
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6l-2-3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>
                </svg>
              )},
            ] as const).map(tab => {
              const active = activePage === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={()=>navigate(tab.id)}
                  className="flex-1 flex flex-col items-center justify-center gap-[3px] relative transition-colors focus:outline-none"
                  aria-label={tab.label}
                  aria-current={active ? "page" : undefined}
                >
                  {active && (
                    <span className="absolute inset-x-2 inset-y-[6px] rounded-[12px] fade"
                      style={{ background:"rgba(184,74,50,0.09)" }} />
                  )}
                  <span style={{ color: active ? "#B84A32" : "#9b9589", position:"relative", transition:"color .15s" }}>
                    {tab.icon}
                  </span>
                  <span className="relative text-[10px] font-[700] tracking-[0.01em]"
                    style={{ color: active ? "#B84A32" : "#9b9589", transition:"color .15s" }}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* toast */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[90] px-[18px] py-[11px] rounded-full text-white text-[13px] font-[600] mm-shadow lg:bottom-5"
          style={{ background:"#2B2B2E", bottom:"calc(76px + env(safe-area-inset-bottom, 0px))" }}>
          {toast}
        </div>
      )}

      {/* WhatsApp float button */}
      <a
        href="https://wa.me/254712345678?text=Hi%20MicMikes%20Paints%20%E2%80%94%20I%27d%20like%20to%20order%20Keekorok%20paints"
        target="_blank" rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed right-5 z-[85] w-14 h-14 rounded-full flex items-center justify-center mm-shadow lg:bottom-6"
        style={{ background:"#25D366", bottom:"calc(80px + env(safe-area-inset-bottom, 0px))" }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>

      {/* Vercel Web Analytics */}
      <Analytics />
    </div>
  );
}

/* ── Wall-paint canvas engine ─────────────────────────────────────────────
   Loads the room photo into an offscreen canvas, precomputes a pixel-level
   wall mask, then rewrites only those pixels to the chosen paint colour.
   The wall's original lightness (shadows, highlights) is preserved.
   ──────────────────────────────────────────────────────────────────────── */

function _hexToRgb(hex: string): [number,number,number] {
  const h = hex.replace("#","");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function _rgbToHsl(r: number, g: number, b: number): [number,number,number] {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), l=(max+min)/2;
  if (max===min) return [0,0,l];
  const d=max-min, s=l>0.5 ? d/(2-max-min) : d/(max+min);
  let h=0;
  if (max===r) h=(g-b)/d+(g<b?6:0);
  else if (max===g) h=(b-r)/d+2;
  else h=(r-g)/d+4;
  return [h/6, s, l];
}
function _hslToRgb(h: number, s: number, l: number): [number,number,number] {
  if (s===0) { const v=Math.round(l*255); return [v,v,v]; }
  const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
  const hf=(t:number)=>{ if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p; };
  return [Math.round(hf(h+1/3)*255), Math.round(hf(h)*255), Math.round(hf(h-1/3)*255)];
}
function _inPoly(px:number, py:number, poly:[number,number][]): boolean {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const[xi,yi]=poly[i],[xj,yj]=poly[j];
    if(((yi>py)!==(yj>py))&&px<(xj-xi)*(py-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
function _parsePoly(mask:string):[number,number][] {
  return mask.trim().split(/\s+/).map(p=>{ const[x,y]=p.split(",").map(Number); return[x,y]; });
}

/* Builds an offscreen canvas with the photo drawn at targetW×targetH (cover crop),
   returns { pixels: original rgba array, wallMask: Uint8Array, w, h } */
async function _loadRoomData(photoUrl:string, wallMask:string, tw:number, th:number) {
  return new Promise<{pixels:Uint8ClampedArray, mask:Uint8Array, w:number, h:number}|null>(resolve=>{
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const oc = document.createElement("canvas");
      oc.width=tw; oc.height=th;
      const ctx = oc.getContext("2d")!;
      // cover: scale to fill, centre
      const sc = Math.max(tw/img.naturalWidth, th/img.naturalHeight);
      const sw = img.naturalWidth*sc, sh = img.naturalHeight*sc;
      ctx.drawImage(img, (tw-sw)/2, (th-sh)/2, sw, sh);
      let pixels: Uint8ClampedArray;
      try { pixels = ctx.getImageData(0,0,tw,th).data; }
      catch { resolve(null); return; } // CORS blocked
      // Rasterise wall mask — supports semicolon-delimited multiple polygon regions
      const polys = (wallMask||"0,0.13 1,0.13 1,0.60 0,0.60")
        .split(";").map(s => _parsePoly(s.trim())).filter(p => p.length >= 3);
      const mask = new Uint8Array(tw*th);
      for(let y=0;y<th;y++){
        const ny=y/th;
        for(let x=0;x<tw;x++){
          if(polys.some(poly => _inPoly(x/tw, ny, poly))) mask[y*tw+x]=1;
        }
      }
      resolve({ pixels: new Uint8ClampedArray(pixels), mask, w:tw, h:th });
    };
    img.onerror = ()=>resolve(null);
    img.src = photoUrl;
  });
}

/* Apply paint colour to a copy of the original pixels.
   Two-layer filter: (1) spatial polygon mask, (2) per-pixel neutrality check —
   walls are desaturated and light; furniture/floors have distinct hue or are dark.
   Only pixels that are both inside the polygon AND neutral enough get recoloured. */
function _applyPaint(
  orig: Uint8ClampedArray, mask: Uint8Array,
  paintHex: string, satScale: number, sheenAmt: number, w:number, h:number
): ImageData {
  const data = new Uint8ClampedArray(orig);
  const [pr,pg,pb] = _hexToRgb(paintHex);
  const [ph,ps] = _rgbToHsl(pr,pg,pb);
  for(let i=0;i<mask.length;i++){
    if(!mask[i]) continue;
    const p=i*4;
    const [,os,ol] = _rgbToHsl(data[p], data[p+1], data[p+2]);
    // Skip pixels that are too saturated (furniture, plants, coloured objects)
    // or too dark (fixtures, shadows, dark cabinets)
    // "wallness" = 0 for clearly non-wall pixels, 1 for neutral bright surfaces
    const satFilt  = Math.max(0, 1 - os * 4);   // 0 when sat ≥ 0.25
    const lightFilt = Math.min(1, Math.max(0, (ol - 0.18) / 0.35)); // 0 when l < 0.18, 1 when l > 0.53
    const wallness = satFilt * lightFilt;
    if(wallness < 0.08) continue;                // skip non-wall pixels entirely
    // Preserve original lightness; replace hue+sat weighted by wallness
    const newS = Math.min(1, ps * satScale * wallness);
    const [nr,ng,nb] = _hslToRgb(ph, newS, ol);
    // Blend toward white on bright areas for satin/gloss sheen
    data[p]   = Math.round(nr + (255-nr)*sheenAmt*ol);
    data[p+1] = Math.round(ng + (255-ng)*sheenAmt*ol);
    data[p+2] = Math.round(nb + (255-nb)*sheenAmt*ol);
  }
  return new ImageData(data, w, h);
}

/* ── Visualizer Canvas (painted preview) ── */
function VisualizerCanvas({ room, colour, finish }:{
  room: Room, colour: Colour, finish: Finish
}){
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomData  = useRef<{pixels:Uint8ClampedArray, mask:Uint8Array, w:number, h:number}|null>(null);
  const [corsErr, setCorsErr] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const W=1200, H=750;

  const pregenUrl = `/pregenerated/${room.id}_${colour.id}.jpg`;

  useEffect(() => {
    setImgErr(false);
  }, [room.id, colour.id]);

  const satScale = finish==="Matte"?0.90:finish==="Eggshell"?0.83:finish==="Satin"?0.76:0.68;
  const sheenAmt = finish==="Matte"?0:finish==="Eggshell"?0.06:finish==="Satin"?0.13:0.24;

  useEffect(()=>{
    if (!imgErr) return;
    setCorsErr(false); roomData.current=null;
    _loadRoomData(room.photo, room.wallMask||"", W, H).then(d=>{
      if(!d){ setCorsErr(true); return; }
      roomData.current=d;
      paint();
    });
  }, [room.photo, room.wallMask, imgErr]);

  const paint = useCallback(()=>{
    const rd=roomData.current; const cv=canvasRef.current;
    if(!rd||!cv) return;
    cv.width=rd.w; cv.height=rd.h;
    const id = _applyPaint(rd.pixels, rd.mask, colour.hex, satScale, sheenAmt, rd.w, rd.h);
    cv.getContext("2d")!.putImageData(id,0,0);
  }, [colour.hex, satScale, sheenAmt]);

  useEffect(()=>{ if(!corsErr && imgErr) paint(); }, [colour.hex, finish, paint, corsErr, imgErr]);

  if (!imgErr) {
    return (
      <div className="relative w-full">
        <img 
          src={pregenUrl} 
          onError={() => setImgErr(true)} 
          alt={`${colour.name} • ${finish}`} 
          className="w-full h-[380px] sm:h-[500px] object-cover block rounded-[18px]"
        />
        <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3">
          <div className="px-[13px] py-[9px] rounded-[14px] text-[13px] font-[600]" style={{background:"rgba(248,244,239,.96)",color:"#2B2B2E"}}>
            {colour.name} • {finish}
          </div>
          <div className="text-[10.5px] font-mono2 px-[10px] py-[6px] rounded-full" style={{background:"rgba(20,20,22,.72)",color:"#F8F4EF"}}>
            {room.name} (HD Preview)
          </div>
        </div>
      </div>
    );
  }

  if(corsErr) return (
    <div className="relative w-full">
      <img src={room.photo} alt={room.name} className="w-full h-[380px] sm:h-[500px] object-cover block rounded-[18px]"/>
      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3">
        <div className="px-[13px] py-[9px] rounded-[14px] text-[13px] font-[600]" style={{background:"rgba(248,244,239,.96)",color:"#2B2B2E"}}>{colour.name} • {finish}</div>
        <div className="text-[10.5px] font-mono2 px-[10px] py-[6px] rounded-full" style={{background:"rgba(20,20,22,.72)",color:"#F8F4EF"}}>{room.name}</div>
      </div>
    </div>
  );

  return (
    <div className="relative w-full">
      <canvas ref={canvasRef} className="w-full h-[380px] sm:h-[500px] block rounded-[18px]" style={{objectFit:"cover"}}/>
      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3">
        <div className="px-[13px] py-[9px] rounded-[14px] text-[13px] font-[600]" style={{background:"rgba(248,244,239,.96)",color:"#2B2B2E"}}>
          {colour.name} • {finish}
        </div>
        <div className="text-[10.5px] font-mono2 px-[10px] py-[6px] rounded-full" style={{background:"rgba(20,20,22,.72)",color:"#F8F4EF"}}>
          {room.name}
        </div>
      </div>
    </div>
  );
}

/* ── Before / After Slider (canvas-powered) ── */
function BeforeAfterSlider({ room, colour, finish }:{
  room: Room, colour: Colour, finish: Finish
}){
  const [pos, setPos] = useState(54);
  const sliderRef  = useRef<HTMLDivElement>(null);
  const afterRef   = useRef<HTMLCanvasElement>(null);
  const roomData   = useRef<{pixels:Uint8ClampedArray, mask:Uint8Array, w:number, h:number}|null>(null);
  const [corsErr, setCorsErr] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const W=900, H=560;

  const pregenUrl = `/pregenerated/${room.id}_${colour.id}.jpg`;

  useEffect(() => {
    setImgErr(false);
  }, [room.id, colour.id]);

  const satScale = finish==="Matte"?0.90:finish==="Eggshell"?0.83:finish==="Satin"?0.76:0.68;
  const sheenAmt = finish==="Matte"?0:finish==="Eggshell"?0.06:finish==="Satin"?0.13:0.24;

  useEffect(()=>{
    if (!imgErr) return;
    setCorsErr(false); roomData.current=null;
    _loadRoomData(room.photo, room.wallMask||"", W, H).then(d=>{
      if(!d){ setCorsErr(true); return; }
      roomData.current=d;
      paintAfter();
    });
  }, [room.photo, room.wallMask, imgErr]);

  const paintAfter = useCallback(()=>{
    const rd=roomData.current; const cv=afterRef.current;
    if(!rd||!cv) return;
    cv.width=rd.w; cv.height=rd.h;
    const id = _applyPaint(rd.pixels, rd.mask, colour.hex, satScale, sheenAmt, rd.w, rd.h);
    cv.getContext("2d")!.putImageData(id,0,0);
  }, [colour.hex, satScale, sheenAmt]);

  useEffect(()=>{ if(!corsErr && imgErr) paintAfter(); }, [colour.hex, finish, paintAfter, corsErr, imgErr]);

  const move=(clientX:number)=>{
    const el=sliderRef.current; if(!el) return;
    const r=el.getBoundingClientRect();
    setPos(Math.max(0,Math.min(100,(clientX-r.left)/r.width*100)));
  };

  return (
    <div
      ref={sliderRef}
      className="relative w-full h-[280px] sm:h-[340px] overflow-hidden rounded-[18px] select-none cursor-ew-resize"
      style={{background:"#111215", touchAction:"none"}}
      onMouseDown={e=>move(e.clientX)}
      onMouseMove={e=>e.buttons===1&&move(e.clientX)}
      onTouchStart={e=>move(e.touches[0].clientX)}
      onTouchMove={e=>move(e.touches[0].clientX)}
      aria-label="Before after slider"
    >
      {/* BEFORE — original photo */}
      <img src={room.photo} alt="before" className="absolute inset-0 w-full h-full object-cover" draggable={false}/>
      {/* AFTER — pregenerated image or fallback canvas, revealed right of handle */}
      {!imgErr ? (
        <img
          src={pregenUrl}
          onError={() => setImgErr(true)}
          alt="after"
          className="absolute inset-0 w-full h-full object-cover"
          style={{clipPath:`inset(0 ${(100-pos).toFixed(1)}% 0 0)`}}
          draggable={false}
        />
      ) : (
        !corsErr && (
          <canvas
            ref={afterRef}
            className="absolute inset-0 w-full h-full"
            style={{objectFit:"cover", clipPath:`inset(0 ${(100-pos).toFixed(1)}% 0 0)`}}
          />
        )
      )}
      {/* divider + handle */}
      <div className="absolute top-0 bottom-0 pointer-events-none" style={{left:`${pos}%`,width:"2px",background:"#F8F4EF",boxShadow:"0 0 18px rgba(0,0,0,.55)"}}/>
      <div className="absolute pointer-events-none" style={{left:`calc(${pos}% - 18px)`,top:"50%",transform:"translateY(-50%)"}}>
        <div className="w-9 h-9 rounded-full bg-[#F8F4EF] shadow-lg flex items-center justify-center text-[13px]" aria-hidden>↔</div>
      </div>
      <div className="absolute left-3 bottom-3 text-[10.5px] font-mono2 px-[9px] py-[5px] rounded-full bg-black/55 text-white select-none">drag</div>
    </div>
  );
}

/* ── Checkout Dialog ── */
function CheckoutDialog({
  subtotal, deliveryFee, total, cartCount, cart, onClose, onSuccess
}:{
  subtotal:number; deliveryFee:number; total:number; cartCount:number;
  cart: CartItem[];
  onClose:()=>void;
  onSuccess:(meta:{invoice:string, mpesaRef:string})=>void;
}){
  const [step, setStep] = useState<"form"|"stk_sending"|"stk_pin"|"success">("form");
  const [form, setForm] = useState({
    name:"Roy Okola",
    email:"roy@micmikespaints.co.ke",
    phone:"0712345678",
    county:"Nairobi",
    town:"Westlands",
    address:"Riverside Drive 47"
  });
  const [err, setErr] = useState("");
  const [countdown, setCountdown] = useState(3);

  const normalizePhone = (p:string)=>{
    let s = p.replace(/\s+/g,"");
    if(s.startsWith("0")) s = "254"+s.slice(1);
    if(s.startsWith("+")) s = s.slice(1);
    if(/^[17]\d{8}$/.test(s)) s = "254"+s;
    return s;
  };
  const phoneNorm = normalizePhone(form.phone);

  const startMpesa = async ()=>{
    if(!form.name.trim() || !form.email.includes("@")){ setErr("Enter name & valid email"); return; }
    if(!/^2547\d{8}$/.test(phoneNorm)){ setErr("M-Pesa number must be 2547XXXXXXXX"); return; }
    setErr("");
    setStep("stk_sending");
    try {
      await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, email: form.email, phone: phoneNorm,
          county: form.county, town: form.town, address: form.address,
          subtotalKes: subtotal, deliveryKes: deliveryFee, totalKes: total,
          items: cart.map(i=>({
            productSlug: i.productSlug,
            colourId: i.colourId,
            size: i.size, finish: i.finish,
            quantity: i.quantity, unitKes: i.unitKes,
          })),
        }),
      });
    } catch { /* order saved best-effort; continue to simulate M-Pesa */ }
    setTimeout(()=>{ setStep("stk_pin"); setCountdown(3); }, 2000);
  };

  // pin countdown → success
  useEffect(()=>{
    if(step!=="stk_pin") return;
    if(countdown<=0){
      setStep("success");
      setTimeout(()=>{
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth()+1).padStart(2,"0");
        const da = String(d.getDate()).padStart(2,"0");
        const seq = String(Math.floor(Math.random()*9000)+1000);
        const invoice = `INV-${y}${m}${da}-${seq}`;
        const mpesaRef = (Math.random().toString(36).toUpperCase().slice(2,5) + Math.floor(100000+Math.random()*899999));
        onSuccess({ invoice, mpesaRef });
      }, 900);
      return;
    }
    const t = setTimeout(()=>setCountdown(c=>c-1),1000);
    return ()=>clearTimeout(t);
  }, [step, countdown, onSuccess]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#1b1b1f]/55 backdrop-blur-[3px] fade" onClick={onClose}/>
      <div className="relative w-full max-w-[580px] rounded-[24px] mm-shadow overflow-hidden fade" style={{ background:"#F8F4EF", border:"1px solid #e7d9c3" }}>
        {/* dialog header */}
        <div className="px-5 sm:px-7 pt-5 pb-4 border-b flex items-start justify-between" style={{ borderColor:"#e8dcc7", background:"#fffdf8" }}>
          <div>
            <div className="font-display text-[24px] sm:text-[26px]">Checkout</div>
            <div className="text-[12.5px] mm-muted">{cartCount} items · {kes(total)}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white border flex items-center justify-center" style={{ borderColor:"#e3d5bc" }} aria-label="Close">✕</button>
        </div>

        <div className="px-5 sm:px-7 py-5 sm:py-6">
          {step==="form" && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-[12px]">
                <label className="block text-[13px]">
                  <div className="text-[12px] mm-muted mb-[5px]">Full name</div>
                  <input className="input" value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))}/>
                </label>
                <label className="block text-[13px]">
                  <div className="text-[12px] mm-muted mb-[5px]">Email</div>
                  <input type="email" className="input" value={form.email} onChange={e=>setForm(f=>({...f, email:e.target.value}))}/>
                </label>
                <label className="block text-[13px]">
                  <div className="text-[12px] mm-muted mb-[5px]">M-Pesa phone</div>
                  <input className="input font-mono2" placeholder="0712345678" value={form.phone} onChange={e=>setForm(f=>({...f, phone:e.target.value}))}/>
                  <div className="text-[11px] mm-muted mt-[4px]">Will send STK → {phoneNorm}</div>
                </label>
                <label className="block text-[13px]">
                  <div className="text-[12px] mm-muted mb-[5px]">Town</div>
                  <input className="input" value={form.town} onChange={e=>setForm(f=>({...f, town:e.target.value}))}/>
                </label>
                <label className="block text-[13px]">
                  <div className="text-[12px] mm-muted mb-[5px]">County</div>
                  <select className="select" value={form.county} onChange={e=>setForm(f=>({...f, county:e.target.value}))}>
                    {["Nairobi","Kiambu","Machakos","Kajiado","Nakuru","Mombasa","Kisumu","Uasin Gishu","Other"].map(c=> <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block sm:col-span-2 text-[13px]">
                  <div className="text-[12px] mm-muted mb-[5px]">Delivery address</div>
                  <input className="input" value={form.address} onChange={e=>setForm(f=>({...f, address:e.target.value}))}/>
                </label>
              </div>

              {err && <div className="text-[12.5px] px-3 py-[9px] rounded-[12px]" style={{ background:"#fff1ef", color:"#a43a25", border:"1px solid #f5c8be" }}>{err}</div>}

              <div className="rounded-[16px] p-[14px]" style={{ background:"#fff", border:"1px solid #e9dbc1" }}>
                <div className="flex justify-between text-[13.5px] mb-[6px]"><span className="mm-muted">Subtotal</span><span className="font-[600]">{kes(subtotal)}</span></div>
                <div className="flex justify-between text-[13.5px] mb-[6px]"><span className="mm-muted">Delivery</span><span>{deliveryFee===0 ? "Free" : kes(deliveryFee)}</span></div>
                <div className="flex justify-between text-[17px] font-[700] pt-[8px] border-t" style={{ borderColor:"#eadcc4" }}><span>Total</span><span>{kes(total)}</span></div>
              </div>

              <button onClick={startMpesa} className="btn w-full py-[13px] text-[15px] text-white" style={{ background:"#0aa85a" }}>
                Pay {kes(total)} via M-Pesa
              </button>
              <div className="text-[11.5px] mm-muted text-center leading-relaxed">
                Payments encrypted end-to-end. Protected under Kenya’s Data Protection Act.<br/>
                Business Short Code 174379 · sandbox
              </div>
            </div>
          )}

          {step==="stk_sending" && (
            <div className="py-6 text-center">
              <div className="text-[15px] font-[600] mb-2">Sending STK Push to {phoneNorm}…</div>
              <div className="text-[13px] mm-muted">POST /api/mpesa/stkpush</div>
              <div className="w-10 h-10 mx-auto mt-5 rounded-full border-[3px] border-[#4FB9B0] border-t-transparent animate-spin"/>
              <div className="text-[11.5px] font-mono2 mm-muted mt-4">CheckoutRequestID: ws_CO_{uid()}</div>
            </div>
          )}

          {step==="stk_pin" && (
            <div className="py-4">
              <div className="rounded-[16px] p-4 mb-4" style={{ background:"#f1fbf6", border:"1px solid #b9e7cc" }}>
                <div className="text-[15px] font-[700]" style={{ color:"#0b8a4a" }}>STK Push sent ✓</div>
                <div className="text-[13.5px] mt-1">Enter your M-Pesa PIN on your phone</div>
                <div className="text-[12px] font-mono2 mt-2" style={{ color:"#0b8a4a" }}>{phoneNorm} · polling /api/mpesa/status … {countdown}s</div>
                <div className="h-[7px] rounded-full mt-3 overflow-hidden" style={{ background:"#d7f3e2" }}>
                  <div className="h-full" style={{ background:"#18b96b", width:`${(1-countdown/3)*100}%`, transition:"width .5s linear" }}/>
                </div>
              </div>
              <div className="text-[12px] mm-muted text-center">Check your phone screen now — Safaricom pop-up</div>
            </div>
          )}

          {step==="success" && (
            <div className="py-6 text-center">
              <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center text-white text-[22px] mb-3" style={{ background:"#15a25a" }}>✓</div>
              <div className="font-display text-[22px] mb-1">Payment confirmed</div>
              <div className="text-[13.5px] mm-muted">Generating invoice INV-YYYYMMDD-XXXX …</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
