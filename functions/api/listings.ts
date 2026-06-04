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
        frequency: row.rent_cycle,
        propertyType: row.property_type,
        tenantType: row.tenant_type,
        amenities: typeof row.amenities === "string" ? JSON.parse(row.amenities || "[]") : (row.amenities || []),
        contactMethod: row.contact_method,
        phone: row.contact_phone,
        images: row.image_url ? [row.image_url] : [],
        status: row.verification_status,
        createdAt: row.created_at,
        leadsCount: row.leads_count
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
      title, suburb, price, landlord_id, verification_status, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities
    } = data;
    
    // Amenities stringified as checklist
    const amenitiesStr = typeof amenities === "string" ? amenities : JSON.stringify(amenities || []);

    const result = await env.DB.prepare(`
      INSERT INTO listings (title, suburb, price, landlord_id, verification_status, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      title, suburb, Number(price), landlord_id || null, verification_status || 'Active', 
      image_url || null, landmark || null, city || null, Number(deposit || 0), 
      property_type || null, tenant_type || null, rent_cycle || 'Month', 
      contact_method || null, contact_phone || null, amenitiesStr
    ).run();

    return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
