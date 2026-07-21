"use client";

import { useState } from "react";
import Link from "next/link";

type ExportedData = {
  customer: {
    id: string;
    email: string;
    phone: string;
    name: string;
    status: string;
    marketingOptIn: boolean;
    analyticsConsent: boolean;
    createdAt: string;
  } | null;
  addresses: any[];
  orders: any[];
};

export default function PrivacyPage() {
  const [email, setEmail] = useState("");
  const [requestType, setRequestType] = useState<"export" | "delete">("export");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [exportedData, setExportedData] = useState<ExportedData | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setMessage({ type: "error", text: "Please enter a valid email address." });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setExportedData(null);

    try {
      const res = await fetch("/api/compliance/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: requestType }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Compliance request failed.");
      }

      if (requestType === "export") {
        setExportedData(data);
        setMessage({
          type: "success",
          text: `✓ Success! Your personal data has been compiled below. You can download the JSON file for your records.`,
        });
      } else {
        setMessage({
          type: "success",
          text: `✓ Success! Your deletion request has been logged. Under the Kenya Data Protection Act, we will verify your request and deactivate/erase your personal data within 14 days, retaining only what is legally required for KRA tax audits.`,
        });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = () => {
    if (!exportedData) return;
    const blob = new Blob([JSON.stringify(exportedData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `micmikes-data-export-${email}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F8F4EF", color: "#2B2B2E", fontFamily: '"Inter", system-ui, sans-serif' }}>
      {/* Premium Header */}
      <header className="border-b" style={{ borderColor: "#e8dcc7", background: "#ffffff" }}>
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-graphite decoration-none">
            <span className="font-display text-[20px] font-bold" style={{ color: "#B84A32" }}>MicMikes Paints</span>
          </Link>
          <Link href="/" className="text-[13px] font-[600] px-4 py-2 rounded-full border hover:bg-[#F8F4EF] transition" style={{ borderColor: "#e3d5bc", color: "#2B2B2E" }}>
            ← Back to Shop
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12 flex-1 w-full">
        <h1 className="font-display text-[36px] sm:text-[44px] text-graphite font-bold mb-3">Privacy Policy</h1>
        <p className="text-[14px] text-[#7b7468] mb-8 font-mono2">Last Updated: July 9, 2026 · Compliant with the Kenya Data Protection Act, 2019</p>

        <div className="space-y-8 text-[15px] leading-relaxed text-graphite">
          {/* Section 1 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>1. Introduction & Compliance</h2>
            <p>
              MicMikes Paints (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is a premium Kenyan paint brand. We are committed to protecting the privacy and personal data of our customers (&ldquo;you&rdquo; or &ldquo;data subject&rdquo;) in accordance with the <strong>Kenya Data Protection Act, 2019 (DPA)</strong>. 
            </p>
            <p className="mt-3">
              This Privacy Policy explains how we collect, use, disclose, and safeguard your personal data when you visit our website, upload photos to our Room Visualizer, order paint, or pay using M-Pesa.
            </p>
          </section>

          {/* Section 2 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>2. Personal Data We Collect</h2>
            <p>To fulfill your orders and support interactive features, we collect the following categories of personal data:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li><strong>Contact Information:</strong> Full name, email address, and phone number (primarily your M-Pesa registered number).</li>
              <li><strong>Order Reference:</strong> Your order details are recorded for fulfilment and collection notification purposes. No delivery address or GPS coordinates are required or collected at this time.</li>
              <li><strong>Financial Transaction Data:</strong> Safaricom M-Pesa transaction reference numbers and payment status. We do not store credit card numbers or PINs.</li>
              <li><strong>Visual Media:</strong> Photos of your rooms that you upload to use our Room Visualizer. These photos are processed to show paint overlays.</li>
              <li><strong>Technical Data:</strong> Browser cookies, IP address, and usage data collected via performance and analytics tools.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>3. Lawful Bases for Processing</h2>
            <p>Under Section 30 of the DPA, we process your personal data using the following legal bases:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li><strong>Consent:</strong> When you opt-in to marketing communications, accept analytical cookies, or upload photos to the Room Visualizer.</li>
              <li><strong>Performance of a Contract:</strong> To process your order, receive payment via M-Pesa, and notify you when your order is ready for showroom collection.</li>
              <li><strong>Legal Obligation:</strong> To maintain transaction records and file VAT tax returns with the Kenya Revenue Authority (KRA).</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>4. How We Use and Share Your Data</h2>
            <p>We use your data strictly to facilitate the MicMikes Paints experience. We share your data only with verified service providers necessary to run our service:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li><strong>Safaricom M-Pesa:</strong> To trigger payment STK push prompts and verify transactions.</li>
              <li><strong>Hosting & Database:</strong> Vercel and Neon Postgres DB, which store your orders securely.</li>
            </ul>
            <p className="mt-3">We never sell, rent, or trade your personal data with third parties for marketing purposes.</p>
          </section>

          {/* Section 5 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>5. Your Rights as a Data Subject</h2>
            <p>The Kenya Data Protection Act, 2019 grants you specific rights over your personal data (Sections 26 to 40):</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div className="p-4 rounded-[14px] bg-[#F8F4EF] border border-[#e8dcc7]">
                <div className="font-bold text-[14px] mb-1">Right to Be Informed</div>
                <div className="text-[12.5px] text-[#7b7468]">You have the right to know how your personal data is collected and processed.</div>
              </div>
              <div className="p-4 rounded-[14px] bg-[#F8F4EF] border border-[#e8dcc7]">
                <div className="font-bold text-[14px] mb-1">Right of Access</div>
                <div className="text-[12.5px] text-[#7b7468]">You can request a copy of the personal data we hold about you at any time.</div>
              </div>
              <div className="p-4 rounded-[14px] bg-[#F8F4EF] border border-[#e8dcc7]">
                <div className="font-bold text-[14px] mb-1">Right of Rectification</div>
                <div className="text-[12.5px] text-[#7b7468]">You have the right to correct inaccurate, outdated, or incomplete data.</div>
              </div>
              <div className="p-4 rounded-[14px] bg-[#F8F4EF] border border-[#e8dcc7]">
                <div className="font-bold text-[14px] mb-1">Right to Erasure (Deletion)</div>
                <div className="text-[12.5px] text-[#7b7468]">You can request that we delete personal data we no longer have a legal basis to retain.</div>
              </div>
            </div>
          </section>

          {/* Section 6: Interactive Portal */}
          <section id="rights-portal" className="bg-[#FAF7F2] p-6 sm:p-8 rounded-[24px] border border-[#B84A32] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#B84A32]/5 rounded-full -mr-16 -mt-16 pointer-events-none" />
            <h2 className="font-display text-[24px] font-bold mb-2 text-graphite flex items-center gap-2">
              <span>🛡️</span> Data Subject Rights Portal
            </h2>
            <p className="text-[13.5px] mm-muted mb-6">
              Kenyan residents can use this self-service compliance portal to instantly download their customer data or request account erasure from the database.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              <div>
                <label className="text-[12.5px] font-[700] block mb-1.5 text-graphite">Your Email Address *</label>
                <input
                  type="email"
                  className="input w-full bg-white border border-[#d4c8b0] rounded-[12px] px-4 py-2.5 text-[14px] focus:outline-none focus:border-[#B84A32]"
                  placeholder="e.g. jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-[12.5px] font-[700] block mb-1.5 text-graphite">I wish to request:</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-[13.5px] cursor-pointer">
                    <input
                      type="radio"
                      name="requestType"
                      value="export"
                      checked={requestType === "export"}
                      onChange={() => setRequestType("export")}
                      className="text-[#B84A32] focus:ring-[#B84A32]"
                    />
                    <span>Data Export (Access)</span>
                  </label>
                  <label className="flex items-center gap-2 text-[13.5px] cursor-pointer">
                    <input
                      type="radio"
                      name="requestType"
                      value="delete"
                      checked={requestType === "delete"}
                      onChange={() => setRequestType("delete")}
                      className="text-[#B84A32] focus:ring-[#B84A32]"
                    />
                    <span>Data Erasure (Deletion)</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary px-6 py-2.5 text-[13.5px] font-[700] transition active:scale-95 disabled:opacity-50"
              >
                {submitting ? "Processing request..." : "Submit Compliance Request →"}
              </button>
            </form>

            {message && (
              <div
                className="mt-6 p-4 rounded-[14px] text-[13px] font-[500] leading-relaxed border"
                style={{
                  background: message.type === "success" ? "#f0fdf4" : "#fdf0ee",
                  borderColor: message.type === "success" ? "#bbf7d0" : "#fecaca",
                  color: message.type === "success" ? "#166534" : "#991b1b",
                }}
              >
                {message.text}
              </div>
            )}

            {/* Display and Download Compiled Data */}
            {exportedData && (
              <div className="mt-6 border border-[#e8dcc7] rounded-[16px] bg-white overflow-hidden">
                <div className="px-4 py-3 bg-[#F8F4EF] border-b border-[#e8dcc7] flex items-center justify-between">
                  <span className="font-mono2 text-[12px] text-graphite font-bold">Compiled JSON Profile Data</span>
                  <button
                    onClick={handleDownload}
                    className="px-3 py-1.5 bg-[#4FB9B0] hover:bg-[#3ea299] text-white text-[12px] font-[700] rounded-lg transition"
                  >
                    ⬇ Download JSON File
                  </button>
                </div>
                <div className="p-4 max-h-[300px] overflow-y-auto font-mono2 text-[11px] bg-neutral-900 text-green-400 rounded-b-[16px] whitespace-pre-wrap">
                  {JSON.stringify(exportedData, null, 2)}
                </div>
              </div>
            )}
          </section>

          {/* Contact Section */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>6. Contact the Data Protection Officer</h2>
            <p>
              If you have any questions about this Privacy Policy, your rights under the Kenya DPA 2019, or our data handling practices, please contact us:
            </p>
            <div className="mt-4 space-y-2 text-[13.5px]">
              <div><strong>Entity:</strong> MicMikes Paints Limited</div>
              <div><strong>Office Location:</strong> Keekorok Road, Nairobi, Kenya</div>
              <div><strong>Email:</strong> <a href="mailto:privacy@micmikespaints.co.ke" className="text-[#B84A32] hover:underline font-[600]">privacy@micmikespaints.co.ke</a></div>
              <div><strong>Helpline:</strong> 0712 345 678</div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-[13px]" style={{ borderColor: "#e8dcc7", background: "#ffffff", color: "#7b7468" }}>
        <p>© {new Date().getFullYear()} MicMikes Paints · Nairobi, Kenya · Compliant with the ODPC Kenya Guidelines</p>
      </footer>
    </div>
  );
}
