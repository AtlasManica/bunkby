import { SeoPagePayload, escapeHtml } from "./seoData";

function escapeJsonForScript(obj: Record<string, any>): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

export function isCrawlerUserAgent(userAgent?: string | null): boolean {
  const ua = String(userAgent || "").trim();
  if (!ua) return true;
  return /(bot|crawl|spider|slurp|mediapartners|adsbot|google-inspectiontool|google-extended|storebot|bingpreview|duckduck|baidu|yandex|applebot|facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|pinterest|gptbot|oai-searchbot|chatgpt|claudebot|claude-web|anthropic|perplexity|bytespider|petalbot|semrush|ahrefs|mj12bot|lighthouse|pagespeed|gtmetrix|headless|curl|wget|python|httpclient|node-fetch|undici|\bnode\b|axios|got\/|okhttp|java\/|ruby|php\/)/i.test(
    ua
  );
}

/**
 * Replaces metadata tags, JSON-LD, and <div id="root"> SSR content inside base index.html
 * cleanly for crawlers & social scrapers without touching Vite asset script/style bundles.
 *
 * When includeSsrBody is false (standard human browsers), seo.ssrHtml is omitted from #root
 * so browsers NEVER paint a flash of unstyled SSR HTML before React mounts, while preserving
 * full dynamic <title>, <meta>, canonical, OG, and Schema.org JSON-LD in <head>.
 */
export function injectSeoIntoHtml(
  baseHtml: string,
  seo: SeoPagePayload,
  options: { includeSsrBody?: boolean } = {}
): string {
  const includeSsrBody = options.includeSsrBody !== false;
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

  const markerPattern = /<!--\s*SSR_ROOT_START\s*-->[\s\S]*?<!--\s*SSR_ROOT_END\s*-->/i;
  const bootShellPattern = /<!--\s*BOOT_SHELL_START\s*-->[\s\S]*?<!--\s*BOOT_SHELL_END\s*-->/i;

  if (includeSsrBody) {
    // Search/AI crawlers: strip human boot shell and inject full semantic SSR HTML
    if (bootShellPattern.test(html)) {
      html = html.replace(bootShellPattern, "");
    }
    const wrappedSsrHtml = `<div id="seo-ssr-snapshot">${seo.ssrHtml}</div>`;
    if (markerPattern.test(html)) {
      html = html.replace(
        markerPattern,
        `<!-- SSR_ROOT_START -->${wrappedSsrHtml}<!-- SSR_ROOT_END -->`
      );
    } else {
      const rootDivPattern = /<div\s+id=["']root["']\s*>[\s\S]*?<\/div>\s*(?=<script|<\/body>)/i;
      if (rootDivPattern.test(html)) {
        html = html.replace(
          rootDivPattern,
          `<div id="root"><!-- SSR_ROOT_START -->${wrappedSsrHtml}<!-- SSR_ROOT_END --></div>\n    `
        );
      }
    }
  } else {
    // Human browsers: never send unstyled SSR white HTML block into #root
    if (markerPattern.test(html)) {
      html = html.replace(markerPattern, `<!-- SSR_ROOT_START --><!-- SSR_ROOT_END -->`);
    }
  }

  return html;
}
