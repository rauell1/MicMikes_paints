import { db } from "../db/client";
import { carts, cartItems } from "../db/schema/commerce";
import { productVariants } from "../db/schema/catalog";
import { eq, and, sql } from "drizzle-orm";

export class CartService {
  /**
   * Fetch an existing active cart or create one.
   */
  static async getOrCreateCart(sessionId?: string, customerId?: string) {
    try {
      let cart = null;

      if (customerId) {
        [cart] = await db
          .select()
          .from(carts)
          .where(and(eq(carts.customerId, customerId), eq(carts.status, "active")))
          .limit(1);
      } else if (sessionId) {
        [cart] = await db
          .select()
          .from(carts)
          .where(and(eq(carts.sessionId, sessionId), eq(carts.status, "active")))
          .limit(1);
      }

      if (!cart) {
        const cartId = crypto.randomUUID();
        const newCartRows = await db
          .insert(carts)
          .values({
            id: cartId,
            customerId: customerId || null,
            sessionId: sessionId || null,
            status: "active",
            currencyCode: "KES",
          })
          .returning();
        cart = newCartRows[0];
      }

      const items = await db
        .select()
        .from(cartItems)
        .where(eq(cartItems.cartId, cart.id));

      return {
        ...cart,
        items,
      };
    } catch (err) {
      console.error("[CartService] getOrCreateCart failed:", err);
      throw err;
    }
  }

  /**
   * Add a product variant to the cart.
   */
  static async addItemToCart(cartId: string, variantId: string, quantity: number) {
    try {
      // Get current list price from catalogue
      const [variant] = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
        .limit(1);

      if (!variant) throw new Error("Variant not found in catalog");

      const [existingItem] = await db
        .select()
        .from(cartItems)
        .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)))
        .limit(1);

      if (existingItem) {
        const newQty = existingItem.quantity + quantity;
        if (newQty <= 0) {
          await db.delete(cartItems).where(eq(cartItems.id, existingItem.id));
        } else {
          await db
            .update(cartItems)
            .set({ quantity: newQty, unitPriceMinor: variant.listPriceMinor })
            .where(eq(cartItems.id, existingItem.id));
        }
      } else if (quantity > 0) {
        await db.insert(cartItems).values({
          id: crypto.randomUUID(),
          cartId,
          variantId,
          quantity,
          unitPriceMinor: variant.listPriceMinor,
        });
      }

      // Update cart timestamp
      await db
        .update(carts)
        .set({ updatedAt: new Date() })
        .where(eq(carts.id, cartId));
    } catch (err) {
      console.error("[CartService] addItemToCart failed:", err);
      throw err;
    }
  }

  /**
   * Remove item from cart.
   */
  static async removeItemFromCart(cartId: string, variantId: string) {
    try {
      await db
        .delete(cartItems)
        .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));

      // Update cart timestamp
      await db
        .update(carts)
        .set({ updatedAt: new Date() })
        .where(eq(carts.id, cartId));
    } catch (err) {
      console.error("[CartService] removeItemFromCart failed:", err);
      throw err;
    }
  }

  /**
   * Merge guest session cart into user account cart upon login.
   */
  static async mergeCart(sessionId: string, customerId: string) {
    try {
      // 1. Get user cart and guest cart
      const guestCart = await this.getOrCreateCart(sessionId, undefined);
      const userCart = await this.getOrCreateCart(undefined, customerId);

      if (guestCart.items.length === 0) return userCart;

      // 2. Add guest items to user cart
      for (const item of guestCart.items) {
        await this.addItemToCart(userCart.id, item.variantId, item.quantity);
      }

      // 3. Mark guest cart as merged
      await db
        .update(carts)
        .set({ status: "merged", sessionId: null })
        .where(eq(carts.id, guestCart.id));

      return this.getOrCreateCart(undefined, customerId);
    } catch (err) {
      console.error("[CartService] mergeCart failed:", err);
      throw err;
    }
  }
}
