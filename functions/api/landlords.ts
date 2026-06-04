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
    const { action, name } = body; 
    
    if (action === "login") {
      const landlord = await env.DB.prepare("SELECT * FROM landlords WHERE full_name = ?").bind(name).first();
      if (landlord) {
        return new Response(JSON.stringify({ success: true, landlord }), { headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: false, code: "ACCOUNT_NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } });
    } else if (action === "signup") {
      const existing = await env.DB.prepare("SELECT * FROM landlords WHERE full_name = ?").bind(name).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, code: "ALREADY_EXISTS" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      
      const res = await env.DB.prepare("INSERT INTO landlords (full_name) VALUES (?)").bind(name).run();
      const landlord = await env.DB.prepare("SELECT * FROM landlords WHERE id = ?").bind(res.meta.last_row_id).first();
      return new Response(JSON.stringify({ success: true, landlord }), { status: 201, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
