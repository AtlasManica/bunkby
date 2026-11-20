import { buildCategorySeo } from "../../shared/seoData";
import { queryAllAvailableListings, renderSeoHtmlResponse } from "../_lib/pageSsr";

export async function onRequestGet({
  request,
  env,
  params,
}: {
  request: Request;
  env: any;
  params: { category: string };
}) {
  const category = String(params?.category || "").trim();
  const activeListings = await queryAllAvailableListings(env);
  const seo = buildCategorySeo(category, activeListings);
  return renderSeoHtmlResponse(request, env, seo);
}
