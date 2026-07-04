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
   MicMikes Paints - Keekorok Edition
   Single-page, mobile-first, production landing
   Next.js + Tailwind + shadcn/ui visual language
   "Bring Walls to Life - Colour That Lasts. Style That Inspires."
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
      fetch("/api/colours?type=rooms").then(r=>r.json()),
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
  const [vizSize, setVizSize] = useState<Size>("4L");
  const vizRoom = rooms[vizRoomIdx] ?? null;
  const vizColour = (vizColourId ? colours.find(c=>c.id===vizColourId) : null) ?? colours.find(c=>c.name==="Indian Ocean") ?? colours[0] ?? null;

  /* popular colours (aggregated from cart_events swatch clicks + adds) */
  const [popularIds, setPopularIds] = useState<string[]>([]);
  useEffect(()=>{
    fetch("/api/colours?popular=1").then(r=>r.ok ? r.json() : [])
      .then(ids=> Array.isArray(ids) && setPopularIds(ids.slice(0,3)))
      .catch(()=>{});
  }, []);

  /* keyboard navigation: ←/→ cycles colours while the visualizer is on screen */
  useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{
      if(e.key!=="ArrowLeft" && e.key!=="ArrowRight") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if(tag==="INPUT" || tag==="TEXTAREA" || tag==="SELECT") return;
      if(!colours.length) return;
      const cur = colours.findIndex(c=>c.id===(vizColour?.id ?? ""));
      const next = e.key==="ArrowRight"
        ? (cur+1) % colours.length
        : (cur-1+colours.length) % colours.length;
      setVizColourId(colours[next].id);
    };
    window.addEventListener("keydown", onKey);
    return ()=>window.removeEventListener("keydown", onKey);
  }, [colours, vizColour?.id]);

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

  /* navigate - tab on mobile, smooth scroll on desktop */
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
          <span className="font-tag text-[15px] sm:text-[16px] italic">Bring Walls to Life - Colour That Lasts. Style That Inspires.</span>
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
                  Keekorok paint system - 20 curated Kenyan shades, M-Pesa checkout, next-day Nairobi delivery. Premium emulsion, eggshell, satin & semi-gloss.
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
              <p className="mm-muted mt-2">20 Kenyan-inspired Keekorok tones. Tap any swatch - it loads instantly in the visualizer below.</p>
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
      </main>
    </div>
  );
}
