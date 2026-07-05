import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

/* ─────────────────────────────────────────────────────────────────────────────
   /api/chat — customer-facing support + colour/product recommendation bot.

   Provider: NVIDIA's free OpenAI-compatible API (integrate.api.nvidia.com).
   Needs env NVIDIA_API_KEY (nvapi-...). Model overridable via NVIDIA_MODEL.

   Read-only: grounds prices/delivery/catalogue in live DB data, and may add
   general paint/decor advice. Never places orders or takes payment.
───────────────────────────────────────────────────────────────────────────── */

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";

const MAX_TURNS = 12;         // cap history sent upstream
const MAX_CHARS = 1500;       // per-message cap

const ALLOWED_ORIGINS = [
  "https://mic-mikes-paints.vercel.app",
  "https://www.micmikespaints.co.ke",
  "https://micmikespaints.co.ke",
  "http://localhost:5173",
  "http://localhost:3000",
];

type ChatMsg = { role: "user" | "assistant"; content: string };

// Build a compact, grounded knowledge block from live data (cached per warm instance).
let cachedContext: { text: string; at: number } | null = null;
async function buildContext(): Promise<string> {
  if (cachedContext && Date.now() - cachedContext.at < 5 * 60 * 1000) return cachedContext.text;
  let colours = "";
  let products = "";
  let delivery = "";
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const cRows = await sql`SELECT name, family, hex FROM colours ORDER BY family, name`;
    if (cRows.length) {
      const byFamily: Record<string, string[]> = {};
      for (const c of cRows) (byFamily[c.family as string] ??= []).push(`${c.name} (${c.hex})`);
      colours = Object.entries(byFamily).map(([f, list]) => `${f}: ${list.join(", ")}`).join("\n");
    }
    const pRows = await sql`
      SELECT p.name, p.category,
             MIN(v.price_kes) AS min_kes, MAX(v.price_kes) AS max_kes
      FROM products p LEFT JOIN variants v ON v.product_id = p.id
      WHERE p.active = true GROUP BY p.name, p.category ORDER BY p.name`;
    if (pRows.length) {
      products = pRows.map(p => `${p.name} (${p.category}) — KES ${p.min_kes}-${p.max_kes}`).join("\n");
    }
    const dRows = await sql`SELECT county, town, rate_kes FROM delivery_rates ORDER BY rate_kes LIMIT 20`;
    if (dRows.length) {
      delivery = dRows.map(d => `${d.county}${d.town ? `/${d.town}` : ""}: KES ${d.rate_kes}`).join("; ");
    }
  } catch { /* fall back to policy-only context */ }

  const text = [
    colours && `COLOURS (by family):\n${colours}`,
    products && `PRODUCTS (price range across 1L/4L/20L):\n${products}`,
    delivery && `DELIVERY RATES (sample): ${delivery}`,
  ].filter(Boolean).join("\n\n");
  cachedContext = { text, at: Date.now() };
  return text;
}

function systemPrompt(context: string): string {
  return `You are the friendly virtual assistant for MicMikes Paints (Keekorok Edition), a premium Kenyan paint brand based in Nairobi. You help customers choose colours and products, and answer questions about finishes, delivery, and payment.

STORE FACTS
- Payment: M-Pesa (STK push at checkout). Prices in Kenyan Shillings (KES).
- Sizes: 1L, 4L, 20L tins. Finishes: Matte, Eggshell, Satin, Semi-Gloss.
- Delivery: within Nairobi and beyond; FREE delivery on orders over KES 15,000.
- There is an interactive Room Visualizer on the site that previews colours on real room photos (walls only).
- For anything you cannot answer, suggest WhatsApp: https://wa.me/254712345678

LIVE CATALOGUE & RATES (ground all prices/colours/delivery in this):
${context || "(catalogue temporarily unavailable — give general guidance and suggest browsing the site)"}

STYLE
- Warm, concise, helpful. Kenyan context. Always quote prices in KES.
- You MAY give general painting and colour/decor advice from your own knowledge, but any price, colour name, or delivery figure MUST come from the catalogue above — never invent them. If a specific colour or price is not listed, say so and point to the Colour Explorer or WhatsApp.
- Recommend the Room Visualizer when a customer is choosing a colour.
- Keep replies short (2-5 sentences) unless asked for detail. Use plain hyphens, not em dashes.
- You cannot place orders or take payment; guide customers to add items to the cart and check out on the site.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.NVIDIA_API_KEY) {
    return res.status(503).json({ error: "Chat is not configured yet. Please try WhatsApp: https://wa.me/254712345678" });
  }

  const body = req.body as { messages?: ChatMsg[] };
  const history = Array.isArray(body?.messages) ? body.messages : [];
  const cleaned: ChatMsg[] = history
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") {
    return res.status(400).json({ error: "A user message is required" });
  }

  try {
    const context = await buildContext();
    const messages = [{ role: "system", content: systemPrompt(context) }, ...cleaned];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let upstream: Response;
    try {
      upstream = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.NVIDIA_MODEL || DEFAULT_MODEL,
          messages,
          temperature: 0.6,
          max_tokens: 500,
          stream: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error("[api/chat] NVIDIA error", upstream.status, detail.slice(0, 300));
      return res.status(502).json({ error: "The assistant is busy right now. Please try again, or reach us on WhatsApp." });
    }

    const data = (await upstream.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return res.status(502).json({ error: "No response. Please try again." });

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("[api/chat]", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
