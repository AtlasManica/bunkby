/**
 * Public Listing Photo Endpoint for /api/rooms/:id/photo.jpg
 * Re-exports the photo handler so requests with .jpg suffix match this route directly.
 */
export { onRequestGet } from "./photo";
