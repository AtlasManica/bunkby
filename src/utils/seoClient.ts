import { SeoPagePayload } from "../../shared/seoData";

export function applyClientSeo(seo: SeoPagePayload) {
  if (typeof document === "undefined") return;

  document.title = seo.title;

  const setMeta = (attrName: "name" | "property", attrValue: string, content: string) => {
    let el = document.querySelector(`meta[${attrName}="${attrValue}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attrName, attrValue);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  };

  setMeta("name", "description", seo.description);
  setMeta("name", "robots", seo.robots);
  setMeta("property", "og:type", seo.ogType);
  setMeta("property", "og:url", seo.canonicalUrl);
  setMeta("property", "og:title", seo.ogTitle);
  setMeta("property", "og:description", seo.ogDescription);
  setMeta("property", "og:image", seo.ogImage);
  setMeta("property", "og:image:secure_url", seo.ogImage);
  setMeta("name", "twitter:title", seo.ogTitle);
  setMeta("name", "twitter:description", seo.ogDescription);
  setMeta("name", "twitter:image", seo.ogImage);

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", seo.canonicalUrl);

  const existingScripts = document.querySelectorAll('script[type="application/ld+json"]');
  existingScripts.forEach((node, idx) => {
    if (idx > 0 || !seo.jsonLd) {
      node.remove();
    }
  });

  if (seo.jsonLd) {
    let scriptEl = document.getElementById("bunkby-seo-jsonld") as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement("script");
      scriptEl.type = "application/ld+json";
      scriptEl.id = "bunkby-seo-jsonld";
      document.head.appendChild(scriptEl);
    }
    scriptEl.textContent = JSON.stringify(seo.jsonLd);
  }
}
