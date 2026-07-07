import "dotenv/config";

export class MpesaProvider {
  private static getCredentials() {
    const key = process.env.MPESA_CONSUMER_KEY;
    const secret = process.env.MPESA_CONSUMER_SECRET;
    const shortcode = process.env.MPESA_SHORTCODE || "174379"; // default sandbox Till
    const passkey = process.env.MPESA_PASSKEY;
    const env = process.env.MPESA_ENVIRONMENT || "sandbox";

    if (!key || !secret) {
      console.warn("[MpesaProvider] Missing consumer credentials.");
    }
    return { key, secret, shortcode, passkey, env };
  }

  /**
   * Fetch an OAuth Access Token from Safaricom Daraja.
   */
  static async generateToken(): Promise<string> {
    const { key, secret, env } = this.getCredentials();
    if (!key || !secret) throw new Error("M-Pesa credentials not configured");

    const url = env === "production"
      ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
      : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

    const auth = Buffer.from(`${key}:${secret}`).toString("base64");
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Daraja OAuth token fetch failed: ${errText}`);
    }

    const data = await res.json();
    return data.access_token;
  }

  /**
   * Initiate Safaricom STK Push.
   */
  static async initiateStkPush(data: {
    phone: string; // must be normalised e.g. 2547XXXXXXXX
    amount: number; // in whole KES
    orderNumber: string;
    callbackUrl: string;
  }) {
    const { shortcode, passkey, env } = this.getCredentials();
    if (!passkey) throw new Error("M-Pesa passkey not configured");

    const token = await this.generateToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

    const url = env === "production"
      ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
      : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

    const requestBody = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: env === "production" ? "CustomerPayBillOnline" : "CustomerPayBillOnline", // sandbox uses paybill online
      Amount: Math.round(data.amount),
      PartyA: data.phone,
      PartyB: shortcode,
      PhoneNumber: data.phone,
      CallBackURL: data.callbackUrl,
      AccountReference: data.orderNumber,
      TransactionDesc: `Pay order ${data.orderNumber}`,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const resData = await res.json();
    if (!res.ok) {
      throw new Error(resData.errorMessage || "Daraja STK push failed");
    }

    return {
      merchantRequestId: resData.MerchantRequestID,
      checkoutRequestId: resData.CheckoutRequestID,
      responseCode: resData.ResponseCode,
      responseDescription: resData.ResponseDescription,
      customerMessage: resData.CustomerMessage,
      rawRequest: requestBody,
      rawResponse: resData,
    };
  }

  /**
   * Query status of STK Push transaction checkout request.
   */
  static async queryTransactionStatus(checkoutRequestId: string) {
    const { shortcode, passkey, env } = this.getCredentials();
    if (!passkey) throw new Error("M-Pesa passkey not configured");

    const token = await this.generateToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

    const url = env === "production"
      ? "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query"
      : "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    });

    const resData = await res.json();
    return resData;
  }
}
