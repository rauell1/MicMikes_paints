// src/prerender/render.tsx
// Build-time server render of the single-page app.
//
// This site is a SINGLE-ROUTE SPA: every "page" (home, colours, visualizer,
// shop) is a <section> inside one <App> toggled by state, served at "/".
// So there is no react-router and no per-route <head> to manage — the meta
// tags already live statically in index.html. All we need to do is render
// <App/> to static HTML once and bake it into the empty #root shell so
// crawlers and no-JS social bots receive real content instead of a blank div.
import React from "react";
import { renderToString } from "react-dom/server";
import App from "../App";

/** Render the marketing chrome (hero, headings, copy, footer) to static HTML. */
export function renderApp(): string {
  // react-router isn't used here, so no useLayoutEffect noise to filter.
  // Data (colours/products/rooms) loads client-side in effects, so SSR emits
  // the static copy plus loading skeletons — exactly the SEO-relevant text.
  return renderToString(<App />);
}

/** Pure: inject the rendered body into the built index.html template. */
export function injectBody(template: string, bodyHtml: string): string {
  return template.replace(
    '<div id="root"></div>',
    `<div id="root">${bodyHtml}</div>`
  );
}
