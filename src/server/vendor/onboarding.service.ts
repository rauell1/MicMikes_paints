import { VendorService } from "./vendor.service";
import { EmailService } from "../notifications/email.service";

export class VendorOnboardingService {
  /**
   * Onboard a vendor and notify them via email.
   */
  static async registerAndInvite(data: {
    legalName: string;
    displayName: string;
    slug: string;
    email: string;
    phoneE164: string;
  }) {
    // 1. Create vendor database record
    const vendor = await VendorService.onboardVendor(data);

    // 2. Dispatch onboarding email
    const emailHtml = `
      <h1>Welcome to MicMikes Paints Platform!</h1>
      <p>Dear ${data.displayName},</p>
      <p>Your seller profile has been created successfully. To complete your onboarding, please log in to the merchant panel and upload your KRA PIN and Business Registration certificate.</p>
      <p>Thank you for partnering with us.</p>
    `;

    await EmailService.sendEmail({
      to: data.email,
      subject: "Action Required: Complete your MicMikes Merchant Onboarding",
      html: emailHtml,
    }).catch((err) => {
      console.error("[VendorOnboarding] Failed to send invitation email:", err);
    });

    return vendor;
  }
}
