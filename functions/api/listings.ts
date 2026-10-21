export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT 
        listings.*, 
        landlords.full_name as landlordName 
      FROM listings 
      LEFT JOIN landlords ON listings.landlord_id = landlords.id 
      WHERE listings.verification_status != 'Delisted'
      ORDER BY listings.created_at DESC
    `).all();

    const mappedListings = results.map((row: any) => ({
        ...row,
        category: row.category || (
          ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(row.property_type)
            ? "hospitality"
            : ["Commercial", "Shop", "Warehouse", "Table"].includes(row.property_type)
            ? "commercial"
            : ["Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"].includes(row.property_type) || row.tenant_type === "Student"
            ? "student"
            : "residential"
        ),
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
    
    const resolvedCategory = category || (
      ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(property_type)
        ? "hospitality"
        : ["Commercial", "Shop", "Warehouse", "Table", "Office"].includes(property_type)
        ? "commercial"
        : ["Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"].includes(property_type) || tenant_type === "Student"
        ? "student"
        : "residential"
    );
    const resolvedBusinessName = business_name || businessName || null;
    const resolvedIsPremium = 0;
    const resolvedTier = "free";
    const resolvedExpiry = expiry_date || expiryDate || (resolvedIsPremium ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : null);

    // Amenities stringified as checklist
    const amenitiesStr = typeof amenities === "string" ? amenities : JSON.stringify(amenities || []);

    // Dynamic column check to safely support both migrated and unmigrated D1 databases
    let cols = ["title", "suburb", "price", "landlord_id", "verification_status", "image_url", "landmark", "city", "deposit", "property_type", "tenant_type", "rent_cycle", "contact_method", "contact_phone", "amenities"];
    try {
      const tableInfo = await env.DB.prepare("PRAGMA table_info(listings)").all();
      const existingCols = (tableInfo?.results || []).map((c: any) => c.name);
      if (existingCols.includes("category")) cols.push("category");
      if (existingCols.includes("business_name")) cols.push("business_name");
      if (existingCols.includes("is_premium")) cols.push("is_premium");
      if (existingCols.includes("listing_tier")) cols.push("listing_tier");
      if (existingCols.includes("expiry_date")) cols.push("expiry_date");
    } catch (_) {}

    const valuesMap: Record<string, any> = {
      title,
      suburb,
      price: Number(price),
      landlord_id: landlord_id || null,
      verification_status: verification_status || 'Active',
      image_url: image_url || null,
      landmark: landmark || null,
      city: city || null,
      deposit: Number(deposit || 0),
      property_type: property_type || null,
      tenant_type: tenant_type || null,
      rent_cycle: rent_cycle || 'Month',
      contact_method: contact_method || null,
      contact_phone: contact_phone || null,
      amenities: amenitiesStr,
      category: resolvedCategory,
      business_name: resolvedBusinessName,
      is_premium: resolvedIsPremium,
      listing_tier: resolvedTier,
      expiry_date: resolvedExpiry
    };

    const targetCols = cols.filter(c => valuesMap[c] !== undefined);
    const placeholders = targetCols.map(() => "?").join(", ");
    const bindValues = targetCols.map(c => valuesMap[c]);

    const result = await env.DB.prepare(`
      INSERT INTO listings (${targetCols.join(", ")})
      VALUES (${placeholders})
    `).bind(...bindValues).run();

    return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
