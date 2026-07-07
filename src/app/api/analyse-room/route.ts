import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI analysis not configured" }, { status: 503 });
  }

  try {
    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: "Missing imageBase64 or mimeType" }, { status: 400 });
    }

    const upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "meta/llama-3.2-90b-vision-instruct",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                },
              },
              {
                type: "text",
                text: `You are a paint colour consultant for MicMikes Paints (Keekorok range, Kenya). Analyse this room photo. Return ONLY valid JSON with these keys: roomType (string), lighting ("bright"|"medium"|"dim"), dominantColors (string[], max 3 existing wall colours you see), suggestedShades (string[], exactly 3 Keekorok shade names chosen from: Brilliant White, Antique White, Ivory Cream, Stone Grey, Warm Pebble, Slate, Desert Sand, Warm Caramel, Dark Walnut, Mint Breeze, Sage Meadow, Forest Deep, Sky Mist, Ocean Breeze, Deep Navy, Sunflower, Mango, Terracotta, Rose Blush, Crimson), recommendation (string, ≤ 60 words, friendly tone, mentions at least one shade by name).`,
              },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return NextResponse.json({ error: `NVIDIA vision API returned ${upstream.status}: ${detail}` }, { status: 500 });
    }

    const data = await upstream.json() as any;
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    const parsed = parseJSON(content);
    if (!parsed) {
      return NextResponse.json({
        recommendation: "Upload a clearer photo and I'll suggest the perfect Keekorok shade for your room!",
      });
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "An unexpected error occurred during room analysis." }, { status: 500 });
  }
}

function parseJSON(text: string) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : JSON.parse(text);
  } catch {
    return null;
  }
}
