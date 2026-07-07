import { Resend } from "resend";
import "dotenv/config";

export class EmailService {
  private static getClient() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("[EmailService] RESEND_API_KEY is missing. Falling back to console logging.");
      return null;
    }
    return new Resend(apiKey);
  }

  /**
   * Dispatch HTML email using Resend SDK.
   */
  static async sendEmail(data: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }) {
    const client = this.getClient();
    const fromAddress = data.from || "MicMikes Paints <orders@micmikespaints.co.ke>";

    if (!client) {
      console.log("📨 [Email Log - DEV MODE]");
      console.log(` - From: ${fromAddress}`);
      console.log(` - To: ${data.to}`);
      console.log(` - Subject: ${data.subject}`);
      console.log(` - Content: ${data.html.substring(0, 300)}...`);
      return { id: "mock-email-id" };
    }

    try {
      const response = await client.emails.send({
        from: fromAddress,
        to: data.to,
        subject: data.subject,
        html: data.html,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return response.data;
    } catch (err) {
      console.error("[EmailService] Dispatch failed:", err);
      throw err;
    }
  }
}
