import "dotenv/config";

export class StripeProvider {
  private static getApiKey() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      console.warn("[StripeProvider] Stripe secret key is not configured.");
    }
    return key;
  }

  /**
   * Create a simulated Stripe Payment Intent.
   */
  static async createPaymentIntent(amountMinor: number, currencyCode: string = "USD") {
    const key = this.getApiKey();
    console.log(`💳 [Stripe Stub] Initiating Stripe PaymentIntent of ${amountMinor} ${currencyCode}...`);
    
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      paymentIntentId: `pi_${Math.floor(Math.random() * 1000000000)}`,
      clientSecret: `pi_${Math.floor(Math.random() * 1000000000)}_secret_${Math.floor(Math.random() * 100000)}`,
      amountMinor,
      currencyCode,
      status: "requires_payment_method",
    };
  }

  /**
   * Refund a simulated Stripe Payment Intent.
   */
  static async refundPaymentIntent(paymentIntentId: string, amountMinor: number) {
    const key = this.getApiKey();
    console.log(`💳 [Stripe Stub] Refunding ${amountMinor} minor units on Stripe transaction ${paymentIntentId}...`);
    
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      refundId: `re_${Math.floor(Math.random() * 1000000000)}`,
      paymentIntentId,
      amountMinor,
      status: "succeeded",
    };
  }
}
