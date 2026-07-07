import africastalking from "africastalking";
import "dotenv/config";

export class SmsService {
  private static getClient() {
    const username = process.env.AFRICASTALKING_USERNAME;
    const apiKey = process.env.AFRICASTALKING_API_KEY;

    if (!username || !apiKey) {
      console.warn("[SmsService] Africa's Talking credentials missing. Falling back to console logging.");
      return null;
    }

    try {
      const at = africastalking({ username, apiKey });
      return at.SMS;
    } catch (err) {
      console.error("[SmsService] Initialization failed:", err);
      return null;
    }
  }

  /**
   * Dispatch SMS using Africa's Talking API.
   */
  static async sendSms(to: string, message: string) {
    const client = this.getClient();

    if (!client) {
      console.log("💬 [SMS Log - DEV MODE]");
      console.log(` - To: ${to}`);
      console.log(` - Message: ${message}`);
      return { status: "success", messageId: "mock-sms-id" };
    }

    try {
      // Africa's Talking expects recipients in an array
      const response = await client.send({
        to: [to],
        message,
      });

      return response;
    } catch (err) {
      console.error("[SmsService] SMS dispatch failed:", err);
      throw err;
    }
  }
}
