import { db } from "../db/client";
import { vendors, vendorContacts, vendorComplianceDocuments } from "../db/schema/vendor";
import { auditLogs } from "../db/schema/iam";
import { eq, and } from "drizzle-orm";

export class VendorService {
  /**
   * Onboard a new vendor and create their primary contact.
   */
  static async onboardVendor(data: {
    legalName: string;
    displayName: string;
    slug: string;
    email: string;
    phoneE164: string;
    whatsappE164?: string;
  }) {
    const vendorId = crypto.randomUUID();

    return await db.transaction(async (tx) => {
      // 1. Create vendor record
      const [vendor] = await tx
        .insert(vendors)
        .values({
          id: vendorId,
          vendorType: "third_party",
          legalName: data.legalName,
          displayName: data.displayName,
          slug: data.slug,
          email: data.email,
          phoneE164: data.phoneE164,
          whatsappE164: data.whatsappE164 || null,
          status: "pending",
          verificationLevel: "basic",
        })
        .returning();

      // 2. Create primary contact
      await tx.insert(vendorContacts).values({
        id: crypto.randomUUID(),
        vendorId,
        fullName: data.displayName,
        roleTitle: "Founder/Owner",
        email: data.email,
        phoneE164: data.phoneE164,
        isPrimary: true,
      });

      // 3. Audit log
      await tx.insert(auditLogs).values({
        actorType: "vendor",
        actorId: vendorId,
        action: "onboard_vendor",
        entityType: "vendor",
        entityId: vendorId,
        metadata: { legalName: data.legalName },
      });

      return vendor;
    });
  }

  /**
   * Upload compliance documents.
   */
  static async uploadComplianceDocument(data: {
    vendorId: string;
    docType: string; // 'kra_pin' | 'business_registration'
    docNumber: string;
    mediaId?: string;
  }) {
    const docId = crypto.randomUUID();

    const [doc] = await db
      .insert(vendorComplianceDocuments)
      .values({
        id: docId,
        vendorId: data.vendorId,
        docType: data.docType,
        docNumber: data.docNumber,
        status: "pending",
        mediaId: data.mediaId || null,
      })
      .returning();

    return doc;
  }

  /**
   * Approve compliance documents by internal staff.
   */
  static async approveComplianceDocument(
    docId: string,
    staffUserId: string,
    approved: boolean,
    notes?: string
  ) {
    return await db.transaction(async (tx) => {
      const [doc] = await tx
        .select()
        .from(vendorComplianceDocuments)
        .where(eq(vendorComplianceDocuments.id, docId))
        .limit(1);

      if (!doc) throw new Error("Compliance document not found");

      const status = approved ? "approved" : "rejected";

      const [updatedDoc] = await tx
        .update(vendorComplianceDocuments)
        .set({
          status,
          reviewedBy: staffUserId,
          reviewedAt: new Date(),
          notes: notes || null,
        })
        .where(eq(vendorComplianceDocuments.id, docId))
        .returning();

      // If document is approved, check if we should auto-verify the vendor
      if (approved) {
        const otherPendingDocs = await tx
          .select()
          .from(vendorComplianceDocuments)
          .where(
            and(
              eq(vendorComplianceDocuments.vendorId, doc.vendorId),
              eq(vendorComplianceDocuments.status, "pending")
            )
          );

        if (otherPendingDocs.length === 0) {
          // Verify vendor
          await tx
            .update(vendors)
            .set({ status: "verified", verificationLevel: "standard" })
            .where(eq(vendors.id, doc.vendorId));

          await tx.insert(auditLogs).values({
            actorType: "staff",
            actorId: staffUserId,
            action: "verify_vendor",
            entityType: "vendor",
            entityId: doc.vendorId,
            metadata: { notes: "All compliance documents verified successfully" },
          });
        }
      }

      return updatedDoc;
    });
  }
}
