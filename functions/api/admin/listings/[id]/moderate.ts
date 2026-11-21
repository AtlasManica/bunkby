import { jsonError, requireAdmin } from "../../../../_lib/security";
import { handleAdminModerate } from "../../../../_lib/reports";

export async function onRequestPost({
  request,
  env,
  params,
}: {
  request: Request;
  env: any;
  params: { id: string };
}) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }

  const auth = await requireAdmin(request, env, body?.token);
  if ("response" in auth) return auth.response;

  return handleAdminModerate({
    env,
    admin: auth.admin,
    listingId: String(params?.id || ""),
    reportId: body?.reportId ?? null,
    body,
  });
}
