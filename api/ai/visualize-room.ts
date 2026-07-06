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

  const prompt = `Edit this ${roomType || 'room'} photo by repainting the main wall surfaces with ${colorName || 'the selected paint color'} (${hex}). Preserve all furniture, structure, perspective, shadows, windows, floors, ceiling, and decor exactly. Keep the result photorealistic and suitable for an interior paint preview.`;

  try {
    const result = await visualizeRoomEdit(imageDataUrl, prompt);
    return res.status(200).json({ ok: true, result });
  } catch (err: any) {
    console.error('[visualize-room]', err);
    return res.status(500).json({ error: err.message || 'Visualization failed' });
  }
}
