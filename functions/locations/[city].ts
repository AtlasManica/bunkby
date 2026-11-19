import {
  findCityBySlugOrName,
  toSlug,
  buildLocationSeo,
} from "../../shared/seoData";
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
  const city = findCityBySlugOrName(String(params?.city || ""));
  if (!city) {
    return renderSeoHtmlResponse(request, env, buildLocationSeo(null, null, []));
  }
  const activeListings = await queryAllAvailableListings(env);
  const cityListings = activeListings.filter(
    (l: any) => toSlug(l.city) === city.slug
  );
  const seo = buildLocationSeo(city, null, cityListings, false);
  return renderSeoHtmlResponse(request, env, seo);
}
