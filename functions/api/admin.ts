import {
  jsonError,
  jsonOk,
  requireAdmin,
  scrubExpiredIpHashes,
} from "../_lib/security";
import { handleAdminModerate } from "../_lib/reports";

export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: any;
}) {
  const auth = await requireAdmin(request, env);
  if ("response" in auth) return auth.response;

  try {
    await scrubExpiredIpHashes(env.DB);

    const landlordsResult = await env.DB.prepare(
      "SELECT id, full_name, national_id_url, rates_bill_url, verification_status FROM landlords"
    ).all();
    const listingsResult = await env.DB.prepare(
      "SELECT * FROM listings ORDER BY created_at DESC, id DESC"
    ).all();

    let reports: any[] = [];
    let moderationActions: any[] = [];
    try {
      const reportsRes = await env.DB.prepare(
        `SELECT
           r.id, r.listing_id, r.reason, r.details, r.reporter_name, r.reporter_phone,
           r.status, r.created_at, r.reviewed_at, r.reviewed_by, r.reviewed_by_name,
           r.moderation_notes,
           l.title AS listing_title, l.city AS listing_city, l.suburb AS listing_suburb,
           l.price AS listing_price, l.rent_cycle AS listing_frequency,
           l.property_type AS listing_property_type, l.category AS listing_category,
           l.verification_status AS listing_status, l.landlord_id AS listing_landlord_id,
           l.reports_count AS listing_reports_count,
           ld.full_name AS listing_landlord_name,
           (
             SELECT COUNT(*)
             FROM listing_reports r2
             WHERE r2.listing_id = r.listing_id
               AND r2.ip_hash IS NOT NULL
               AND r2.ip_hash = r.ip_hash
           ) AS same_ip_reports_count
         FROM listing_reports r
         LEFT JOIN listings l ON l.id = r.listing_id
         LEFT JOIN landlords ld ON ld.id = l.landlord_id
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT 200`
      ).all();
      reports = reportsRes?.results || [];

      const actionsRes = await env.DB.prepare(
        `SELECT a.*, l.title AS listing_title
         FROM listing_moderation_actions a
         LEFT JOIN listings l ON l.id = a.listing_id
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT 100`
      ).all();
      moderationActions = actionsRes?.results || [];
    } catch (_) {
      // Tables may not exist yet before migration 0004 is applied
    }

    return jsonOk({
      landlords: landlordsResult?.results || [],
      listings: listingsResult?.results || [],
      reports,
      moderationActions,
    });
  } catch (error: any) {
    return jsonError(error?.message || "Failed to load admin data.", 500);
  }
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: any;
}) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }

  const auth = await requireAdmin(request, env, body?.token);
  if ("response" in auth) return auth.response;

  try {
    const { action, id, targetId, phone, status, reportId, listingId } = body;
    const targetLandlordId =
      id || (phone ? Number(String(phone).replace(/\D/g, "")) : null);
    const targetListingId = id || targetId || listingId;

    if (action === "verify") {
      const nextStatus = status || "verified";
      await env.DB.prepare(
        "UPDATE landlords SET verification_status = ? WHERE id = ?"
      )
        .bind(nextStatus, targetLandlordId)
        .run();
      await env.DB.prepare(
        "UPDATE listings SET verification_status = ? WHERE landlord_id = ? AND COALESCE(verification_status, 'Active') NOT IN ('Hidden', 'Removed')"
      )
        .bind(nextStatus === "verified" ? "Active" : "Delisted", targetLandlordId)
        .run();
      return jsonOk({ success: true, updated: targetLandlordId, status: nextStatus });
    }

    if (action === "deleteLandlord") {
      // Preserve any listings with reports or moderation audit history as 'Removed'
      try {
        await env.DB.prepare(
          `UPDATE listings
           SET verification_status = 'Removed', landlord_id = NULL
           WHERE landlord_id = ?
             AND (
               EXISTS (SELECT 1 FROM listing_reports r WHERE r.listing_id = listings.id)
               OR EXISTS (SELECT 1 FROM listing_moderation_actions a WHERE a.listing_id = listings.id)
             )`
        )
          .bind(targetLandlordId)
          .run();
      } catch (_) {}
      await env.DB.prepare(
        `DELETE FROM listings
         WHERE landlord_id = ?
           AND NOT EXISTS (SELECT 1 FROM listing_reports r WHERE r.listing_id = listings.id)
           AND NOT EXISTS (SELECT 1 FROM listing_moderation_actions a WHERE a.listing_id = listings.id)`
      )
        .bind(targetLandlordId)
        .run();
      await env.DB.prepare("DELETE FROM landlords WHERE id = ?")
        .bind(targetLandlordId)
        .run();
      return jsonOk({ success: true });
    }

    if (action === "deleteListing") {
      // Preserve the listing row, listing_reports, and listing_moderation_actions via 'Removed' status
      return handleAdminModerate({
        env,
        admin: auth.admin,
        reportId: reportId ?? null,
        listingId: targetListingId ?? null,
        body: {
          ...body,
          action: "remove_listing",
          notes:
            body?.notes ||
            "Removed by administrator (record and report history preserved)",
        },
      });
    }

    // Delegate moderation actions to shared handler
    if (
      [
        "mark_under_review",
        "dismiss",
        "dismiss_report",
        "hide_listing",
        "restore_listing",
        "remove_listing",
        "resolve",
        "resolve_report",
        "add_note",
      ].includes(action)
    ) {
      return handleAdminModerate({
        env,
        admin: auth.admin,
        reportId: reportId ?? null,
        listingId: targetListingId ?? null,
        body,
      });
    }

    return jsonError("Invalid action", 400);
  } catch (error: any) {
    return jsonError(error?.message || "Admin operation failed.", 500);
  }
}
