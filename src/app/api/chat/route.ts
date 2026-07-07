import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const MODEL_CHAIN = [
  "z-ai/glm-5.2",
  "deepseek-ai/deepseek-v4-pro",
  "moonshotai/kimi-k2.6",
];

const MODEL_TIMEOUT: Record<string, number> = {
  "z-ai/glm-5.2":                 15_000,
  "deepseek-ai/deepseek-v4-pro":  20_000,
  "moonshotai/kimi-k2.6":         18_000,
};
const DEFAULT_TIMEOUT = 18_000;

const MAX_TURNS = 10;
const MAX_CHARS = 1200;

type ChatMsg = { role: "user" | "assistant"; content: string };

let cachedContext: { text: string; at: number } | null = null;

async function buildContext(): Promise<string> {
  if (cachedContext && Date.now() - cachedContext.at < 5 * 60 * 1000) {
    return cachedContext.text;
  }

  let colours = "";
  let products = "";
  let delivery = "";

  try {
    const cRows = (await db.execute(sql`
      SELECT s.name, f.name AS family, s.hex_value AS hex
      FROM catalog.shades s
      LEFT JOIN catalog.colour_families f ON f.id = s.family_id
      WHERE s.is_active = true
      ORDER BY f.name, s.name
    `)).rows;

    if (cRows.length > 0) {
      const byFamily: Record<string, string[]> = {};
      for (const c of cRows) {
        const fam = String(c.family || "Neutrals");
        (byFamily[fam] ??= []).push(`${c.name} (${c.hex})`);
      }
      colours = Object.entries(byFamily)
        .map(([f, list]) => `${f}: ${list.join(", ")}`)
        .join("\n");
    }

    const pRows = (await db.execute(sql`
      SELECT p.name, p.slug, p.product_type AS category,
             MIN(v.list_price_minor) / 100 AS min_kes, MAX(v.list_price_minor) / 100 AS max_kes
      FROM catalog.products p
      LEFT JOIN catalog.product_variants v ON v.product_id = p.id
      WHERE p.status = 'active'
      GROUP BY p.name, p.slug, p.product_type
      ORDER BY p.name
    `)).rows;

    if (pRows.length > 0) {
      products = pRows
        .map(p => `${p.name} (${p.category}) - KES ${p.min_kes ?? "?"}-${p.max_kes ?? "?"}`)
        .join("\n");
    }

    const dRows = (await db.execute(sql`
      SELECT county_code AS county, locality AS town, base_fee_minor / 100 AS rate_kes
      FROM delivery.delivery_zones
      WHERE is_active = true
      ORDER BY rate_kes
      LIMIT 30
    `)).rows;

    if (dRows.length > 0) {
      delivery = dRows
        .map(d => `${d.county}${d.town ? `/${d.town}` : ""}: KES ${d.rate_kes}`)
        .join("; ");
    }
  } catch (e) {
    console.error("[api/chat] buildContext error:", e);
  }

  const text = [
    colours  ? `COLOURS (by family):\n${colours}`  : "",
    products ? `PRODUCTS (price range):\n${products}` : "",
    delivery ? `DELIVERY RATES: ${delivery}`        : "",
  ].filter(Boolean).join("\n\n");

  cachedContext = { text, at: Date.now() };
  return text;
}

function systemPrompt(context: string): string {
  const catalogue = context ||
    "(Live catalogue unavailable right now. Tell the customer to browse the website or contact us on WhatsApp.)";

  return `You are the MicMikes Paints virtual assistant. MicMikes Paints is a premium Kenyan paint brand (Keekorok Edition) based in Nairobi.

YOUR ONLY JOB
You answer questions EXCLUSIVELY about MicMikes Paints products, colours, finishes, sizes, prices, delivery, payment (M-Pesa), and the Room Visualizer feature on the website. Nothing else.

STRICT RULES
1. ONLY use information from the LIVE CATALOGUE below. Never invent a colour name, product name, price or delivery rate that is not listed there.
2. If a question is not about MicMikes Paints (e.g. general knowledge, other brands, coding, weather, politics), reply: "I can only help with MicMikes Paints products and services. For anything else, please visit the website or contact us on WhatsApp: https://wa.me/254712345678"
3. If a specific colour, product or delivery area is not in the catalogue, say it is not listed and direct the customer to the website or WhatsApp.
4. Never place orders, never take payment, never promise stock availability not confirmed in the catalogue.
5. Always quote prices in KES.

STORE FACTS
- Payment: M-Pesa via STK push at checkout on the website.
- Tin sizes: 1L, 4L, 20L. Finishes: Matte, Eggshell, Satin, Semi-Gloss.
- Free delivery on orders over KES 15,000.
- Room Visualizer: interactive tool on the site - lets customers preview colours on real room photos (walls only).
- WhatsApp support: https://wa.me/254712345678
- Website: https://mic-mikes-paints.vercel.app

LIVE CATALOGUE (ground every answer in this data):
${catalogue}

STYLE
- Warm, friendly, concise. Kenyan context.
- 2-4 sentences per reply unless the customer asks for detail.
- Use plain hyphens (-), not em dashes.
- Recommend the Room Visualizer whenever a customer is deciding on a colour.`;
}

async function callNvidia(model: string, messages: any[], apiKey: string): Promise<string | null> {
  const timeout = MODEL_TIMEOUT[model] ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
    console.warn(`[api/chat] ${model} timed out after ${timeout}ms`);
  }, timeout);

  try {
    const upstream = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        top_p: 0.9,
        max_tokens: 400,
        stream: false,
        ...(model.includes("deepseek") ? { extra_body: { chat_template_kwargs: { thinking: false } } } : {}),
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error(`[api/chat] ${model} HTTP ${upstream.status}: ${detail.slice(0, 200)}`);
      return null;
    }

    const data = (await upstream.json()) as any;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    if (!(err instanceof Error && err.name === "AbortError")) {
      console.error(`[api/chat] ${model} error:`, err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: "Chat is temporarily unavailable. Please reach us on WhatsApp: https://wa.me/254712345678",
    }, { status: 503 });
  }

  try {
    const { messages } = await req.json();
    const history = Array.isArray(messages) ? messages : [];
    const cleaned: ChatMsg[] = history
      .filter(
        m =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      )
      .slice(-MAX_TURNS)
      .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS).trim() }));

    if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") {
      return NextResponse.json({ error: "A user message is required." }, { status: 400 });
    }

    const context = await buildContext();
    const formattedMessages = [
      { role: "system", content: systemPrompt(context) },
      ...cleaned,
    ];

    const envModel = process.env.NVIDIA_MODEL;
    const chain = envModel
      ? [envModel, ...MODEL_CHAIN.filter(m => m !== envModel)]
      : MODEL_CHAIN;

    let reply: string | null = null;
    let usedModel = "";

    for (const model of chain) {
      console.log(`[api/chat] trying ${model}...`);
      reply = await callNvidia(model, formattedMessages, apiKey);
      if (reply) {
        usedModel = model;
        if (model !== chain[0]) {
          console.warn(`[api/chat] primary failed - served by fallback: ${model}`);
        }
        break;
      }
    }

    if (!reply) {
      console.error(`[api/chat] all models failed. chain: ${chain.join(", ")}`);
      return NextResponse.json({
        error: "Our assistant is currently busy. Please try again in a moment, or reach us on WhatsApp: https://wa.me/254712345678",
      }, { status: 502 });
    }

    return NextResponse.json({ reply, model: usedModel });
  } catch (err) {
    console.error("[api/chat] unexpected error:", err);
    return NextResponse.json({
      error: "Something went wrong. Please try again or contact us on WhatsApp.",
    }, { status: 500 });
  }
}
