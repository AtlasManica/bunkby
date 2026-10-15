/**
 * Public Listing Photo Endpoint for Cloudflare Pages Functions
 * Serves real photos (base64 Data URIs or HTTP redirects) to Meta WhatsApp Cloud API and external clients
 * Route: GET /api/rooms/:id/photo
 */

export async function onRequestGet({ env, params }: { env: any; params: any }) {
  try {
    const id = params.id;
    if (!id || !env.DB) {
      return new Response("Listing not found", { status: 404 });
    }

    const listing = await env.DB.prepare(
      "SELECT image_url, title FROM listings WHERE id = ?"
    ).bind(id).first();

    if (!listing || !listing.image_url) {
      return new Response("Photograph not found", { status: 404 });
    }

    let raw = String(listing.image_url).trim();

    // If stored as JSON array of multiple photos, extract the primary photo
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          raw = String(parsed[0]).trim();
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
