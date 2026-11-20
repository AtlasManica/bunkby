/**
 * Public Listing Photo Endpoint for Cloudflare Pages Functions
 * Serves real photos (base64 Data URIs or HTTP redirects) to Meta WhatsApp Cloud API and external clients
 * Supports index query parameter (?index=0, ?index=1, ?index=2) to serve specific gallery photos.
 * Route: GET /api/rooms/:id/photo
 */
function isBrandingAsset(rawImage: string): boolean {
  const trimmed = String(rawImage || "").trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("logo") ||
    lower.includes("bunkby-logo") ||
    lower.includes("bunkbylogo") ||
    lower.includes("watermark") ||
    lower.includes("favicon") ||
    lower.includes("brand-mark")
  ) {
    return true;
  }
  if (
    lower.includes("fba8ec567cb5f69b") ||
    (trimmed.length === 152391 && (trimmed.includes("AIiIAiIgCIiAIiIAiIg") || trimmed.includes("IiIAiIgCIiAIiIAiIg"))) ||
    trimmed.endsWith("IiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiA/9k=") ||
    trimmed.endsWith("AIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiA/9k=")
  ) {
    return true;
  }
  return false;
}

export async function onRequestGet({ request, env, params }: { request?: Request; env: any; params: any }) {
  try {
    const id = String(params.id || "").replace(/\.[a-zA-Z0-9]+$/, "");
    if (!id || !env.DB) {
      return new Response("Listing not found", { status: 404 });
    }

    const listing = await env.DB.prepare(
      "SELECT image_url, title FROM listings WHERE id = ?"
    ).bind(id).first();

    if (!listing || !listing.image_url) {
      return new Response("Photograph not found", { status: 404 });
    }

    let photoIndex: number | null = null;
    if (request) {
      try {
        const url = new URL(request.url);
        const idxParam = url.searchParams.get("index") || url.searchParams.get("idx") || url.searchParams.get("i");
        if (idxParam !== null) {
          const parsedIdx = parseInt(idxParam, 10);
          if (!Number.isNaN(parsedIdx) && parsedIdx >= 0) {
            photoIndex = parsedIdx;
          }
        }
      } catch (_) {}
    }

    let raw = String(listing.image_url).trim();
    // If stored as JSON array of multiple photos, select requested index or first valid non-branding photo
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const entries = parsed.map((item: any) => String(item || "").trim()).filter(Boolean);
          if (photoIndex !== null) {
            raw = entries[photoIndex] !== undefined ? entries[photoIndex] : (entries[0] || "");
          } else {
            raw = entries.find((item: string) => !isBrandingAsset(item)) || entries[0] || "";
          }
        }
      } catch (_) {}
    }

    if (!raw) {
      return new Response("Photograph not found", { status: 404 });
    }

    // 1. If base64 data URI (e.g. data:image/jpeg;base64,...)
    if (raw.startsWith("data:")) {
      const matches = raw.match(/^data:([a-zA-Z0-9.+_-]+\/[a-zA-Z0-9.+_-]+)(?:;[a-zA-Z0-9=_-]+)*;base64,([\s\S]+)$/i);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2].replace(/\s+/g, "");
        const binaryStr = atob(base64Data);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        return new Response(bytes.buffer, {
          status: 200,
          headers: {
            "Content-Type": mimeType,
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    // 2. If standard HTTP/HTTPS URL
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return Response.redirect(raw, 302);
    }

    // 3. If relative asset path
    if (raw.startsWith("/")) {
      let origin = "https://bunkby.com";
      if (request) {
        try {
          const u = new URL(request.url);
          if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
            origin = `https://${u.host}`;
          } else {
            origin = u.origin;
          }
        } catch (_) {}
      }
      return Response.redirect(new URL(raw, origin).toString(), 302);
    }

    return new Response("Photograph format not supported", { status: 404 });
  } catch (err: any) {
    return new Response(`Error serving photograph: ${err.message}`, { status: 500 });
  }
}
