import { requireAdmin } from "../../_lib/security";
import { handleAdminListReports } from "../../_lib/reports";

export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: any;
}) {
  const auth = await requireAdmin(request, env);
  if ("response" in auth) return auth.response;
  return handleAdminListReports({ request, env });
}
