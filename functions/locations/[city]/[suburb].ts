import { buildLocationSeo } from "../../../shared/seoData";
import { queryAllAvailableListings, renderSeoHtmlResponse } from "../../_lib/pageSsr";

export async function onRequestGet({
  request,
  env,
  params,
}: {
  request: Request;
  env: any;
  params: { city: string; suburb: string };
}) {
  const city = String(params?.city || "").trim();
  const suburb = String(params?.suburb || "").trim();
  const activeListings = await queryAllAvailableListings(env);
  const seo = buildLocationSeo(city, suburb, activeListings);
  return renderSeoHtmlResponse(request, env, seo);
}
