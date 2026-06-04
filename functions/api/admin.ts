export async function onRequestGet({ env }) {
  try {
    const landlordsResult = await env.DB.prepare("SELECT * FROM landlords").all();
    const listingsResult = await env.DB.prepare("SELECT * FROM listings").all();
    return new Response(JSON.stringify({ landlords: landlordsResult.results, listings: listingsResult.results }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { action, id, targetId } = body;
    
    if (action === "verify") {
      await env.DB.prepare("UPDATE landlords SET verification_status = 'verified' WHERE id = ?").bind(id).run();
      await env.DB.prepare("UPDATE listings SET verification_status = 'verified' WHERE landlord_id = ?").bind(id).run();
      return new Response(JSON.stringify({ success: true, updated: id }), { headers: { "Content-Type": "application/json" } });
    } else if (action === "deleteLandlord") {
      await env.DB.prepare("DELETE FROM landlords WHERE id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM listings WHERE landlord_id = ?").bind(id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } else if (action === "deleteListing") {
      await env.DB.prepare("DELETE FROM listings WHERE id = ?").bind(id || targetId).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
