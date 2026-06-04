export async function onRequestPost({ env, params }) {
  try {
    const id = params.id;
    const listing = await env.DB.prepare("SELECT verification_status FROM listings WHERE id = ?").bind(id).first();
    
    if (listing) {
      const nextStatus = listing.verification_status === "Active" ? "Delisted" : "Active";
      await env.DB.prepare("UPDATE listings SET verification_status = ? WHERE id = ?").bind(nextStatus, id).run();
      return new Response(JSON.stringify({ success: true, status: nextStatus }), { headers: { "Content-Type": "application/json" } });
    } else {
      return new Response(JSON.stringify({ error: "Listing not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
