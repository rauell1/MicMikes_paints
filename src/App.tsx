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
  { id: "fc-04", name: "Stone Grey",       hex