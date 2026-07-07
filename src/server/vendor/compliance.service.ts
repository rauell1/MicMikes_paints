import { VendorService } from "./vendor.service";

export class VendorComplianceService {
  /**
   * Submit KRA PIN document details.
   */
  static async submitKraPin(vendorId: string, pin: string, mediaId?: string) {
    // Basic KRA PIN format validation (A123456789B)
    const pinRegex = /^[A-Z]\d{9}[A-Z]$/i;
    if (!pinRegex.test(pin)) {
      throw new Error("Invalid KRA PIN format");
    }

    return await VendorService.uploadComplianceDocument({
      vendorId,
      docType: "kra_pin",
      docNumber: pin.toUpperCase(),
      mediaId,
    });
  }

  /**
   * Submit Business Registration document details.
   */
  static async submitBusinessRegistration(vendorId: string, regNumber: string, mediaId?: string) {
    if (regNumber.trim().length < 3) {
      throw new Error("Invalid business registration number");
    }

    return await VendorService.uploadComplianceDocument({
      vendorId,
      docType: "business_registration",
      docNumber: regNumber.trim(),
      mediaId,
    });
  }

  /**
   * Audit/Review document submission status.
   */
  static async auditDocument(docId: string, auditorId: string, approve: boolean, notes?: string) {
    return await VendorService.approveComplianceDocument(docId, auditorId, approve, notes);
  }
}
