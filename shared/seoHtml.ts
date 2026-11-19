import { SeoPagePayload, escapeHtml } from "./seoData";

function escapeJsonForScript(obj: Record<string, any>): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

/**
 * Replaces metadata tags, JSON-LD, and <div id="root"> SSR content inside base index.html
 * cleanly for crawlers & social scrapers without touching Vite asset script/style bundles.
 */
export function injectSeoIntoHtml(baseHtml: string, seo: SeoPagePayload): string {
  let html = baseHtml;

  // Replace <title>...</title>
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`);

  // Replace or insert meta tags helper
  const setMetaTag = (attrName: string, attrValue: string, content: string) => {
    const escapedAttr = attrValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `<meta\\s+[^>]*${attrName}=["']${escapedAttr}["'][^>]*>`,
      "i"
    );
    const replacement = `<meta ${attrName}="${escapeHtml(attrValue)}" content="${escapeHtml(content)}" />`;
    if (regex.test(html)) {
      html = html.replace(regex, replacement);
    } else {
      html = html.replace(/<\/head>/i, `    ${replacement}\n  </head>`);
    }
  };

  setMetaTag("name", "description", seo.description);
  setMetaTag("name", "robots", seo.robots);
  setMetaTag("property", "og:type", seo.ogType);
  setMetaTag("property", "og:url", seo.canonicalUrl);
  setMetaTag("property", "og:title", seo.ogTitle);
  setMetaTag("property", "og:description", seo.ogDescription);
  setMetaTag("property", "og:image", seo.ogImage);
  setMetaTag("property", "og:image:secure_url", seo.ogImage);
  setMetaTag("name", "twitter:title", seo.ogTitle);
  setMetaTag("name", "twitter:description", seo.ogDescription);
  setMetaTag("name", "twitter:image", seo.ogImage);

  // Replace canonical URL
  const canonicalRegex = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i;
  const canonicalTag = `<link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}" />`;
  if (canonicalRegex.test(html)) {
    html = html.replace(canonicalRegex, canonicalTag);
  } else {
    html = html.replace(/<\/head>/i, `    ${canonicalTag}\n  </head>`);
  }

  // Replace existing Schema.org JSON-LD block
  const jsonLdRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi;
  if (seo.jsonLd) {
    const scriptBlock = `<script type="application/ld+json" id="bunkby-seo-jsonld">${escapeJsonForScript(
      seo.jsonLd
    )}</script>`;
    if (jsonLdRegex.test(html)) {
      let replaced = false;
      html = html.replace(jsonLdRegex, () => {
        if (!replaced) {
          replaced = true;
          return scriptBlock;
        }
        return "";
      });
    } else {
      html = html.replace(/<\/head>/i, `    ${scriptBlock}\n  </head>`);
    }
  } else {
    html = html.replace(jsonLdRegex, "");
  }

  // Inject crawler-readable semantic HTML inside <div id="root">...</div>
  // Note: React's createRoot(document.getElementById("root")).render(...) cleanly replaces this node's contents on mount.
  const markerPattern = /<!--\s*SSR_ROOT_START\s*-->[\s\S]*?<!--\s*SSR_ROOT_END\s*-->/i;
  if (markerPattern.test(html)) {
    html = html.replace(
      markerPattern,
      `<!-- SSR_ROOT_START -->${seo.ssrHtml}<!-- SSR_ROOT_END -->`
    );
  } else {
    const rootDivPattern = /<div\s+id=["']root["']\s*>[\s\S]*?<\/div>\s*(?=<script|<\/body>)/i;
    if (rootDivPattern.test(html)) {
      html = html.replace(
        rootDivPattern,
        `<div id="root"><!-- SSR_ROOT_START -->${seo.ssrHtml}<!-- SSR_ROOT_END --></div>\n    `
      );
    }
  }

  return html;
}
