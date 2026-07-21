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
  {
    id: "fallback-1",
    slug: "keekorok-premium-emulsion",
    name: "Keekorok Premium Emulsion",
    blurb: "Superior washable emulsion. Vivid, long-lasting colour for interior walls & ceilings.",
    category: "Paint",
    productType: "paint",
    categoryName: "Paint",
    isFeatured: true,
    isNewRelease: true,
    isExteriorGrade: false,
    roomTags: ["Living Room", "Bedroom", "Hallway"],
    image: "",
    imageAlt: "",
    baseKes: { "1L": 850, "4L": 2800, "20L": 11500 },
    variants: [
      { variantId: "fv-1-1", size: "1L", listKes: 850, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-1-2", size: "4L", listKes: 2800, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-1-3", size: "20L", listKes: 11500, saleKes: null, stockTracking: false, available: null }
    ],
    specs: { washability: 5, coverage: 12, dryingMinutes: 180 }
  },
  {
    id: "fallback-2",
    slug: "keekorok-satin-finish",
    name: "Keekorok Satin Finish",
    blurb: "Silky satin sheen - ideal for living rooms, hallways & feature walls.",
    category: "Paint",
    productType: "paint",
    categoryName: "Paint",
    isFeatured: true,
    isNewRelease: false,
    isExteriorGrade: false,
    roomTags: ["Living Room", "Dining Room", "Kids Room"],
    image: "",
    imageAlt: "",
    baseKes: { "1L": 950, "4L": 3200, "20L": 13500 },
    variants: [
      { variantId: "fv-2-1", size: "1L", listKes: 950, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-2-2", size: "4L", listKes: 3200, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-2-3", size: "20L", listKes: 13500, saleKes: null, stockTracking: false, available: null }
    ],
    specs: { washability: 4, coverage: 14, dryingMinutes: 120 }
  },
  {
    id: "fallback-3",
    slug: "keekorok-primer-sealer",
    name: "Keekorok Primer & Sealer",
    blurb: "Multi-surface primer for new plaster, timber & previously painted surfaces.",
    category: "Primer",
    productType: "primer",
    categoryName: "Primer",
    isFeatured: false,
    isNewRelease: false,
    isExteriorGrade: true,
    roomTags: ["Exterior", "Walls", "Ceilings"],
    image: "",
    imageAlt: "",
    baseKes: { "1L": 700, "4L": 2200, "20L": 9000 },
    variants: [
      { variantId: "fv-3-1", size: "1L", listKes: 700, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-3-2", size: "4L", listKes: 2200, saleKes: null, stockTracking: false, available: null },
      { variantId: "fv-3-3", size: "20L", listKes: 9000, saleKes: null, stockTracking: false, available: null }
    ],
    specs: { washability: 3, coverage: 10, dryingMinutes: 90 }
  }
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
      const productsRows = (await db.execute(sql`
        SELECT 
          p.id, 
          p.slug, 
          p.name, 
          p.short_description AS "shortDescription", 
          p.long_description AS "longDescription",
          p.product_type AS "productType", 
          p.is_featured AS "isFeatured", 
          p.is_new_release AS "isNewRelease", 
          p.is_exterior_grade AS "isExteriorGrade", 
          p.room_tags AS "roomTags",
          pc.name AS "categoryName",
          m.cdn_url AS "image",
          m.alt_text AS "imageAlt",
          ps.washability_rating AS "washability",
          ps.coverage_m2_per_l AS "coverage",
          ps.drying_time_minutes AS "dryingMinutes"
        FROM catalog.products p
        LEFT JOIN catalog.product_categories pc ON pc.id = p.category_id
        LEFT JOIN catalog.media_assets m ON m.owner_type = 'product' 
          AND m.owner_id = p.id 
          AND m.media_kind = 'image' 
          AND m.moderation_status = 'approved'
        LEFT JOIN catalog.paint_specs ps ON ps.product_id = p.id
        WHERE p.status = 'active'
        ORDER BY p.created_at
      `)).rows;

      if (!productsRows.length) return NextResponse.json(FALLBACK_PRODUCTS);

      const variants = (await db.execute(sql`
        SELECT 
          v.id AS "variantId",
          v.product_id AS "productId",
          v.pack_size_ml AS "sizeMl",
          v.list_price_minor / 100 AS "listKes",
          v.sale_price_minor / 100 AS "saleKes",
          v.stock_tracking AS "stockTracking",
          ii.on_hand_qty AS "onHand",
          ii.reserved_qty AS "reserved"
        FROM catalog.product_variants v
        LEFT JOIN catalog.inventory_items ii ON ii.variant_id = v.id
        WHERE v.is_active = true
        ORDER BY v.product_id, v.pack_size_ml
      `)).rows;

      const sizeMap: Record<string, string> = { "1000": "1L", "4000": "4L", "20000": "20L" };

      const prodMap = new Map<string, any>();
      for (const row of productsRows as any[]) {
        if (!prodMap.has(row.id)) {
          prodMap.set(row.id, {
            id: row.id,
            slug: row.slug,
            name: row.name,
            blurb: row.shortDescription || "",
            shortDescription: row.shortDescription || "",
            longDescription: row.longDescription || "",
            productType: row.productType,
            category: row.productType === "paint" ? "Paint" : row.productType === "primer" ? "Primer" : "Supplies",
            categoryName: row.categoryName || (row.productType === "paint" ? "Paint" : row.productType === "primer" ? "Primer" : "Supplies"),
            isFeatured: Boolean(row.isFeatured),
            isNewRelease: Boolean(row.isNewRelease),
            isExteriorGrade: Boolean(row.isExteriorGrade),
            roomTags: row.roomTags || [],
            image: row.image || "",
            imageAlt: row.imageAlt || "",
            specs: row.washability || row.coverage || row.dryingMinutes ? {
              washability: row.washability ? Number(row.washability) : null,
              coverage: row.coverage ? Number(row.coverage) : null,
              dryingMinutes: row.dryingMinutes ? Number(row.dryingMinutes) : null
            } : null
          });
        }
      }

      const result = Array.from(prodMap.values()).map((p) => {
        const prodVariants = variants
          .filter((v) => v.productId === p.id)
          .map((v) => {
            const szLabel = sizeMap[String(v.sizeMl)] || `${Number(v.sizeMl)/1000}L`;
            const isManaged = Boolean(v.stockTracking) && Number(v.onHand) > 0;
            const available = isManaged ? Math.max(0, Number(v.onHand) - Number(v.reserved)) : null;
            return {
              variantId: v.variantId,
              size: szLabel,
              listKes: Number(v.listKes),
              saleKes: v.saleKes !== null && v.saleKes !== undefined ? Number(v.saleKes) : null,
              stockTracking: Boolean(v.stockTracking),
              available
            };
          });

        const baseKes: Record<string, number> = {};
        prodVariants.forEach((v) => {
          baseKes[v.size] = v.saleKes !== null ? v.saleKes : v.listKes;
        });

        if (prodVariants.length === 0) {
          baseKes["4L"] = 0;
        }

        return {
          ...p,
          baseKes,
          variants: prodVariants
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
