#!/usr/bin/env node
// scripts/prerender.mjs — run AFTER `vite build` (dist/index.html is the template).
//
// Single-route SPA: renders <App/> once and bakes the HTML into the empty
// #root shell so crawlers / no-JS social bots get real content. Boots Vite in
// middleware mode only to SSR-load the TS render module (resolves the `@`
// alias, TS, import.meta.env). Never fails the build for a render error — the
// client SPA still serves the page.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const TEMPLATE_PATH = path.join(DIST, "index.html");

async function main() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error("prerender: dist/index.html not found — run `vite build` first.");
    process.exit(1);
  }
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  // Expose VITE_* to the SSR module runner (which, unlike `vite build`, does
  // not statically inline them). Placeholder fallbacks keep any import-time
  // env read from throwing; renderToString runs no effects, so no real
  // network/API call happens during prerender.
  const fileEnv = loadEnv("production", ROOT, "VITE_");
  const pick = (k, fb) => fileEnv[k] || process.env[k] || fb;
  const define = {
    "import.meta.env.VITE_API_TARGET": JSON.stringify(pick("VITE_API_TARGET", "")),
  };

  const vite = await createServer({
    mode: "production",
    define,
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    appType: "custom",
    logLevel: "warn",
  });

  try {
    const { renderApp, injectBody } = await vite.ssrLoadModule("/src/prerender/render.tsx");
    const bodyHtml = renderApp();
    const html = injectBody(template, bodyHtml);
    fs.writeFileSync(TEMPLATE_PATH, html, "utf8");
    const words = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().split(" ").length;
    console.log(`prerender: baked homepage body into dist/index.html (~${words} visible words)`);
  } catch (err) {
    // Do not fail the deploy — the client SPA still renders the page.
    console.warn(`prerender: skipped (${err.message}); shipping client-rendered shell`);
  } finally {
    await vite.close();
  }
}

main()
  .then(() => process.exit(0)) // force clean exit; esbuild/worker handles can otherwise hang the build
  .catch((err) => { console.error("prerender failed:", err); process.exit(0); });
