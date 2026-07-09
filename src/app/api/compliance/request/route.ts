import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";
import { sanitizeEmail } from "@/lib/sanitize";
import { EmailService } from "@/server/notifications/email.service";

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, type } = await req.json();

    if (!rawEmail || !type || !["export", "delete"].includes(type)) {
      return NextResponse.json({ error: "Email and valid request type ('export' or 'delete') are required." }, { status: 400 });
    }

    const email = sanitizeEmail(rawEmail);

    // 1. Check if the customer exists
    const customerRow = (await db.execute(sql`
      SELECT id, email, phone_e164 as phone, full_name as name, status, 
             marketing_opt_in as "marketingOptIn", analytics_consent as "analyticsConsent", created_at as "createdAt"
      FROM customer.customers
      WHERE LOWER(email) = LOWER(${email})
      LIMIT 1
    `)).rows;

    if (customerRow.length === 0) {
      return NextResponse.json({ error: "No customer profile found with this email address." }, { status: 404 });
    }

    const customer = customerRow[0] as any;
    const customerId = customer.id;

    if (type === "export") {
      // 2. Set export requested timestamp
      await db.execute(sql`
        UPDATE customer.customers
        SET data_export_requested_at = NOW(), updated_at = NOW()
        WHERE id = ${customerId}
      `);

      // 3. Compile customer details, addresses, orders & items
      const addresses = (await db.execute(sql`
        SELECT id, county_code as county, locality as town, estate, building_name as building, house_unit as unit, recipient_name as recipient, recipient_phone_e164 as phone, latitude, longitude, is_default as "isDefault", created_at as "createdAt"
        FROM customer.addresses
        WHERE customer_id = ${customerId}
        ORDER BY created_at DESC
      `)).rows;

      const orders = (await db.execute(sql`
        SELECT id, order_number as "orderNumber", status, currency_code as currency, 
               subtotal_minor / 100 as subtotal_kes, shipping_minor / 100 as delivery_kes, total_minor / 100 as total_kes, 
               placed_at as "placedAt"
        FROM commerce.orders
        WHERE customer_id = ${customerId}
        ORDER BY placed_at DESC
      `)).rows;

      // Compile order items for each order
      const compiledOrders = [];
      for (const order of orders) {
        const items = (await db.execute(sql`
          SELECT variant_id as "variantId", shade_name as "colourName", finish_name as "finish", pack_size_ml as "sizeMl", quantity, unit_price_minor / 100 as "unitPriceKes"
          FROM commerce.order_items
          WHERE order_id = ${order.id}
        `)).rows;
        compiledOrders.push({
          ...order,
          items,
        });
      }

      // Notify the customer of data export via console/email
      await EmailService.sendEmail({
        to: email,
        subject: "Your MicMikes Paints Data Subject Access Request (Export)",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e8dcc7; background: #F8F4EF; border-radius: 12px;">
            <h2 style="color: #B84A32; font-family: Georgia, serif;">MicMikes Paints Compliance</h2>
            <p>Hello ${customer.name || "Customer"},</p>
            <p>We received a Data Subject Access Request (DSAR) under the <strong>Kenya Data Protection Act, 2019</strong> to export your customer profile and purchase data.</p>
            <p>Your data was compiled and downloaded directly from our website rights portal. For your records, this includes:</p>
            <ul>
              <li>Your customer profile information and consents</li>
              <li>Saved shipping addresses</li>
              <li>Purchase and M-Pesa payment history</li>
            </ul>
            <p>If you did not authorize this request, please contact our Data Protection Officer immediately at <a href="mailto:privacy@micmikespaints.co.ke" style="color: #B84A32;">privacy@micmikespaints.co.ke</a>.</p>
            <hr style="border: 0; border-top: 1px solid #d4c8b0; margin: 20px 0;" />
            <p style="font-size: 11px; color: #7b7468;">MicMikes Paints Limited · Keekorok Road, Nairobi, Kenya</p>
          </div>
        `,
      }).catch(err => console.error("Compliance email fail:", err));

      return NextResponse.json({
        customer,
        addresses,
        orders: compiledOrders,
      });

    } else if (type === "delete") {
      // 4. Set deletion requested timestamp and disable customer account
      await db.execute(sql`
        UPDATE customer.customers
        SET deletion_requested_at = NOW(), status = 'disabled', updated_at = NOW()
        WHERE id = ${customerId}
      `);

      // Notify the customer of data erasure request
      await EmailService.sendEmail({
        to: email,
        subject: "Your MicMikes Paints Deletion Request Registered",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e8dcc7; background: #F8F4EF; border-radius: 12px;">
            <h2 style="color: #B84A32; font-family: Georgia, serif;">MicMikes Paints Compliance</h2>
            <p>Hello ${customer.name || "Customer"},</p>
            <p>We have registered your request for erasure (deletion) of your personal data under the <strong>Kenya Data Protection Act, 2019</strong>.</p>
            <p><strong>What happens next:</strong></p>
            <ol>
              <li>Your customer profile has been immediately deactivated (disabled).</li>
              <li>Your personal details, saved rooms, wishlists, and delivery addresses will be permanently deleted from our active databases within 14 days.</li>
              <li>Please note that completed order ledgers and payment logs must be retained for 7 years to comply with statutory tax auditing requirements under the <strong>Kenya Revenue Authority (KRA)</strong> guidelines. These records will be anonymized where possible.</li>
            </ol>
            <p>If you did not authorize this request, please contact our Data Protection Officer immediately at <a href="mailto:privacy@micmikespaints.co.ke" style="color: #B84A32;">privacy@micmikespaints.co.ke</a>.</p>
            <hr style="border: 0; border-top: 1px solid #d4c8b0; margin: 20px 0;" />
            <p style="font-size: 11px; color: #7b7468;">MicMikes Paints Limited · Keekorok Road, Nairobi, Kenya</p>
          </div>
        `,
      }).catch(err => console.error("Compliance email fail:", err));

      return NextResponse.json({ success: true, message: "Account deletion request logged successfully." });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err: any) {
    console.error("[compliance/request] failed:", err);
    return NextResponse.json({ error: "Failed to process compliance request. Please try again later." }, { status: 500 });
  }
}
