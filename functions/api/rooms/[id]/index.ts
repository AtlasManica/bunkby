import { normalizeListingRow, isListingAvailable } from "../../../../shared/seoData";
import { getAuthenticatedLandlord, jsonError } from "../../../_lib/security";

export async function onRequestGet({ env, params }: { env: any; params: { id: string } }) {
  try {
    const id = String(params?.id || "").trim();
    const row = await env.DB.prepare(`
      SELECT
        listings.*,
        landlords.full_name as landlordName,
        landlords.verification_status as landlordVerificationStatus
      FROM listings
      LEFT JOIN landlords ON listings.landlord_id = landlords.id
      WHERE listings.id = ?
    `)
      .bind(id)
      .first();

    if (!row) {
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const mapped = normalizeListingRow(row);
    const available = isListingAvailable(mapped);

    if (!available) {
      return new Response(
        JSON.stringify({
          available: false,
          listing: {
            id: mapped.id,
            title: mapped.title,
            city: mapped.city,
            suburb: mapped.suburb,
            propertyType: mapped.propertyType,
            category: mapped.category,
            status: mapped.status,
          },
        }),
        {
          status: 410,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ available: true, listing: mapped }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function onRequestPut({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    const id = params.id;
    const body = await request.json();
    const {
      title, suburb, price, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities,
      category, business_name, businessName, is_premium, isPremium, listing_tier, listingTier, verification_status, status
    } = body;
    
    // Server-side ownership / existence check
    const existingListing = await env.DB.prepare("SELECT * FROM listings WHERE id = ?").bind(id).first();
    if (!existingListing) {
      return jsonError("Listing not found", 404);
    }

    const requester = await getAuthenticatedLandlord(request, env, body?.token);
    if (!requester) {
      return jsonError("Unauthorized: Valid landlord authentication token is required.", 401);
    }
    if (existingListing.landlord_id && requester.id !== existingListing.landlord_id && !requester.isAdmin) {
      return jsonError("Forbidden: You do not have permission to modify another landlord's listing.", 403);
    }

    const resolvedCategory = category || (["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(property_type) ? "hospitality" : "residential");
    const resolvedBusinessName = business_name || businessName || null;
    const resolvedIsPremium = (is_premium !== undefined ? is_premium : isPremium) ? 1 : 0;
    const resolvedTier = listing_tier || listingTier || (resolvedIsPremium ? "paid" : "free");
    const isModeratedLocked =
      !requester.isAdmin &&
      (existingListing.verification_status === "Hidden" || existingListing.verification_status === "Removed");
    const resolvedStatus = isModeratedLocked
      ? existingListing.verification_status
      : verification_status || status || existingListing.verification_status || 'Active';

    // Stringify amenities if it's an array for SQLite text storage
    const amenitiesStr = typeof amenities === "string" ? amenities : JSON.stringify(amenities || []);

    await env.DB.prepare(`
      UPDATE listings SET
        title = ?, suburb = ?, price = ?, image_url = ?, landmark = ?, city = ?, deposit = ?, property_type = ?, tenant_type = ?, rent_cycle = ?, contact_method = ?, contact_phone = ?, amenities = ?,
        category = ?, business_name = ?, is_premium = ?, listing_tier = ?, verification_status = ?
      WHERE id = ?
    `).bind(
      title, suburb, Number(price), image_url || null, landmark || null, city || null, Number(deposit || 0), 
      property_type || null, tenant_type || null, rent_cycle || 'Month', 
      contact_method || null, contact_phone || null, amenitiesStr,
      resolvedCategory, resolvedBusinessName, resolvedIsPremium, resolvedTier, resolvedStatus,
      id
    ).run();

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function onRequestDelete({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    const id = params.id;
    const existingListing = await env.DB.prepare("SELECT * FROM listings WHERE id = ?").bind(id).first();
    if (!existingListing) {
      return jsonError("Listing not found", 404);
    }

    const requester = await getAuthenticatedLandlord(request, env);
    if (!requester) {
      return jsonError("Unauthorized: Valid landlord authentication token is required.", 401);
    }
    if (existingListing.landlord_id && requester.id !== existingListing.landlord_id && !requester.isAdmin) {
      return jsonError("Forbidden: You do not have permission to delete another landlord's listing.", 403);
    }

    if (
      !requester.isAdmin &&
      (existingListing.verification_status === "Hidden" || existingListing.verification_status === "Removed")
    ) {
      return jsonError(
        `Forbidden: This listing is currently ${String(existingListing.verification_status).toLowerCase()} by BunkBy moderation and cannot be deleted without administrator review.`,
        403
      );
    }

    let hasReportHistory = false;
    try {
      const reportRef = await env.DB.prepare("SELECT id FROM listing_reports WHERE listing_id = ? LIMIT 1").bind(id).first();
      const actionRef = await env.DB.prepare("SELECT id FROM listing_moderation_actions WHERE listing_id = ? LIMIT 1").bind(id).first();
      hasReportHistory = Boolean(reportRef || actionRef);
    } catch (_) {}

    if (hasReportHistory || requester.isAdmin) {
      const nextStatus = requester.isAdmin ? "Removed" : "Delisted";
      await env.DB.prepare("UPDATE listings SET verification_status = ? WHERE id = ?")
        .bind(nextStatus, id)
        .run();
      if (requester.isAdmin) {
        try {
          await env.DB.prepare(
            `INSERT INTO listing_moderation_actions (
               listing_id, report_id, admin_id, admin_name, action_type,
               previous_listing_status, new_listing_status, reason, notes
             ) VALUES (?, NULL, ?, ?, 'remove_listing', ?, 'Removed', 'Admin removal', 'Removed via listing endpoint (report history preserved)')`
          )
            .bind(id, requester.id, requester.name, existingListing.verification_status || "Active")
            .run();
        } catch (_) {}
      }
      return new Response(JSON.stringify({ success: true, preservedHistory: true, status: nextStatus }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    await env.DB.prepare("DELETE FROM listings WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
