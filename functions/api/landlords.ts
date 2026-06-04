export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare("SELECT * FROM landlords").all();
    return new Response(JSON.stringify({ landlords: results }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { action, phone, name } = body; // Front-end uses phone, we expect the user to add contact_phone/phone to landlords table!
    
    if (action === "login") {
      // NOTE: Ensure your Cloudflare D1 landlords table has a 'phone' column. Ex: ALTER TABLE landlords ADD COLUMN phone TEXT;
      const landlord = await env.DB.prepare("SELECT * FROM landlords WHERE phone = ?").bind(phone).first();
      if (landlord) {
        return new Response(JSON.stringify({ success: true, landlord }), { headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: false, code: "ACCOUNT_NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } });
    } else if (action === "signup") {
      const existing = await env.DB.prepare("SELECT * FROM landlords WHERE phone = ?").bind(phone).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, code: "ALREADY_EXISTS" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      
      const res = await env.DB.prepare("INSERT INTO landlords (full_name, phone) VALUES (?, ?)").bind(name, phone).run();
      const landlord = await env.DB.prepare("SELECT * FROM landlords WHERE id = ?").bind(res.meta.last_row_id).first();
      return new Response(JSON.stringify({ success: true, landlord }), { status: 201, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
