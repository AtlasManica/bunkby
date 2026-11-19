import {
  SeoPagePayload,
  normalizeListingRow,
  isListingAvailable,
} from "../../shared/seoData";
import { injectSeoIntoHtml } from "../../shared/seoHtml";

export async function queryAllAvailableListings(env: any): Promise<any[]> {
  if (!env?.DB) return [];
  try {
    const { results } = await env.DB.prepare(`
      SELECT
        listings.*,
        landlords.full_name as landlordName,
        landlords.verification_status as landlordVerificationStatus
      FROM listings
      LEFT JOIN landlords ON listings.landlord_id = landlords.id
      WHERE listings.verification_status IN ('Active', 'verified')
      ORDER BY COALESCE(listings.is_premium, 0) DESC, listings.created_at DESC, listings.id DESC
    `).all();
    return (results || [])
      .map(normalizeListingRow)
      .filter((l: any) => l && isListingAvailable(l));
  } catch {
    try {
      const { results } = await env.DB.prepare(`
        SELECT
          listings.*,
          landlords.full_name as landlordName,
          landlords.verification_status as landlordVerificationStatus
        FROM listings
        LEFT JOIN landlords ON listings.landlord_id = landlords.id
        WHERE listings.verification_status IN ('Active', 'verified')
        ORDER BY listings.created_at DESC, listings.id DESC
      `).all();
      return (results || [])
        .map(normalizeListingRow)
        .filter((l: any) => l && isListingAvailable(l));
    } catch {
      return [];
    }
  }
}

export async function querySingleListing(env: any, id: string): Promise<any | null> {
  if (!env?.DB) return null;
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;
  try {
    const row = await env.DB.prepare(`
      SELECT
        listings.*,
        landlords.full_name as landlordName,
        landlords.verification_status as landlordVerificationStatus
      FROM listings
      LEFT JOIN landlords ON listings.landlord_id = landlords.id
      WHERE listings.id = ?
    `)
      .bind(cleanId)
      .first();
    return row ? normalizeListingRow(row) : null;
  } catch {
    return null;
  }
}

export async function renderSeoHtmlResponse(
  request: Request,
  env: any,
  seo: SeoPagePayload
): Promise<Response> {
  let baseHtml = "";
  try {
    if (env?.ASSETS?.fetch) {
      const assetUrl = new URL("/index.html", request.url);
      const assetRes = await env.ASSETS.fetch(new Request(assetUrl.toString()));
      if (assetRes.ok) {
        baseHtml = await assetRes.text();
      }
    }
  } catch {
    // Fallback below if asset fetch unavailable
  }

  if (!baseHtml) {
    baseHtml = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title></title></head><body><div id="root"><!-- SSR_ROOT_START --><!-- SSR_ROOT_END --></div></body></html>`;
  }

  const renderedHtml = injectSeoIntoHtml(baseHtml, seo);
  return new Response(renderedHtml, {
    status: seo.httpStatus,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": seo.httpStatus === 200 ? "public, max-age=120, s-maxage=300" : "no-store",
    },
  });
}
