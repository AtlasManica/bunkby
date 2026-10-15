/**
 * Public Listing Photo Endpoint for Cloudflare Pages Functions
 * Serves real photos (base64 Data URIs or HTTP redirects) to Meta WhatsApp Cloud API and external clients
 * Route: GET /api/listings/:id/photo
 */
export { onRequestGet } from "../../rooms/[id]/photo";
