import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const log: string[] = [];
  log.push("Starting database migration on Vercel server...");

  try {
    // 1. Clear existing media assets for products and customer_rooms to start clean
    await db.execute(sql`DELETE FROM catalog.media_assets WHERE owner_type IN ('product', 'customer_room')`);
    log.push("Cleared existing product and room media assets.");

    // 2. Fetch old products and their image URLs
    const oldProducts = (await db.execute(sql`
      SELECT id, slug, name, image_url 
      FROM public.products 
      WHERE image_url IS NOT NULL AND image_url != ''
    `)).rows;
    log.push(`Found ${oldProducts.length} old products with image_url.`);

    for (const p of oldProducts) {
      const mediaId = crypto.randomUUID();
      const mimeType = String(p.image_url).includes('.png') ? 'image/png' : 'image/jpeg';
      
      // Insert into media_assets
      await db.execute(sql`
        INSERT INTO catalog.media_assets (id, owner_type, owner_id, media_kind, storage_key, cdn_url, mime_type, moderation_status)
        VALUES (${mediaId}, 'product', ${p.id}, 'image', ${p.image_url}, ${p.image_url}, ${mimeType}, 'approved')
      `);
      log.push(`Migrated product image for ${p.name} (${p.slug})`);
    }

    // 3. Fetch old rooms and their photo URLs / wall masks
    const oldRooms = (await db.execute(sql`
      SELECT id, name, photo_url, wall_mask 
      FROM public.rooms 
      WHERE photo_url IS NOT NULL AND photo_url != ''
    `)).rows;
    log.push(`Found ${oldRooms.length} old rooms with photo_url.`);

    for (const r of oldRooms) {
      const mediaId = crypto.randomUUID();
      const mimeType = String(r.photo_url).includes('.png') ? 'image/png' : 'image/jpeg';

      // Insert into media_assets
      await db.execute(sql`
        INSERT INTO catalog.media_assets (id, owner_type, owner_id, media_kind, storage_key, cdn_url, mime_type, moderation_status)
        VALUES (${mediaId}, 'customer_room', ${r.id}, 'visualizer', ${r.wall_mask || r.photo_url}, ${r.photo_url}, ${mimeType}, 'approved')
      `);

      // Update customer.saved_rooms pointing to media_assets
      const updated = (await db.execute(sql`
        UPDATE customer.saved_rooms
        SET media_id = ${mediaId}
        WHERE id = ${r.id}
        RETURNING id, room_name
      `)).rows;

      if (updated.length > 0) {
        log.push(`Migrated room image for ${r.name} and updated saved_rooms`);
      } else {
        log.push(`Migrated room image for ${r.name} but room ID not found in customer.saved_rooms`);
      }
    }

    log.push("Migration finished successfully!");
    return NextResponse.json({ success: true, log });
  } catch (err: any) {
    log.push(`Migration failed: ${err.message}`);
    return NextResponse.json({ success: false, log }, { status: 500 });
  }
}
