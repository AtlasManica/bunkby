export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT 
        listings.*, 
        landlords.full_name as landlordName 
      FROM listings 
      LEFT JOIN landlords ON listings.landlord_id = landlords.id 
      ORDER BY listings.created_at DESC
    `).all();

    const mappedListings = results.map((row: any) => ({
        ...row,
        category: row.category || (["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(row.property_type) ? "hospitality" : "residential"),
        businessName: row.business_name || null,
        frequency: row.rent_cycle,
        propertyType: row.property_type,
        tenantType: row.tenant_type,
        amenities: typeof row.amenities === "string" ? JSON.parse(row.amenities || "[]") : (row.amenities || []),
        contactMethod: row.contact_method,
        phone: row.contact_phone,
        images: (() => {
          if (!row.image_url) return [];
          const str = String(row.image_url).trim();
          if (str.startsWith("[")) {
            try {
              const arr = JSON.parse(str);
              if (Array.isArray(arr)) return arr;
            } catch (_) {}
          }
          return [str];
        })(),
        status: row.verification_status,
        createdAt: row.created_at,
        leadsCount: row.leads_count,
        isPremium: Boolean(row.is_premium),
        listingTier: row.listing_tier || (row.is_premium ? "paid" : "free"),
        expiryDate: row.expiry_date
    }));

    return new Response(JSON.stringify({ listings: mappedListings }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();
    const {
      title, suburb, price, landlord_id, verification_status, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities,
      category, business_name, businessName, is_premium, isPremium, listing_tier, listingTier, expiry_date, expiryDate
    } = data;
    
    const resolvedCategory = category || (["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(property_type) ? "hospitality" : "residential");
    const resolvedBusinessName = business_name || businessName || null;
    const resolvedIsPremium = (is_premium !== undefined ? is_premium : isPremium) ? 1 : (resolvedCategory === "hospitality" ? 1 : 0);
    const resolvedTier = listing_tier || listingTier || (resolvedCategory === "hospitality" ? "paid" : "free");
    const resolvedExpiry = expiry_date || expiryDate || (resolvedIsPremium ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : null);

    // Amenities stringified as checklist
    const amenitiesStr = typeof amenities === "string" ? amenities : JSON.stringify(amenities || []);

    const result = await env.DB.prepare(`
      INSERT INTO listings (
        title, suburb, price, landlord_id, verification_status, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities,
        category, business_name, is_premium, listing_tier, expiry_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      title, suburb, Number(price), landlord_id || null, verification_status || 'Active', 
      image_url || null, landmark || null, city || null, Number(deposit || 0), 
      property_type || null, tenant_type || null, rent_cycle || 'Month', 
      contact_method || null, contact_phone || null, amenitiesStr,
      resolvedCategory, resolvedBusinessName, resolvedIsPremium, resolvedTier, resolvedExpiry
    ).run();

    return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
