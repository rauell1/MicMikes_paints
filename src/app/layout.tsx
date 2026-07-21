import type { Metadata } from "next";
import { Playfair_Display, Cormorant, Inter, Roboto_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cormorant = Cormorant({
  variable: "--font-tag",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-mono2",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "MicMikes Paints - Keekorok Edition | Bring Walls to Life",
  description: "Premium Kenyan paint brand. 20 landscape-inspired shades, M-Pesa payments, free Nairobi delivery over KES 15,000. Matte, Satin, Eggshell & Semi-Gloss finishes.",
  keywords: "MicMikes Paints, Keekorok, Kenyan paint brand, Nairobi paint delivery, room visualizer, M-Pesa paint purchase, matte emulsion, satin silk, eggshell heritage, semi-gloss acrylic",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${cormorant.variable} ${inter.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {process.env.NEXT_PUBLIC_COOKIEYES_KEY && (
          <Script
            src={`https://cdn.cookieyes.com/client_data/${process.env.NEXT_PUBLIC_COOKIEYES_KEY}/script.js`}
            id="cookieyes"
            strategy="beforeInteractive"
          />
        )}
        {process.env.NEXT_PUBLIC_COOKIEBOT_ID && (
          <Script
            src="https://consent.cookiebot.com/uc.js"
            id="Cookiebot"
            data-cbid={process.env.NEXT_PUBLIC_COOKIEBOT_ID}
            data-blockingmode="auto"
            strategy="beforeInteractive"
          />
        )}
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              "name": "MicMikes Paints",
              "image": "https://mic-mikes-paints.vercel.app/og-image.jpg",
              "telephone": "0712 345 678",
              "email": "orders@micmikespaints.co.ke",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "Keekorok Road",
                "addressLocality": "Nairobi",
                "addressCountry": "KE"
              },
              "priceRange": "$$"
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "MicMikes Paints Keekorok Paint",
              "description": "Premium landscape-inspired paint shades and finishes.",
              "brand": {
                "@type": "Brand",
                "name": "MicMikes"
              },
              "offers": {
                "@type": "AggregateOffer",
                "priceCurrency": "KES",
                "lowPrice": "850",
                "highPrice": "15000",
                "offerCount": "20"
              }
            })
          }}
        />
      </body>
    </html>
  );
}
