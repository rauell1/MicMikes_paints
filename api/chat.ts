import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

/* ─────────────────────────────────────────────────────────────────────────────
   /api/chat - MicMikes Paints customer assistant.

   Provider  : NVIDIA free OpenAI-compatible API (integrate.api.nvidia.com)
   Env needed: NVIDIA_API_KEY   (nvapi-...)
               NVIDIA_MODEL     (optional override of primary)

   Fallback chain (tried in order, first success wins):
     1. z-ai/glm-5.2                (53B,  1M ctx, agentic + reasoning)
     2. deepseek-ai/deepseek-v4-pro (reasoning, coding, general)
     3. moonshotai/kimi-k2.6        (vision-capable, multimodal)

   Strictly grounded: ONLY answers questions about MicMikes products,
   colours, prices, delivery, payment and the Room Visualizer.
   Refuses all off-topic requests. Never invents data.
───────────────────────────────────────────────────────────────────────────── */

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// Ordered fallback chain - tried left-to-right until one succeeds
const MODEL_CHAIN = [
  "z-ai/glm-5.2",
  "deepseek-ai/deepseek-v4-pro",
  "moonshotai/kimi-k2.6",
];

// Per-model timeout in ms. DeepSeek can be slower due to thinking steps.
const MODEL_TIMEOUT: Record<string, number> = {
  "z-ai/glm-5.2":                 15_000,
  "deepseek-ai/deepseek-v4-pro":  20_000,
  "moonshotai/kimi-k2.6":         18_000,
};
const DEFAULT_TIMEOUT = 18_000;

const MAX_TURNS = 10;   // cap history sent upstream
const MAX_CHARS = 1200; // per-message char cap

const ALLOWED_ORIGINS = [
  "https://mic-mikes-paints.vercel.app",
  "https://www.micmikespaints.co.ke",
  "https://micmikespaints.co.ke",
  "http://localhost:5173",
  "http://localhost:3000",
];

type ChatMsg = { role: "user" | "assistant"; content: string };

/* ── Live catalogue context (cached 5 min per warm serverless instance) ─── */
let cachedContext: { text: string; at: number } | null = null;

async function buildContext(): Promise<string> {
  if (cachedContext && Date.now() - cachedContext.at < 5 * 60 * 1000)
    return cachedContext.text;

  let colours = "";
  let products = "";
  let delivery = "";

  try {
    const sql = neon(process.env.DATABASE_URL!);

    const cRows = await sql`SELECT name, family, hex FROM colours ORDER BY family, name`;
    if (cRows.length) {
      const byFamily: Record<string, string[]> = {};
      for (const c of cRows)
        (byFamily[c.family as string] ??= []).push(`${c.name} (${c.hex})`);
      colours = Object.entries(byFamily)
        .map(([f, list]) => `${f}: ${list.join(", ")}`)
        .join("\n");
    }

    const pRows = await sql`
      SELECT p.name, p.slug, p.category,
             MIN(v.price_kes) AS min_kes, MAX(v.price_kes) AS max_kes
      FROM products p
      LEFT JOIN variants v ON v.product_id = p.id
      WHERE p.active = true
      GROUP BY p.name, p.slug, p.category
      ORDER BY p.name`;
    if (pRows.length) {
      products = pRows
        .map(p => `${p.name} (${p.category}) - KES ${p.min_kes ?? "?"}-${p.max_kes ?? "?"}`)
        .join("\n");
    }

    const dRows = await sql`
      SELECT county, town, rate_kes FROM delivery_rates ORDER BY rate_kes LIMIT 30`;
    if (dRows.length) {
      delivery = dRows
        .map(d => `${d.county}${d.town ? `/${d.town}` : ""}: KES ${d.rate_kes}`)
        .join("; ");
    }
  } catch (e) {
    console.error("[api/chat] buildContext error:", e);
    // proceed with empty context - system prompt handles it gracefully
  }

  const text = [
    colours  ? `COLOURS (by family):\n${colours}`  : "",
    products ? `PRODUCTS (price range):\n${products}` : "",
    delivery ? `DELIVERY RATES: ${delivery}`        : "",
  ].filter(Boolean).join("\n\n");

  cachedContext = { text, at: Date.now() };
  return text;
}

/* ── System prompt - strictly grounded to MicMikes website only ─────────── */
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

/* ── Single model call with per-model timeout ───────────────────────────── */
async function callNvidia(
  model: string,
  messages: object[],
  apiKey: string,
): Promise<string | null> {
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
        temperature: 0.4,   // lower = more factual, less hallucination
        top_p: 0.9,
        max_tokens: 400,
        stream: false,
        // suppress internal reasoning tokens for DeepSeek
        ...(model.includes("deepseek") ? { extra_body: { chat_template_kwargs: { thinking: false } } } : {}),
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error(`[api/chat] ${model} HTTP ${upstream.status}: ${detail.slice(0, 200)}`);
      return null;
    }

    const data = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = data.choices?.[0]?.message?.content?.trim();
    return reply || null;

  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    if (!isAbort) console.error(`[api/chat] ${model} error:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Route handler ──────────────────────────────────────────────────────── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin))
    res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "Chat is temporarily unavailable. Please reach us on WhatsApp: https://wa.me/254712345678",
    });
  }

  // Parse + sanitise message history
  const body = req.body as { messages?: ChatMsg[] };
  const history = Array.isArray(body?.messages) ? body.messages : [];
  const cleaned: ChatMsg[] = history
    .filter(
      m =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-MAX_TURNS)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS).trim() }));

  if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") {
    return res.status(400).json({ error: "A user message is required." });
  }

  try {
    const context  = await buildContext();
    const messages = [
      { role: "system", content: systemPrompt(context) },
      ...cleaned,
    ];

    // Build chain: NVIDIA_MODEL env override goes first if set
    const envModel = process.env.NVIDIA_MODEL;
    const chain = envModel
      ? [envModel, ...MODEL_CHAIN.filter(m => m !== envModel)]
      : MODEL_CHAIN;

    let reply: string | null = null;
    let usedModel = "";

    for (const model of chain) {
      console.log(`[api/chat] trying ${model}...`);
      reply = await callNvidia(model, messages, apiKey);
      if (reply) {
        usedModel = model;
        if (model !== chain[0])
          console.warn(`[api/chat] primary failed - served by fallback: ${model}`);
        break;
      }
    }

    if (!reply) {
      console.error(`[api/chat] all models failed. chain: ${chain.join(", ")}`);
      return res.status(502).json({
        error:
          "Our assistant is currently busy. Please try again in a moment, or reach us on WhatsApp: https://wa.me/254712345678",
      });
    }

    return res.status(200).json({ reply, model: usedModel });

  } catch (err) {
    console.error("[api/chat] unexpected error:", err);
    return res.status(500).json({
      error: "Something went wrong. Please try again or contact us on WhatsApp.",
    });
  }
}
