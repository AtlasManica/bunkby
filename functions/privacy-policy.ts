import { buildPrivacySeo } from "../shared/seoData";
import { renderSeoHtmlResponse } from "./_lib/pageSsr";

export async function onRequestGet({ request, env }: { request: Request; env: any }) {
  return renderSeoHtmlResponse(request, env, buildPrivacySeo());
}
