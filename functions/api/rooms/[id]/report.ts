import { handleSubmitListingReport } from "../../../_lib/reports";

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-reporter-token",
    },
  });
}

export async function onRequestPost({
  request,
  env,
  params,
}: {
  request: Request;
  env: any;
  params: { id: string };
}) {
  return handleSubmitListingReport({
    request,
    env,
    listingId: String(params?.id || ""),
  });
}
