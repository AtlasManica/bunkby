/**
 * Centralised Nationwide Zimbabwe Location Catalogue
 * Covers all 10 provinces of Zimbabwe, recognised cities, towns, tourism destinations,
 * suburbs, and localities with search aliases and database-driven listing matching.
 *
 * Pure TypeScript — runs identically in Cloudflare Pages Functions, Node.js Express, and React SPA.
 */

export type LocationType =
  | "province"
  | "city"
  | "town"
  | "suburb"
  | "locality"
  | "tourism-destination";

export interface ProvinceDefinition {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  locationType: "province";
  capital: string;
  intro: string;
  highlights: string;
  seoTitle: string;
  seoDescription: string;
  featuredOnHomepage: boolean;
}

export interface SuburbDefinition {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  province: string;
  provinceSlug: string;
  parentId: string;
  parentName: string;
  locationType: "suburb" | "locality";
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  featuredOnHomepage: boolean;
}

export interface CityDefinition {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  province: string;
  provinceSlug: string;
  provinceOrRegion: string;
  locationType: "city" | "town" | "tourism-destination" | "locality";
  parentId: string;
  featuredOnHomepage: boolean;
  featuredGroup?: "city" | "tourism";
  seoTitle: string;
  seoDescription: string;
  intro: string;
  highlights: string;
  suburbs: SuburbDefinition[];
}

export interface CatalogLocationEntry {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  province: string;
  provinceSlug: string;
  parentId?: string;
  parentName?: string;
  parentSlug?: string;
  locationType: LocationType;
  path: string;
  featuredOnHomepage: boolean;
  seoTitle: string;
  seoDescription: string;
}

export interface LocationMatchCounts {
  totalActive: number;
  byProvince: Record<string, number>;
  byCity: Record<string, number>;
  bySuburb: Record<string, number>;
}

export function toSlug(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSearchToken(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const ZIMBABWE_PROVINCES: ProvinceDefinition[] = [
  {
    id: "harare-metropolitan",
    slug: "harare-metropolitan",
    name: "Harare Metropolitan",
    aliases: ["Harare Metropolitan Province", "Harare Province", "Harare Metro"],
    locationType: "province",
    capital: "Harare",
    intro:
      "Harare Metropolitan Province encompasses Zimbabwe's capital city Harare alongside Chitungwiza and Epworth, spanning residential suburbs, university areas, CBD retail and office hubs, and guest lodges.",
    highlights:
      "Browse available rooms, cottages, flats, student accommodation, guesthouses, shops, offices, and warehouses across Harare Metropolitan.",
    seoTitle: "Properties & Accommodation in Harare Metropolitan Province | BunkBy",
    seoDescription:
      "Discover residential rentals, student accommodation, lodges, guesthouses, and commercial properties across Harare, Chitungwiza, and Epworth on BunkBy.",
    featuredOnHomepage: true,
  },
  {
    id: "bulawayo-metropolitan",
    slug: "bulawayo-metropolitan",
    name: "Bulawayo Metropolitan",
    aliases: ["Bulawayo Metropolitan Province", "Bulawayo Province", "Bulawayo Metro"],
    locationType: "province",
    capital: "Bulawayo",
    intro:
      "Bulawayo Metropolitan Province covers Zimbabwe's second-largest city and its established residential suburbs, NUST student precincts, industrial corridors, and hospitality guesthouses.",
    highlights:
      "Explore rooms, cottages, houses, student boarding options, guesthouses, and commercial spaces across Bulawayo suburbs.",
    seoTitle: "Properties & Accommodation in Bulawayo Metropolitan Province | BunkBy",
    seoDescription:
      "Find residential rentals, student housing, guesthouses, and commercial premises across Bulawayo Metropolitan Province on BunkBy.",
    featuredOnHomepage: true,
  },
  {
    id: "manicaland",
    slug: "manicaland",
    name: "Manicaland",
    aliases: ["Manicaland Province", "Eastern Highlands"],
    locationType: "province",
    capital: "Mutare",
    intro:
      "Manicaland spans eastern Zimbabwe from Mutare and Rusape to Chipinge and the Eastern Highlands tourism centres of Nyanga, Vumba, and Chimanimani.",
    highlights:
      "Search residential rentals, mountain lodges, guesthouses, student rooms, and commercial spaces across Manicaland.",
    seoTitle: "Properties & Accommodation in Manicaland Province | BunkBy",
    seoDescription:
      "Explore rentals, lodges, guesthouses, student housing, and commercial properties in Mutare, Nyanga, Rusape, Chipinge, Chimanimani, and Vumba.",
    featuredOnHomepage: true,
  },
  {
    id: "mashonaland-central",
    slug: "mashonaland-central",
    name: "Mashonaland Central",
    aliases: ["Mashonaland Central Province", "Mash Central"],
    locationType: "province",
    capital: "Bindura",
    intro:
      "Mashonaland Central covers Bindura, Mazowe, Mount Darwin, Shamva, Guruve, Mvurwi, and surrounding agricultural and mining towns north of Harare.",
    highlights:
      "Browse rooms, family cottages, student accommodation near BUSE, and commercial shops across Mashonaland Central.",
    seoTitle: "Properties & Accommodation in Mashonaland Central Province | BunkBy",
    seoDescription:
      "Find rentals, student accommodation, guesthouses, and commercial properties in Bindura, Mazowe, Mount Darwin, Guruve, Shamva, and Mvurwi.",
    featuredOnHomepage: true,
  },
  {
    id: "mashonaland-east",
    slug: "mashonaland-east",
    name: "Mashonaland East",
    aliases: ["Mashonaland East Province", "Mash East"],
    locationType: "province",
    capital: "Marondera",
    intro:
      "Mashonaland East extends east and south-east of Harare, including Marondera, Ruwa, Chivhu, Macheke, Mutoko, Murehwa, and Wedza.",
    highlights:
      "Discover residential houses, commuter rentals, student rooms, guesthouses, and trading spaces across Mashonaland East.",
    seoTitle: "Properties & Accommodation in Mashonaland East Province | BunkBy",
    seoDescription:
      "Search residential rentals, cottages, lodges, and commercial properties in Marondera, Ruwa, Chivhu, Murehwa, Mutoko, and Macheke.",
    featuredOnHomepage: true,
  },
  {
    id: "mashonaland-west",
    slug: "mashonaland-west",
    name: "Mashonaland West",
    aliases: ["Mashonaland West Province", "Mash West"],
    locationType: "province",
    capital: "Chinhoyi",
    intro:
      "Mashonaland West connects major urban, university, mining, and lakeside destinations including Chinhoyi, Kariba, Kadoma, Chegutu, Norton, Banket, and Karoi.",
    highlights:
      "Explore lakeside lodges in Kariba, CUT student accommodation in Chinhoyi, commuter homes in Norton, and rentals across Kadoma and Chegutu.",
    seoTitle: "Properties & Accommodation in Mashonaland West Province | BunkBy",
    seoDescription:
      "Find accommodation, residential rentals, lakeside lodges, student rooms, and commercial spaces in Chinhoyi, Kariba, Kadoma, Chegutu, Norton, and Karoi.",
    featuredOnHomepage: true,
  },
  {
    id: "masvingo",
    slug: "masvingo",
    name: "Masvingo",
    aliases: ["Masvingo Province"],
    locationType: "province",
    capital: "Masvingo",
    intro:
      "Masvingo Province encompasses Masvingo City, Great Zimbabwe heritage hospitality, Chiredzi, Triangle, Rutenga, Gutu, Bikita, Zaka, and Mwenezi.",
    highlights:
      "Browse residential rentals, university housing, lodges, guesthouses, and commercial premises across Masvingo Province.",
    seoTitle: "Properties & Accommodation in Masvingo Province | BunkBy",
    seoDescription:
      "Discover rentals, student rooms, lodges, and commercial spaces in Masvingo, Chiredzi, Triangle, Rutenga, Gutu, and Great Zimbabwe.",
    featuredOnHomepage: true,
  },
  {
    id: "matabeleland-north",
    slug: "matabeleland-north",
    name: "Matabeleland North",
    aliases: ["Matabeleland North Province", "Mat North"],
    locationType: "province",
    capital: "Lupane",
    intro:
      "Matabeleland North stretches across western and north-western Zimbabwe, including Victoria Falls, Hwange, Lupane, Binga, Nkayi, and Dete.",
    highlights:
      "Find tourism lodges, guesthouses, staff quarters, residential rentals, student housing, and commercial properties across Matabeleland North.",
    seoTitle: "Properties & Accommodation in Matabeleland North Province | BunkBy",
    seoDescription:
      "Explore hospitality stays, lodges, rentals, and commercial properties in Victoria Falls, Hwange, Lupane, Binga, Dete, and Nkayi.",
    featuredOnHomepage: true,
  },
  {
    id: "matabeleland-south",
    slug: "matabeleland-south",
    name: "Matabeleland South",
    aliases: ["Matabeleland South Province", "Mat South"],
    locationType: "province",
    capital: "Gwanda",
    intro:
      "Matabeleland South covers Gwanda, the Beitbridge border hub, Plumtree, Esigodini, Filabusi, Insiza, and surrounding southern Zimbabwe centres.",
    highlights:
      "Search residential rooms, cottages, overnight lodges, and commercial trading spaces across Matabeleland South.",
    seoTitle: "Properties & Accommodation in Matabeleland South Province | BunkBy",
    seoDescription:
      "Browse rentals, guesthouses, overnight stays, and commercial spaces in Gwanda, Beitbridge, Plumtree, Esigodini, Filabusi, and Insiza.",
    featuredOnHomepage: true,
  },
  {
    id: "midlands",
    slug: "midlands",
    name: "Midlands",
    aliases: ["Midlands Province"],
    locationType: "province",
    capital: "Gweru",
    intro:
      "Midlands lies at the heart of Zimbabwe, spanning Gweru, Kwekwe, Zvishavane, Shurugwi, Redcliff, Mvuma, Gokwe, and Mberengwa.",
    highlights:
      "Discover MSU student accommodation, residential rentals, industrial premises, and hospitality stays across the Midlands.",
    seoTitle: "Properties & Accommodation in Midlands Province | BunkBy",
    seoDescription:
      "Find residential rentals, student housing, lodges, and commercial properties across Gweru, Kwekwe, Zvishavane, Shurugwi, Redcliff, and Gokwe.",
    featuredOnHomepage: true,
  },
];

interface SuburbSeed {
  name: string;
  aliases?: string[];
  description?: string;
  locationType?: "suburb" | "locality";
  featuredOnHomepage?: boolean;
}

interface CitySeed {
  name: string;
  aliases?: string[];
  provinceSlug: string;
  locationType: "city" | "town" | "tourism-destination" | "locality";
  featuredOnHomepage?: boolean;
  featuredGroup?: "city" | "tourism";
  intro: string;
  highlights: string;
  suburbs?: SuburbSeed[];
}

function buildCity(seed: CitySeed): CityDefinition {
  const provinceDef = ZIMBABWE_PROVINCES.find((p) => p.slug === seed.provinceSlug);
  if (!provinceDef) {
    throw new Error(`Unknown provinceSlug "${seed.provinceSlug}" for city "${seed.name}"`);
  }
  const citySlug = toSlug(seed.name);
  const cityAliases = Array.from(new Set([seed.name, ...(seed.aliases || [])]));
  const provinceOrRegion =
    provinceDef.slug === "harare-metropolitan" || provinceDef.slug === "bulawayo-metropolitan"
      ? `${provinceDef.name} Province`
      : `${provinceDef.name} Province`;

  const suburbs: SuburbDefinition[] = (seed.suburbs || []).map((sub) => {
    const subSlug = toSlug(sub.name);
    const subAliases = Array.from(new Set([sub.name, ...(sub.aliases || [])]));
    return {
      id: `${citySlug}/${subSlug}`,
      name: sub.name,
      slug: subSlug,
      aliases: subAliases,
      province: provinceDef.name,
      provinceSlug: provinceDef.slug,
      parentId: citySlug,
      parentName: seed.name,
      locationType: sub.locationType || "suburb",
      description: sub.description,
      seoTitle: `Accommodation, Rooms & Properties in ${sub.name}, ${seed.name} | BunkBy`,
      seoDescription: `Find available rooms, cottages, houses, student accommodation, guesthouses, and commercial properties in ${sub.name}, ${seed.name} on BunkBy or WhatsApp (+263 78 978 3200).`,
      featuredOnHomepage: Boolean(sub.featuredOnHomepage),
    };
  });

  return {
    id: citySlug,
    name: seed.name,
    slug: citySlug,
    aliases: cityAliases,
    province: provinceDef.name,
    provinceSlug: provinceDef.slug,
    provinceOrRegion,
    locationType: seed.locationType,
    parentId: provinceDef.slug,
    featuredOnHomepage: Boolean(seed.featuredOnHomepage),
    featuredGroup: seed.featuredGroup,
    seoTitle: `Accommodation, Rentals & Commercial Spaces in ${seed.name}, Zimbabwe | BunkBy`,
    seoDescription: `Discover available rooms, cottages, houses, student accommodation, lodges, and commercial properties in ${seed.name}, ${provinceDef.name} on BunkBy or via WhatsApp (+263 78 978 3200).`,
    intro: seed.intro,
    highlights: seed.highlights,
    suburbs,
  };
}

export const LOCATION_CITIES: CityDefinition[] = [
  // ======================== 1. HARARE METROPOLITAN ========================
  buildCity({
    name: "Harare",
    aliases: ["Hre", "Harare City"],
    provinceSlug: "harare-metropolitan",
    locationType: "city",
    featuredOnHomepage: true,
    featuredGroup: "city",
    intro:
      "Harare is Zimbabwe's capital city, spanning residential suburbs, university precincts, CBD commercial hubs, and guest lodges.",
    highlights:
      "Browse available rooms, cottages, flats, student boarding houses, guesthouses, retail shops, and office spaces across Harare neighborhoods.",
    suburbs: [
      {
        name: "Mount Pleasant",
        aliases: ["Mt Pleasant", "Mt. Pleasant"],
        description: "Residential and university precinct near the University of Zimbabwe.",
        featuredOnHomepage: true,
      },
      {
        name: "Borrowdale",
        aliases: ["Borrowdale Brooke", "Borrowdale West"],
        description: "Northern residential and commercial corridor in Harare.",
        featuredOnHomepage: true,
      },
      {
        name: "Avondale",
        aliases: ["Avondale West"],
        description: "Central-north residential, apartment, retail, and hospitality hub.",
        featuredOnHomepage: true,
      },
      {
        name: "Eastlea",
        description: "Accessible central suburb for cottages, flats, offices, and guesthouses.",
        featuredOnHomepage: true,
      },
      {
        name: "Greendale",
        description: "Eastern residential and cottage rental neighborhood in Harare.",
        featuredOnHomepage: true,
      },
      {
        name: "Avonlea",
        description: "Northwestern Harare suburb popular for rooms and cottages.",
      },
      {
        name: "Belvedere",
        description: "Central-west suburb convenient for students and professionals.",
        featuredOnHomepage: true,
      },
      {
        name: "Avenues",
        aliases: ["The Avenues"],
        description: "Inner-city apartment, bedsit, office, and hospitality district.",
      },
      {
        name: "CBD",
        aliases: ["Harare CBD", "City Centre", "Central Business District"],
        description: "Central business district for retail shops, offices, and market tables.",
        featuredOnHomepage: true,
      },
      {
        name: "Highlands",
        description: "Established northern suburb with houses, cottages, and offices.",
      },
      {
        name: "Mabelreign",
        description: "Western residential suburb with family homes, rooms, and cottages.",
      },
      {
        name: "Marlborough",
        description: "Northwestern residential area in Harare.",
      },
      {
        name: "Hatfield",
        description: "Southern residential suburb near Harare Airport Road.",
      },
      {
        name: "Msasa",
        description: "Industrial and commercial warehouse district in eastern Harare.",
      },
      {
        name: "Waterfalls",
        description: "Southern residential area with rooms, cottages, and full houses.",
      },
      {
        name: "Westgate",
        description: "Northwestern residential and retail node.",
        featuredOnHomepage: true,
      },
      {
        name: "Chisipite",
        description: "Northeastern residential and suburban shopping area.",
      },
      {
        name: "Milton Park",
        description: "Central residential and office conversion district.",
      },
      {
        name: "Braeside",
        description: "Southeastern residential neighborhood near the city center.",
      },
      {
        name: "Madokero",
        aliases: ["Madokero Estate"],
        description: "Growing western residential estate.",
      },
      {
        name: "Highfield",
        aliases: ["Highfields"],
        description: "Established high-density residential and trading suburb.",
      },
      {
        name: "Budiriro",
        description: "Southwestern residential suburb in Harare.",
      },
      {
        name: "Glen View",
        description: "Southern residential and small-business neighborhood.",
      },
      {
        name: "Mbare",
        description: "Historic southern trading, market, and residential district.",
      },
      { name: "Kuwadzana", description: "Western residential suburb along the Bulawayo corridor." },
      { name: "Glen Norah", description: "Southwestern residential suburb in Harare." },
      { name: "Kambuzuma", description: "Western residential suburb near industrial zones." },
      { name: "Warren Park", description: "Western residential neighborhood near the city center." },
      { name: "Dzivarasekwa", aliases: ["Dzivaresekwa", "DZ"], description: "Northwestern residential suburb in Harare." },
      { name: "Mabvuku", description: "Eastern residential suburb in Harare." },
      { name: "Tafara", description: "Eastern residential neighborhood bordering Mabvuku." },
      { name: "Greystone Park", description: "Northern residential suburb near Borrowdale." },
      { name: "Emerald Hill", description: "Northwestern suburb adjacent to Mount Pleasant and Avondale." },
      { name: "Strathaven", description: "Central-west residential area near Avondale." },
      { name: "Bluff Hill", aliases: ["Bluffhill"], description: "Northwestern residential and office neighborhood." },
      { name: "Alexandra Park", aliases: ["Alex Park"], description: "Northern residential suburb bordering Mount Pleasant." },
      { name: "Vainona", description: "Northern residential suburb near Borrowdale." },
      { name: "Pomona", description: "Northern commercial and residential area in Harare." },
      { name: "Gunhill", description: "Central-north residential suburb." },
      { name: "Ashdown Park", description: "Western residential suburb bordering Mabelreign." },
      { name: "Tynwald", aliases: ["Tynwald North", "Tynwald South"], description: "Western residential and industrial node." },
      { name: "Sunningdale", description: "Southern residential suburb near Arcadia and Hatfield." },
      { name: "Arcadia", description: "Central-south residential neighborhood in Harare." },
      { name: "Southerton", description: "Major industrial and commercial district in Harare." },
      { name: "Workington", description: "Established commercial and warehouse district." },
      { name: "Newlands", description: "Commercial, office, and residential hub north-east of the CBD." },
    ],
  }),
  buildCity({
    name: "Chitungwiza",
    aliases: ["Chitown", "Chi-town"],
    provinceSlug: "harare-metropolitan",
    locationType: "city",
    featuredOnHomepage: true,
    featuredGroup: "city",
    intro:
      "Chitungwiza is one of Zimbabwe's largest urban communities, offering single rooms, family cottages, full houses, and local retail shops.",
    highlights:
      "Discover residential rooms, cottages, and commercial spaces across Chitungwiza directly from landlords.",
    suburbs: [
      { name: "Zengeza" },
      { name: "Seke" },
      { name: "St Marys", aliases: ["St Mary's"] },
      { name: "Makoni" },
      { name: "Huruyadzo" },
    ],
  }),
  buildCity({
    name: "Epworth",
    provinceSlug: "harare-metropolitan",
    locationType: "town",
    intro:
      "Epworth offers residential rooms and small commercial trading spaces near southeastern Harare.",
    highlights: "Browse available rooms and properties in Epworth.",
    suburbs: [
      { name: "Domboramwari" },
      { name: "Overspill" },
      { name: "Stopover" },
      { name: "Muguta" },
    ],
  }),

  // ======================== 2. BULAWAYO METROPOLITAN ========================
  buildCity({
    name: "Bulawayo",
    aliases: ["Byo", "Bulawayo City"],
    provinceSlug: "bulawayo-metropolitan",
    locationType: "city",
    featuredOnHomepage: true,
    featuredGroup: "city",
    intro:
      "Bulawayo is Zimbabwe's second-largest city, offering residential rooms and cottages, student housing near NUST, commercial premises, and guesthouses.",
    highlights:
      "Explore active accommodation and commercial property listings across Bulawayo suburbs directly on BunkBy or via WhatsApp.",
    suburbs: [
      { name: "Kumalo", aliases: ["Khumalo"] },
      { name: "Hillside" },
      { name: "Suburbs" },
      { name: "Bradfield" },
      { name: "Famona" },
      { name: "Burnside" },
      { name: "Morningside" },
      { name: "Matsheumhlope" },
      { name: "Selborne Park" },
      { name: "Cowdray Park" },
      { name: "Luveve" },
      { name: "Nkulumane" },
      { name: "Sizinda" },
      { name: "Belmont" },
      { name: "Pumula" },
      { name: "Mzilikazi" },
      { name: "Makokoba" },
      { name: "Lobengula" },
      { name: "Entumbane" },
      { name: "Emganwini" },
      { name: "Nketa" },
      { name: "Magwegwe" },
      { name: "Pelandaba" },
      { name: "Barbourfields" },
      { name: "Woodlands" },
      { name: "Montrose" },
      { name: "Malindela" },
      { name: "Mahatshula" },
      { name: "Killarney" },
      { name: "Waterford" },
      { name: "CBD", aliases: ["Bulawayo CBD"] },
    ],
  }),

  // ======================== 3. MANICALAND ========================
  buildCity({
    name: "Mutare",
    provinceSlug: "manicaland",
    locationType: "city",
    featuredOnHomepage: true,
    featuredGroup: "city",
    intro:
      "Mutare is the gateway to Zimbabwe's Eastern Highlands, combining residential rentals, university housing, commercial trading spaces, and mountain-view lodges.",
    highlights:
      "Search available Mutare rooms, cottages, guesthouses, and business spaces directly with property advertisers.",
    suburbs: [
      { name: "Murambi" },
      { name: "Palmerstone" },
      { name: "Chikanga" },
      { name: "Dangamvura" },
      { name: "Hobhouse" },
      { name: "Fairbridge Park" },
      { name: "Yeovil" },
      { name: "Darlington" },
      { name: "Morningside" },
      { name: "Sakubva" },
      { name: "Greenside" },
      { name: "Florida" },
      { name: "Fern Valley" },
      { name: "CBD", aliases: ["Mutare CBD"] },
    ],
  }),
  buildCity({
    name: "Rusape",
    provinceSlug: "manicaland",
    locationType: "town",
    intro: "Rusape is a commercial and residential town along the Harare–Mutare highway in Manicaland.",
    highlights: "Find rooms, houses, guesthouses, and commercial properties in Rusape.",
    suburbs: [
      { name: "Vengere" },
      { name: "Mabvazuva" },
      { name: "Tsanzaguru" },
    ],
  }),
  buildCity({
    name: "Chipinge",
    provinceSlug: "manicaland",
    locationType: "town",
    intro: "Chipinge serves southern Manicaland with residential housing, commercial shops, and agricultural district services.",
    highlights: "Explore active accommodation and commercial listings in Chipinge.",
    suburbs: [
      { name: "Gaza" },
      { name: "Medium Density" },
      { name: "Low Density" },
    ],
  }),
  buildCity({
    name: "Chimanimani",
    provinceSlug: "manicaland",
    locationType: "tourism-destination",
    intro: "Chimanimani is a scenic mountain town and tourism destination in Manicaland near Chimanimani National Park.",
    highlights: "Discover lodges, guesthouses, cottages, and local rentals in Chimanimani.",
  }),
  buildCity({
    name: "Nyanga",
    provinceSlug: "manicaland",
    locationType: "tourism-destination",
    featuredOnHomepage: true,
    featuredGroup: "tourism",
    intro:
      "Nyanga offers highland lodges, guesthouses, cottages, and mountain retreats in Zimbabwe's Eastern Highlands.",
    highlights: "Browse lodges, guesthouses, and rentals in Nyanga.",
    suburbs: [
      { name: "Juliasdale", locationType: "locality" },
      { name: "Troutbeck", locationType: "locality" },
      { name: "Nyamhuka" },
      { name: "Rochdale" },
    ],
  }),
  buildCity({
    name: "Vumba",
    aliases: ["Bvumba", "Vumba Mountains"],
    provinceSlug: "manicaland",
    locationType: "tourism-destination",
    intro: "Vumba (Bvumba) is a misty highland tourism and hospitality destination overlooking Mutare and the Burma Valley.",
    highlights: "Explore mountain lodges, guesthouses, and holiday stays in Vumba.",
  }),
  buildCity({
    name: "Murambinda",
    aliases: ["Buhera", "Murambinda Growth Point"],
    provinceSlug: "manicaland",
    locationType: "town",
    intro: "Murambinda is the main urban service and trading centre for Buhera District in Manicaland.",
    highlights: "Find rentals, guesthouses, and retail spaces in Murambinda.",
  }),
  buildCity({
    name: "Penhalonga",
    provinceSlug: "manicaland",
    locationType: "town",
    intro: "Penhalonga is a historic mining and residential valley settlement north of Mutare.",
    highlights: "Browse available rooms, cottages, and properties in Penhalonga.",
  }),
  buildCity({
    name: "Headlands",
    provinceSlug: "manicaland",
    locationType: "town",
    intro: "Headlands is a highway service and farming centre in Makoni District, Manicaland.",
    highlights: "Search available listings in Headlands.",
  }),
  buildCity({
    name: "Odzi",
    provinceSlug: "manicaland",
    locationType: "town",
    intro: "Odzi is a roadside settlement and agricultural service town west of Mutare.",
    highlights: "Explore residential and commercial properties in Odzi.",
  }),
  buildCity({
    name: "Hauna",
    aliases: ["Honde Valley"],
    provinceSlug: "manicaland",
    locationType: "locality",
    intro: "Hauna is the commercial centre of Honde Valley in Mutasa District, Manicaland.",
    highlights: "Browse listings in Hauna and the Honde Valley area.",
  }),

  // ======================== 4. MASHONALAND CENTRAL ========================
  buildCity({
    name: "Bindura",
    provinceSlug: "mashonaland-central",
    locationType: "town",
    intro:
      "Bindura is the provincial capital of Mashonaland Central, offering residential rooms, student housing near Bindura University of Science Education (BUSE), and commercial shops.",
    highlights: "Search available listings across Bindura suburbs.",
    suburbs: [
      { name: "Chipadze" },
      { name: "Aerodrome" },
      { name: "Chiwaridzo" },
      { name: "Brockley" },
      { name: "Atherstone" },
    ],
  }),
  buildCity({
    name: "Mazowe",
    provinceSlug: "mashonaland-central",
    locationType: "town",
    intro: "Mazowe lies north of Harare in Mashonaland Central, known for residential estates, schools, citrus farming, and hospitality venues.",
    highlights: "Find rentals, cottages, and properties in Mazowe.",
  }),
  buildCity({
    name: "Mount Darwin",
    aliases: ["Mt Darwin"],
    provinceSlug: "mashonaland-central",
    locationType: "town",
    intro: "Mount Darwin is an important regional service, retail, and residential town in Mashonaland Central.",
    highlights: "Browse rooms, houses, lodges, and commercial shops in Mount Darwin.",
  }),
  buildCity({
    name: "Guruve",
    provinceSlug: "mashonaland-central",
    locationType: "town",
    intro: "Guruve serves northern Mashonaland Central with residential rentals and commercial trading spaces.",
    highlights: "Explore active properties in Guruve.",
  }),
  buildCity({
    name: "Shamva",
    provinceSlug: "mashonaland-central",
    locationType: "town",
    intro: "Shamva is a mining and agricultural town east of Bindura in Mashonaland Central.",
    highlights: "Find residential rentals and commercial listings in Shamva.",
  }),
  buildCity({
    name: "Mvurwi",
    provinceSlug: "mashonaland-central",
    locationType: "town",
    intro: "Mvurwi is a central farming and commercial town in Mazowe District, Mashonaland Central.",
    highlights: "Browse available rooms, houses, and shops in Mvurwi.",
  }),
  buildCity({
    name: "Concession",
    provinceSlug: "mashonaland-central",
    locationType: "town",
    intro: "Concession is a commercial and residential hub along the Harare–Bindura route.",
    highlights: "Search available properties in Concession.",
  }),
  buildCity({
    name: "Glendale",
    provinceSlug: "mashonaland-central",
    locationType: "town",
    intro: "Glendale is an agricultural and commuter town in Mazowe District.",
    highlights: "Discover rentals and commercial listings in Glendale.",
  }),
  buildCity({
    name: "Centenary",
    provinceSlug: "mashonaland-central",
    locationType: "town",
    intro: "Centenary is a farming service centre in northern Mashonaland Central.",
    highlights: "Browse properties in Centenary.",
  }),
  buildCity({
    name: "Muzarabani",
    provinceSlug: "mashonaland-central",
    locationType: "locality",
    intro: "Muzarabani is a district centre in the Zambezi Valley area of Mashonaland Central.",
    highlights: "Check active properties in Muzarabani.",
  }),

  // ======================== 5. MASHONALAND EAST ========================
  buildCity({
    name: "Marondera",
    provinceSlug: "mashonaland-east",
    locationType: "town",
    intro:
      "Marondera is the provincial capital of Mashonaland East, offering family houses, cottages, boarding rooms, lodges, and commercial premises.",
    highlights: "Browse active property listings in Marondera.",
    suburbs: [
      { name: "Rujeko" },
      { name: "Dombotombo" },
      { name: "Cherutombo" },
      { name: "Winston Park" },
      { name: "Nyameni" },
      { name: "Paradise Park" },
    ],
  }),
  buildCity({
    name: "Ruwa",
    provinceSlug: "mashonaland-east",
    locationType: "town",
    intro:
      "Ruwa is a growing urban town east of Harare in Mashonaland East, popular for residential rentals, family houses, cottages, and light industrial warehouses.",
    highlights: "Find rooms, cottages, houses, and commercial spaces in Ruwa.",
    suburbs: [
      { name: "Damofalls" },
      { name: "Zimre Park" },
      { name: "Windsor Park" },
    ],
  }),
  buildCity({
    name: "Chivhu",
    aliases: ["Enkeldoorn"],
    provinceSlug: "mashonaland-east",
    locationType: "town",
    intro: "Chivhu provides residential rooms, guesthouses, and highway-corridor commercial spaces.",
    highlights: "Find available listings in Chivhu.",
    suburbs: [{ name: "CBD" }, { name: "Northwood" }],
  }),
  buildCity({
    name: "Macheke",
    provinceSlug: "mashonaland-east",
    locationType: "town",
    intro: "Macheke is a residential and farming town along the Harare–Mutare corridor in Mashonaland East.",
    highlights: "Browse rentals and commercial listings in Macheke.",
  }),
  buildCity({
    name: "Mutoko",
    provinceSlug: "mashonaland-east",
    locationType: "town",
    intro: "Mutoko is a regional commercial, granite-quarrying, and residential town in north-eastern Mashonaland East.",
    highlights: "Explore active rooms, houses, lodges, and shops in Mutoko.",
  }),
  buildCity({
    name: "Murehwa",
    aliases: ["Murewa"],
    provinceSlug: "mashonaland-east",
    locationType: "town",
    intro: "Murehwa (Murewa) is a prominent district commercial and residential centre along the Nyamapanda corridor.",
    highlights: "Find rooms, cottages, and business premises in Murehwa.",
  }),
  buildCity({
    name: "Wedza",
    aliases: ["Hwedza"],
    provinceSlug: "mashonaland-east",
    locationType: "town",
    intro: "Wedza (Hwedza) is a district centre in Mashonaland East offering residential and commercial spaces.",
    highlights: "Search available properties in Wedza.",
  }),
  buildCity({
    name: "Goromonzi",
    provinceSlug: "mashonaland-east",
    locationType: "locality",
    intro: "Goromonzi is a peri-urban and agricultural district centre east of Harare.",
    highlights: "Browse listings in Goromonzi.",
  }),
  buildCity({
    name: "Beatrice",
    provinceSlug: "mashonaland-east",
    locationType: "town",
    intro: "Beatrice is a rural service and commercial town along the Harare–Masvingo highway.",
    highlights: "Find properties in Beatrice.",
  }),
  buildCity({
    name: "Kotwa",
    aliases: ["Mudzi"],
    provinceSlug: "mashonaland-east",
    locationType: "locality",
    intro: "Kotwa is the administrative centre for Mudzi District in Mashonaland East.",
    highlights: "Browse properties in Kotwa and Mudzi.",
  }),
  buildCity({
    name: "Sadza",
    provinceSlug: "mashonaland-east",
    locationType: "locality",
    intro: "Sadza is a recognised growth point in Chikomba District, Mashonaland East.",
    highlights: "Check active properties in Sadza.",
  }),

  // ======================== 6. MASHONALAND WEST ========================
  buildCity({
    name: "Chinhoyi",
    provinceSlug: "mashonaland-west",
    locationType: "town",
    featuredOnHomepage: true,
    featuredGroup: "city",
    intro:
      "Chinhoyi is the provincial capital of Mashonaland West, hosting residential housing, student rooms serving Chinhoyi University of Technology (CUT), commercial spaces, and regional lodges.",
    highlights: "Find rooms, student accommodation, and commercial spaces in Chinhoyi.",
    suburbs: [
      { name: "Coldstream" },
      { name: "Orange Grove" },
      { name: "Ruvimbo" },
      { name: "Chikonohono" },
      { name: "Mzari" },
      { name: "Gunhill" },
    ],
  }),
  buildCity({
    name: "Kariba",
    aliases: ["Lake Kariba"],
    provinceSlug: "mashonaland-west",
    locationType: "tourism-destination",
    featuredOnHomepage: true,
    featuredGroup: "tourism",
    intro:
      "Kariba features lakeside lodges, guesthouses, holiday stays, and residential rentals on Lake Kariba.",
    highlights: "Explore hospitality stays and rentals in Kariba.",
    suburbs: [
      { name: "Nyamhunga" },
      { name: "Mahombekombe" },
      { name: "Heights", aliases: ["Kariba Heights"] },
    ],
  }),
  buildCity({
    name: "Kadoma",
    provinceSlug: "mashonaland-west",
    locationType: "city",
    intro:
      "Kadoma provides residential rentals, cottages, lodges, and retail spaces along the Harare–Bulawayo corridor.",
    highlights: "Browse available rooms, cottages, and commercial spaces in Kadoma.",
    suburbs: [
      { name: "Rimuka" },
      { name: "Waverley", aliases: ["Waverly"] },
      { name: "Mornington" },
      { name: "Westview" },
      { name: "Ingezi" },
      { name: "Eiffel Flats" },
    ],
  }),
  buildCity({
    name: "Chegutu",
    provinceSlug: "mashonaland-west",
    locationType: "town",
    intro: "Chegutu is an industrial, mining, and residential town in Mashonaland West.",
    highlights: "Find residential rooms, houses, lodges, and commercial shops in Chegutu.",
    suburbs: [
      { name: "Pfupajena" },
      { name: "Chinengundu" },
      { name: "Hintonville" },
    ],
  }),
  buildCity({
    name: "Norton",
    provinceSlug: "mashonaland-west",
    locationType: "town",
    intro:
      "Norton provides commuter residential rentals, cottages, and commercial spaces west of Harare.",
    highlights: "Find rooms and houses in Norton.",
    suburbs: [
      { name: "Katanga" },
      { name: "Knowe" },
      { name: "Twin Lakes" },
      { name: "Maridale" },
    ],
  }),
  buildCity({
    name: "Banket",
    provinceSlug: "mashonaland-west",
    locationType: "town",
    intro: "Banket is an agricultural and commercial town between Harare and Chinhoyi.",
    highlights: "Browse residential rentals and business spaces in Banket.",
  }),
  buildCity({
    name: "Karoi",
    provinceSlug: "mashonaland-west",
    locationType: "town",
    intro: "Karoi is a commercial and agricultural town in Hurungwe District along the highway toward Kariba.",
    highlights: "Search available rooms, houses, lodges, and shops in Karoi.",
    suburbs: [{ name: "Chikangwe" }],
  }),
  buildCity({
    name: "Makonde",
    provinceSlug: "mashonaland-west",
    locationType: "locality",
    intro: "Makonde covers recognised localities and centres in Makonde District, Mashonaland West.",
    highlights: "Browse properties in Makonde District.",
  }),
  buildCity({
    name: "Hurungwe",
    aliases: ["Magunje"],
    provinceSlug: "mashonaland-west",
    locationType: "locality",
    intro: "Hurungwe encompasses Magunje and surrounding district centres in northern Mashonaland West.",
    highlights: "Explore active properties in Hurungwe and Magunje.",
  }),
  buildCity({
    name: "Mhangura",
    provinceSlug: "mashonaland-west",
    locationType: "town",
    intro: "Mhangura is a mining and residential town in Makonde District, Mashonaland West.",
    highlights: "Find available rooms and houses in Mhangura.",
  }),
  buildCity({
    name: "Murombedzi",
    aliases: ["Zvimba"],
    provinceSlug: "mashonaland-west",
    locationType: "town",
    intro: "Murombedzi is the primary growth point and administrative centre for Zvimba District.",
    highlights: "Search rentals and trading spaces in Murombedzi.",
  }),
  buildCity({
    name: "Chirundu",
    provinceSlug: "mashonaland-west",
    locationType: "town",
    intro: "Chirundu is a Zambezi border town offering overnight lodges, staff rooms, and logistics facilities.",
    highlights: "Find lodges, accommodation, and commercial premises in Chirundu.",
  }),

  // ======================== 7. MASVINGO ========================
  buildCity({
    name: "Masvingo",
    aliases: ["Masvingo City"],
    provinceSlug: "masvingo",
    locationType: "city",
    featuredOnHomepage: true,
    featuredGroup: "city",
    intro:
      "Masvingo offers residential rentals, student accommodation, guesthouses, lodges near Great Zimbabwe, and commercial spaces across town neighborhoods.",
    highlights:
      "Browse active listings in Rhodene, Target Kopje, Rujeko, Mucheke, Eastvale, and greater Masvingo.",
    suburbs: [
      { name: "Rhodene" },
      { name: "Target Kopje" },
      { name: "Rujeko" },
      { name: "Mucheke" },
      { name: "Eastvale" },
      { name: "Clovelly" },
      { name: "Zimre Park" },
    ],
  }),
  buildCity({
    name: "Chiredzi",
    provinceSlug: "masvingo",
    locationType: "town",
    intro: "Chiredzi is a Lowveld commercial and residential hub serving sugar-estate industries and Gonarezhou visitors.",
    highlights: "Explore rooms, houses, lodges, and commercial properties in Chiredzi.",
    suburbs: [{ name: "Tshovani" }],
  }),
  buildCity({
    name: "Triangle",
    provinceSlug: "masvingo",
    locationType: "town",
    intro: "Triangle is a Lowveld town in Chiredzi District with residential estates and commercial services.",
    highlights: "Search available listings in Triangle.",
  }),
  buildCity({
    name: "Rutenga",
    provinceSlug: "masvingo",
    locationType: "town",
    intro: "Rutenga is a railway and highway junction growth point in Mwenezi District, Masvingo Province.",
    highlights: "Browse rentals, guesthouses, and retail spaces in Rutenga.",
  }),
  buildCity({
    name: "Gutu",
    aliases: ["Mpandawana", "Gutu Mpandawana"],
    provinceSlug: "masvingo",
    locationType: "town",
    intro: "Gutu (Mpandawana) is a major district growth point and commercial hub in Masvingo Province.",
    highlights: "Find residential accommodation and shops in Gutu / Mpandawana.",
  }),
  buildCity({
    name: "Bikita",
    aliases: ["Nyika", "Nyika Growth Point"],
    provinceSlug: "masvingo",
    locationType: "locality",
    intro: "Bikita (including Nyika Growth Point) is a district centre in eastern Masvingo Province.",
    highlights: "Explore active properties in Bikita.",
  }),
  buildCity({
    name: "Zaka",
    aliases: ["Jerera", "Jerera Growth Point"],
    provinceSlug: "masvingo",
    locationType: "locality",
    intro: "Zaka (including Jerera Growth Point) serves southeastern Masvingo Province.",
    highlights: "Browse listings in Zaka and Jerera.",
  }),
  buildCity({
    name: "Mwenezi",
    aliases: ["Neshuro"],
    provinceSlug: "masvingo",
    locationType: "locality",
    intro: "Mwenezi (including Neshuro) is a district area along the Masvingo–Beitbridge corridor.",
    highlights: "Discover available properties in Mwenezi.",
  }),
  buildCity({
    name: "Mashava",
    provinceSlug: "masvingo",
    locationType: "town",
    intro: "Mashava is a historic mining town west of Masvingo hosting campus residences and residential cottages.",
    highlights: "Search student rooms and rentals in Mashava.",
  }),
  buildCity({
    name: "Great Zimbabwe",
    aliases: ["Great Zimbabwe Monuments", "Kyle"],
    provinceSlug: "masvingo",
    locationType: "tourism-destination",
    intro: "Great Zimbabwe and the Lake Mutirikwi area feature heritage lodges, guesthouses, and short-stay retreats.",
    highlights: "Find lodges and hospitality stays near Great Zimbabwe.",
  }),

  // ======================== 8. MATABELELAND NORTH ========================
  buildCity({
    name: "Victoria Falls",
    aliases: ["Vic Falls", "Mosi-oa-Tunya"],
    provinceSlug: "matabeleland-north",
    locationType: "tourism-destination",
    featuredOnHomepage: true,
    featuredGroup: "tourism",
    intro:
      "Victoria Falls is one of Zimbabwe's key tourism destinations, featuring lodges, hotels, guesthouses, staff rooms, residential cottages, and tourism-district commercial spaces.",
    highlights: "Explore hospitality stays, lodges, and residential listings in Victoria Falls with direct WhatsApp contact.",
    suburbs: [
      { name: "Chinotimba" },
      { name: "Mkhosana" },
      { name: "Aerodrome" },
      { name: "Low Density" },
    ],
  }),
  buildCity({
    name: "Hwange",
    provinceSlug: "matabeleland-north",
    locationType: "town",
    intro: "Hwange is a mining, power, and safari-gateway town in Matabeleland North.",
    highlights: "Browse residential rentals, guesthouses, and commercial properties in Hwange.",
    suburbs: [
      { name: "Empumalanga" },
      { name: "Baobab Hill" },
      { name: "Madumabisa" },
    ],
  }),
  buildCity({
    name: "Lupane",
    provinceSlug: "matabeleland-north",
    locationType: "town",
    intro: "Lupane is the provincial capital of Matabeleland North and home to Lupane State University.",
    highlights: "Find student rooms, residential rentals, and business spaces in Lupane.",
  }),
  buildCity({
    name: "Binga",
    provinceSlug: "matabeleland-north",
    locationType: "tourism-destination",
    intro: "Binga sits on the western shores of Lake Kariba, offering lakeside lodges, guesthouses, and town accommodation.",
    highlights: "Discover lodges, rooms, and stays in Binga.",
  }),
  buildCity({
    name: "Nkayi",
    provinceSlug: "matabeleland-north",
    locationType: "locality",
    intro: "Nkayi is a district administrative and trading centre in Matabeleland North.",
    highlights: "Browse active properties in Nkayi.",
  }),
  buildCity({
    name: "Dete",
    provinceSlug: "matabeleland-north",
    locationType: "town",
    intro: "Dete is the rail and hospitality gateway adjacent to Hwange National Park.",
    highlights: "Explore lodges, guesthouses, and rentals in Dete.",
  }),
  buildCity({
    name: "Tsholotsho",
    provinceSlug: "matabeleland-north",
    locationType: "locality",
    intro: "Tsholotsho is a district centre northwest of Bulawayo in Matabeleland North.",
    highlights: "Search available listings in Tsholotsho.",
  }),
  buildCity({
    name: "Inyathi",
    aliases: ["Inyati"],
    provinceSlug: "matabeleland-north",
    locationType: "locality",
    intro: "Inyathi is the district centre of Bubi District in Matabeleland North.",
    highlights: "Browse properties in Inyathi.",
  }),

  // ======================== 9. MATABELELAND SOUTH ========================
  buildCity({
    name: "Gwanda",
    provinceSlug: "matabeleland-south",
    locationType: "town",
    intro: "Gwanda is the provincial capital of Matabeleland South, serving mining, education, and regional commerce.",
    highlights: "Find residential rooms, houses, lodges, and commercial shops in Gwanda.",
    suburbs: [
      { name: "Jahunda" },
      { name: "Spitzkop" },
      { name: "Phakama" },
    ],
  }),
  buildCity({
    name: "Beitbridge",
    provinceSlug: "matabeleland-south",
    locationType: "town",
    featuredOnHomepage: true,
    featuredGroup: "city",
    intro:
      "Beitbridge is Zimbabwe's busiest southern border town, with high demand for short-stay lodges, guest rooms, logistics warehouses, and commercial offices.",
    highlights: "Discover stays, residential rooms, and commercial spaces in Beitbridge.",
    suburbs: [{ name: "Dulibadzimu", aliases: ["Dulivhadzimu"] }],
  }),
  buildCity({
    name: "Plumtree",
    provinceSlug: "matabeleland-south",
    locationType: "town",
    intro: "Plumtree is a western border town along the Bulawayo–Botswana corridor.",
    highlights: "Browse rooms, houses, guesthouses, and shops in Plumtree.",
    suburbs: [{ name: "Dingumuzi" }],
  }),
  buildCity({
    name: "Esigodini",
    aliases: ["Essexvale"],
    provinceSlug: "matabeleland-south",
    locationType: "town",
    intro: "Esigodini is a commuter and agricultural town southeast of Bulawayo.",
    highlights: "Find residential cottages, houses, and lodges in Esigodini.",
  }),
  buildCity({
    name: "Filabusi",
    provinceSlug: "matabeleland-south",
    locationType: "locality",
    intro: "Filabusi is a mining and administrative centre in Insiza District, Matabeleland South.",
    highlights: "Search available listings in Filabusi.",
  }),
  buildCity({
    name: "Insiza",
    provinceSlug: "matabeleland-south",
    locationType: "locality",
    intro: "Insiza serves farming and mining communities in northern Matabeleland South.",
    highlights: "Browse active properties in Insiza.",
  }),
  buildCity({
    name: "Kezi",
    provinceSlug: "matabeleland-south",
    locationType: "locality",
    intro: "Kezi is a district centre in Matobo District, Matabeleland South.",
    highlights: "Explore active properties in Kezi.",
  }),
  buildCity({
    name: "Maphisa",
    aliases: ["Antelope"],
    provinceSlug: "matabeleland-south",
    locationType: "town",
    intro: "Maphisa is a commercial growth point in Matobo District.",
    highlights: "Search rentals and commercial listings in Maphisa.",
  }),
  buildCity({
    name: "Colleen Bawn",
    provinceSlug: "matabeleland-south",
    locationType: "town",
    intro: "Colleen Bawn is a cement-manufacturing and residential settlement east of Gwanda.",
    highlights: "Browse available rooms and houses in Colleen Bawn.",
  }),
  buildCity({
    name: "West Nicholson",
    provinceSlug: "matabeleland-south",
    locationType: "locality",
    intro: "West Nicholson is a highway settlement along the Gwanda–Beitbridge route.",
    highlights: "Check available listings in West Nicholson.",
  }),

  // ======================== 10. MIDLANDS ========================
  buildCity({
    name: "Gweru",
    provinceSlug: "midlands",
    locationType: "city",
    featuredOnHomepage: true,
    featuredGroup: "city",
    intro:
      "Gweru serves the Midlands region with student accommodation near Midlands State University (MSU), residential cottages, commercial premises, and hospitality stays.",
    highlights:
      "Browse rentals, student accommodation, and commercial spaces in Senga, Southdowns, Daylesford, Lundi Park, and across Gweru.",
    suburbs: [
      { name: "Senga" },
      { name: "Southdowns" },
      { name: "Daylesford" },
      { name: "Lundi Park" },
      { name: "Mkoba" },
      { name: "Riverside" },
      { name: "Athlone" },
      { name: "Harben Park" },
      { name: "Kopje" },
      { name: "Ascot" },
      { name: "Nehosho" },
    ],
  }),
  buildCity({
    name: "Kwekwe",
    provinceSlug: "midlands",
    locationType: "city",
    featuredOnHomepage: true,
    featuredGroup: "city",
    intro:
      "Kwekwe connects Midlands industry with residential rentals, guesthouses, and commercial properties.",
    highlights: "Discover active rentals and business spaces across Kwekwe.",
    suburbs: [
      { name: "Mbizo" },
      { name: "Amaveni" },
      { name: "Msasa Park" },
      { name: "Fitchlea" },
      { name: "Newtown" },
    ],
  }),
  buildCity({
    name: "Zvishavane",
    provinceSlug: "midlands",
    locationType: "town",
    intro: "Zvishavane is a mining and university town in southern Midlands hosting Midlands State University faculties.",
    highlights: "Find student accommodation, rooms, houses, lodges, and commercial spaces in Zvishavane.",
    suburbs: [
      { name: "Mandava" },
      { name: "Makwasha" },
      { name: "Highlands" },
    ],
  }),
  buildCity({
    name: "Shurugwi",
    provinceSlug: "midlands",
    locationType: "town",
    intro: "Shurugwi is a scenic mining town south-east of Gweru in the Midlands.",
    highlights: "Browse rentals, guesthouses, and retail spaces in Shurugwi.",
    suburbs: [{ name: "Sebanga" }, { name: "Makusha" }],
  }),
  buildCity({
    name: "Mvuma",
    provinceSlug: "midlands",
    locationType: "town",
    intro: "Mvuma sits at the crossroads between Gweru, Harare, and Masvingo in Chirumanzu District.",
    highlights: "Search residential rentals, lodges, and shops in Mvuma.",
  }),
  buildCity({
    name: "Redcliff",
    provinceSlug: "midlands",
    locationType: "town",
    intro: "Redcliff is a residential and industrial municipality adjacent to Kwekwe in Midlands Province.",
    highlights: "Explore rooms, houses, and commercial spaces in Redcliff.",
    suburbs: [{ name: "Torwood" }, { name: "Rutendo" }],
  }),
  buildCity({
    name: "Mberengwa",
    aliases: ["Mataga"],
    provinceSlug: "midlands",
    locationType: "locality",
    intro: "Mberengwa covers Mataga growth point and surrounding centres in southern Midlands.",
    highlights: "Browse active properties in Mberengwa.",
  }),
  buildCity({
    name: "Gokwe",
    provinceSlug: "midlands",
    locationType: "town",
    intro: "Gokwe is a major agricultural and commercial town in northwestern Midlands Province.",
    highlights: "Find rooms, houses, lodges, and retail shops in Gokwe.",
  }),
  buildCity({
    name: "Lalapanzi",
    provinceSlug: "midlands",
    locationType: "locality",
    intro: "Lalapanzi is a settlement along the Gweru–Mvuma highway in Chirumanzu District.",
    highlights: "Search properties in Lalapanzi.",
  }),
  buildCity({
    name: "Silobela",
    provinceSlug: "midlands",
    locationType: "locality",
    intro: "Silobela is a district centre northwest of Kwekwe in Midlands Province.",
    highlights: "Check active properties in Silobela.",
  }),
];

// Featured city/town/tourism slugs shown on the compact homepage directory
export const FEATURED_CITY_SLUGS = LOCATION_CITIES.filter(
  (c) => c.featuredOnHomepage
).map((c) => c.slug);

export const FEATURED_MAJOR_CITY_SLUGS = LOCATION_CITIES.filter(
  (c) => c.featuredOnHomepage && c.featuredGroup !== "tourism"
).map((c) => c.slug);

export const FEATURED_TOURISM_SLUGS = LOCATION_CITIES.filter(
  (c) => c.featuredOnHomepage && c.featuredGroup === "tourism"
).map((c) => c.slug);

export const FEATURED_HARARE_SUBURB_SLUGS =
  LOCATION_CITIES.find((c) => c.slug === "harare")
    ?.suburbs.filter((s) => s.featuredOnHomepage)
    .map((s) => s.slug) || [];

// Ordered city display list for forms & filters (derives centrally from LOCATION_CITIES)
export const ALL_CATALOG_CITY_NAMES: string[] = LOCATION_CITIES.map((c) => c.name);

/**
 * Resolve a ProvinceDefinition by slug, official name, or alias.
 */
export function findProvinceBySlugOrName(param: string): ProvinceDefinition | null {
  const targetSlug = toSlug(param);
  const cleanParam = normalizeSearchToken(param);
  if (!targetSlug && !cleanParam) return null;

  return (
    ZIMBABWE_PROVINCES.find(
      (p) =>
        p.slug === targetSlug ||
        toSlug(p.name) === targetSlug ||
        p.aliases.some(
          (a) => toSlug(a) === targetSlug || normalizeSearchToken(a) === cleanParam
        )
    ) || null
  );
}

/**
 * Resolve a CityDefinition by slug, official name, or alias.
 */
export function findCityBySlugOrName(cityParam: string): CityDefinition | null {
  const targetSlug = toSlug(cityParam);
  const cleanParam = normalizeSearchToken(cityParam);
  if (!targetSlug && !cleanParam) return null;

  return (
    LOCATION_CITIES.find(
      (c) =>
        c.slug === targetSlug ||
        toSlug(c.name) === targetSlug ||
        c.aliases.some(
          (a) => toSlug(a) === targetSlug || normalizeSearchToken(a) === cleanParam
        )
    ) || null
  );
}

export function findSuburbInCity(
  city: CityDefinition,
  suburbParam: string
): SuburbDefinition | null {
  const targetSlug = toSlug(suburbParam);
  const cleanParam = normalizeSearchToken(suburbParam);
  if (!targetSlug && !cleanParam) return null;

  return (
    city.suburbs.find(
      (s) =>
        s.slug === targetSlug ||
        s.aliases.some(
          (alias) =>
            toSlug(alias) === targetSlug || normalizeSearchToken(alias) === cleanParam
        )
    ) || null
  );
}

export function matchesSuburbName(
  listingSuburb: string,
  suburb: SuburbDefinition
): boolean {
  const cleanListing = toSlug(listingSuburb);
  if (!cleanListing) return false;
  return (
    cleanListing === suburb.slug ||
    suburb.aliases.some((alias) => toSlug(alias) === cleanListing)
  );
}

export function getCitiesInProvince(provinceSlug: string): CityDefinition[] {
  return LOCATION_CITIES.filter((c) => c.provinceSlug === provinceSlug);
}

export function getSuburbNamesForCity(cityNameOrSlug: string): string[] {
  const city = findCityBySlugOrName(cityNameOrSlug);
  if (city && city.suburbs.length > 0) {
    return city.suburbs.map((s) => s.name);
  }
  return [
    "Avonlea",
    "Mount Pleasant",
    "Borrowdale",
    "Hillside",
    "Senga",
    "Murambi",
    "Rimuka",
    "Nyamhunga",
  ];
}

/**
 * Flattened catalogue of all Provinces, Cities/Towns/Tourism Destinations, and Suburbs
 * for unified directory browsing & instant alias-aware search.
 */
export const CATALOG_SEARCH_ENTRIES: CatalogLocationEntry[] = (() => {
  const entries: CatalogLocationEntry[] = [];

  for (const prov of ZIMBABWE_PROVINCES) {
    entries.push({
      id: `province:${prov.slug}`,
      slug: prov.slug,
      name: prov.name,
      aliases: prov.aliases,
      province: prov.name,
      provinceSlug: prov.slug,
      locationType: "province",
      path: `/?province=${prov.slug}`,
      featuredOnHomepage: prov.featuredOnHomepage,
      seoTitle: prov.seoTitle,
      seoDescription: prov.seoDescription,
    });
  }

  for (const city of LOCATION_CITIES) {
    entries.push({
      id: `city:${city.slug}`,
      slug: city.slug,
      name: city.name,
      aliases: city.aliases,
      province: city.province,
      provinceSlug: city.provinceSlug,
      parentId: city.provinceSlug,
      parentName: city.province,
      parentSlug: city.provinceSlug,
      locationType: city.locationType,
      path: `/?city=${encodeURIComponent(city.name)}`,
      featuredOnHomepage: city.featuredOnHomepage,
      seoTitle: city.seoTitle,
      seoDescription: city.seoDescription,
    });

    for (const sub of city.suburbs) {
      entries.push({
        id: `suburb:${city.slug}:${sub.slug}`,
        slug: sub.slug,
        name: sub.name,
        aliases: sub.aliases,
        province: city.province,
        provinceSlug: city.provinceSlug,
        parentId: city.slug,
        parentName: city.name,
        parentSlug: city.slug,
        locationType: sub.locationType,
        path: `/?city=${encodeURIComponent(city.name)}&suburb=${encodeURIComponent(sub.name)}`,
        featuredOnHomepage: sub.featuredOnHomepage,
        seoTitle: sub.seoTitle || "",
        seoDescription: sub.seoDescription || "",
      });
    }
  }

  return entries;
})();

/**
 * Search the central location catalogue with alias support and relevance ranking.
 */
export function searchLocationsCatalogue(
  query: string,
  limit: number = 25
): CatalogLocationEntry[] {
  const clean = normalizeSearchToken(query);
  if (!clean) return [];
  const slugQuery = toSlug(clean);

  const scored: Array<{ entry: CatalogLocationEntry; score: number }> = [];

  for (const entry of CATALOG_SEARCH_ENTRIES) {
    const nameLower = normalizeSearchToken(entry.name);
    const parentLower = entry.parentName ? normalizeSearchToken(entry.parentName) : "";
    const provinceLower = normalizeSearchToken(entry.province);
    const aliasTokens = entry.aliases.map(normalizeSearchToken);

    let score = 0;

    if (nameLower === clean || entry.slug === slugQuery) {
      score = 100;
    } else if (
      clean.includes(" ") &&
      parentLower &&
      (`${nameLower} ${parentLower}` === clean ||
        `${parentLower} ${nameLower}` === clean ||
        aliasTokens.some((a) => `${a} ${parentLower}` === clean || `${parentLower} ${a}` === clean))
    ) {
      score = 96;
    } else if (aliasTokens.some((a) => a === clean || toSlug(a) === slugQuery)) {
      score = 92;
    } else if (nameLower.startsWith(clean)) {
      score = 80;
    } else if (aliasTokens.some((a) => a.startsWith(clean))) {
      score = 72;
    } else if (nameLower.includes(clean)) {
      score = 60;
    } else if (aliasTokens.some((a) => a.includes(clean))) {
      score = 52;
    } else if (
      clean.includes(" ") &&
      parentLower &&
      (`${nameLower} ${parentLower}`.includes(clean) ||
        `${parentLower} ${nameLower}`.includes(clean) ||
        aliasTokens.some((a) => `${a} ${parentLower}`.includes(clean) || `${parentLower} ${a}`.includes(clean)))
    ) {
      score = 48;
    } else if (provinceLower === clean || provinceLower.startsWith(clean)) {
      score = 35;
    }

    if (score > 0) {
      // Slight tie-breaker preference: city/town/tourism > province > suburb
      const typeBoost =
        entry.locationType === "city" ||
        entry.locationType === "town" ||
        entry.locationType === "tourism-destination"
          ? 3
          : entry.locationType === "province"
          ? 2
          : 1;
      scored.push({ entry, score: score + typeBoost * 0.1 });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return scored.slice(0, limit).map((s) => s.entry);
}

/**
 * Format location type human label cleanly for UI badges & search suggestions.
 */
export function formatLocationTypeLabel(type: LocationType): string {
  switch (type) {
    case "province":
      return "Province";
    case "city":
      return "City";
    case "town":
      return "Town";
    case "tourism-destination":
      return "Tourism Destination";
    case "suburb":
      return "Suburb";
    case "locality":
      return "Locality";
    default:
      return "Location";
  }
}

/**
 * Determine whether a listing resolves to a specific canonical CityDefinition & SuburbDefinition.
 * Handles direct city matches, city aliases (e.g. "Vic Falls" -> "Victoria Falls"),
 * and fallback locality matching (if a listing put a known suburb/locality in city field).
 */
export function resolveListingLocation(listing: any): {
  city: CityDefinition | null;
  suburb: SuburbDefinition | null;
  provinceSlug: string | null;
} {
  if (!listing) return { city: null, suburb: null, provinceSlug: null };

  const rawCity = String(listing.city || "").trim();
  const rawSuburb = String(listing.suburb || "").trim();

  // Check if rawSuburb is actually one of our catalogued standalone towns inside a metro (e.g. Ruwa listed under Harare)
  const suburbAsStandaloneTown = rawSuburb ? findCityBySlugOrName(rawSuburb) : null;
  if (
    suburbAsStandaloneTown &&
    suburbAsStandaloneTown.slug !== toSlug(rawCity) &&
    ["ruwa", "norton", "epworth", "chitungwiza", "mazowe"].includes(
      suburbAsStandaloneTown.slug
    )
  ) {
    return {
      city: suburbAsStandaloneTown,
      suburb: null,
      provinceSlug: suburbAsStandaloneTown.provinceSlug,
    };
  }

  let city = rawCity ? findCityBySlugOrName(rawCity) : null;
  let suburb = city && rawSuburb ? findSuburbInCity(city, rawSuburb) : null;

  // Fallback: if listing.city wasn't matched as a city, check if it matches a known suburb/locality (e.g. Juliasdale)
  if (!city && rawCity) {
    for (const candidateCity of LOCATION_CITIES) {
      const matchedSub = findSuburbInCity(candidateCity, rawCity);
      if (matchedSub) {
        city = candidateCity;
        suburb = rawSuburb ? findSuburbInCity(candidateCity, rawSuburb) || matchedSub : matchedSub;
        break;
      }
    }
  }

  return {
    city,
    suburb,
    provinceSlug: city ? city.provinceSlug : null,
  };
}

/**
 * Shared availability check predicate (mirrors seoData.isListingAvailable without circular import).
 */
export function isCatalogListingAvailable(listing: any, nowMs: number = Date.now()): boolean {
  if (!listing) return false;
  const rawStatus = String(listing.status || listing.verification_status || "Active").trim();
  if (rawStatus !== "Active" && rawStatus !== "verified") {
    return false;
  }
  const expiryDate = listing.expiryDate || listing.expiry_date;
  if (expiryDate) {
    const expMs = Date.parse(String(expiryDate));
    if (!Number.isNaN(expMs) && expMs < nowMs) {
      return false;
    }
  }
  return true;
}

/**
 * Compute database-driven active property counts per province, city/town, and suburb.
 * Strictly deduplicates by listing ID, excludes deleted/delisted/rented/unavailable/expired listings,
 * and never double-counts suburbs onto cities or cities onto provinces.
 */
export function computeLocationCounts(
  rawListings: any[],
  nowMs: number = Date.now()
): LocationMatchCounts {
  const byProvince: Record<string, number> = {};
  const byCity: Record<string, number> = {};
  const bySuburb: Record<string, number> = {};
  const seenIds = new Set<string>();
  let totalActive = 0;

  for (const row of rawListings || []) {
    if (!row || row.id === undefined || row.id === null) continue;
    const id = String(row.id);
    if (seenIds.has(id)) continue;
    if (!isCatalogListingAvailable(row, nowMs)) continue;

    seenIds.add(id);
    totalActive++;

    const resolved = resolveListingLocation(row);
    if (resolved.provinceSlug) {
      byProvince[resolved.provinceSlug] = (byProvince[resolved.provinceSlug] || 0) + 1;
    }
    if (resolved.city) {
      byCity[resolved.city.slug] = (byCity[resolved.city.slug] || 0) + 1;
      if (resolved.suburb) {
        const subKey = `${resolved.city.slug}/${resolved.suburb.slug}`;
        bySuburb[subKey] = (bySuburb[subKey] || 0) + 1;
      }
    }
  }

  return {
    totalActive,
    byProvince,
    byCity,
    bySuburb,
  };
}
