import { buildLocationSeo } from "../../shared/seoData";
import { queryAllAvailableListings, renderSeoHtmlResponse } from "../_lib/pageSsr";

export async function onRequestGet({
  request,
  env,
  params,
}: {
  request: Request;
  env: any;
  params: { city: string };
}) {
  const city = String(params?.city || "").trim();
  const activeListings = await queryAllAvailableListings(env);
  const seo = buildLocationSeo(city, activeListings);
  return renderSeoHtmlResponse(request, env, seo);
}
