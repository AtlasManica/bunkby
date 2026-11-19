import type { Database } from "better-sqlite3";

export interface WhatsAppMessagePayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text" | "image" | "interactive";
  text?: {
    preview_url?: boolean;
    body: string;
  };
  image?: {
    link?: string;
    id?: string;
    caption?: string;
  };
  interactive?: {
    type: "button" | "list";
    header?: {
      type: "text" | "image";
      text?: string;
      image?: { link: string };
    };
    body: {
      text: string;
    };
    footer?: {
      text: string;
    };
    action: {
      button?: string;
      buttons?: Array<{
        type: "reply";
        reply: {
          id: string;
          title: string;
        };
      }>;
      sections?: Array<{
        title: string;
        rows: Array<{
          id: string;
          title: string;
          description?: string;
        }>;
      }>;
    };
  };
}

export interface ParsedWhatsAppInput {
  phone: string;
  name?: string;
  messageId?: string;
  type: "text" | "interactive" | "image" | "button" | "unknown";
  text: string;
  buttonPayload?: string;
  mediaId?: string;
  mimeType?: string;
  isStatusUpdate?: boolean;
}

export const SEARCH_PAGE_SIZE = 5;

export interface SearchFilters {
  category?: "residential" | "hospitality" | "commercial" | "student" | "all";
  city?: string;
  suburb?: string;
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  rawQuery?: string;
  offset?: number;
  cursorIsPremium?: number;
  cursorCreatedAt?: string;
  cursorId?: number;
  excludeIds?: number[];
}

export interface PaginatedSearchResult {
  results: any[];
  totalMatching: number;
  nextCursor: {
    is_premium: number;
    created_at: string;
    id: number;
  } | null;
  hasMore: boolean;
}

/**
 * Parses incoming Meta WhatsApp Cloud API webhook request bodies
 * as well as legacy/custom JSON payloads.
 */
export function parseIncomingWhatsAppWebhook(body: any): ParsedWhatsAppInput | null {
  if (!body) return null;

  // Meta Cloud API structure: entry[0].changes[0].value
  if (body.entry && Array.isArray(body.entry)) {
    const change = body.entry[0]?.changes?.[0]?.value;
    if (!change) return null;

    // Check if this is a message delivery/read status update
    if (change.statuses && Array.isArray(change.statuses) && change.statuses.length > 0) {
      return {
        phone: change.statuses[0].recipient_id || "",
        type: "unknown",
        text: "",
        isStatusUpdate: true
      };
    }

    const contact = change.contacts?.[0];
    const message = change.messages?.[0];

    if (!message) return null;

    const senderPhone = message.from || contact?.wa_id || "";
    const senderName = contact?.profile?.name || "BunkBy User";
    const messageType = message.type || "text";

    let textContent = "";
    let buttonPayload: string | undefined;
    let mediaId: string | undefined;
    let mimeType: string | undefined;

    if (messageType === "text") {
      textContent = message.text?.body || "";
    } else if (messageType === "interactive") {
      const interactive = message.interactive;
      if (interactive?.type === "button_reply") {
        buttonPayload = interactive.button_reply?.id;
        textContent = interactive.button_reply?.title || "";
      } else if (interactive?.type === "list_reply") {
        buttonPayload = interactive.list_reply?.id;
        textContent = interactive.list_reply?.title || "";
      }
    } else if (messageType === "button") {
      buttonPayload = message.button?.payload;
      textContent = message.button?.text || "";
    } else if (messageType === "image") {
      mediaId = message.image?.id;
      mimeType = message.image?.mime_type;
      textContent = message.image?.caption || "";
    }

    return {
      phone: senderPhone.replace(/^whatsapp:/i, "").trim(),
      name: senderName,
      messageId: message.id,
      type: messageType,
      text: (textContent || buttonPayload || "").trim(),
      buttonPayload,
      mediaId,
      mimeType,
      isStatusUpdate: false
    };
  }

  // Fallback for custom / simulator payloads: { phone, text }
  const rawPhone = body.phone || body.phoneNumber || body.phone_number || body.from || body.From || "";
  const rawText = body.text || body.message || body.body || body.Body || "";

  if (rawPhone) {
    return {
      phone: String(rawPhone).replace(/^whatsapp:/i, "").trim(),
      name: body.name || "BunkBy User",
      type: "text",
      text: String(rawText).trim(),
      isStatusUpdate: false
    };
  }

  return null;
}

/**
 * Deterministic Natural Language Search Parser
 * Extracts city, suburb, category, price range, property type, and amenities
 * without needing an LLM dependency.
 */
const ZIM_CITIES = [
  "Harare", "Bulawayo", "Chitungwiza", "Mutare", "Gweru", 
  "Kwekwe", "Kadoma", "Masvingo", "Victoria Falls", "Chinhoyi", "Marondera"
];

const COMMON_SUBURBS = [
  // Harare
  "Avonlea", "Avondale", "Belvedere", "Mount Pleasant", "Mt Pleasant", "Avenues", "Braeside", 
  "Mabelreign", "Marlborough", "Borrowdale", "Eastlea", "Greendale", "Highlands",
  "Hatfield", "Waterfalls", "Westgate", "Madokero", "Bluffhill", "Mbare",
  "Highfield", "Glen View", "Budiriro", "Warren Park", "Dzivarasekwa", "Kambuzuma",
  "CBD", "Msasa", "Chitungwiza", "Norton", "Ruwa",
  // Bulawayo
  "Suburbs", "Kumalo", "Hillside", "Bradfield", "Famona", "Woodville", "Matsheumhlope",
  "Khumalo", "Burnside", "Morningside", "Selborne Park", "Luveve", "Nkulumane", "Belmont", "Cowdray Park",
  // Gweru
  "Senga", "Southdowns", "Lundi Park", "Daylesford",
  // Mutare
  "Murambi", "Palmerstone", "Fairbridge Park", "Chikanga", "Dangamvura",
  // Victoria Falls
  "Chinotimba", "Aerodrome"
];

const PROPERTY_TYPES_KEYWORDS: Record<string, string> = {
  "single student room": "Single Student Room",
  "shared student room": "Shared Student Room",
  "student hostel": "Student Hostel",
  "boarding house": "Boarding House",
  "boarding": "Boarding House",
  "hostel": "Student Hostel",
  "hostels": "Student Hostel",
  "single room": "Single Room",
  "bed-sitter": "Bed-sitter",
  "bedsitter": "Bed-sitter",
  "cottage": "Cottage",
  "cottages": "Cottage",
  "townhouse": "Townhouse / Cluster",
  "cluster": "Townhouse / Cluster",
  "apartment": "Apartment / Flat",
  "apartments": "Apartment / Flat",
  "flat": "Apartment / Flat",
  "flats": "Apartment / Flat",
  "full house": "Full house",
  "house sale": "House Sale",
  "lodge / guesthouse": "Lodge / Guesthouse",
  "lodge": "Lodge",
  "lodges": "Lodge",
  "guesthouse": "Guesthouse",
  "guesthouses": "Guesthouse",
  "guest house": "Guesthouse",
  "hotel": "Hotel",
  "hotels": "Hotel",
  "b&b": "Bed & Breakfast",
  "bed and breakfast": "Bed & Breakfast",
  "bed & breakfast": "Bed & Breakfast",
  "retail shop": "Shop",
  "retail shops": "Shop",
  "storefront": "Shop",
  "storefronts": "Shop",
  "shop": "Shop",
  "shops": "Shop",
  "warehouse": "Warehouse",
  "warehouses": "Warehouse",
  "storage": "Warehouse",
  "market stall": "Table",
  "market stalls": "Table",
  "flea market": "Table",
  "stall": "Table",
  "stalls": "Table",
  "booth": "Table",
  "booths": "Table",
  "table": "Table",
  "tables": "Table",
  "office space": "Commercial",
  "office suite": "Commercial",
  "offices": "Commercial",
  "office": "Commercial",
  "commercial": "Commercial"
};

const AMENITY_KEYWORDS: Record<string, string> = {
  "wifi": "Wifi / Internet",
  "wi-fi": "Wifi / Internet",
  "internet": "Wifi / Internet",
  "solar": "Solar Power Backup",
  "borehole": "Borehole Water",
  "water": "Borehole Water",
  "ensuite": "Ensuite",
  "en-suite": "Ensuite",
  "own bathroom": "Ensuite",
  "generator": "Generator Backup",
  "pool": "Swimming Pool",
  "swimming": "Swimming Pool",
  "breakfast": "Breakfast Included",
  "parking": "Secure Parking",
  "security": "Walled & Gated"
};

export function parseNaturalLanguageQuery(query: string): SearchFilters {
  const clean = query.trim();
  const lower = clean.toLowerCase();

  const filters: SearchFilters = {
    rawQuery: clean,
    category: "all"
  };

  // 1. Detect Category
  const commercialMatches = ["commercial", "shop", "shops", "retail", "storefront", "office", "offices", "warehouse", "warehouses", "market stall", "stall", "booth", "table", "tables"];
  const studentMatches = ["student accommodation", "student hostel", "boarding house", "single student", "shared student", "student", "hostel", "hostels", "boarding", "campus"];
  const hospitalityMatches = ["lodge", "guesthouse", "guest house", "hotel", "b&b", "bed & breakfast", "bed and breakfast", "night", "per night", "hospitality"];
  const residentialMatches = ["cottage", "single room", "2 rooms", "3 rooms", "bed-sitter", "bedsitter", "flat", "apartment", "townhouse", "cluster", "full house", "monthly", "residential"];

  let commScore = 0;
  let studScore = 0;
  let hospScore = 0;
  let resScore = 0;

  for (const w of commercialMatches) {
    if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) commScore++;
  }
  for (const w of studentMatches) {
    if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) studScore++;
  }
  for (const w of hospitalityMatches) {
    if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) hospScore++;
  }
  for (const w of residentialMatches) {
    if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) resScore++;
  }

  const maxScore = Math.max(commScore, studScore, hospScore, resScore);
  if (maxScore > 0) {
    if (commScore === maxScore) {
      filters.category = "commercial";
    } else if (studScore === maxScore) {
      filters.category = "student";
    } else if (hospScore === maxScore) {
      filters.category = "hospitality";
    } else {
      filters.category = "residential";
    }
  }

  // 2. Detect City
  for (const city of ZIM_CITIES) {
    const regex = new RegExp(`\\b${city.toLowerCase()}\\b`, "i");
    if (regex.test(lower)) {
      filters.city = city;
      break;
    }
  }

  // 3. Detect Suburb
  for (const sub of COMMON_SUBURBS) {
    const regex = new RegExp(`\\b${sub.toLowerCase()}\\b`, "i");
    if (regex.test(lower)) {
      filters.suburb = sub;
      break;
    }
  }

  // 4. Detect Price Constraints
  // e.g. "under $300", "under 200", "<= 150", "below 250", "max 180"
  const underMatch = lower.match(/(?:under|below|less than|max|up to|<|=<|<=)\s*\$?\s*(\d+)/i);
  if (underMatch && underMatch[1]) {
    filters.maxPrice = parseInt(underMatch[1], 10);
  }

  // e.g. "above $100", "from 150", "min 80", "> 50"
  const aboveMatch = lower.match(/(?:above|from|more than|min|at least|>|>=)\s*\$?\s*(\d+)/i);
  if (aboveMatch && aboveMatch[1]) {
    filters.minPrice = parseInt(aboveMatch[1], 10);
  }

  // e.g. "around $100", "about 120"
  const aroundMatch = lower.match(/(?:around|about|approx|approximately)\s*\$?\s*(\d+)/i);
  if (aroundMatch && aroundMatch[1] && !filters.maxPrice && !filters.minPrice) {
    const target = parseInt(aroundMatch[1], 10);
    filters.minPrice = Math.max(0, Math.floor(target * 0.7));
    filters.maxPrice = Math.ceil(target * 1.3);
  }

  // e.g. standalone "$120" or "120 usd"
  if (!filters.maxPrice && !filters.minPrice) {
    const standAlonePrice = lower.match(/\$\s*(\d+)/i) || lower.match(/(\d+)\s*(?:usd|dollars)/i);
    if (standAlonePrice && standAlonePrice[1]) {
      filters.maxPrice = parseInt(standAlonePrice[1], 10);
    }
  }

  // 5. Detect Property Type
  for (const [key, val] of Object.entries(PROPERTY_TYPES_KEYWORDS)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedKey}\\b`, "i");
    if (regex.test(lower)) {
      // Avoid treating generic word "commercial" as an exclusive subtype unless "office" is mentioned
      if (key === "commercial" && !/\boffice/i.test(lower)) {
        continue;
      }
      filters.propertyType = val;
      if (["Shop", "Warehouse", "Table", "Commercial"].includes(val)) {
        filters.category = "commercial";
      } else if (["Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"].includes(val)) {
        filters.category = "student";
      } else if (["Lodge", "Lodge / Guesthouse", "Guesthouse", "Hotel", "Bed & Breakfast"].includes(val)) {
        filters.category = "hospitality";
      }
      break;
    }
  }

  // 6. Detect Amenities
  const foundAmenities: string[] = [];
  for (const [key, val] of Object.entries(AMENITY_KEYWORDS)) {
    const regex = new RegExp(`\\b${key}\\b`, "i");
    if (regex.test(lower)) {
      if (!foundAmenities.includes(val)) {
        foundAmenities.push(val);
      }
    }
  }
  if (foundAmenities.length > 0) {
    filters.amenities = foundAmenities;
  }

  return filters;
}

/**
 * Shared SQL WHERE clause builder for both COUNT(*) and paginated SELECT queries.
 */
function buildSearchWhereClause(filters: SearchFilters): { whereSql: string; params: any[] } {
  const conditions: string[] = ["listings.verification_status != 'Delisted'"];
  const params: any[] = [];

  // Category filter (strictly prevents commercial/student/hospitality from leaking into residential)
  if (filters.category && filters.category !== "all") {
    if (filters.category === "commercial") {
      conditions.push("(listings.category = 'commercial' OR listings.property_type IN ('Commercial', 'Shop', 'Warehouse', 'Table', 'Office'))");
    } else if (filters.category === "student") {
      conditions.push("(listings.category = 'student' OR listings.tenant_type = 'Student' OR listings.property_type IN ('Student Hostel', 'Boarding House', 'Single Student Room', 'Shared Student Room'))");
    } else if (filters.category === "hospitality") {
      conditions.push("(listings.category = 'hospitality' OR listings.property_type IN ('Lodge / Guesthouse', 'Hotel', 'Lodge', 'Guesthouse', 'Guest House', 'Bed & Breakfast', 'Short-Stay Apartment'))");
    } else if (filters.category === "residential") {
      conditions.push("(listings.category = 'residential' OR ((listings.category IS NULL OR trim(listings.category) = '') AND listings.property_type NOT IN ('Lodge / Guesthouse', 'Hotel', 'Lodge', 'Guesthouse', 'Guest House', 'Bed & Breakfast', 'Short-Stay Apartment', 'Commercial', 'Shop', 'Warehouse', 'Table', 'Office', 'Student Hostel', 'Boarding House', 'Single Student Room', 'Shared Student Room')))");
    } else {
      conditions.push("listings.category = ?");
      params.push(filters.category);
    }
  }

  // City filter
  if (filters.city) {
    conditions.push("listings.city LIKE ?");
    params.push(`%${filters.city}%`);
  }

  // Suburb filter (treat "Mount Pleasant" and "Mt Pleasant" as equivalent)
  if (filters.suburb) {
    const subLower = filters.suburb.toLowerCase();
    if (subLower === "mount pleasant" || subLower === "mt pleasant") {
      conditions.push("(listings.suburb LIKE '%Mt Pleasant%' OR listings.suburb LIKE '%Mount Pleasant%' OR listings.title LIKE '%Mt Pleasant%' OR listings.title LIKE '%Mount Pleasant%')");
    } else {
      conditions.push("listings.suburb LIKE ?");
      params.push(`%${filters.suburb}%`);
    }
  }

  // Property Type filter (with canonical commercial/hospitality alias awareness)
  if (filters.propertyType && filters.propertyType.toLowerCase() !== "all") {
    if (filters.propertyType === "Commercial") {
      conditions.push("(listings.property_type = 'Commercial' OR listings.property_type = 'Office' OR listings.property_type LIKE '%Office%')");
    } else if (filters.propertyType === "Table") {
      conditions.push("(listings.property_type = 'Table' OR listings.property_type LIKE '%Table%' OR listings.property_type LIKE '%Stall%')");
    } else if (filters.propertyType === "Guesthouse") {
      conditions.push("(listings.property_type = 'Guesthouse' OR listings.property_type = 'Guest House' OR listings.property_type = 'Lodge / Guesthouse')");
    } else {
      conditions.push("listings.property_type LIKE ?");
      params.push(`%${filters.propertyType}%`);
    }
  }

  // Price filters
  if (filters.maxPrice !== undefined) {
    conditions.push("listings.price <= ?");
    params.push(filters.maxPrice);
  }
  if (filters.minPrice !== undefined) {
    conditions.push("listings.price >= ?");
    params.push(filters.minPrice);
  }

  // Amenity search: look inside JSON text
  if (filters.amenities && filters.amenities.length > 0) {
    for (const am of filters.amenities) {
      conditions.push("listings.amenities LIKE ?");
      params.push(`%${am}%`);
    }
  }

  // Fallback: If no suburb/city/propertyType extracted, clean generic nationwide/filler words before keyword matching
  if (!filters.suburb && !filters.city && !filters.propertyType && filters.rawQuery) {
    const cleanTokens = filters.rawQuery
      .replace(/\b(search|find|show|looking for|room in|house in|all|available|across|zimbabwe|zim|anywhere|any|locations?|properties|property|places|listings|accommodation|rentals?|spaces?)\b/gi, " ")
      .replace(/\b(in|at|near|around|for|with|across)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanTokens && cleanTokens.length >= 2) {
      conditions.push("(listings.suburb LIKE ? OR listings.title LIKE ? OR listings.landmark LIKE ? OR listings.city LIKE ?)");
      params.push(`%${cleanTokens}%`, `%${cleanTokens}%`, `%${cleanTokens}%`, `%${cleanTokens}%`);
    }
  }

  return {
    whereSql: conditions.join(" AND "),
    params
  };
}

/**
 * Scalable database-level paginated search returning at most `SEARCH_PAGE_SIZE` (5) listings per call.
 * Uses SQL COUNT(*) + deterministic ORDER BY (is_premium DESC, created_at DESC, id DESC) + keyset cursor / OFFSET.
 */
export function searchListingsPaginated(
  db: Database,
  filters: SearchFilters,
  pageSize = SEARCH_PAGE_SIZE
): PaginatedSearchResult {
  const safeLimit = Math.max(1, Math.min(pageSize, SEARCH_PAGE_SIZE));
  const { whereSql, params } = buildSearchWhereClause(filters);

  try {
    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM listings WHERE ${whereSql}`)
      .get(...params) as any;
    const totalMatching = Number(countRow?.total) || 0;

    if (totalMatching === 0) {
      return { results: [], totalMatching: 0, nextCursor: null, hasMore: false };
    }

    const pageConditions = [whereSql];
    const pageParams = [...params];

    // Deduplicate previously sent IDs in this search session
    if (filters.excludeIds && filters.excludeIds.length > 0) {
      const cleanIds = filters.excludeIds.filter(id => Number.isInteger(id) && id > 0);
      if (cleanIds.length > 0) {
        pageConditions.push(`listings.id NOT IN (${cleanIds.map(() => "?").join(", ")})`);
        pageParams.push(...cleanIds);
      }
    }

    const useCursor = Boolean(filters.cursorCreatedAt && filters.cursorId !== undefined);
    if (useCursor) {
      const cPrem = Number(filters.cursorIsPremium ?? 0);
      const cCreated = String(filters.cursorCreatedAt);
      const cId = Number(filters.cursorId);
      pageConditions.push(
        "(COALESCE(listings.is_premium, 0) < ? OR (COALESCE(listings.is_premium, 0) = ? AND (listings.created_at < ? OR (listings.created_at = ? AND listings.id < ?))))"
      );
      pageParams.push(cPrem, cPrem, cCreated, cCreated, cId);
    }

    const offset = useCursor ? 0 : Math.max(0, Number(filters.offset || 0));

    const sql = `
      SELECT 
        listings.*, 
        landlords.full_name as landlord_name
      FROM listings
      LEFT JOIN landlords ON listings.landlord_id = landlords.id
      WHERE ${pageConditions.join(" AND ")}
      ORDER BY COALESCE(listings.is_premium, 0) DESC, listings.created_at DESC, listings.id DESC
      LIMIT ? OFFSET ?
    `;

    pageParams.push(safeLimit, offset);
    const rows = db.prepare(sql).all(...pageParams) as any[];
    const mapped = rows.map((r: any) => ({
      ...r,
      amenities: typeof r.amenities === "string" ? JSON.parse(r.amenities || "[]") : (r.amenities || []),
      is_premium: Boolean(r.is_premium)
    }));

    const lastRow = mapped.length > 0 ? mapped[mapped.length - 1] : null;
    const nextCursor = lastRow
      ? {
          is_premium: lastRow.is_premium ? 1 : 0,
          created_at: String(lastRow.created_at || ""),
          id: Number(lastRow.id)
        }
      : null;

    const deliveredUpTo = useCursor
      ? (filters.excludeIds?.length || 0) + mapped.length
      : offset + mapped.length;
    const hasMore = mapped.length === safeLimit && deliveredUpTo < totalMatching;

    return {
      results: mapped,
      totalMatching,
      nextCursor,
      hasMore
    };
  } catch (err) {
    console.error("Error executing searchListingsPaginated:", err);
    return { results: [], totalMatching: 0, nextCursor: null, hasMore: false };
  }
}

/**
 * Queries the real SQLite database using extracted filters (capped at pageSize, default 5)
 */
export function searchListings(db: Database, filters: SearchFilters, limit = SEARCH_PAGE_SIZE): any[] {
  return searchListingsPaginated(db, filters, limit).results;
}

/**
 * Encodes pagination state safely into `PAGE_{offset}_{cat}:{subtype}_{query}` (<= 256 chars for Meta buttons)
 * preserving spaces and multi-word locations like "Mount Pleasant".
 */
export function encodeSearchPaginationId(
  offset: number,
  category?: string,
  propertyType?: string,
  query?: string
): string {
  const baseCat = (category || "all").toLowerCase().slice(0, 12);
  const cleanSub = (propertyType || "").replace(/[_:]/g, " ").trim().slice(0, 24);
  const catToken = cleanSub ? `${baseCat}:${cleanSub}` : baseCat;
  const cleanQ = (query || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const encodedQ = cleanQ ? encodeURIComponent(cleanQ).replace(/_/g, "%5F") : "";
  const id = `PAGE_${Math.max(0, Math.floor(offset))}_${catToken}_${encodedQ}`;
  return id.slice(0, 256);
}

/**
 * Parses `PAGE_{offset}_{cat}:{subtype}_{query}` payloads losslessly.
 */
export function parseSearchPaginationId(payload: string): {
  offset: number;
  category: string;
  propertyType: string;
  query: string;
} | null {
  if (!payload || !payload.startsWith("PAGE_")) return null;
  const parts = payload.split("_");
  const offset = Math.max(0, parseInt(parts[1] || "0", 10) || 0);
  const catRaw = parts[2] || "";
  const colonIdx = catRaw.indexOf(":");
  const candCat = (colonIdx >= 0 ? catRaw.slice(0, colonIdx) : catRaw).toLowerCase();
  const candSub = colonIdx >= 0 ? catRaw.slice(colonIdx + 1) : "";

  const knownCats = ["residential", "hospitality", "commercial", "student", "all"];
  if (knownCats.includes(candCat)) {
    const rawQ = parts.slice(3).join("_");
    let query = rawQ;
    try {
      query = decodeURIComponent(rawQ);
    } catch (_) {}
    return {
      offset,
      category: candCat === "all" ? "" : candCat,
      propertyType: candSub,
      query: query.trim()
    };
  }

  const rawLegacyQ = parts.slice(2).join("_");
  let legacyQuery = rawLegacyQ;
  try {
    legacyQuery = decodeURIComponent(rawLegacyQ);
  } catch (_) {}
  return {
    offset,
    category: "",
    propertyType: "",
    query: legacyQuery.trim()
  };
}

/**
 * Resolves the public image URL for a listing photograph.
 * Handles HTTP/HTTPS URLs as well as base64 images served via /api/listings/:id/photo
 */
/**
 * Checks whether an image URL or data URI represents a branding logo, company watermark,
 * icon, or non-photographic graphic placeholder rather than an authentic room/property photo.
 * Note: Never use generic standard JFIF/EXIF headers (like standard /9j/4AAQSkZJRg...) which
 * are shared by millions of legitimate camera photographs.
 */
export function isBrandingOrLogoImage(rawImage: string): boolean {
  if (!rawImage) return false;
  const trimmed = rawImage.trim();
  const lower = trimmed.toLowerCase();

  // 1. Explicit company/branding asset paths, filenames, and URL keywords
  if (
    lower.includes("logo") ||
    lower.includes("bunkby-logo") ||
    lower.includes("bunkbylogo") ||
    lower.includes("watermark") ||
    lower.includes("favicon") ||
    lower.includes("brand-mark")
  ) {
    return true;
  }

  // 2. Exact match check for known static placeholder/branding assets in D1:
  // Listing #4's specific branding placeholder graphic (exact byte length: 114,275 bytes, base64 length: 152,368 chars, sha256: fba8ec567cb5f69b...)
  // Listing #4's specific graphic placeholder (SHA256: fba8ec567cb5f69b..., length: 152391 chars, ends with repetitive pattern)
  if (
    lower.includes("fba8ec567cb5f69b") ||
    (trimmed.length === 152391 && (trimmed.includes("AIiIAiIgCIiAIiIAiIg") || trimmed.includes("IiIAiIgCIiAIiIAiIg"))) ||
    trimmed.endsWith("IiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiA/9k=") ||
    trimmed.endsWith("AIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiA/9k=")
  ) {
    return true;
  }

  return false;
}

export function getListingPhotoUrl(listing: any, baseUrl: string): string | null {
  if (!listing) return null;

  let raw = listing.image_url;
  if (!raw || typeof raw !== "string") return null;
  raw = raw.trim();

  // If stored as JSON array of image strings, extract primary photo
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        raw = String(parsed[0]).trim();
      }
    } catch (_) {}
  }

  // Filter out any corporate branding, company logos, or placeholder graphics
  if (isBrandingOrLogoImage(raw)) {
    return null;
  }

  // If it is already a public HTTP/HTTPS URL, use it directly
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  // If it's a data URI or relative path, point to our public photo endpoint
  if (raw.startsWith("data:") || raw.startsWith("/")) {
    const cleanBase = baseUrl.replace(/\/+$/, "");
    return `${cleanBase}/api/rooms/${listing.id}/photo`;
  }

  return null;
}

/**
 * Builds Meta WhatsApp Cloud API Outbound Message Payloads
 */
export function createTextMessage(to: string, text: string, previewUrl = false): WhatsAppMessagePayload {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/\D/g, ""),
    type: "text",
    text: {
      body: text,
      preview_url: previewUrl
    }
  };
}

export function createImageMessage(to: string, imageUrl: string, caption?: string): WhatsAppMessagePayload {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/\D/g, ""),
    type: "image",
    image: {
      link: imageUrl,
      caption: caption || ""
    }
  };
}

export function createButtonMessage(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  headerText?: string,
  footerText?: string
): WhatsAppMessagePayload {
  // WhatsApp Meta Cloud API restricts quick reply buttons to at most 3
  const safeButtons = buttons.slice(0, 3).map(b => ({
    type: "reply" as const,
    reply: {
      id: b.id.slice(0, 256),
      title: b.title.slice(0, 20) // Meta max 20 chars
    }
  }));

  const payload: WhatsAppMessagePayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/\D/g, ""),
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: bodyText
      },
      action: {
        buttons: safeButtons
      }
    }
  };

  if (headerText && payload.interactive) {
    payload.interactive.header = {
      type: "text",
      text: headerText
    };
  }

  if (footerText && payload.interactive) {
    payload.interactive.footer = {
      text: footerText
    };
  }

  return payload;
}

export function createListMessage(
  to: string,
  headerText: string,
  bodyText: string,
  buttonText: string,
  sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  footerText?: string
): WhatsAppMessagePayload {
  const payload: WhatsAppMessagePayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/\D/g, ""),
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: headerText
      },
      body: {
        text: bodyText
      },
      action: {
        button: buttonText.slice(0, 20),
        sections: sections.map(s => ({
          title: s.title.slice(0, 24),
          rows: s.rows.slice(0, 10).map(r => ({
            id: r.id.slice(0, 200),
            title: r.title.slice(0, 24),
            description: r.description ? r.description.slice(0, 72) : undefined
          }))
        }))
      }
    }
  };

  if (footerText && payload.interactive) {
    payload.interactive.footer = {
      text: footerText
    };
  }

  return payload;
}

/**
 * Builds a WhatsApp Listing Card with real photograph and formatted caption
 */
export function buildListingCard(listing: any, baseUrl: string, toPhone: string): WhatsAppMessagePayload {
  const isHospitality = listing.category === "hospitality" || [
    "Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Guest House", "Bed & Breakfast"
  ].includes(listing.property_type);
  const isCommercial = listing.category === "commercial" || [
    "Commercial", "Shop", "Warehouse", "Table", "Office"
  ].includes(listing.property_type);
  const isStudent = listing.category === "student" || [
    "Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"
  ].includes(listing.property_type) || listing.tenant_type === "Student";

  const cycle = listing.rent_cycle || (isHospitality ? "Night" : isStudent ? "Semester" : "Month");
  const photoUrl = getListingPhotoUrl(listing, baseUrl);
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const listingUrl = `${cleanBase}/#listing-${listing.id}`;

  const cleanPhone = (listing.contact_phone || "").replace(/\D/g, "");
  const waContactLink = cleanPhone ? `wa.me/${cleanPhone.startsWith("0") ? "263" + cleanPhone.slice(1) : cleanPhone}` : null;

  let caption = "";
  if (isHospitality) {
    caption += `🏨 *${listing.business_name || listing.title}*\n`;
    if (listing.business_name && listing.title && listing.business_name !== listing.title) {
      caption += `"${listing.title}"\n`;
    }
    caption += `✨ _[${listing.property_type || "Hospitality & Guest Stay"}]_\n\n`;
  } else if (isCommercial) {
    caption += `🏢 *${listing.title}*\n`;
    caption += `🏷️ _[${listing.property_type || "Commercial Property"}]_\n\n`;
  } else if (isStudent) {
    caption += `🎓 *${listing.title}*\n`;
    caption += `🏷️ _[${listing.property_type || "Student Accommodation"}]_\n\n`;
  } else {
    caption += `🏠 *${listing.title}*\n`;
    caption += `🏷️ _[${listing.property_type || "Residential Rental"}]_\n\n`;
  }

  caption += `📍 *Location:* ${listing.suburb}, ${listing.city || "Harare"}`;
  if (listing.landmark) {
    caption += ` (${listing.landmark})`;
  }
  caption += `\n`;

  caption += `💰 *Rate:* $${listing.price} / ${cycle}`;
  if (!isHospitality && listing.deposit !== undefined) {
    caption += ` (Deposit: $${listing.deposit})`;
  }
  caption += `\n`;

  if (listing.tenant_type) {
    caption += `👤 *Seeking:* ${listing.tenant_type}\n`;
  }

  if (listing.amenities && listing.amenities.length > 0) {
    caption += `\n✨ *Key Amenities:*\n`;
    const topAmenities = listing.amenities.slice(0, 4);
    for (const am of topAmenities) {
      caption += `• ${am}\n`;
    }
  }

  caption += `\n📞 *Direct Host/Landlord:* ${listing.contact_phone || "Contact on BunkBy"}\n`;
  if (waContactLink) {
    caption += `💬 *Chat directly:* ${waContactLink}\n`;
  }
  caption += `🔗 *Full Details:* ${listingUrl}`;

  // If a real photo exists, send as an image message with caption
  if (photoUrl) {
    return createImageMessage(toPhone, photoUrl, caption);
  }

  // Fallback to text message if listing genuinely has no photograph
  return createTextMessage(toPhone, caption, true);
}

/**
 * Builds a concise WhatsApp Search Result Card (no bulky descriptions or image uploads).
 * Users can open the direct link for full website details & photo gallery, or reply `photos <id>`.
 */
export function buildConciseSearchCard(
  listing: any,
  baseUrl: string,
  toPhone: string,
  resultNumber?: number
): WhatsAppMessagePayload {
  const isHospitality = listing.category === "hospitality" || [
    "Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Guest House", "Bed & Breakfast"
  ].includes(listing.property_type);
  const isCommercial = listing.category === "commercial" || [
    "Commercial", "Shop", "Warehouse", "Table", "Office"
  ].includes(listing.property_type);
  const isStudent = listing.category === "student" || [
    "Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"
  ].includes(listing.property_type) || listing.tenant_type === "Student";

  const icon = isHospitality ? "🏨" : isCommercial ? "🏢" : isStudent ? "🎓" : "🏠";
  const defaultType = isHospitality ? "Hospitality Stay" : isCommercial ? "Commercial Space" : isStudent ? "Student Accommodation" : "Residential Rental";
  const cycle = listing.rent_cycle || (isHospitality ? "Night" : isStudent ? "Semester" : "Month");
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const listingUrl = `${cleanBase}/?listing=${listing.id}`;

  const titleText = String(isHospitality ? (listing.business_name || listing.title) : listing.title || "Property Listing").slice(0, 72);
  const numPrefix = resultNumber ? `${resultNumber}. ` : "";

  const amenitiesArr: string[] = Array.isArray(listing.amenities)
    ? listing.amenities
    : (() => {
        try { return JSON.parse(listing.amenities || "[]"); } catch { return []; }
      })();
  const summaryParts: string[] = [];
  if (listing.landmark) summaryParts.push(String(listing.landmark).slice(0, 45));
  if (amenitiesArr.length > 0) summaryParts.push(amenitiesArr.slice(0, 3).join(", "));
  const summaryLine = summaryParts.length > 0 ? summaryParts.join(" · ") : `${listing.property_type || defaultType} in ${listing.suburb}`;

  const rawDigits = String(listing.contact_phone || "").replace(/\D/g, "");
  const displayPhone = rawDigits.startsWith("263")
    ? `+${rawDigits}`
    : rawDigits.startsWith("0") && rawDigits.length >= 9
    ? `+263${rawDigits.slice(1)}`
    : (listing.contact_phone || "See link");

  const cardText =
    `${icon} *${numPrefix}${titleText}*\n` +
    `🏷️ ${listing.property_type || defaultType} • 📍 ${listing.suburb}, ${listing.city || "Harare"}\n` +
    `💰 *$${listing.price} / ${cycle}*\n` +
    `✨ ${summaryLine}\n` +
    `📞 ${displayPhone} • 🔗 ${listingUrl}`;

  return createTextMessage(toPhone, cardText, false);
}

/**
 * Sends messages to Meta's WhatsApp Cloud API
 * Gracefully logs and returns payload if credentials are not configured yet.
 */
export async function sendWhatsAppMessage(
  payload: WhatsAppMessagePayload,
  config?: {
    accessToken?: string;
    phoneNumberId?: string;
    businessAccountId?: string;
  }
): Promise<{ success: boolean; data?: any; error?: string; simulated?: boolean }> {
  const token = config?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = config?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = config?.businessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

  // If credentials are NOT provided, return simulated success for testing mode
  if (!token || !phoneId) {
    return {
      success: true,
      simulated: true,
      data: {
        status: "simulated_local",
        message: "Meta credentials not set. Message constructed successfully.",
        payload
      }
    };
  }

  const endpoint = `https://graph.facebook.com/v26.0/${phoneId}/messages`;
  const sanitizedRecipient = payload.to ? `${String(payload.to).slice(0, 4)}***${String(payload.to).slice(-3)}` : "unknown";
  console.log(`[WhatsApp Outbound] Attempting Meta dispatch to recipient: ${sanitizedRecipient}, payload type: ${payload.type}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      const codePart = data.error?.code ? `(Meta Code ${data.error.code}) ` : "";
      const errorMsg = `${codePart}${data.error?.message || `HTTP ${response.status}: Failed to dispatch WhatsApp message`}`;
      console.error(`[WhatsApp Outbound Failed] Meta error for ${sanitizedRecipient}: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg
      };
    }

    console.log(`[WhatsApp Outbound Delivered] Meta API accepted message for ${sanitizedRecipient}, ID: ${data.messages?.[0]?.id || "acknowledged"}`);
    return {
      success: true,
      data
    };
  } catch (err: any) {
    const networkMsg = err.message || "Network error dispatching Meta WhatsApp request";
    console.error(`[WhatsApp Outbound Error] Network failure for ${sanitizedRecipient}: ${networkMsg}`);
    return {
      success: false,
      error: networkMsg
    };
  }
}
