"use client";

import Link from "next/link";

export default function TermsPage() {
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
        <h1 className="font-display text-[36px] sm:text-[44px] text-graphite font-bold mb-3">Terms of Service</h1>
        <p className="text-[14px] text-[#7b7468] mb-8 font-mono2">Last Updated: July 9, 2026 · Governed by the Laws of the Republic of Kenya</p>

        <div className="space-y-8 text-[15px] leading-relaxed text-graphite">
          {/* Section 1 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>1. Acceptance of Terms</h2>
            <p>
              By accessing our website, uploading images, browsing our paint catalogue, placing an order, or initiating an M-Pesa payment, you agree to be bound by these Terms of Service. If you do not agree to all of these terms, you are prohibited from using our site and services.
            </p>
          </section>

          {/* Section 2 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>2. Orders and M-Pesa Payments</h2>
            <p>
              We process orders and sell products exclusively within Kenya. 
            </p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li><strong>Payment Initiation:</strong> Payments are processed via Safaricom M-Pesa STK Push. By submitting your phone number, you authorize us to trigger a payment prompt on your mobile device.</li>
              <li><strong>Order Confirmation:</strong> An order is only considered accepted and &ldquo;Confirmed&rdquo; once Safaricom registers a successful transaction and issues an M-Pesa transaction reference number.</li>
              <li><strong>Pricing:</strong> All prices listed on the site are in Kenyan Shillings (KES) and are inclusive of standard 16% Value Added Tax (VAT) unless otherwise specified.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>3. Deliveries and County Zones</h2>
            <p>
              We ship paints to select counties and subcounties in Kenya. 
            </p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li><strong>Delivery Zones:</strong> Delivery fees are calculated dynamically based on your selected county and town. Nairobi deliveries are free for orders exceeding KES 15,000.</li>
              <li><strong>Coordinates Sharing:</strong> We offer an optional geolocation feature to share your delivery rider pin. You are responsible for ensuring the coordinates provided are accurate. We are not liable for delayed deliveries due to wrong coordinates or invalid physical addresses.</li>
              <li><strong>Timelines:</strong> Standard delivery within Nairobi takes 24 to 48 hours. Deliveries outside Nairobi take 2 to 4 business days.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>4. Room Visualizer and Photo Uploads</h2>
            <p>
              Our website features a Room Visualizer tool that allows you to upload photos of your spaces to test our paint colours.
            </p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li><strong>Ownership:</strong> You retain ownership of any photos you upload.</li>
              <li><strong>License:</strong> By uploading a photo, you grant us a temporary, non-exclusive, royalty-free license to store and process the image for the sole purpose of rendering paint visualizations.</li>
              <li><strong>Content Guidelines:</strong> You must not upload photos that contain third-party faces without consent, intellectual property violations, or offensive content.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>5. Custom Tinted Products and Return Policy</h2>
            <p>
              Because our paints are tinted to order (curated Kenyan shades, custom finishes like Matte, Satin, Eggshell, and Semi-Gloss):
            </p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li><strong>Tinting Policy:</strong> All paint variants are custom tinted. Once an order is placed, paid, and confirmed, it cannot be cancelled or refunded unless there is a physical defect in the paint emulsion or packaging.</li>
              <li><strong>Colour Differences:</strong> Slight colour variations may occur between the screen rendering (visualizer) and the actual dried paint. We recommend reviewing shades carefully before ordering.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>6. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by Kenyan law, MicMikes Paints shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, use, or goodwill, arising out of your use of our paints or visualizer tool.
            </p>
          </section>

          {/* Section 7 */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>7. Governing Law and Jurisdiction</h2>
            <p>
              These Terms of Service shall be governed by and construed in accordance with the laws of the Republic of Kenya. Any disputes arising out of or relating to these terms shall be subject to the exclusive jurisdiction of the Courts of Kenya.
            </p>
          </section>

          {/* Contact Section */}
          <section className="bg-white p-6 sm:p-8 rounded-[20px] border" style={{ borderColor: "#e8dcc7" }}>
            <h2 className="font-display text-[22px] font-bold mb-4" style={{ color: "#B84A32" }}>8. Contact Us</h2>
            <p>
              If you have any questions or require support regarding these Terms of Service, please contact our support desk:
            </p>
            <div className="mt-4 space-y-2 text-[13.5px]">
              <div><strong>Entity:</strong> MicMikes Paints Limited</div>
              <div><strong>Location:</strong> Keekorok Road, Nairobi, Kenya</div>
              <div><strong>Email:</strong> <a href="mailto:support@micmikespaints.co.ke" className="text-[#B84A32] hover:underline font-[600]">support@micmikespaints.co.ke</a></div>
              <div><strong>Phone:</strong> 0712 345 678</div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-[13px]" style={{ borderColor: "#e8dcc7", background: "#ffffff", color: "#7b7468" }}>
        <p>© {new Date().getFullYear()} MicMikes Paints · Terms of Service · Nairobi, Kenya</p>
      </footer>
    </div>
  );
}
