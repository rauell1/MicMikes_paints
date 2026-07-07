import { Client } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL env var is missing!");
  process.exit(1);
}

const SQL_FILES = [
  "001_schemas.sql",
  "002_micmikes_vendor.sql",
  "003_mpesa_payment_method.sql",
  "004_nairobi_delivery_zone.sql",
  "005_kenya_vat.sql",
  "006_colour_families.sql",
  "007_finishes.sql",
  "008_data_migration.sql"
];

async function main() {
  console.log("🚀 Starting database evolution and data migration...");

  const client = new Client(databaseUrl);
  await client.connect();
  console.log("🔌 Connected to Neon Database via WebSocket client.");

  try {
    const seedsDir = path.join(process.cwd(), "db", "seeds");

    for (const filename of SQL_FILES) {
      const filePath = path.join(seedsDir, filename);
      console.log(`\n📄 Reading ${filename}...`);
      
      if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
      }

      const sqlContent = fs.readFileSync(filePath, "utf-8");
      console.log(`⚡ Executing ${filename} against database...`);
      
      try {
        // Execute the raw SQL content (allows multiple statements)
        await client.query(sqlContent);
        console.log(`✅ Successfully executed ${filename}`);
      } catch (err) {
        console.error(`❌ Error executing ${filename}:`, err);
        process.exit(1);
      }
    }

    console.log("\n📊 Running data migration verification...");
    try {
      const checkCounts = async (desc: string, publicQuery: string, newQuery: string) => {
        const publicRes = await client.query(publicQuery);
        const newRes = await client.query(newQuery);
        const publicCount = parseInt(publicRes.rows[0]?.count ?? "0", 10);
        const newCount = parseInt(newRes.rows[0]?.count ?? "0", 10);
        const match = publicCount === newCount ? "✅ MATCH" : "⚠️ MISMATCH";
        console.log(` - ${desc.padEnd(25)} | Public: ${String(publicCount).padEnd(5)} | New Schema: ${String(newCount).padEnd(5)} | ${match}`);
      };

      console.log("\n-------------------------------------------------------------");
      console.log(" Table Name                 | Public | New Schema | Match Status");
      console.log("-------------------------------------------------------------");
      await checkCounts("Colours vs Shades", "SELECT count(*)::text as count FROM public.colours", "SELECT count(*)::text as count FROM catalog.shades");
      await checkCounts("Products", "SELECT count(*)::text as count FROM public.products", "SELECT count(*)::text as count FROM catalog.products");
      await checkCounts("Variants", "SELECT count(*)::text as count FROM public.variants", "SELECT count(*)::text as count FROM catalog.product_variants");
      await checkCounts("Stock vs Inventory Items", "SELECT count(*)::text as count FROM public.product_stock", "SELECT count(*)::text as count FROM catalog.inventory_items");
      await checkCounts("Orders", "SELECT count(*)::text as count FROM public.orders", "SELECT count(*)::text as count FROM commerce.orders");
      await checkCounts("Order Items", "SELECT count(*)::text as count FROM public.order_items", "SELECT count(*)::text as count FROM commerce.order_items");
      await checkCounts("M-Pesa Payments", "SELECT count(*)::text as count FROM public.mpesa_payments", "SELECT count(*)::text as count FROM payment.payment_attempts");
      await checkCounts("Rooms vs Saved Rooms", "SELECT count(*)::text as count FROM public.rooms", "SELECT count(*)::text as count FROM customer.saved_rooms WHERE customer_id = '88d8bd7f-94d3-488f-a0bb-26aa77dd8e10'");
      await checkCounts("Rates vs Zones", "SELECT count(*)::text as count FROM public.delivery_rates", "SELECT count(*)::text as count FROM delivery.delivery_zones");
      await checkCounts("Cart Events vs Analytics", "SELECT count(*)::text as count FROM public.cart_events", "SELECT count(*)::text as count FROM analytics.events");
      console.log("-------------------------------------------------------------");
      
      // Check seed items too
      const vendorRes = await client.query("SELECT count(*)::text as count FROM vendor.vendors");
      const pmRes = await client.query("SELECT count(*)::text as count FROM payment.payment_methods");
      const taxRes = await client.query("SELECT count(*)::text as count FROM regulatory.tax_rules");
      
      console.log(`\n🌱 Seed checks:`);
      console.log(` - Vendors: ${vendorRes.rows[0].count}`);
      console.log(` - Payment Methods: ${pmRes.rows[0].count}`);
      console.log(` - Tax Rules: ${taxRes.rows[0].count}`);

      console.log("\n🎉 E-Commerce database evolution and data migration completed successfully!");
    } catch (err) {
      console.error("❌ Verification failed:", err);
    }
  } finally {
    await client.end();
    console.log("🔌 Database connection closed.");
  }
}

main();
