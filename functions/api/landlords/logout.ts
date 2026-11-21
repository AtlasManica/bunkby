import { getAuthenticatedLandlord, jsonOk } from "../../_lib/security";

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: any;
}) {
  try {
    const landlord = await getAuthenticatedLandlord(request, env);
    if (landlord && env?.DB) {
      await env.DB.prepare("UPDATE landlords SET auth_token = NULL WHERE id = ?")
        .bind(landlord.id)
        .run();
    }
  } catch (_) {}
  return jsonOk({ success: true, message: "Logged out successfully" });
}
