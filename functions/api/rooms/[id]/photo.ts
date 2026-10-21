/**
 * Public Listing Photo Endpoint for Cloudflare Pages Functions
 * Serves real photos (base64 Data URIs or HTTP redirects) to Meta WhatsApp Cloud API and external clients
 * Supports index query parameter (?index=0, ?index=1, ?index=2) to serve specific gallery photos.
 * Route: GET /api/rooms/:id/photo
 */
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

    let photoIndex = 0;
    if (request) {
      try {
        const url = new URL(request.url);
        const idxParam = url.searchParams.get("index") || url.searchParams.get("idx") || url.searchParams.get("i");
        if (idxParam !== null) {
          photoIndex = parseInt(idxParam, 10) || 0;
        }
      } catch (_) {}
    }

    let raw = String(listing.image_url).trim();
    // If stored as JSON array of multiple photos, extract the photo at photoIndex (fallback to 0)
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const selected = parsed[photoIndex] !== undefined ? parsed[photoIndex] : parsed[0];
          raw = String(selected).trim();
        }
      } catch (_) {}
    }

    // 1. If base64 data URI (e.g. data:image/jpeg;base64,...)
    if (raw.startsWith("data:")) {
      const matches = raw.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
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

    return new Response("Photograph format not supported", { status: 404 });
  } catch (err: any) {
    return new Response(`Error serving photograph: ${err.message}`, { status: 500 });
  }
}
