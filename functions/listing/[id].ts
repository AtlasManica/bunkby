import { buildListingSeo } from "../../shared/seoData";
import { querySingleListing, renderSeoHtmlResponse } from "../_lib/pageSsr";

export async function onRequestGet({
  request,
  env,
  params,
}: {
  request: Request;
  env: any;
  params: { id: string };
}) {
  const id = String(params?.id || "").trim();
  const listing = await querySingleListing(env, id);
  const seo = buildListingSeo(listing, id);
  return renderSeoHtmlResponse(request, env, seo);
}
