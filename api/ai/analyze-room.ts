import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeRoomImage, generateRecommendationText, moderateImage } from '../lib/ai';

function getCatalogContext() {
  return `MicMikes Paints Kenya sells Keekorok premium decorative paints: emulsion, eggshell, satin, semi-gloss.
Available colours include Neutrals, Warm Earth, Cool Green, Blue, Red & Terracotta, Yellow & Gold families.
Pricing: 1L from KES 850, 4L from KES 2800, 20L from KES 11500. Free delivery on all orders.
Recommend specific finish types (matte for low-traffic, satin/semi-gloss for kitchens/bathrooms) and prep advice.`;
}

function safeJsonParse(text: string) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

function extractText(payload: any) {
  return payload?.choices?.[0]?.message?.content || '';
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

  if (!imageDataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image format' });
  }

  try {
    // Safety check
    try {
      const moderation = await moderateImage(imageDataUrl);
      const modText = extractText(moderation);
      const modJson = safeJsonParse(modText);
      if (modJson && modJson.allowed === false) {
        return res.status(400).json({ error: modJson.reason || 'Image not suitable for analysis' });
      }
    } catch {
      // Safety check failure is non-blocking — proceed
    }

    // Room analysis
    const analysisRaw = await analyzeRoomImage(imageDataUrl);
    const analysisText = extractText(analysisRaw);
    const analysis = safeJsonParse(analysisText);

    if (!analysis) {
      return res.status(502).json({ error: 'Could not parse room analysis. Please try a clearer photo.' });
    }

    // Product recommendation
    let recommendation = null;
    try {
      const recRaw = await generateRecommendationText(analysis, getCatalogContext());
      const recText = extractText(recRaw);
      recommendation = safeJsonParse(recText);
    } catch {
      // Recommendation is best-effort
    }

    return res.status(200).json({ ok: true, analysis, recommendation });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'AI analysis failed. Please try again.' });
  }
}
