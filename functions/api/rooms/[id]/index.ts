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
      return new Response(JSON.stringify({ error: "Listing not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    const tokenHeader = request.headers.get("x-landlord-token");
    if (tokenHeader) {
      const landlord = await env.DB.prepare("SELECT id FROM landlords WHERE auth_token = ?").bind(tokenHeader).first();
      if (landlord && existingListing.landlord_id && landlord.id !== existingListing.landlord_id) {
        return new Response(JSON.stringify({ error: "Forbidden: You do not have permission to modify another landlord's listing." }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
    }

    const resolvedCategory = category || (["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(property_type) ? "hospitality" : "residential");
    const resolvedBusinessName = business_name || businessName || null;
    const resolvedIsPremium = (is_premium !== undefined ? is_premium : isPremium) ? 1 : 0;
    const resolvedTier = listing_tier || listingTier || (resolvedIsPremium ? "paid" : "free");
    const resolvedStatus = verification_status || status || existingListing.verification_status || 'Active';

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
      return new Response(JSON.stringify({ error: "Listing not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    const tokenHeader = request.headers.get("x-landlord-token");
    if (tokenHeader) {
      const landlord = await env.DB.prepare("SELECT id FROM landlords WHERE auth_token = ?").bind(tokenHeader).first();
      if (landlord && existingListing.landlord_id && landlord.id !== existingListing.landlord_id) {
        return new Response(JSON.stringify({ error: "Forbidden: You do not have permission to delete another landlord's listing." }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
    }

    await env.DB.prepare("DELETE FROM listings WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
