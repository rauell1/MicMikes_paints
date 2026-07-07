import "dotenv/config";

export class PaystackProvider {
  private static getSecretKey() {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
      console.warn("[PaystackProvider] Paystack secret key is not configured.");
    }
    return key;
  }

  /**
   * Initialize a simulated Paystack payment checkout session.
   */
  static async initializeTransaction(email: string, amountMinor: number, currency: string = "KES") {
    const key = this.getSecretKey();
    console.log(`💳 [Paystack Stub] Initializing Paystack transaction of ${amountMinor} ${currency} for ${email}...`);

    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      authorizationUrl: `https://checkout.paystack.com/${Math.floor(Math.random() * 10000000)}`,
      accessCode: `acc_${Math.floor(Math.random() * 10000000)}`,
      reference: `paystack_${Math.floor(Math.random() * 1000000000)}`,
    };
  }

  /**
   * Verify a simulated Paystack payment status.
   */
  static async verifyTransaction(reference: string) {
    const key = this.getSecretKey();
    console.log(`💳 [Paystack Stub] Verifying Paystack reference ${reference}...`);

    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      reference,
      status: "success",
      amountMinor: 500000,
      currency: "KES",
      paidAt: new Date().toISOString(),
    };
  }
}
