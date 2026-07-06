import type { VercelRequest, VercelResponse } from '@vercel/node';
import { visualizeRoomEdit } from '../lib/ai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (process.env.AI_VISUALIZER_ENABLED !== 'true') {
    return res.status(403).json({ error: 'AI visualizer is not enabled' });
  }

  const { imageDataUrl, colorName, hex, roomType } = req.body || {};

  if (!imageDataUrl || !hex) {
    return res.status(400).json({ error: 'imageDataUrl and hex are required' });
  }

  if (!imageDataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image format' });
  }

  const prompt = `Repaint the main wall surfaces in this ${roomType || 'room'} with the paint color "${colorName || 'selected color'}" (hex ${hex}). Preserve all furniture, fixtures, floors, ceiling, windows, doors, and room structure exactly. Make the result photorealistic and natural-looking, suitable for an interior paint preview.`;

  try {
    const result = await visualizeRoomEdit(imageDataUrl, prompt);
    return res.status(200).json({ ok: true, result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Visualization failed. Please try again.' });
  }
}
