import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const results: any = {
    env: {
      has_database_url: !!process.env.DATABASE_URL,
      has_admin_password: !!process.env.ADMIN_PASSWORD,
      has_admin_jwt_secret: !!process.env.ADMIN_JWT_SECRET,
      vercel_env: process.env.VERCEL_ENV || 'unknown',
    },
    db: {
      connected: false,
      error: null,
      products_count: 0,
      media_assets_count: 0,
      saved_rooms_count: 0,
      old_rooms_table_exists: false,
    }
  };

  try {
    const testQuery = await db.execute(sql`SELECT 1 as val`);
    results.db.connected = testQuery.rows.length > 0;
  } catch (e: any) {
    results.db.error = e.message;
    return NextResponse.json(results);
  }

  try {
    const products = await db.execute(sql`SELECT COUNT(*)::int as count FROM catalog.products`);
    results.db.products_count = products.rows[0]?.count ?? 0;

    const media = await db.execute(sql`SELECT COUNT(*)::int as count FROM catalog.media_assets`);
    results.db.media_assets_count = media.rows[0]?.count ?? 0;

    const rooms = await db.execute(sql`SELECT COUNT(*)::int as count FROM customer.saved_rooms`);
    results.db.saved_rooms_count = rooms.rows[0]?.count ?? 0;

    const checkOldRooms = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'rooms'
      ) as exists
    `);
    results.db.old_rooms_table_exists = checkOldRooms.rows[0]?.exists ?? false;

  } catch (e: any) {
    results.db.error = "Error querying tables: " + e.message;
  }

  return NextResponse.json(results);
}
