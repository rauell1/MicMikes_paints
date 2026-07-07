import { db } from "../db/client";
import { carts, cartItems } from "../db/schema/commerce";
import { productVariants, products, shades } from "../db/schema/catalog";
import { addresses } from "../db/schema/customer";
import { OrderService } from "./order.service";
import { PricingService } from "../catalog/pricing.service";
import { DeliveryService } from "../delivery/delivery.service";
import { TaxService } from "../regulatory/tax.service";
import { OutboxProcessor } from "../integration/outbox.processor";
import { eq } from "drizzle-orm";

export class CheckoutService {
  /**
   * Run the checkout pipeline: validations, price locking, tax/shipping resolution, order generation.
   */
  static async processCheckout(data: {
    cartId: string;
    shippingAddressId: string;
    notes?: string;
  }) {
    return await db.transaction(async (tx) => {
      // 1. Fetch Cart & Items
      const [cart] = await tx
        .select()
        .from(carts)
        .where(eq(carts.id, data.cartId))
        .limit(1);

      if (!cart || cart.status !== "active") {
        throw new Error("Cart not found or already processed");
      }

      const items = await tx
        .select()
        .from(cartItems)
        .where(eq(cartItems.cartId, data.cartId));

      if (items.length === 0) {
        throw new Error("Cart is empty");
      }

      // 2. Fetch Shipping Address to resolve delivery zones
      const [address] = await tx
        .select()
        .from(addresses)
        .where(eq(addresses.id, data.shippingAddressId))
        .limit(1);

      if (!address) {
        throw new Error("Shipping address not found");
      }

      // 3. Resolve shipping cost
      const shippingRateKes = await DeliveryService.getDeliveryRate(
        address.countyCode || "KE-30", // default county code if null
        address.subcountyCode || undefined
      );
      const shippingMinor = shippingRateKes * 100;

      // 4. Calculate pricing, taxes, and subtotal
      let subtotalMinor = 0;
      let totalTaxMinor = 0;
      const orderLines = [];

      for (const item of items) {
        const [variant] = await tx
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, item.variantId))
          .limit(1);

        if (!variant) throw new Error("Product variant not found");

        const [prod] = await tx
          .select()
          .from(products)
          .where(eq(products.id, variant.productId))
          .limit(1);

        if (!prod) throw new Error("Product not found");

        let shadeName = "";
        if (variant.shadeId) {
          const [shade] = await tx
            .select()
            .from(shades)
            .where(eq(shades.id, variant.shadeId))
            .limit(1);
          shadeName = shade ? shade.name : "";
        }

        // Calculate tax for this line item (exclusive VAT)
        const itemSubtotalMinor = item.quantity * variant.listPriceMinor;
        subtotalMinor += itemSubtotalMinor;

        const taxRes = await TaxService.calculateTax(itemSubtotalMinor, "KE", "VAT");
        totalTaxMinor += taxRes.taxAmountMinor;

        orderLines.push({
          variantId: item.variantId,
          productName: prod.name,
          shadeName,
          finishName: variant.finishId || undefined,
          packSizeMl: variant.packSizeMl,
          vendorSku: variant.sku,
          quantity: item.quantity,
          unitPriceMinor: variant.listPriceMinor,
          taxMinor: taxRes.taxAmountMinor,
        });
      }

      // 5. Apply coupon if any
      const couponCode = cart.couponCode || undefined;
      const couponRes = await PricingService.applyCoupon(subtotalMinor, couponCode);
      const discountMinor = couponRes.discountMinor;
      const discountedSubtotalMinor = couponRes.finalSubtotalMinor;

      // Deduct tax proportionally to discount if inclusive, otherwise compute on discounted total
      const taxResOnDiscounted = await TaxService.calculateTax(discountedSubtotalMinor, "KE", "VAT");
      const finalTaxMinor = taxResOnDiscounted.taxAmountMinor;

      // Free shipping threshold (KES 15,000)
      const finalShippingMinor = subtotalMinor >= 1500000 ? 0 : shippingMinor;
      const totalMinor = discountedSubtotalMinor + finalShippingMinor + finalTaxMinor;

      // 6. Create the order
      const order = await OrderService.createOrder({
        customerId: cart.customerId || undefined,
        vendorId: "88d8bd7f-94d3-488f-a0bb-26aa77dd8e10", // MicMikes Vendor ID placeholder
        subtotalMinor,
        discountMinor,
        shippingMinor: finalShippingMinor,
        taxMinor: finalTaxMinor,
        totalMinor,
        billingAddressId: data.shippingAddressId,
        shippingAddressId: data.shippingAddressId,
        notes: data.notes || undefined,
        items: orderLines,
      });

      // 7. Update Cart status to converted
      await tx
        .update(carts)
        .set({ status: "converted", updatedAt: new Date() })
        .where(eq(carts.id, data.cartId));

      // 8. Queue integration outbox event
      await OutboxProcessor.queueEvent({
        aggregateType: "order",
        aggregateId: order.id,
        eventType: "order.created",
        payload: {
          orderNumber: order.orderNumber,
          totalMinor: order.totalMinor,
          placedAt: new Date().toISOString(),
        },
        targetSystem: "erp",
      });

      return order;
    });
  }
}
