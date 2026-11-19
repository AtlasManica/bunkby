/**
 * Shared Pure-TypeScript SEO Architecture, Location Catalog, Schema.org Builders & Sitemap Generator
 * Compatible with Cloudflare Pages Functions (Web Standards), Express (Node.js), and React SPA.
 */

import {
  ALL_CATALOG_CITY_NAMES,
  CATALOG_SEARCH_ENTRIES,
  CatalogLocationEntry,
  CityDefinition,
  FEATURED_CITY_SLUGS,
  FEATURED_HARARE_SUBURB_SLUGS,
  FEATURED_MAJOR_CITY_SLUGS,
  FEATURED_TOURISM_SLUGS,
  LOCATION_CITIES,
  LocationMatchCounts,
  LocationType,
  ProvinceDefinition,
  SuburbDefinition,
  ZIMBABWE_PROVINCES,
  computeLocationCounts,
  findCityBySlugOrName,
  findProvinceBySlugOrName,
  findSuburbInCity,
  formatLocationTypeLabel,
  getCitiesInProvince,
  getSuburbNamesForCity,
  isCatalogListingAvailable,
  matchesSuburbName,
  resolveListingLocation,
  searchLocationsCatalogue,
  toSlug,
} from "./locationCatalog";

export {
  ALL_CATALOG_CITY_NAMES,
  CATALOG_SEARCH_ENTRIES,
  FEATURED_CITY_SLUGS,
  FEATURED_HARARE_SUBURB_SLUGS,
  FEATURED_MAJOR_CITY_SLUGS,
  FEATURED_TOURISM_SLUGS,
  LOCATION_CITIES,
  ZIMBABWE_PROVINCES,
  computeLocationCounts,
  findCityBySlugOrName,
  findProvinceBySlugOrName,
  findSuburbInCity,
  formatLocationTypeLabel,
  getCitiesInProvince,
  getSuburbNamesForCity,
  matchesSuburbName,
  resolveListingLocation,
  searchLocationsCatalogue,
  toSlug,
};
export type {
  CatalogLocationEntry,
  CityDefinition,
  LocationMatchCounts,
  LocationType,
  ProvinceDefinition,
  SuburbDefinition,
};

export const SITE_URL = "https://bunkby.com";
export const SITE_NAME = "BunkBy";
export const OPERATOR_NAME = "Atlas Manica Group";
export const WHATSAPP_NUMBER_DISPLAY = "+263 78 978 3200";
export const WHATSAPP_E164 = "263789783200";
export const WHATSAPP_BASE_URL = `https://wa.me/${WHATSAPP_E164}`;

export function getWhatsAppLink(message?: string): string {
  if (!message) return WHATSAPP_BASE_URL;
  return `${WHATSAPP_BASE_URL}?text=${encodeURIComponent(message)}`;
}

export type MarketplaceCategoryKey = "residential" | "hospitality" | "commercial" | "student";

export interface CategoryDefinition {
  key: MarketplaceCategoryKey;
  slug: string;
  name: string;
  headline: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  propertyTypes: string[];
}

export const CATEGORY_DEFINITIONS: Record<MarketplaceCategoryKey, CategoryDefinition> = {
  residential: {
    key: "residential",
    slug: "residential",
    name: "Residential Rentals",
    headline: "Residential Rooms, Cottages, Flats & Houses in Zimbabwe",
    metaTitle: "Residential Rentals in Zimbabwe – Rooms, Cottages & Houses | BunkBy",
    metaDescription:
      "Browse available rooms, cottages, apartments, flats, townhouses, and full houses across Zimbabwe on BunkBy with direct landlord contact.",
    intro:
      "Discover residential rental accommodation across Zimbabwe including single rooms, bedsits, self-contained cottages, apartments, flats, townhouses, and full houses listed directly by landlords with zero agent commissions.",
    propertyTypes: [
      "Single Room",
      "Cottage",
      "2 rooms",
      "3 rooms",
      "Full house",
      "Apartment / Flat",
      "Townhouse / Cluster",
      "Shared Space",
      "House Sale",
      "Bed-sitter",
    ],
  },
  hospitality: {
    key: "hospitality",
    slug: "hospitality",
    name: "Hospitality & Stays",
    headline: "Lodges, Guesthouses, Hotels & Short Stays in Zimbabwe",
    metaTitle: "Lodges, Guesthouses & Hotels in Zimbabwe | BunkBy",
    metaDescription:
      "Find lodges, guesthouses, hotels, and bed & breakfast stays across Harare, Victoria Falls, Bulawayo, Mutare, Kariba, and Nyanga with direct host WhatsApp inquiries.",
    intro:
      "Explore lodges, guesthouses, hotels, and short stays across Zimbabwe with listed nightly rates and direct WhatsApp inquiries to hosts.",
    propertyTypes: [
      "Lodge / Guesthouse",
      "Lodge",
      "Guesthouse",
      "Guest House",
      "Hotel",
      "Bed & Breakfast",
      "Boutique Hotel",
      "Short-Stay Apartment",
    ],
  },
  commercial: {
    key: "commercial",
    slug: "commercial",
    name: "Commercial Properties",
    headline: "Shops, Offices, Warehouses & Market Tables in Zimbabwe",
    metaTitle: "Commercial Properties for Rent in Zimbabwe – Shops, Offices & Warehouses | BunkBy",
    metaDescription:
      "Discover commercial properties for rent in Zimbabwe including retail shops, office spaces, warehouses, and flea market tables on BunkBy or via WhatsApp (+263 78 978 3200).",
    intro:
      "Browse commercial spaces across Zimbabwe including retail shops, office spaces, warehouses, and market stalls/tables listed directly by property owners and landlords.",
    propertyTypes: ["Commercial", "Shop", "Office", "Warehouse", "Table"],
  },
  student: {
    key: "student",
    slug: "student",
    name: "Student Accommodation",
    headline: "Student Hostels, Boarding Houses & Off-Campus Rooms in Zimbabwe",
    metaTitle: "Student Accommodation in Zimbabwe – Hostels & Boarding Houses | BunkBy",
    metaDescription:
      "Find student hostels, boarding houses, single student rooms, and shared rooms near universities and colleges across Harare, Bulawayo, Gweru, and Zimbabwe.",
    intro:
      "Compare student hostels, boarding houses, single student rooms, and shared student rooms near Zimbabwean universities and colleges with clear monthly or per-semester rates.",
    propertyTypes: [
      "Student Hostel",
      "Boarding House",
      "Single Student Room",
      "Shared Student Room",
    ],
  },
};

// Location catalogue types, data, and helpers are centralised in ./locationCatalog.ts and re-exported above.

export function normalizeListingRow(row: any): any {
  if (!row) return null;
  const amenities =
    typeof row.amenities === "string"
      ? (() => {
          try {
            const p = JSON.parse(row.amenities || "[]");
            return Array.isArray(p) ? p : [];
          } catch {
            return [];
          }
        })()
      : Array.isArray(row.amenities)
      ? row.amenities
      : [];

  const images = (() => {
    if (Array.isArray(row.images) && row.images.length > 0) return row.images;
    if (!row.image_url) return [];
    const str = String(row.image_url).trim();
    if (str.startsWith("[")) {
      try {
        const arr = JSON.parse(str);
        if (Array.isArray(arr)) return arr.filter(Boolean);
      } catch {
        // ignore
      }
    }
    return str ? [str] : [];
  })();

  const propType = row.propertyType || row.property_type || "Single Room";
  const tenantType = row.tenantType || row.tenant_type || "General";
  const category =
    row.category ||
    (["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Guest House", "Bed & Breakfast"].includes(propType)
      ? "hospitality"
      : ["Commercial", "Shop", "Warehouse", "Table", "Office"].includes(propType)
      ? "commercial"
      : ["Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"].includes(propType) ||
        tenantType === "Student"
      ? "student"
      : "residential");

  const status = row.status || row.verification_status || "Active";

  return {
    id: String(row.id),
    title: String(row.title || "").trim(),
    category,
    businessName: row.businessName || row.business_name || null,
    business_name: row.business_name || row.businessName || null,
    city: String(row.city || "Harare").trim(),
    suburb: String(row.suburb || "").trim(),
    landmark: String(row.landmark || "").trim(),
    price: Number(row.price || 0),
    deposit: Number(row.deposit || 0),
    frequency: row.frequency || row.rent_cycle || "Month",
    propertyType: propType,
    tenantType,
    amenities,
    contactMethod: row.contactMethod || row.contact_method || "Call / Whatsapp",
    phone: row.phone || row.contact_phone || "",
    landlordName: row.landlordName || row.full_name || "Property Advertiser",
    landlord_id: row.landlord_id,
    isVerifiedLandlord: Boolean(
      row.isVerifiedLandlord ||
        row.landlordVerificationStatus === "verified" ||
        row.landlordVerificationStatus === "approved"
    ),
    status,
    images,
    image_url: row.image_url,
    createdAt: row.createdAt || row.created_at || "",
    leadsCount: Number(row.leadsCount ?? row.leads_count ?? 0),
    isPremium: Boolean(row.isPremium ?? row.is_premium),
    listingTier: row.listingTier || row.listing_tier || (row.is_premium ? "paid" : "free"),
    expiryDate: row.expiryDate || row.expiry_date || null,
    isSample: Boolean(row.isSample ?? row.is_sample),
    description: row.description || null,
  };
}

export function isListingAvailable(listing: any, nowMs: number = Date.now()): boolean {
  return isCatalogListingAvailable(listing, nowMs);
}

export function getPublicListingImageUrl(listing: any, origin: string = SITE_URL): string {
  const id = listing?.id;
  const images = Array.isArray(listing?.images) ? listing.images : [];
  const first = String(images[0] || listing?.image_url || "").trim();
  if (first.startsWith("http://") || first.startsWith("https://")) {
    return first;
  }
  if (first.startsWith("data:") && id) {
    return `${origin}/api/rooms/${encodeURIComponent(String(id))}/photo`;
  }
  return `${origin}/og-image.png`;
}

export function getListingCategoryKey(listing: any): MarketplaceCategoryKey {
  const rawCat = String(listing?.category || "").toLowerCase();
  const propType = String(listing?.propertyType || listing?.property_type || "");
  if (rawCat === "commercial" || ["Commercial", "Shop", "Warehouse", "Table", "Office"].includes(propType)) {
    return "commercial";
  }
  if (
    rawCat === "student" ||
    ["Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"].includes(propType) ||
    listing?.tenantType === "Student" ||
    listing?.tenant_type === "Student"
  ) {
    return "student";
  }
  if (
    rawCat === "hospitality" ||
    ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Guest House", "Bed & Breakfast", "Boutique Hotel", "Short-Stay Apartment"].includes(propType)
  ) {
    return "hospitality";
  }
  return "residential";
}

export interface SeoPagePayload {
  httpStatus: number;
  title: string;
  description: string;
  canonicalUrl: string;
  robots: string;
  ogType: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  jsonLd: Record<string, any> | null;
  ssrHtml: string;
}

export function escapeHtml(input: string): string {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPriceSuffix(frequency?: string): string {
  const f = String(frequency || "Month").trim();
  return f ? `/${f}` : "/Month";
}

function buildListingCardSsrHtml(listing: any): string {
  const href = `/listing/${encodeURIComponent(String(listing.id))}`;
  const loc = [listing.suburb, listing.city].filter(Boolean).join(", ");
  const catName = CATEGORY_DEFINITIONS[getListingCategoryKey(listing)].name;
  return `<article style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff;margin-bottom:12px;">
    <h3 style="margin:0 0 6px;font-size:17px;color:#052659;"><a href="${escapeHtml(href)}" style="color:#052659;text-decoration:none;">${escapeHtml(listing.title)}</a></h3>
    <p style="margin:0 0 6px;font-size:14px;color:#334155;"><strong>$${escapeHtml(String(listing.price))}${escapeHtml(formatPriceSuffix(listing.frequency))}</strong> &middot; ${escapeHtml(listing.propertyType)} (${escapeHtml(catName)})</p>
    <p style="margin:0 0 8px;font-size:13px;color:#475569;">Location: ${escapeHtml(loc)}${listing.landmark ? ` &middot; ${escapeHtml(listing.landmark)}` : ""}</p>
    <a href="${escapeHtml(href)}" style="font-size:13px;font-weight:bold;color:#FF7A00;">View Property Details &rarr;</a>
  </article>`;
}

export const WHATSAPP_FAQ_ITEMS = [
  {
    question: "How do I search for accommodation or commercial spaces on WhatsApp?",
    answer: `Message BunkBy on WhatsApp at ${WHATSAPP_NUMBER_DISPLAY} (${WHATSAPP_BASE_URL}). You can send natural-language searches such as "cottage in Avondale under $250", "shops in Harare CBD", or "student hostel near MSU", or choose guided interactive filters by category and location.`,
  },
  {
    question: "How many listings does the WhatsApp assistant send at once?",
    answer:
      "Search results are returned in paginated batches of up to 5 active listings per page. When more matching listings are available, you can tap the Next 5 Results button to load the next page.",
  },
  {
    question: "What property categories can I find or list on WhatsApp?",
    answer:
      "You can search and list across four categories: Residential Rentals (rooms, cottages, flats, houses), Hospitality & Stays (lodges, guesthouses, hotels, B&Bs), Commercial Properties (retail shops, offices, warehouses, market tables), and Student Accommodation (hostels, boarding houses, student rooms).",
  },
  {
    question: "How do landlords publish and manage listings via WhatsApp?",
    answer:
      'Send "list" or tap "Post Property" on WhatsApp to start the guided step-by-step listing flow. You can also send "my listings" to view your properties, "photos [listing ID]" to request listing photos, "delete [listing ID]" to remove a listing, or "CANCEL" at any step to cancel an active session.',
  },
  {
    question: "Does BunkBy charge agent commissions?",
    answer:
      "No. BunkBy connects property seekers, students, businesses, and travellers directly with property owners and advertisers without estate agent commissions.",
  },
];

export function buildHomeSeo(activeListings: any[]): SeoPagePayload {
  const title = "BunkBy – Zimbabwe Property Marketplace & Accommodation on WhatsApp";
  const description =
    "Find residential rentals, rooms, cottages, houses, student accommodation, guesthouses, lodges, and commercial properties across Zimbabwe on BunkBy or via WhatsApp (+263 78 978 3200) with zero agent fees.";
  const canonicalUrl = `${SITE_URL}/`;
  const recent = activeListings.slice(0, 12);

  const ssrHtml = `<main style="font-family:sans-serif;max-width:960px;margin:24px auto;padding:20px;background:#fff;color:#1e293b;border-radius:12px;">
    <header style="margin-bottom:20px;border-bottom:1px solid #e2e8f0;padding-bottom:14px;">
      <p style="font-size:12px;text-transform:uppercase;color:#FF7A00;font-weight:bold;margin:0 0 6px;">${SITE_NAME} Zimbabwe &middot; Operated by ${OPERATOR_NAME}</p>
      <h1 style="color:#052659;font-size:28px;margin:0 0 8px;">Find Stays, Commercial Spaces &amp; Rentals in Zimbabwe</h1>
      <p style="font-size:15px;line-height:1.6;margin:0;">BunkBy is an agent-free property and accommodation marketplace across Zimbabwe for rooms, houses, cottages, flats, student accommodation, guesthouses, lodges, and commercial spaces—available on the web and on WhatsApp at <a href="${WHATSAPP_BASE_URL}">${WHATSAPP_NUMBER_DISPLAY}</a> (<a href="/whatsapp" style="color:#15803d;font-weight:bold;">WhatsApp Guide</a>).</p>
    </header>
    ${
      recent.length > 0
        ? `<section><h2 style="font-size:18px;color:#052659;">Active Property Listings in Zimbabwe</h2>${recent
            .map(buildListingCardSsrHtml)
            .join("")}</section>`
        : ""
    }
    <footer style="margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:13px;color:#475569;">
      <a href="/privacy-policy">Privacy Policy</a> &middot; Powered by Zen Accommodation
    </footer>
  </main>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        legalName: OPERATOR_NAME,
        url: `${SITE_URL}/`,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/bunkbylogo.png`,
          width: 1254,
          height: 1254,
        },
        contactPoint: {
          "@type": "ContactPoint",
          telephone: "+263789783200",
          contactType: "customer service",
          areaServed: "ZW",
          availableLanguage: ["en"],
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description,
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
        inLanguage: "en-ZW",
      },
    ],
  };

  return {
    httpStatus: 200,
    title,
    description,
    canonicalUrl,
    robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    ogType: "website",
    ogTitle: title,
    ogDescription: description,
    ogImage: `${SITE_URL}/og-image.png`,
    jsonLd,
    ssrHtml,
  };
}

export function buildWhatsAppSeo(): SeoPagePayload {
  const title = "Find and List Accommodation on WhatsApp | BunkBy Zimbabwe";
  const description = `Search rooms, cottages, student accommodation, lodges, and commercial properties in Zimbabwe or publish your own property listing on WhatsApp with BunkBy (${WHATSAPP_NUMBER_DISPLAY}) with zero agent fees.`;
  const canonicalUrl = `${SITE_URL}/whatsapp`;

  const ssrHtml = `<main style="font-family:sans-serif;max-width:900px;margin:24px auto;padding:24px;background:#fff;color:#1e293b;border-radius:12px;">
    <nav aria-label="Breadcrumb" style="font-size:13px;margin-bottom:16px;"><a href="/">BunkBy Home</a> &rsaquo; <span>WhatsApp Property Assistant</span></nav>
    <h1 style="color:#052659;font-size:30px;margin:0 0 12px;">Find and List Accommodation on WhatsApp in Zimbabwe</h1>
    <p style="font-size:15px;line-height:1.6;">BunkBy's official WhatsApp Business assistant (${WHATSAPP_NUMBER_DISPLAY}) lets property seekers find available properties and allows landlords to publish listings directly through WhatsApp without agent commissions.</p>
    <p style="margin:16px 0;"><a href="${getWhatsAppLink("Hi BunkBy! I would like to find accommodation.")}" style="display:inline-block;background:#15803d;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Chat with BunkBy on WhatsApp (${WHATSAPP_NUMBER_DISPLAY})</a></p>
    <section style="margin-top:20px;">
      <h2 style="color:#052659;font-size:20px;">For Property Seekers</h2>
      <ul>
        <li>Search by city, suburb, category (Residential, Hospitality, Commercial, Student), or price limit (for example: "cottage in Harare under $250" or "shops in Harare CBD").</li>
        <li>Browse paginated batches of 5 active listings per page and tap "Next 5 Results" to continue.</li>
        <li>Request photos using "photos [ID]" and contact advertisers directly.</li>
      </ul>
    </section>
    <section style="margin-top:20px;">
      <h2 style="color:#052659;font-size:20px;">For Landlords and Property Advertisers</h2>
      <ul>
        <li>Send "list" on WhatsApp for guided step-by-step property submission across Residential, Hospitality, Commercial (Shop, Commercial/Office, Warehouse, Table), and Student categories.</li>
        <li>Send "my listings" to check your active listings or "delete [ID]" to remove a listing; type "CANCEL" anytime to cancel an active flow.</li>
      </ul>
    </section>
    <section style="margin-top:20px;">
      <h2 style="color:#052659;font-size:20px;">Frequently Asked Questions</h2>
      ${WHATSAPP_FAQ_ITEMS.map(
        (faq) => `<div style="margin-bottom:12px;"><h3 style="font-size:16px;margin:0 0 4px;color:#052659;">${escapeHtml(faq.question)}</h3><p style="font-size:14px;margin:0;color:#475569;">${escapeHtml(faq.answer)}</p></div>`
      ).join("")}
    </section>
  </main>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": canonicalUrl,
        url: canonicalUrl,
        name: title,
        description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        inLanguage: "en-ZW",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "WhatsApp Assistant", item: canonicalUrl },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: WHATSAPP_FAQ_ITEMS.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };

  return {
    httpStatus: 200,
    title,
    description,
    canonicalUrl,
    robots: "index, follow",
    ogType: "website",
    ogTitle: title,
    ogDescription: description,
    ogImage: `${SITE_URL}/og-image.png`,
    jsonLd,
    ssrHtml,
  };
}

export function buildPrivacySeo(): SeoPagePayload {
  const title = "Privacy Policy | BunkBy – Zimbabwe Property Marketplace";
  const description = `Official Privacy Policy for BunkBy (operated by ${OPERATOR_NAME}). Learn how accommodation listings, enquiries, and WhatsApp assistant interactions (${WHATSAPP_NUMBER_DISPLAY}) are handled under Zimbabwe law.`;
  const canonicalUrl = `${SITE_URL}/privacy-policy`;

  return {
    httpStatus: 200,
    title,
    description,
    canonicalUrl,
    robots: "index, follow",
    ogType: "website",
    ogTitle: title,
    ogDescription: description,
    ogImage: `${SITE_URL}/og-image.png`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      url: canonicalUrl,
      name: title,
      description,
      inLanguage: "en-ZW",
    },
    ssrHtml: `<main style="font-family:sans-serif;max-width:850px;margin:24px auto;padding:24px;background:#fff;color:#1e293b;border-radius:12px;">
      <nav aria-label="Breadcrumb" style="font-size:13px;margin-bottom:14px;"><a href="/">BunkBy Home</a> &rsaquo; <span>Privacy Policy</span></nav>
      <h1 style="color:#052659;">Privacy Policy</h1>
      <p>This Privacy Policy explains how BunkBy, operated by ${OPERATOR_NAME}, handles personal information for our accommodation marketplace and WhatsApp Business assistant in Zimbabwe.</p>
      <p><a href="/">Return to BunkBy</a></p>
    </main>`,
  };
}

export function buildListingSeo(rawListing: any | null, idParam: string): SeoPagePayload {
  const cleanId = String(idParam || "").trim();
  if (!rawListing) {
    const canonicalUrl = `${SITE_URL}/listing/${encodeURIComponent(cleanId)}`;
    return {
      httpStatus: 404,
      title: "Property Listing Not Found | BunkBy Zimbabwe",
      description: "This property listing could not be found or has been removed from BunkBy.",
      canonicalUrl,
      robots: "noindex, nofollow",
      ogType: "website",
      ogTitle: "Property Listing Not Found | BunkBy Zimbabwe",
      ogDescription: "This property listing is no longer available on BunkBy.",
      ogImage: `${SITE_URL}/og-image.png`,
      jsonLd: null,
      ssrHtml: `<main style="font-family:sans-serif;max-width:850px;margin:24px auto;padding:24px;background:#fff;color:#1e293b;border-radius:12px;">
        <h1 style="color:#052659;">Property Listing Not Found</h1>
        <p>This listing has been removed or does not exist. Explore currently available properties in Zimbabwe on <a href="/">BunkBy</a>.</p>
      </main>`,
    };
  }

  const listing = normalizeListingRow(rawListing);
  const canonicalUrl = `${SITE_URL}/listing/${encodeURIComponent(String(listing.id))}`;
  const cityDef = findCityBySlugOrName(listing.city);
  const suburbDef = cityDef ? findSuburbInCity(cityDef, listing.suburb) : null;
  const locationLabel = [listing.suburb, listing.city].filter(Boolean).join(", ");
  const available = isListingAvailable(listing);

  if (!available) {
    return {
      httpStatus: 410,
      title: `Listing No Longer Available – ${listing.city || "Zimbabwe"} | BunkBy`,
      description: `This ${listing.propertyType} listing in ${locationLabel || "Zimbabwe"} is currently ${listing.status || "unavailable"} on BunkBy.`,
      canonicalUrl,
      robots: "noindex, nofollow",
      ogType: "website",
      ogTitle: `Listing No Longer Available | BunkBy`,
      ogDescription: `This listing in ${locationLabel || "Zimbabwe"} is no longer active. Browse current properties on BunkBy.`,
      ogImage: `${SITE_URL}/og-image.png`,
      jsonLd: null,
      ssrHtml: `<main style="font-family:sans-serif;max-width:850px;margin:24px auto;padding:24px;background:#fff;color:#1e293b;border-radius:12px;">
        <h1 style="color:#052659;">This Listing Is No Longer Available</h1>
        <p>The listing <strong>${escapeHtml(listing.title)}</strong> in ${escapeHtml(locationLabel)} is currently marked as <strong>${escapeHtml(listing.status)}</strong>.</p>
        <p><a href="/">Search available properties on BunkBy</a></p>
      </main>`,
    };
  }

  const catKey = getListingCategoryKey(listing);
  const catDef = CATEGORY_DEFINITIONS[catKey];
  const ogImage = getPublicListingImageUrl(listing, SITE_URL);

  const title = `${listing.title} – ${listing.propertyType} in ${locationLabel} | BunkBy`;
  const amenitiesText =
    listing.amenities.length > 0 ? ` Amenities: ${listing.amenities.slice(0, 4).join(", ")}.` : "";
  const description = `${listing.propertyType} in ${locationLabel} (${catDef.name}) for $${listing.price}${formatPriceSuffix(
    listing.frequency
  )}.${listing.landmark ? ` Near ${listing.landmark}.` : ""}${amenitiesText} Contact directly on BunkBy with zero agent fees.`;

  const breadcrumbItems: Array<Record<string, any>> = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    {
      "@type": "ListItem",
      position: 2,
      name: listing.title,
      item: canonicalUrl,
    },
  ];

  const schemaType = catKey === "hospitality" ? ["LodgingBusiness", "RealEstateListing"] : "RealEstateListing";
  const listingSchema: Record<string, any> = {
    "@type": schemaType,
    "@id": canonicalUrl,
    url: canonicalUrl,
    name: listing.title,
    description,
    image: ogImage,
    category: catDef.name,
    address: {
      "@type": "PostalAddress",
      addressLocality: listing.suburb || listing.city,
      addressRegion: listing.city,
      addressCountry: "ZW",
    },
    offers: {
      "@type": "Offer",
      price: listing.price,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: canonicalUrl,
    },
  };
  if (listing.createdAt) {
    listingSchema.datePosted = String(listing.createdAt).split("T")[0];
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      listingSchema,
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems,
      },
    ],
  };

  const ssrHtml = `<main style="font-family:sans-serif;max-width:900px;margin:24px auto;padding:24px;background:#fff;color:#1e293b;border-radius:12px;">
    <nav aria-label="Breadcrumb" style="font-size:13px;margin-bottom:14px;">
      <a href="/">Home</a> &rsaquo; <span>${escapeHtml(catDef.name)}</span>${
    cityDef ? ` &rsaquo; <span>${escapeHtml(cityDef.name)}</span>` : ""
  }${
    cityDef && suburbDef ? ` &rsaquo; <span>${escapeHtml(suburbDef.name)}</span>` : ""
  } &rsaquo; <span>${escapeHtml(listing.title)}</span>
    </nav>
    <article>
      <h1 style="color:#052659;font-size:28px;margin:0 0 8px;">${escapeHtml(listing.title)}</h1>
      <p style="font-size:18px;font-weight:bold;color:#0f172a;margin:0 0 10px;">$${escapeHtml(
        String(listing.price)
      )}${escapeHtml(formatPriceSuffix(listing.frequency))}</p>
      <dl style="font-size:14px;line-height:1.7;">
        <dt style="font-weight:bold;">Location</dt><dd style="margin:0 0 8px;">${escapeHtml(locationLabel)}${
    listing.landmark ? ` (${escapeHtml(listing.landmark)})` : ""
  }</dd>
        <dt style="font-weight:bold;">Property Type &amp; Category</dt><dd style="margin:0 0 8px;">${escapeHtml(
    listing.propertyType
  )} &middot; ${escapeHtml(catDef.name)}</dd>
        <dt style="font-weight:bold;">Deposit</dt><dd style="margin:0 0 8px;">${
    listing.deposit > 0 ? `$${escapeHtml(String(listing.deposit))} USD` : "No Deposit"
  }</dd>
        ${
          listing.amenities.length > 0
            ? `<dt style="font-weight:bold;">Amenities</dt><dd style="margin:0 0 8px;">${escapeHtml(
                listing.amenities.join(", ")
              )}</dd>`
            : ""
        }
        <dt style="font-weight:bold;">Advertiser</dt><dd style="margin:0 0 8px;">${escapeHtml(
    listing.businessName || listing.landlordName
  )} (${escapeHtml(listing.contactMethod)})</dd>
      </dl>
      ${listing.description ? `<p style="font-size:14px;line-height:1.6;">${escapeHtml(listing.description)}</p>` : ""}
    </article>
  </main>`;

  return {
    httpStatus: 200,
    title,
    description,
    canonicalUrl,
    robots: "index, follow, max-image-preview:large",
    ogType: "website",
    ogTitle: title,
    ogDescription: description,
    ogImage,
    jsonLd,
    ssrHtml,
  };
}

export function buildSitemapXml(rawListings: any[], fallbackDate?: string): string {
  const today = fallbackDate || new Date().toISOString().slice(0, 10);
  const urlEntries = new Map<string, { lastmod: string; changefreq: string; priority: string }>();

  const addUrl = (loc: string, lastmod: string, changefreq: string, priority: string) => {
    if (!urlEntries.has(loc)) {
      urlEntries.set(loc, { lastmod, changefreq, priority });
    }
  };

  // Core public landing & informational pages
  addUrl(`${SITE_URL}/`, today, "daily", "1.0");
  addUrl(`${SITE_URL}/whatsapp`, today, "weekly", "0.9");
  addUrl(`${SITE_URL}/privacy-policy`, today, "monthly", "0.5");

  // Active, non-expired listing detail pages
  const availableListings = rawListings
    .map(normalizeListingRow)
    .filter((l) => l && isListingAvailable(l));

  for (const listing of availableListings) {
    const rawDate = String(listing.createdAt || "").trim();
    const parsedMs = rawDate ? Date.parse(rawDate) : NaN;
    const lastmod = !Number.isNaN(parsedMs) ? new Date(parsedMs).toISOString().slice(0, 10) : today;
    addUrl(`${SITE_URL}/listing/${encodeURIComponent(String(listing.id))}`, lastmod, "daily", "0.8");
  }

  const xmlItems = Array.from(urlEntries.entries())
    .map(
      ([loc, meta]) => `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${escapeHtml(meta.lastmod)}</lastmod>
    <changefreq>${meta.changefreq}</changefreq>
    <priority>${meta.priority}</priority>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlItems}
</urlset>
`;
}
