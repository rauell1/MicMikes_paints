/**
 * DEPRECATED — This monolithic handler has been split into dedicated route files:
 *
 *   POST /api/mpesa/stkpush   → api/mpesa/stkpush.ts
 *   POST /api/mpesa/callback  → api/mpesa/callback.ts
 *   GET  /api/mpesa/status/[id] → api/mpesa/status/[id].ts
 *
 * This file is intentionally kept as a 410 stub so that any stale
 * clients or Safaricom sandbox callbacks pointed at the old ?action= URL
 * receive a clear, permanent-gone signal rather than a silent 404.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(410).json({
    error:
      "This endpoint has moved. Use POST /api/mpesa/stkpush, POST /api/mpesa/callback, or GET /api/mpesa/status/:id.",
  });
}
