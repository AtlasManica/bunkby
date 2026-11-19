import { buildSitemapXml } from "../shared/seoData";
import { queryAllAvailableListings } from "./_lib/pageSsr";

export async function onRequestGet({ env }: { env: any }) {
  const listings = await queryAllAvailableListings(env);
  const xml = buildSitemapXml(listings);
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
}
