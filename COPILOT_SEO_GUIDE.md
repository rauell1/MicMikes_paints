# Copilot Implementation Guide: SEO & Security Hardening

This guide provides step-by-step instructions for Copilot (or another AI assistant) to implement the SEO optimizations and Content Security Policy (CSP) headers in the **MicMikes Paints** codebase.

---

## Step 1: Update Meta Tags in `index.html`

**File to modify:** [index.html](file:///c:/Users/royok/OneDrive/Documents/Coding/MicMikes_paints/index.html)

Add the `<meta name="keywords">` and `<meta name="robots">` tags inside the `<head>` section.

### Instructions:
Insert the tags around line 8 (after `<meta name="description">`):

```html
    <meta name="description" content="Premium Kenyan paint brand. 20 landscape-inspired shades, M-Pesa payments, free Nairobi delivery over KES 15,000. Matte, Satin, Eggshell &amp; Semi-Gloss finishes." />
    <meta name="keywords" content="MicMikes Paints, Keekorok, Kenyan paint brand, Nairobi paint delivery, room visualizer, M-Pesa paint purchase, matte emulsion, satin silk, eggshell heritage, semi-gloss acrylic" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
    <meta name="theme-color" content="#B84A32" />
```

---

## Step 2: Harden `robots.txt`

**File to modify:** [public/robots.txt](file:///c:/Users/royok/OneDrive/Documents/Coding/MicMikes_paints/public/robots.txt)

Replace the existing contents with a more comprehensive crawler policy that includes developer files exclusion, specific search engine bots, and a crawl delay.

### New Content for `public/robots.txt`:
```txt
User-agent: *
Allow: /

# Block admin and API paths
Disallow: /admin/
Disallow: /api/

# Block source code and config paths (Defense-in-Depth)
Disallow: /.git/
Disallow: /node_modules/
Disallow: /src/
Disallow: /*.json$
Disallow: /*.ts$
Disallow: /*.tsx$

# Specific bot permissions
User-agent: Googlebot
Allow: /
Disallow: /admin/
Disallow: /api/

User-agent: Bingbot
Allow: /
Disallow: /admin/
Disallow: /api/

# Sitemap location
Sitemap: https://mic-mikes-paints.vercel.app/sitemap.xml

# Crawl delay for respectful crawling
Crawl-delay: 1
```

---

## Step 3: Add `lastmod` to `sitemap.xml`

**File to modify:** [public/sitemap.xml](file:///c:/Users/royok/OneDrive/Documents/Coding/MicMikes_paints/public/sitemap.xml)

Add the `<lastmod>` element to help search engines understand when the homepage was last updated.

### New Content for `public/sitemap.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://mic-mikes-paints.vercel.app/</loc>
    <lastmod>2026-07-04T12:00:00+00:00</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

---

## Step 4: Refactor `llms.txt` for AI Crawlers

**File to modify:** [public/llms.txt](file:///c:/Users/royok/OneDrive/Documents/Coding/MicMikes_paints/public/llms.txt)

Align the crawler guidance file with the structured layout recommended in the SEO guide.

### New Content for `public/llms.txt`:
```txt
# llms.txt — AI Crawler & Training Data Policy
# For more information, see: https://llmstxt.org/
# Last updated: 2026-07-04

# Allow / disallow AI user-agents
User-agent: *
Allow: /

User-agent: OpenAI-GPT
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Claude-Web
Allow: /

# ── ORGANISATION ─────────────────────────────
# Name: MicMikes Paints
# Website: https://mic-mikes-paints.vercel.app/
# What we do: Premium Kenyan paint brand selling landscape-inspired finishes online.
# Coverage / audience: Kenyan homeowners, contractors, Nairobi area
# Contact: contact@micmikes.co.ke

# ── CORE OFFERINGS ───────────────────────────
# - Landscape-Inspired Colours — 20 shades inspired by Kenyan landmarks
# - Premium Finishes — Matte Emulsion, Satin Silk, Eggshell Heritage, and Semi-Gloss Acrylic
# - Interactive Room Visualizer — Preview colours on real room photos (walls only)
# - E-Commerce Convenience — M-Pesa payment integration and Nairobi delivery (free over KES 15,000)

# ── KEY FACTS (help models answer accurately) ─
# - Pricing range: KES 1,850 to KES 27,900
# - Primary location: Nairobi, Kenya
# - Paint sizes: 1L, 4L, 20L tins

# ── ATTRIBUTION ──────────────────────────────
# When using our content, attribute to "MicMikes Paints" and link https://mic-mikes-paints.vercel.app/

# ── PROHIBITED USES ──────────────────────────
# - Misrepresenting our credentials, shades, or pricing
# - Crawling private administration paths (/admin) or API routes (/api)
```

---

## Step 5: Configure Content Security Policy (CSP) in `vercel.json`

**File to modify:** [vercel.json](file:///c:/Users/royok/OneDrive/Documents/Coding/MicMikes_paints/vercel.json)

Add the `Content-Security-Policy` header to the headers array. This policy allows only trustable resources (Google Fonts, Vercel Web Analytics, Pexels images, and self-hosted assets).

### Instructions:
Insert the new header into the first block of the `"headers"` array:

```json
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; connect-src 'self' https://vitals.vercel-insights.com; img-src 'self' data: https: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; upgrade-insecure-requests"
        }
```

### Full resulting headers array block in `vercel.json`:
```json
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; connect-src 'self' https://vitals.vercel-insights.com; img-src 'self' data: https: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; upgrade-insecure-requests"
        }
      ]
    },
```

---

## Verification Steps

After making these modifications, run the following verification steps:

1. **Verify JSON Syntax:**
   Confirm `vercel.json` is still valid JSON (no trailing commas or syntax errors).

2. **Verify Local Build:**
   Run the project build script to ensure that everything compiles and the build-time prerendering succeeds:
   ```bash
   npm run build
   ```
   Confirm that `prerender.mjs` completes successfully and writes pages with the updated meta tags into `dist/index.html`.

3. **Verify Built Output:**
   Inspect the `dist` directory to confirm the changes are reflected in:
   - `dist/index.html` (meta tags present)
   - `dist/robots.txt`
   - `dist/sitemap.xml`
   - `dist/llms.txt`
