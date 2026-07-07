import "dotenv/config";

export class FlutterwaveProvider {
  private static getPublicKey() {
    const key = process.env.FLUTTERWAVE_PUBLIC_KEY;
    if (!key) {
      console.warn("[FlutterwaveProvider] Flutterwave public key is not configured.");
    }
    return key;
  }

  /**
   * Initialize a simulated Flutterwave charge session.
   */
  static async initializePayment(data: {
    amount: number;
    email: string;
    phone: string;
    txRef: string;
  }) {
    const key = this.getClientSecret();
    console.log(`💳 [Flutterwave Stub] Initializing payment of KES ${data.amount} for ${data.email} (ref: ${data.txRef})...`);

    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      status: "success",
      message: "Hosted payment link generated",
      data: {
        link: `https://checkout.flutterwave.com/v3/hosted/pay/${Math.floor(Math.random() * 10000000)}`,
      },
    };
  }

  /**
   * Verify transaction status from Flutterwave transaction ID.
   */
  static async verifyTransaction(transactionId: string) {
    const key = this.getClientSecret();
    console.log(`💳 [Flutterwave Stub] Verifying Flutterwave transaction ${transactionId}...`);

    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      status: "success",
      message: "Tx verified",
      data: {
        id: parseInt(transactionId, 10) || 1234567,
        txRef: `flw_ref_${Math.floor(Math.random() * 10000000)}`,
        flwRef: `flw_gateway_ref_${Math.floor(Math.random() * 10000000)}`,
        amount: 2500,
        currency: "KES",
        status: "successful",
      },
    };
  }

  private static getClientSecret() {
    return process.env.FLUTTERWAVE_SECRET_KEY || "mock_secret";
  }
}
