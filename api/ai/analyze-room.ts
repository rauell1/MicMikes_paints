import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeRoomImage, generateRecommendationText, moderateImage } from '../lib/ai';

function getCatalogContext() {
  return `
Mic Mikes Paints sells the Keekorok range — decorative and protective paints for Kenyan homes.
Products include: Premium Emulsion (interior walls/ceilings), Satin Finish (feature walls/hallways), Primer & Sealer (new plaster/timber).
Pricing: 1L from KES 700, 4L from KES 2200, 20L from KES 9000.
Recommend finish type, room suitability, and prep advice.
`;
}

function extractText(payload: any): string {
  return payload?.choices?.[0]?.message?.content || '';
}

function safeJsonParse(text: string): any | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : JSON.parse(text);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (process.env.AI_ROOM_ANALYZER_ENABLED !== 'true') {
    return res.status(403).json({ error: 'Room analyzer is not enabled' });
  }

  const { imageDataUrl } = req.body || {};
  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    return res.status(400).json({ error: 'imageDataUrl is required' });
  }

  try {
    // Step 1: Safety check
    const modRaw = await moderateImage(imageDataUrl);
    const modJson = safeJsonParse(extractText(modRaw));
    if (modJson && modJson.allowed === false) {
      return res.status(400).json({ error: modJson.reason || 'Image not suitable for analysis' });
    }

    // Step 2: Room analysis
    const analysisRaw = await analyzeRoomImage(imageDataUrl);
    const analysis = safeJsonParse(extractText(analysisRaw));
    if (!analysis) return res.status(502).json({ error: 'Failed to parse room analysis from AI' });

    // Step 3: Product recommendation text
    const recRaw = await generateRecommendationText(analysis, getCatalogContext());
    const recommendation = safeJsonParse(extractText(recRaw));

    return res.status(200).json({ ok: true, analysis, recommendation });
  } catch (err: any) {
    console.error('[analyze-room]', err);
    return res.status(500).json({ error: err.message || 'AI analysis failed' });
  }
}
