import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

const FALLBACK_COLOURS = [
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

const FALLBACK_ROOMS = [
  { id: "fr-01", name: "Living Room",  photo: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200&q=80", wallMask: null },
  { id: "fr-02", name: "Bedroom",      photo: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1200&q=80", wallMask: null },
  { id: "fr-03", name: "Kitchen",      photo: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80", wallMask: null },
];

const FALLBACK_PRODUCTS = [
  { id: "fallback-1", slug: "keekorok-premium-emulsion", name: "Keekorok Premium Emulsion", blurb: "Superior washable emulsion. Vivid, long-lasting colour for interior walls & ceilings.", category: "Paint", image: "", baseKes: { "1L": 850, "4L": 2800, "20L": 11500 } },
  { id: "fallback-2", slug: "keekorok-satin-finish", name: "Keekorok Satin Finish", blurb: "Silky satin sheen — ideal for living rooms, hallways & feature walls.", category: "Paint", image: "", baseKes: { "1L": 950, "4L": 3200, "20L": 13500 } },
  { id: "fallback-3", slug: "keekorok-primer-sealer", name: "Keekorok Primer & Sealer", blurb: "Multi-surface primer for new plaster, timber & previously painted surfaces.", category: "Primer", image: "", baseKes: { "1L": 700, "4L": 2200, "20L": 9000 } }
];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type");
  const popular = searchParams.get("popular");

  try {
    // --- Rooms (visualizer backgrounds owned by showcase customer) ---
    if (type === "rooms") {
      const rows = await db.execute(sql`
        SELECT r.id, r.room_name AS "name", m.cdn_url AS "photo", m.storage_key AS "wallMask"
        FROM customer.saved_rooms r
        LEFT JOIN catalog.media_assets m ON m.id = r.media_id
        WHERE r.customer_id = '88d8bd7f-94d3-488f-a0bb-26aa77dd8e10'
        ORDER BY r.created_at
      `);
      if (!rows.rows.length) return NextResponse.json(FALLBACK_ROOMS);
      return NextResponse.json(rows.rows);
    }

    // --- Products + price variants ---
    if (type === "products") {
      const products = (await db.execute(sql`
        SELECT p.id, p.slug, p.name, p.short_description AS "blurb", p.product_type AS "category", COALESCE(m.cdn_url, '') AS "image"
        FROM catalog.products p
        LEFT JOIN catalog.media_assets m ON m.owner_type = 'product' AND m.owner_id = p.id
        WHERE p.status = 'active'
        ORDER BY p.created_at
      `)).rows;

      if (!products.length) return NextResponse.json(FALLBACK_PRODUCTS);

      const variants = (await db.execute(sql`
        SELECT product_id AS "productId", pack_size_ml AS "size", list_price_minor / 100 AS "priceKes"
        FROM catalog.product_variants
        WHERE is_active = true
        ORDER BY product_id, pack_size_ml
      `)).rows;

      const sizeMap: Record<string, string> = { "1000": "1L", "4000": "4L", "20000": "20L" };

      const result = products.map((p) => {
        const prodVariants = variants.filter((v) => v.productId === p.id);
        const baseKes: Record<string, number> = {};
        prodVariants.forEach((v) => {
          const szLabel = sizeMap[String(v.size)] || `${Number(v.size)/1000}L`;
          baseKes[szLabel] = Number(v.priceKes);
        });
        return {
          ...p,
          baseKes
        };
      });

      return NextResponse.json(result);
    }

    // --- Popular colour IDs (last 30 days) ---
    if (popular) {
      const rows = (await db.execute(sql`
        SELECT entity_id AS colour_id,
               SUM(CASE WHEN event_name = 'add_to_cart' THEN 3 ELSE 1 END)::int AS score
        FROM analytics.events
        WHERE entity_id IS NOT NULL
          AND event_name IN ('add_to_cart', 'swatch_click')
          AND event_ts > NOW() - INTERVAL '30 days'
        GROUP BY entity_id
        ORDER BY score DESC
        LIMIT 5
      `)).rows;

      if (!rows.length) return NextResponse.json(FALLBACK_COLOURS.slice(0, 5).map(c => c.id));
      return NextResponse.json(rows.map((r) => r.colour_id));
    }

    // --- Full colour list (shades joined with families) ---
    const rows = (await db.execute(sql`
      SELECT s.id, s.code, s.name, s.hex_value AS hex, f.name AS family
      FROM catalog.shades s
      LEFT JOIN catalog.colour_families f ON f.id = s.family_id
      WHERE s.is_active = true
      ORDER BY f.name, s.name
    `)).rows;

    if (!rows.length) return NextResponse.json(FALLBACK_COLOURS);
    return NextResponse.json(rows);

  } catch (err) {
    console.error("[api/colours] DB error, using fallback:", err);
    if (type === "rooms") return NextResponse.json(FALLBACK_ROOMS);
    if (type === "products") return NextResponse.json(FALLBACK_PRODUCTS);
    if (popular) return NextResponse.json(FALLBACK_COLOURS.slice(0, 5).map(c => c.id));
    return NextResponse.json(FALLBACK_COLOURS);
  }
}
