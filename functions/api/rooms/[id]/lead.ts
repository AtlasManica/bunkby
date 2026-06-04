export async function onRequestPost({ env, params }) {
  try {
    const id = params.id;
    await env.DB.prepare("UPDATE listings SET leads_count = leads_count + 1 WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
