import {
  findCityBySlugOrName,
  findSuburbInCity,
  matchesSuburbName,
  toSlug,
  buildLocationSeo,
} from "../../../shared/seoData";
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
  const city = findCityBySlugOrName(String(params?.city || ""));
  if (!city) {
    return renderSeoHtmlResponse(request, env, buildLocationSeo(null, null, [], true));
  }
  const suburb = findSuburbInCity(city, String(params?.suburb || ""));
  if (!suburb) {
    return renderSeoHtmlResponse(request, env, buildLocationSeo(city, null, [], true));
  }
  const activeListings = await queryAllAvailableListings(env);
  const suburbListings = activeListings.filter(
    (l: any) => toSlug(l.city) === city.slug && matchesSuburbName(l.suburb, suburb)
  );
  const seo = buildLocationSeo(city, suburb, suburbListings, false);
  return renderSeoHtmlResponse(request, env, seo);
}
