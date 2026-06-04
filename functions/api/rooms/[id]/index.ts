export async function onRequestPut({ request, env, params }) {
  try {
    const id = params.id;
    const body = await request.json();
    const {
      title, suburb, price, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities
    } = body;
    
    // Stringify amenities if it's an array for SQLite text storage
    const amenitiesStr = typeof amenities === "string" ? amenities : JSON.stringify(amenities || []);

    await env.DB.prepare(`
      UPDATE listings SET
        title = ?, suburb = ?, price = ?, image_url = ?, landmark = ?, city = ?, deposit = ?, property_type = ?, tenant_type = ?, rent_cycle = ?, contact_method = ?, contact_phone = ?, amenities = ?
      WHERE id = ?
    `).bind(
      title, suburb, Number(price), image_url || null, landmark || null, city || null, Number(deposit || 0), 
      property_type || null, tenant_type || null, rent_cycle || 'Month', 
      contact_method || null, contact_phone || null, amenitiesStr,
      id
    ).run();

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function onRequestDelete({ env, params }) {
  try {
    const id = params.id;
    await env.DB.prepare("DELETE FROM listings WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
