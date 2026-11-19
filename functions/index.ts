import { buildHomeSeo, buildListingSeo } from "../shared/seoData";
import {
  queryAllAvailableListings,
  querySingleListing,
  renderSeoHtmlResponse,
} from "./_lib/pageSsr";

export async function onRequestGet({ request, env }: { request: Request; env: any }) {
  const url = new URL(request.url);
  const listingQueryId = url.searchParams.get("listing");
  if (listingQueryId) {
    const listing = await querySingleListing(env, listingQueryId);
    const seo = buildListingSeo(listing, listingQueryId);
    return renderSeoHtmlResponse(request, env, seo);
  }
  const activeListings = await queryAllAvailableListings(env);
  const seo = buildHomeSeo(activeListings);
  return renderSeoHtmlResponse(request, env, seo);
}
