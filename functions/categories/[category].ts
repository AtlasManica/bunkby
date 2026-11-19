import {
  CATEGORY_DEFINITIONS,
  MarketplaceCategoryKey,
  getListingCategoryKey,
  buildCategorySeo,
  toSlug,
} from "../../shared/seoData";
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
  const slug = toSlug(String(params?.category || "")) as MarketplaceCategoryKey;
  const catDef = CATEGORY_DEFINITIONS[slug] || null;
  if (!catDef) {
    return renderSeoHtmlResponse(request, env, buildCategorySeo(null, []));
  }
  const activeListings = await queryAllAvailableListings(env);
  const filtered = activeListings.filter((l: any) => getListingCategoryKey(l) === catDef.key);
  return renderSeoHtmlResponse(request, env, buildCategorySeo(catDef, filtered));
}
