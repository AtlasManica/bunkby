import { jsonError, requireAdmin } from "../../../_lib/security";
import {
  handleAdminGetReportDetail,
  handleAdminModerate,
} from "../../../_lib/reports";

export async function onRequestGet({
  request,
  env,
  params,
}: {
  request: Request;
  env: any;
  params: { id: string };
}) {
  const auth = await requireAdmin(request, env);
  if ("response" in auth) return auth.response;
  return handleAdminGetReportDetail({
    env,
    reportId: String(params?.id || ""),
  });
}

async function handleMutation({
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
    reportId: String(params?.id || ""),
    body,
  });
}

export async function onRequestPost(ctx: {
  request: Request;
  env: any;
  params: { id: string };
}) {
  return handleMutation(ctx);
}

export async function onRequestPatch(ctx: {
  request: Request;
  env: any;
  params: { id: string };
}) {
  return handleMutation(ctx);
}
