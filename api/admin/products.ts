import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = crypto.createHmac("sha256", process.env.ADMIN_JWT_SECRET!).update(payload).digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    const ts = parseInt(payload, 10);
    return !isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000;
  } catch { return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAdminToken(req.cookies?.["mm-admin-token"] as string | undefined))
    return res.status(401).json({ error: "Unauthorized" });

  const sql = neon(process.env.DATABASE_URL!);

  if (req.method === "GET") {
    const rows = await sql`
      SELECT p.id, p.slug, p.name, p.blurb, p.category, p.image_url,
        json_agg(json_build_object('id', v.id, 'size', v.size, 'price_kes', v.price_kes) ORDER BY v.size) AS variants
      FROM products p LEFT JOIN variants v ON v.product_id = p.id
      GROUP BY p.id ORDER BY p.category, p.name`;
    return res.json(rows);
  }
  if (req.method === "POST") {
    const { slug, name, blurb, category, image_url } = req.body;
    const [prod] = await sql`INSERT INTO products (id, slug, name, blurb, category, image_url) VALUES (gen_random_uuid(), ${slug}, ${name}, ${blurb}, ${category}, ${image_url}) RETURNING id, slug, name, blurb, category, image_url`;
    await sql`INSERT INTO variants (id, product_id, size, price_kes) VALUES (gen_random_uuid(), ${prod.id}, '1L', 0),(gen_random_uuid(), ${prod.id}, '4L', 0),(gen_random_uuid(), ${prod.id}, '20L', 0)`;
    return res.status(201).json(prod);
  }
  if (req.method === "PUT") {
    const { id, slug, name, blurb, category, image_url } = req.body;
    const [row] = await sql`UPDATE products SET slug=${slug}, name=${name}, blurb=${blurb}, category=${category}, image_url=${image_url} WHERE id=${id} RETURNING id, slug, name, blurb, category, image_url`;
    return res.json(row);
  }
  if (req.method === "DELETE") {
    const { id } = req.body;
    await sql`DELETE FROM variants WHERE product_id=${id}`;
    await sql`DELETE FROM products WHERE id=${id}`;
    return res.json({ ok: true });
  }
  res.status(405).end();
}
