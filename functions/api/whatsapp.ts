/**
 * BunkBy WhatsApp Chatbot Engine for Cloudflare Pages Functions
 * Targets Cloudflare D1 SQLite Database (`env.DB`)
 *
 * Implements:
 * 1. Meta Webhook Verification (GET /api/whatsapp)
 * 2. Incoming WhatsApp Message Ingestion (POST /api/whatsapp)
 * 3. Outbound Message Dispatch to Meta Cloud API (graph.facebook.com)
 * 4. Safe Diagnostic Logging (stored in D1, sanitized, no secrets exposed)
 * 5. Prompt Webhook Acknowledgment with Retry Deduplication
 */

const SEARCH_PAGE_SIZE = 5;

interface Env {
  DB: any;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_BUSINESS_ACCOUNT_ID?: string;
}

interface ParsedMessage {
  phone: string;
  text: string;
  messageId: string;
  name: string;
  isStatusUpdate: boolean;
  type: string;
  buttonPayload?: string;
  mediaId?: string;
  mimeType?: string;
}

// Standardized JSON response helper
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

// OPTIONS handler for CORS
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

/**
 * GET Handler:
 * 1. Meta Webhook Verification Handshake (hub.mode=subscribe)
 * 2. Diagnostic & Health Inquiries (diagnostics=true returns recent sanitized events)
 */
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  // 1. Meta Cloud API Webhook Handshake
  if (mode === "subscribe") {
    const expectedToken = env.WHATSAPP_VERIFY_TOKEN;
    if (expectedToken && token !== expectedToken) {
      return new Response("Forbidden: verify token mismatch", { status: 403 });
    }
    if (challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    }
  }

  // 2. Safe Diagnostics endpoint via query param (?diagnostics=true)
  if (url.searchParams.has("diagnostics")) {
    let recentEvents: any[] = [];
    if (env.DB) {
      try {
        await ensureDiagnosticTable(env.DB);
        const { results } = await env.DB.prepare(`
          SELECT id, timestamp, sender, sender_name as senderName, incoming_preview as incomingTextPreview, action_taken as actionTaken, outbound_count as outboundCount, outbound_delivery as outboundDelivery, status, error
          FROM whatsapp_diagnostic_events
          ORDER BY id DESC LIMIT 20
        `).all();
        recentEvents = (results || []).map((r: any) => ({
          ...r,
          outboundDelivery: r.outboundDelivery ? JSON.parse(r.outboundDelivery) : []
        }));
      } catch (e: any) {
        // Table might be initializing
      }
    }

    const activeToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
    const activePhoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const tokenFingerprint = activeToken && activeToken.length > 10
      ? `${activeToken.slice(0, 4)}...${activeToken.slice(-4)} (len:${activeToken.length})`
      : (activeToken ? "present_short" : "missing");

    return jsonResponse({
      status: "online",
      service: "BunkBy WhatsApp Cloudflare Pages Function",
      version: "2026-10-21_diagnostic_v20_global_commercial_seo_prompts",
      metaConfigured: Boolean(activeToken && activePhoneId),
      hasAccessToken: Boolean(activeToken),
      hasPhoneNumberId: Boolean(activePhoneId),
      tokenFingerprint,
      phoneNumberId: activePhoneId ? `${activePhoneId.slice(0, 4)}***${activePhoneId.slice(-4)}` : null,
      totalEventsTracked: recentEvents.length,
      events: recentEvents,
      serverTimestamp: new Date().toISOString()    });
  }

  // Default GET status response
  return jsonResponse({
    status: "online",
    service: "BunkBy WhatsApp Cloudflare Pages Function",
    metaConfigured: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    endpoints: {
      postWebhook: "/api/whatsapp",
      diagnostics: "/api/whatsapp?diagnostics=true"
    }
  });
}

/**
 * Outbound WhatsApp Dispatch Helper:
 * Dispatches message to Meta Graph API using environment credentials.
 */
interface WhatsAppListSection {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

interface WhatsAppListConfig {
  header?: string;
  button: string;
  footer?: string;
  sections: WhatsAppListSection[];
}

interface OutboundDispatchResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  httpStatus?: number;
  metaCode?: number;
  metaSubcode?: number;
  metaErrorType?: string;
  metaErrorMessage?: string;
  fbtraceId?: string;
  error?: string;
  tokenFingerprint?: string;
  phoneNumberIdUsed?: string;
  itemType?: string;
  interactiveType?: "button" | "list";
  listingId?: number | string;
  hasImage?: boolean;
  imageUrl?: string | null;
}

/**
 * Comprehensive Zimbabwe Geographic Hierarchy Mapping
 * Connects major cities (Harare, Bulawayo, Mutare, Gweru, etc.) to all their constituent suburbs.
 * Enables parent-city searches (e.g. "Harare") to immediately find listings in Greendale, Mt Pleasant, etc.,
 * and vice-versa.
 */
const ZIMBABWE_CITY_SUBURBS_MAP: Record<string, string[]> = {
  "Harare": [
    "Greendale", "Avondale", "Mt Pleasant", "Mount Pleasant", "Borrowdale", "Belvedere",
    "Avenues", "Eastlea", "Highlands", "Hatfield", "Marlborough", "Mabelreign", "Milton Park",
    "Waterfalls", "Westgate", "Kambuzuma", "Mbare", "Warren Park", "Glen Norah", "Glen View",
    "Budiriro", "Highfield", "Chisipite", "Gunhill", "Newlands", "Alex Park", "Alexandra Park",
    "Braeside", "Cranborne", "Logan Park", "Prospect", "Sunningdale", "Southerton", "Workington",
    "Graniteside", "Msasa", "Vainona", "Helensvale", "Borrowdale Brooke", "Glen Lorne", "Shawasha",
    "Shawasha Hills", "Pomona", "Emerald Hill", "Strathaven", "Monavale", "Bluffhill", "Tynwald",
    "Ashdown Park", "Mabvuku", "Tafara", "Epworth", "Ruwa", "Chitungwiza", "Norton", "Dzivarasekwa",
    "Kuwadzana", "Arcadia", "Hillside Harare", "Queensdale", "St Martins", "Ardbennie", "Bluff Hill"
  ],
  "Bulawayo": [
    "Khumalo", "Hillside", "Suburbs", "Burnside", "Morningside", "Bradfield", "Famona",
    "Matsheumhlope", "Woodlands", "Montrose", "Newton West", "Southwold", "Barham Green",
    "Kumalo", "North End", "Paddonhurst", "Sunninghill", "Tshabalala", "Nkulumane",
    "Luveve", "Magwegwe", "Entumbane", "Lobengula", "Cowdray Park", "Pelandaba", "Mpopoma",
    "Emganwini", "Nketa", "Sizinda", "Ilanda", "Parklands", "Kenilworth", "Greenhill", "Ascot"
  ],
  "Mutare": [
    "Murambi", "Palmerstone", "Fairbridge Park", "Chikanga", "Dangamvura", "Hobhouse",
    "Yeovil", "Florida", "Bordervale", "Tiger Kloof", "Morningside", "Darlington"
  ],
  "Gweru": [
    "Gweru East", "Southdowns", "Harben Park", "Nashville", "Athlone", "Daylesford",
    "Lundi Park", "Mkoba", "Mambo", "Southview", "Ridgemont", "Windsor Park"
  ],
  "Victoria Falls": [
    "Chinotimba", "Mkhosana", "Low Density", "SDR", "Industrial", "Aerodrome", "Masue"
  ],
  "Masvingo": [
    "Rhodene", "Target Kopje", "Rujeko", "Mucheke", "Eastvale", "Clovelly", "Kopje"
  ],
  "Chinhoyi": [
    "Coldstream", "Orange Grove", "Ruvimbo", "Chikonohono", "Bruins", "White City"
  ],
  "Kadoma": [
    "Rimuka", "Waverley", "Innsfree", "Mornington", "Westview"
  ],
  "Kwekwe": [
    "Mbizo", "Amaveni", "Msasa Park", "Fitchlea", "Chicago", "Golden Acres"
  ],
  "Marondera": [
    "Rujeko", "Dombotombo", "Cherutombo", "Yellow City", "Winston Park", "Nyameni"
  ],
  "Bindura": [
    "Chipadze", "Aerodrome", "Brockley", "Shashi View", "Greenhill"
  ]
};

/**
 * Builds intelligent SQL clauses matching:
 * 1. Direct text search across suburb, city, title, landmark
 * 2. City-to-suburb hierarchy: searching "Harare" automatically matches listings in Greendale, Avondale, etc.
 * 3. Suburb-to-city hierarchy: searching "Greendale" matches listings with city Harare
 */
const NON_RESIDENTIAL_PROPERTY_TYPES = [
  "Lodge / Guesthouse",
  "Hotel",
  "Lodge",
  "Guesthouse",
  "Guest House",
  "Bed & Breakfast",
  "Short-Stay Apartment",
  "Commercial",
  "Shop",
  "Warehouse",
  "Table",
  "Office",
  "Student Hostel",
  "Boarding House",
  "Single Student Room",
  "Shared Student Room"
];

function buildCategoryAndLocationClauses(
  category: string,
  locationQuery: string,
  tablePrefix: string = "",
  propertyType: string = ""
): { whereSql: string; params: any[] } {
  const prefix = tablePrefix ? `${tablePrefix}.` : "";
  const whereParts: string[] = [];
  const params: any[] = [];

  const catLower = (category || "").toLowerCase().trim();
  if (catLower === "commercial") {
    whereParts.push(`(${prefix}category = 'commercial' OR ${prefix}property_type IN ('Commercial', 'Shop', 'Warehouse', 'Table', 'Office'))`);
  } else if (catLower === "hospitality" || catLower === "guesthouse/lodge" || catLower === "lodge") {
    whereParts.push(`(${prefix}category = 'hospitality' OR ${prefix}property_type IN ('Lodge / Guesthouse', 'Hotel', 'Lodge', 'Guesthouse', 'Guest House', 'Bed & Breakfast', 'Short-Stay Apartment'))`);
  } else if (catLower === "student") {
    whereParts.push(`(${prefix}category = 'student' OR ${prefix}tenant_type = 'Student' OR ${prefix}property_type IN ('Student Hostel', 'Boarding House', 'Single Student Room', 'Shared Student Room'))`);
  } else if (catLower === "residential") {
    const excludedList = NON_RESIDENTIAL_PROPERTY_TYPES.map(t => `'${t}'`).join(", ");
    whereParts.push(`(${prefix}category = 'residential' OR ((${prefix}category IS NULL OR trim(${prefix}category) = '') AND ${prefix}property_type NOT IN (${excludedList})))`);
  }

  const pType = (propertyType || "").trim();
  if (pType && pType.toLowerCase() !== "all") {
    const pLower = pType.toLowerCase();
    if (pLower === "shop") {
      whereParts.push(`(${prefix}property_type = 'Shop' OR ${prefix}property_type LIKE '%Shop%')`);
    } else if (pLower === "warehouse") {
      whereParts.push(`(${prefix}property_type = 'Warehouse' OR ${prefix}property_type LIKE '%Warehouse%')`);
    } else if (pLower === "table") {
      whereParts.push(`(${prefix}property_type = 'Table' OR ${prefix}property_type LIKE '%Table%' OR ${prefix}property_type LIKE '%Stall%')`);
    } else if (pLower === "commercial" || pLower === "office") {
      whereParts.push(`(${prefix}property_type = 'Commercial' OR ${prefix}property_type = 'Office' OR ${prefix}property_type LIKE '%Office%')`);
    } else {
      whereParts.push(`(${prefix}property_type = ? OR ${prefix}property_type LIKE ?)`);
      params.push(pType, `%${pType}%`);
    }
  }

  const q = (locationQuery || "").trim();
  const qLower = q.toLowerCase();

  if (
    q &&
    !["all", "any", "skip", "all locations", "zimbabwe", "across zimbabwe", "everywhere"].includes(qLower)
  ) {
    const locClauses: string[] = [];
    if (qLower === "mount pleasant" || qLower === "mt pleasant") {
      locClauses.push(
        `(${prefix}suburb LIKE '%Mt Pleasant%' OR ${prefix}suburb LIKE '%Mount Pleasant%' OR ${prefix}city LIKE '%Mt Pleasant%' OR ${prefix}title LIKE '%Mt Pleasant%' OR ${prefix}title LIKE '%Mount Pleasant%' OR ${prefix}landmark LIKE '%Mt Pleasant%' OR ${prefix}landmark LIKE '%Mount Pleasant%')`
      );
    } else {
      locClauses.push(
        `(${prefix}suburb LIKE ? OR ${prefix}city LIKE ? OR ${prefix}title LIKE ? OR ${prefix}landmark LIKE ?)`
      );
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    const tokens = q.split(/[,/+\s]+/).map(t => t.trim()).filter(t => t.length >= 2);
    if (tokens.length >= 2 && qLower !== "mount pleasant" && qLower !== "mt pleasant") {
      const tokenSubclauses: string[] = [];
      for (const t of tokens) {
        tokenSubclauses.push(`(${prefix}suburb LIKE ? OR ${prefix}city LIKE ? OR ${prefix}title LIKE ? OR ${prefix}landmark LIKE ?)`);
        params.push(`%${t}%`, `%${t}%`, `%${t}%`, `%${t}%`);
      }
      locClauses.push(`(` + tokenSubclauses.join(" AND ") + `)`);
    }

    // City hierarchy
    for (const [city, suburbs] of Object.entries(ZIMBABWE_CITY_SUBURBS_MAP)) {
      if (city.toLowerCase() === qLower || tokens.some(t => t.toLowerCase() === city.toLowerCase())) {
        const placeholders = suburbs.map(() => "?").join(", ");
        locClauses.push(`(${prefix}suburb IN (${placeholders}))`);
        params.push(...suburbs);
        break;
      }
    }

    // Suburb hierarchy
    for (const [city, suburbs] of Object.entries(ZIMBABWE_CITY_SUBURBS_MAP)) {
      const isKnown = suburbs.some(s => s.toLowerCase() === qLower || tokens.some(t => t.toLowerCase() === s.toLowerCase()));
      if (isKnown) {
        locClauses.push(`(${prefix}city LIKE ?)`);
        params.push(`%${city}%`);
        break;
      }
    }

    whereParts.push(`(` + locClauses.join(" OR ") + `)`);
  }

  return {
    whereSql: whereParts.length > 0 ? ` AND ` + whereParts.join(" AND ") : "",
    params
  };
}

function extractNaturalSearchIntent(cleanQuery: string): {
  category: string;
  propertyType: string;
  locationQuery: string;
} {
  const q = cleanQuery.trim();
  const qLower = q.toLowerCase();

  let category = "";
  let propertyType = "";

  // Detect commercial subtypes first
  if (/\b(retail shops?|storefronts?|shops?)\b/i.test(qLower)) {
    category = "commercial";
    propertyType = "Shop";
  } else if (/\b(warehouses?|storage)\b/i.test(qLower)) {
    category = "commercial";
    propertyType = "Warehouse";
  } else if (/\b(market stalls?|flea markets?|stalls?|booths?|tables?)\b/i.test(qLower)) {
    category = "commercial";
    propertyType = "Table";
  } else if (/\b(office spaces?|office suites?|offices?)\b/i.test(qLower)) {
    category = "commercial";
    propertyType = "Commercial";
  } else if (/\b(commercials?|commercial propert(?:y|ies)|commercial spaces?)\b/i.test(qLower)) {
    category = "commercial";
  } else if (/\b(student accommodation|student hostels?|boarding houses?|students?|hostels?)\b/i.test(qLower)) {
    category = "student";
  } else if (/\b(guesthouses?|guest houses?|lodges?|hotels?|b&bs?|bed & breakfasts?|hospitality)\b/i.test(qLower)) {
    category = "hospitality";
  } else if (qLower === "residential" || qLower === "res" || qLower === "rooms") {
    category = "residential";
  }

  // Strip detected category/type words and generic search fillers so remaining text is pure location
  let locationQuery = q
    .replace(/\b(retail shops?|storefronts?|shops?|warehouses?|storage|market stalls?|flea markets?|stalls?|booths?|tables?|office spaces?|office suites?|offices?|commercial propert(?:y|ies)|commercial spaces?|commercials?|student accommodation|student hostels?|boarding houses?|hostels?|students?|guesthouses?|guest houses?|lodges?|hotels?|b&bs?|hospitality|residential|rentals?|properties|property|places|listings|spaces?|accommodation|rooms?)\b/gi, " ")
    .replace(/\b(all|available|across|zimbabwe|zim|anywhere|any|locations?|search|find|show|looking|for|in|at|near|around|with|me)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { category, propertyType, locationQuery };
}

function buildLocationSearchClauses(cleanQuery: string, tablePrefix: string = ""): { whereSql: string; params: any[] } {
  const intent = extractNaturalSearchIntent(cleanQuery);
  return buildCategoryAndLocationClauses(intent.category, intent.locationQuery, tablePrefix, intent.propertyType);
}

function encodePageButtonId(
  offset: number,
  category: string,
  propertyType: string,
  query: string
): string {
  const baseCat = (category || "all").toLowerCase().slice(0, 12);
  const cleanSub = (propertyType || "").replace(/[_:]/g, " ").trim().slice(0, 24);
  const catToken = cleanSub ? `${baseCat}:${cleanSub}` : baseCat;
  const cleanQ = (query || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const encodedQ = cleanQ ? encodeURIComponent(cleanQ).replace(/_/g, "%5F") : "";
  return `PAGE_${Math.max(0, Math.floor(offset))}_${catToken}_${encodedQ}`.slice(0, 256);
}

function parsePageButtonId(payload: string): {
  offset: number;
  category: string;
  propertyType: string;
  query: string;
} {
  const pageParts = payload.split("_");
  const offset = Math.max(0, parseInt(pageParts[1] || "0", 10) || 0);
  const candidateCatRaw = pageParts[2] || "";
  const colonIdx = candidateCatRaw.indexOf(":");
  const candidateCat = colonIdx >= 0 ? candidateCatRaw.slice(0, colonIdx) : candidateCatRaw;
  const candidateSubtype = colonIdx >= 0 ? candidateCatRaw.slice(colonIdx + 1) : "";

  if (["residential", "hospitality", "commercial", "student", "all"].includes(candidateCat.toLowerCase())) {
    const rawQ = pageParts.slice(3).join("_") || "";
    let decodedQ = rawQ;
    try {
      decodedQ = decodeURIComponent(rawQ);
    } catch (_) {}
    return {
      offset,
      category: candidateCat.toLowerCase() === "all" ? "" : candidateCat.toLowerCase(),
      propertyType: candidateSubtype,
      query: decodedQ.trim()
    };
  }

  const legacyRaw = pageParts.slice(2).join("_") || "";
  let decodedLegacy = legacyRaw;
  try {
    decodedLegacy = decodeURIComponent(legacyRaw);
  } catch (_) {}
  return {
    offset,
    category: "",
    propertyType: "",
    query: decodedLegacy.trim()
  };
}

/**
 * Uploads a listing photo directly to Meta Graph API media storage to obtain a native media_id.
 * This completely avoids external URL crawl failures from Meta's edge servers.
 */
async function uploadListingPhotoToMeta(
  rawPhoto: string,
  token: string,
  phoneId: string
): Promise<string | null> {
  if (!rawPhoto || !token || !phoneId) return null;
  try {
    let normalized = rawPhoto.trim();
    // If stored as a JSON array string of multiple photos, extract the primary photo
    if (normalized.startsWith("[")) {
      try {
        const parsed = JSON.parse(normalized);
        if (Array.isArray(parsed) && parsed.length > 0) {
          normalized = String(parsed[0]).trim();
        }
      } catch (_) {}
    }

    let fileBlob: Blob | null = null;
    let mimeType = "image/jpeg";

    if (normalized.startsWith("data:")) {
      const match = normalized.match(/^data:([a-zA-Z0-9\/+-]+);base64,(.+)$/);
      if (!match) return null;
      mimeType = match[1];
      const b64 = match[2];
      const binaryStr = atob(b64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      fileBlob = new Blob([bytes], { type: mimeType });
    } else if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const resp = await fetch(normalized, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!resp.ok) return null;
        fileBlob = await resp.blob();
        mimeType = fileBlob.type || "image/jpeg";
      } catch {
        clearTimeout(timeoutId);
        return null;
      }
    }

    if (!fileBlob) return null;

    const formData = new FormData();
    formData.append("messaging_product", "whatsapp");
    formData.append("type", mimeType);
    formData.append("file", fileBlob, "property.jpg");

    const uploadRes = await fetch(`https://graph.facebook.com/v26.0/${phoneId}/media`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`
      },
      body: formData
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.warn(`[Meta Media Upload Notice]: HTTP ${uploadRes.status} - ${errText.slice(0, 80)}`);
      return null;
    }

    const uploadData: any = await uploadRes.json();
    return uploadData.id || null;
  } catch (err: any) {
    console.warn(`[Meta Media Upload Error]:`, err?.message || err);
    return null;
  }
}

/**
 * Resolves the public image URL for a listing photograph.
 * Handles HTTP/HTTPS URLs as well as base64 images served via /api/rooms/:id/photo
 */
/**
 * Checks whether an image URL or data URI represents a branding logo, company watermark,
 * icon, or non-photographic graphic placeholder rather than an authentic room/property photo.
 * Note: Never use generic standard JFIF/EXIF headers (like standard /9j/4AAQSkZJRg...) which
 * are shared by millions of legitimate camera photographs.
 */
function isBrandingOrLogoImage(rawImage: string): boolean {
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
  // We identify it specifically by its exact base64 payload characteristics (length 152,368 chars and its unique repetitive padding suffix)
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

function getListingPhotoUrl(listing: any, baseUrl: string): string | null {
  if (!listing) return null;
  let raw = String(listing.image_url || "").trim();
  if (!raw) return null;

  // If stored as a JSON array of image strings, extract the first photo
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        raw = String(parsed[0]).trim();
      }
    } catch (_) {}
  }

  // Filter out explicit corporate branding logos
  if (isBrandingOrLogoImage(raw)) {
    return null;
  }

  // 1. If standard HTTP/HTTPS URL
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  // 2. If base64 data URI or relative path, serve via public photo endpoint with .jpg suffix for Meta Media Parser
  if (raw.startsWith("data:") || raw.startsWith("/")) {
    // Ensure public production hostname https://bunkby.com is used so Meta servers can always download the image
    let origin = "https://bunkby.com";
    if (baseUrl && (baseUrl.startsWith("https://") || baseUrl.startsWith("http://"))) {
      try {
        const u = new URL(baseUrl);
        if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
          origin = u.origin;
        }
      } catch (_) {}
    }
    const cleanBase = origin.replace(/\/+$/, "");
    return `${cleanBase}/api/rooms/${listing.id}/photo`;
  }

  return null;
}

/**
 * Builds a photographic listing card with formatted details and contact
 */
function buildListingCardMessage(
  listing: any,
  baseUrl: string,
  toPhone: string
): { imageUrl: string | null; text: string } {
  const isHospitality = listing.category === "hospitality" || [
    "Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"
  ].includes(listing.property_type);
  const cycle = listing.rent_cycle || (isHospitality ? "Night" : "Month");
  const photoUrl = getListingPhotoUrl(listing, baseUrl);
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const listingUrl = `${cleanBase}/#listing-${listing.id}`;

  const cleanPhone = (listing.contact_phone || "").replace(/\D/g, "");
  const waContactLink = cleanPhone ? `https://wa.me/${cleanPhone.startsWith("0") ? "263" + cleanPhone.slice(1) : cleanPhone}` : null;

  // Normalize landlord/host phone to international format starting with +263
  const rawDigits = (listing.contact_phone || "").replace(/\D/g, "");
  let displayPhone = listing.contact_phone || "Contact via BunkBy";
  let waDigits = rawDigits;
  if (rawDigits.startsWith("263")) {
    displayPhone = `+${rawDigits}`;
    waDigits = rawDigits;
  } else if (rawDigits.startsWith("0") && rawDigits.length >= 9) {
    displayPhone = `+263${rawDigits.slice(1)}`;
    waDigits = `263${rawDigits.slice(1)}`;
  } else if (rawDigits.length === 9) {
    displayPhone = `+263${rawDigits}`;
    waDigits = `263${rawDigits}`;
  } else if (rawDigits.length > 0 && !displayPhone.startsWith("+")) {
    displayPhone = `+${rawDigits}`;
  }
  const formattedWaContactLink = waDigits ? `https://wa.me/${waDigits}` : waContactLink;

  const isStudent = listing.category === "student" || [
    "Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"
  ].includes(listing.property_type) || listing.tenant_type === "Student";
  const isCommercial = listing.category === "commercial" || [
    "Commercial", "Shop", "Warehouse", "Table"
  ].includes(listing.property_type);

  let text = "";
  if (isHospitality) {
    text += `🏨 *${listing.business_name || listing.title}*\n`;
    if (listing.business_name && listing.title && listing.business_name !== listing.title) {
      text += `"${listing.title}"\n`;
    }
    text += `✨ *${listing.property_type || "Hospitality & Guest Stay"}*\n\n`;
  } else if (isStudent) {
    text += `🎓 *${listing.title}*\n`;
    text += `🏷️ *${listing.property_type || "Student Accommodation"}*\n\n`;
  } else if (isCommercial) {
    text += `🏢 *${listing.title}*\n`;
    text += `🏷️ *${listing.property_type || "Commercial Space"}*\n\n`;
  } else {
    text += `🏠 *${listing.title}*\n`;
    text += `🏷️ *${listing.property_type || "Residential Rental"}*\n\n`;
  }

  text += `📍 *Location:* ${listing.suburb}, ${listing.city || "Harare"}`;
  if (listing.landmark) {
    text += ` (${listing.landmark})`;
  }
  text += `\n`;

  text += `💰 *Rate:* $${listing.price} / ${cycle}`;
  if (!isHospitality && listing.deposit !== undefined && listing.deposit !== null) {
    text += ` (Deposit: $${listing.deposit})`;
  }
  text += `\n`;

  if (listing.tenant_type && !isHospitality) {
    text += `👤 *Seeking:* ${listing.tenant_type}\n`;
  }

  let amenitiesList: string[] = [];
  if (typeof listing.amenities === "string") {
    try {
      amenitiesList = JSON.parse(listing.amenities || "[]");
    } catch {
      amenitiesList = [];
    }
  } else if (Array.isArray(listing.amenities)) {
    amenitiesList = listing.amenities;
  }

  if (amenitiesList.length > 0) {
    text += `\n✨ *Key Amenities:*\n`;
    for (const am of amenitiesList.slice(0, 4)) {
      text += `• ${am}\n`;
    }
  }

  // Check total photos available
  let totalAvailablePhotos = 1;
  const rawImg = String(listing.image_url || "").trim();
  if (rawImg.startsWith("[")) {
    try {
      const arr = JSON.parse(rawImg);
      if (Array.isArray(arr) && arr.length > 0) totalAvailablePhotos = arr.length;
    } catch (_) {}
  }

  text += `\n📞 *Landlord/Host Contact:* ${displayPhone}\n`;
  if (formattedWaContactLink) {
    text += `💬 *WhatsApp Host Directly:* ${formattedWaContactLink}\n`;
  }
  if (totalAvailablePhotos > 1) {
    text += `📸 *Gallery:* ${totalAvailablePhotos} photos available (reply *photos ${listing.id}* to view all here!)\n`;
  }
  text += `🔗 *Full Gallery & Map:* ${listingUrl}`;

  return {
    imageUrl: photoUrl,
    rawPhoto: String(listing.image_url || "").trim() || null,
    text
  };
}

/**
 * Builds a concise WhatsApp search card (no image downloads/uploads or bulky text).
 * Includes: listing title, property type, location, price + cycle, short summary, direct ?listing= link.
 */
function buildConciseSearchCardText(listing: any, baseUrl: string, resultNumber?: number): string {
  const isHospitality = listing.category === "hospitality" || [
    "Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Guest House", "Bed & Breakfast"
  ].includes(listing.property_type);
  const isStudent = listing.category === "student" || [
    "Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"
  ].includes(listing.property_type) || listing.tenant_type === "Student";
  const isCommercial = listing.category === "commercial" || [
    "Commercial", "Shop", "Warehouse", "Table", "Office"
  ].includes(listing.property_type);

  const icon = isHospitality ? "🏨" : isCommercial ? "🏢" : isStudent ? "🎓" : "🏠";
  const defaultType = isHospitality
    ? "Hospitality Stay"
    : isCommercial
    ? "Commercial Space"
    : isStudent
    ? "Student Accommodation"
    : "Residential Rental";
  const cycle = listing.rent_cycle || (isHospitality ? "Night" : isStudent ? "Semester" : "Month");

  let publicBase = "https://bunkby.com";
  if (baseUrl && (baseUrl.startsWith("https://") || baseUrl.startsWith("http://"))) {
    try {
      const u = new URL(baseUrl);
      if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
        publicBase = u.origin.replace(/\/+$/, "");
      }
    } catch (_) {}
  }
  const listingUrl = `${publicBase}/?listing=${listing.id}`;

  const rawTitle = String(isHospitality ? (listing.business_name || listing.title) : listing.title || "Property").slice(0, 72);
  const numPrefix = resultNumber ? `${resultNumber}. ` : "";

  let amenitiesList: string[] = [];
  if (typeof listing.amenities === "string") {
    try {
      amenitiesList = JSON.parse(listing.amenities || "[]");
    } catch {
      amenitiesList = [];
    }
  } else if (Array.isArray(listing.amenities)) {
    amenitiesList = listing.amenities;
  }

  const summaryParts: string[] = [];
  if (listing.landmark) summaryParts.push(String(listing.landmark).slice(0, 45));
  if (amenitiesList.length > 0) summaryParts.push(amenitiesList.slice(0, 3).join(", "));
  const summaryLine = summaryParts.length > 0
    ? summaryParts.join(" · ")
    : `${listing.property_type || defaultType} in ${listing.suburb}`;

  const rawDigits = String(listing.contact_phone || "").replace(/\D/g, "");
  let displayPhone = listing.contact_phone || "See link";
  if (rawDigits.startsWith("263")) displayPhone = `+${rawDigits}`;
  else if (rawDigits.startsWith("0") && rawDigits.length >= 9) displayPhone = `+263${rawDigits.slice(1)}`;
  else if (rawDigits.length === 9) displayPhone = `+263${rawDigits}`;

  return (
    `${icon} *${numPrefix}${rawTitle}*\n` +
    `🏷️ ${listing.property_type || defaultType} • 📍 ${listing.suburb}, ${listing.city || "Harare"}\n` +
    `💰 *$${listing.price} / ${cycle}*\n` +
    `✨ ${summaryLine}\n` +
    `📞 ${displayPhone} • 🔗 ${listingUrl}`
  );
}


/**
 * Downloads incoming media (photos) from Meta Graph API using the mediaId
 * and converts it to a standard base64 data URI stored in BunkBy D1 listings.
 */
async function downloadWhatsAppMediaAsDataUri(mediaId: string, env: Env): Promise<string | null> {
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!token || !mediaId) return null;

  try {
    // 10-second timeout to prevent worker execution hang
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    // 1. Retrieve temporary media URL from Meta Graph API
    const metaMediaRes = await fetch(`https://graph.facebook.com/v26.0/${mediaId}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      },
      signal: controller.signal
    });

    if (!metaMediaRes.ok) {
      clearTimeout(timeoutId);
      console.warn(`[WhatsApp Media] Failed to resolve media URL for ID ${mediaId}: HTTP ${metaMediaRes.status}`);
      return null;
    }

    const metaMediaData: any = await metaMediaRes.json();
    const mediaUrl = metaMediaData.url;
    const mimeType = metaMediaData.mime_type || "image/jpeg";
    if (!mediaUrl) {
      clearTimeout(timeoutId);
      return null;
    }

    // 2. Download binary bytes with Authorization header
    const binaryRes = await fetch(mediaUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "BunkBy-WhatsApp-Bot/1.0"
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!binaryRes.ok) {
      console.warn(`[WhatsApp Media] Failed to download media binary: HTTP ${binaryRes.status}`);
      return null;
    }

    const arrayBuffer = await binaryRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // In Cloudflare Worker environment, convert to base64 using safe chunks
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 4096;
    for (let i = 0; i < len; i += chunkSize) {
      const end = Math.min(i + chunkSize, len);
      const chunk = bytes.subarray(i, end);
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }
    const base64 = btoa(binary);

    return `data:${mimeType};base64,${base64}`;
  } catch (err: any) {
    console.warn(`[WhatsApp Media Download Error]:`, err.message || err);
    return null;
  }
}

async function sendMetaWhatsAppMessage(
  recipientPhone: string,
  replyText: string,
  env: Env,
  buttons?: Array<{ id: string; title: string }>,
  imageUrl?: string | null,
  listConfig?: WhatsAppListConfig
): Promise<OutboundDispatchResult> {
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  // Safe token fingerprint (e.g. EAAG...4aB1, length 198) so admin can verify if updated token is active
  const tokenFingerprint = token && token.length > 10 
    ? `${token.slice(0, 4)}...${token.slice(-4)} (len:${token.length})` 
    : (token ? "present_short" : "missing");

  if (!token || !phoneId) {
    return {
      success: false,
      simulated: true,
      error: "Meta credentials not configured on Cloudflare runtime.",
      interactiveType: listConfig ? "list" : buttons?.length ? "button" : undefined,
      tokenFingerprint,
      phoneNumberIdUsed: phoneId ? `${phoneId.slice(0, 4)}***` : "missing"
    };
  }

  const endpoint = `https://graph.facebook.com/v26.0/${phoneId}/messages`;

  let payload: any;
  let interactiveTypeUsed: "button" | "list" | undefined;

  if (imageUrl) {
    // Outbound Meta Image Message: supports both pre-uploaded Meta media_id and public link
    const isMediaId = imageUrl.startsWith("meta_id:") || /^[0-9]{8,25}$/.test(imageUrl.trim());
    const cleanMediaId = imageUrl.replace(/^meta_id:/, "").trim();

    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "image",
      image: isMediaId
        ? { id: cleanMediaId, caption: replyText.slice(0, 1024) }
        : { link: imageUrl, caption: replyText.slice(0, 1024) }
    };
  } else if (listConfig && listConfig.sections && listConfig.sections.length > 0) {
    // Meta Cloud API Interactive List Message (up to 10 total rows across sections)
    interactiveTypeUsed = "list";
    let remainingRows = 10;
    const boundedSections = listConfig.sections
      .slice(0, 10)
      .map(sec => {
        if (remainingRows <= 0) return null;
        const rows = sec.rows.slice(0, remainingRows).map(r => ({
          id: r.id.slice(0, 200),
          title: r.title.slice(0, 24),
          ...(r.description ? { description: r.description.slice(0, 72) } : {})
        }));
        remainingRows -= rows.length;
        if (rows.length === 0) return null;
        return {
          title: sec.title.slice(0, 24),
          rows
        };
      })
      .filter(Boolean);

    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "interactive",
      interactive: {
        type: "list",
        ...(listConfig.header ? { header: { type: "text", text: listConfig.header.slice(0, 60) } } : {}),
        body: { text: replyText.slice(0, 1024) },
        ...(listConfig.footer ? { footer: { text: listConfig.footer.slice(0, 60) } } : {}),
        action: {
          button: (listConfig.button || "Choose Option").slice(0, 20),
          sections: boundedSections
        }
      }
    };
  } else if (buttons && buttons.length > 0 && buttons.length <= 3) {
    interactiveTypeUsed = "button";
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: replyText.slice(0, 1024) },
        action: {
          buttons: buttons.map(b => ({
            type: "reply",
            reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) }
          }))
        }
      }
    };
  } else {
    let fullText = replyText;
    if (buttons && buttons.length > 3) {
      fullText += "\n\n" + buttons.map((b, i) => `${i + 1}️⃣ *${b.title}*`).join("\n");
    }
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "text",
      text: { body: fullText }
    };
  }

  try {
    let res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    // BULLETPROOF FALLBACK: If interactive message (list or buttons) fails for ANY reason,
    // immediately retry sending as formatted plain text so the user NEVER gets stuck!
    if (!res.ok && payload.type === "interactive") {
      console.warn(`[Meta Interactive Notice] HTTP ${res.status}: ${data?.error?.message || "interactive rejected"}. Auto-retrying as plain text.`);
      let fallbackText = replyText;
      if (listConfig && listConfig.sections && listConfig.sections.length > 0) {
        let idx = 1;
        const lines: string[] = [];
        for (const sec of listConfig.sections) {
          for (const r of sec.rows) {
            lines.push(`${idx}️⃣ *${r.title}*${r.description ? ` — ${r.description}` : ""}`);
            idx++;
          }
        }
        fallbackText += "\n\n" + lines.join("\n");
      } else if (buttons && buttons.length > 0) {
        fallbackText += "\n\n" + buttons.map((b, i) => `${i + 1}️⃣ *${b.title}*`).join("\n");
      }
      const plainPayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientPhone,
        type: "text",
        text: { body: fallbackText }
      };
      const textRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(plainPayload)
      });
      let textData: any = {};
      try {
        textData = await textRes.json();
      } catch {
        textData = {};
      }
      if (textRes.ok) {
        return {
          success: true,
          httpStatus: textRes.status,
          messageId: textData.messages?.[0]?.id,
          interactiveType: interactiveTypeUsed,
          tokenFingerprint,
          phoneNumberIdUsed: `${phoneId.slice(0, 4)}***`
        };
      }
      res = textRes;
      data = textData;
    }

    if (!res.ok) {
      const errObj = data.error || {};
      const metaCode = errObj.code;
      const metaSubcode = errObj.error_subcode;
      const metaType = errObj.type;
      const metaMessage = errObj.message || `HTTP ${res.status} dispatch error`;
      const fbtraceId = errObj.fbtrace_id;

      // Safe sanitized error summary without exposing secrets
      const codePart = metaCode ? `(Meta Code ${metaCode}${metaSubcode ? `, Subcode ${metaSubcode}` : ""}) ` : "";
      const errorSummary = `${codePart}${metaMessage}${fbtraceId ? ` [fbtrace_id: ${fbtraceId}]` : ""}`;
      console.warn(`[Meta Cloud API Error] HTTP ${res.status}: ${errorSummary}`);

      return {
        success: false,
        httpStatus: res.status,
        metaCode,
        metaSubcode,
        metaErrorType: metaType,
        metaErrorMessage: metaMessage,
        fbtraceId,
        error: errorSummary,
        tokenFingerprint,
        phoneNumberIdUsed: `${phoneId.slice(0, 4)}***`
      };
    }

    return {
      success: true,
      httpStatus: res.status,
      messageId: data.messages?.[0]?.id,
      interactiveType: interactiveTypeUsed,
      tokenFingerprint,
      phoneNumberIdUsed: `${phoneId.slice(0, 4)}***`
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Network failure dispatching Meta request",
      tokenFingerprint,
      phoneNumberIdUsed: phoneId ? `${phoneId.slice(0, 4)}***` : "missing"
    };
  }
}

/**
 * Ensures chatbot_sessions and whatsapp_diagnostic_events tables exist in D1
 */
async function ensureDiagnosticTable(db: any) {
  // 1. Ensure core session and diagnostic tables exist
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS chatbot_sessions (
      phone_number TEXT PRIMARY KEY,
      current_step TEXT NOT NULL,
      collected_data TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS whatsapp_diagnostic_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      message_id TEXT,
      sender TEXT,
      sender_name TEXT,
      incoming_preview TEXT,
      action_taken TEXT,
      outbound_count INTEGER DEFAULT 0,
      outbound_delivery TEXT,
      status TEXT,
      error TEXT
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS whatsapp_search_state (
      phone_number TEXT PRIMARY KEY,
      search_key TEXT NOT NULL,
      filters_json TEXT,
      total_matching INTEGER DEFAULT 0,
      dispatched_count INTEGER DEFAULT 0,
      cursor_is_premium INTEGER DEFAULT 0,
      cursor_created_at TEXT,
      cursor_id INTEGER,
      seen_ids TEXT,
      last_page_payload TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Ensure scalable covering search indexes exist (safe, idempotent)
  const indexDdls = [
    "CREATE INDEX IF NOT EXISTS idx_listings_active_created_id ON listings(created_at DESC, id DESC) WHERE verification_status != 'Delisted'",
    "CREATE INDEX IF NOT EXISTS idx_listings_active_cat_created_id ON listings(category, created_at DESC, id DESC) WHERE verification_status != 'Delisted'",
    "CREATE INDEX IF NOT EXISTS idx_listings_active_type_created_id ON listings(property_type, created_at DESC, id DESC) WHERE verification_status != 'Delisted'",
    "CREATE INDEX IF NOT EXISTS idx_listings_active_premium_created_id ON listings(is_premium DESC, created_at DESC, id DESC) WHERE verification_status != 'Delisted'",
    "CREATE INDEX IF NOT EXISTS idx_listings_active_coalesce_premium_created_id ON listings(COALESCE(is_premium, 0) DESC, created_at DESC, id DESC) WHERE verification_status != 'Delisted'",
    "CREATE INDEX IF NOT EXISTS idx_listings_city_status ON listings(city, verification_status)",
    "CREATE INDEX IF NOT EXISTS idx_listings_suburb_status ON listings(suburb, verification_status)",
    "CREATE INDEX IF NOT EXISTS idx_listings_landlord_status ON listings(landlord_id, verification_status, id DESC)"
  ];
  for (const ddl of indexDdls) {
    try {
      await db.prepare(ddl).run();
    } catch (_) {}
  }

  // 2. Self-healing D1 schema migrations: ensure new columns exist in listings table
  try {
    const tableInfo = await db.prepare("PRAGMA table_info(listings)").all();
    const cols = (tableInfo?.results || []).map((c: any) => c.name);

    if (cols.length > 0) {
      if (!cols.includes("category")) {
        await db.prepare("ALTER TABLE listings ADD COLUMN category TEXT DEFAULT 'residential'").run();
      }
      if (!cols.includes("business_name")) {
        await db.prepare("ALTER TABLE listings ADD COLUMN business_name TEXT").run();
      }
      if (!cols.includes("is_premium")) {
        await db.prepare("ALTER TABLE listings ADD COLUMN is_premium INTEGER DEFAULT 0").run();
      }
      if (!cols.includes("listing_tier")) {
        await db.prepare("ALTER TABLE listings ADD COLUMN listing_tier TEXT DEFAULT 'free'").run();
      }
      if (!cols.includes("expiry_date")) {
        await db.prepare("ALTER TABLE listings ADD COLUMN expiry_date TEXT").run();
      }
      if (!cols.includes("is_sample")) {
        await db.prepare("ALTER TABLE listings ADD COLUMN is_sample INTEGER DEFAULT 0").run();
      }
      if (!cols.includes("reports_count")) {
        await db.prepare("ALTER TABLE listings ADD COLUMN reports_count INTEGER DEFAULT 0").run();
      }

      // 3. Self-healing City Normalization:
      // If a listing has a known Harare suburb (like Greendale, Avondale, Mt Pleasant) but city is empty or null,
      // backfill city = 'Harare' so city-wide searches always succeed.
      try {
        await db.prepare(`
          UPDATE listings 
          SET city = 'Harare' 
          WHERE (city IS NULL OR trim(city) = '' OR city = 'None')
            AND (
              suburb LIKE '%Greendale%' OR suburb LIKE '%Avondale%' OR suburb LIKE '%Mt Pleasant%' OR 
              suburb LIKE '%Borrowdale%' OR suburb LIKE '%Belvedere%' OR suburb LIKE '%Avenues%' OR
              suburb LIKE '%Eastlea%' OR suburb LIKE '%Highlands%' OR suburb LIKE '%Hatfield%' OR
              suburb LIKE '%Marlborough%' OR suburb LIKE '%Mabelreign%' OR suburb LIKE '%Milton Park%' OR
              suburb LIKE '%Waterfalls%' OR suburb LIKE '%Westgate%' OR suburb LIKE '%Glen Lorne%'
            )
        `).run();
      } catch (_) {}

      // 4. Remove any audit test / dummy listings (e.g. audit test cottage or dummy listings)
      try {
        await db.prepare(`
          DELETE FROM listings 
          WHERE title LIKE '%test cottage%' 
             OR title LIKE '%audit test%' 
             OR title LIKE '%dummy%'
             OR suburb LIKE '%dummy%'
        `).run();
      } catch (_) {}
    }
  } catch (err: any) {
    console.warn("[D1 Schema Self-Healing]:", err?.message || err);
  }
}

/**
 * Parses incoming Webhook payload supporting both Meta Cloud API and test JSON formats
 */
function parseIncomingWebhook(body: any): ParsedMessage | null {
  if (!body) return null;

  // 1. Meta Cloud API Payload format
  if (body.entry && Array.isArray(body.entry)) {
    const change = body.entry[0]?.changes?.[0]?.value;
    if (!change) return null;

    // Check delivery/read status updates
    if (change.statuses && Array.isArray(change.statuses) && change.statuses.length > 0) {
      const statusObj = change.statuses[0];
      const statusName = statusObj.status || "receipt";
      const statusErr = statusObj.errors?.[0];
      const errDetail = statusErr ? `(Meta Status Code ${statusErr.code}: ${statusErr.title || statusErr.message})` : "";
      return {
        phone: statusObj.recipient_id || "",
        text: `${statusName} ${errDetail}`.trim(),
        messageId: statusObj.id || "",
        name: "",
        isStatusUpdate: true,
        type: "status_receipt"
      };
    }

    const contact = change.contacts?.[0];
    const message = change.messages?.[0];
    if (!message) return null;

    const senderPhone = (message.from || contact?.wa_id || "").replace(/^whatsapp:/i, "").trim();
    const senderName = contact?.profile?.name || "BunkBy User";
    const messageType = message.type || "text";

    let text = "";
    let buttonPayload: string | undefined;

    let mediaId: string | undefined;
    let mimeType: string | undefined;

    if (messageType === "text") {
      text = message.text?.body || "";
    } else if (messageType === "interactive") {
      const interactive = message.interactive;
      if (interactive?.type === "button_reply") {
        buttonPayload = interactive.button_reply?.id;
        text = interactive.button_reply?.title || "";
      } else if (interactive?.type === "list_reply") {
        buttonPayload = interactive.list_reply?.id;
        text = interactive.list_reply?.title || "";
      }
    } else if (messageType === "button") {
      buttonPayload = message.button?.payload;
      text = message.button?.text || "";
    } else if (messageType === "image") {
      mediaId = message.image?.id;
      mimeType = message.image?.mime_type;
      text = message.image?.caption || "";
    }

    return {
      phone: senderPhone,
      text: (text || buttonPayload || "").trim(),
      messageId: message.id || "",
      name: senderName,
      isStatusUpdate: false,
      type: messageType,
      buttonPayload,
      mediaId,
      mimeType
    };
  }

  // 2. Direct / Test JSON format ({ phone: "...", text: "..." })
  if (body.phone || body.from) {
    const rawPhone = (body.phone || body.from || "").replace(/^whatsapp:/i, "").trim();
    const rawText = (body.text || body.message || "").trim();
    return {
      phone: rawPhone,
      text: rawText,
      messageId: body.messageId || "simulated_id",
      name: body.name || "Test User",
      isStatusUpdate: false,
      type: body.type || (body.mediaId ? "image" : "text"),
      buttonPayload: body.buttonPayload,
      mediaId: body.mediaId,
      mimeType: body.mimeType
    };
  }

  return null;
}

/**
 * Summarizes the high-level schema of an incoming payload without storing PII or message content
 */
function summarizePayloadStructure(body: any): string {
  if (!body || typeof body !== "object") return "non_object_body";
  const keys = Object.keys(body);
  const parts: string[] = [`root_keys:[${keys.join(",")}]`];

  if (body.object) {
    parts.push(`obj:${body.object}`);
  }

  if (Array.isArray(body.entry)) {
    parts.push(`entry_count:${body.entry.length}`);
    const entry0 = body.entry[0];
    if (entry0 && Array.isArray(entry0.changes)) {
      parts.push(`changes_count:${entry0.changes.length}`);
      const change0 = entry0.changes[0];
      if (change0?.field) parts.push(`field:${change0.field}`);
      const val = change0?.value;
      if (val && typeof val === "object") {
        const valKeys = Object.keys(val);
        parts.push(`val_keys:[${valKeys.join(",")}]`);
        if (Array.isArray(val.messages)) {
          parts.push(`msg_count:${val.messages.length}`);
          const msg0 = val.messages[0];
          if (msg0) {
            parts.push(`msg_type:${msg0.type || "unknown"}`);
            if (msg0.id) parts.push(`msg_id_prefix:${msg0.id.slice(0, 8)}`);
          }
        }
        if (Array.isArray(val.statuses)) {
          parts.push(`status_count:${val.statuses.length}`);
          const st0 = val.statuses[0];
          if (st0) parts.push(`status_val:${st0.status || "unknown"}`);
        }
        if (Array.isArray(val.errors)) {
          parts.push(`err_count:${val.errors.length}`);
        }
      }
    }
  } else if (body.phone || body.from) {
    parts.push("direct_test_format");
  }

  return parts.join(" | ").slice(0, 200);
}

/**
 * Main POST Webhook Handler
 */
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  // Initialize tables safely if DB is available
  if (env.DB) {
    try {
      await ensureDiagnosticTable(env.DB);
    } catch (_) {}
  }

  // Parse incoming payload
  const incoming = parseIncomingWebhook(body);
  
  // If payload could not be parsed as a message, record structural diagnostic before returning
  if (!incoming) {
    const structureSummary = summarizePayloadStructure(body);
    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO whatsapp_diagnostic_events (
            timestamp, message_id, sender, sender_name, incoming_preview, action_taken, outbound_count, status, error
          ) VALUES (CURRENT_TIMESTAMP, NULL, 'system', 'Meta Webhook Receiver', ?, 'UNPARSED_PAYLOAD', 0, 'ignored_unparsed', ?)
        `).bind(
          structureSummary,
          "Incoming webhook payload did not match known message structure"
        ).run();
      } catch (_) {}
    }
    return jsonResponse({ status: "ignored_unparsed", structure: structureSummary }, 200);
  }

  // Record status receipts (delivered/read/sent receipts from Meta)
  if (incoming.isStatusUpdate) {
    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO whatsapp_diagnostic_events (
            timestamp, message_id, sender, sender_name, incoming_preview, action_taken, outbound_count, status, error
          ) VALUES (CURRENT_TIMESTAMP, ?, 'status_receipt', 'Meta Status Update', ?, 'STATUS_RECEIPT_ACK', 0, 'status_acknowledged', NULL)
        `).bind(incoming.messageId || null, incoming.text ? `Status: ${incoming.text}` : "status update receipt").run();
      } catch (_) {}
    }
    return jsonResponse({ status: "status_acknowledged" }, 200);
  }

  const { phone, text, messageId, name, buttonPayload, mediaId: incomingMediaId, mimeType: incomingMimeType } = incoming;
  const lowerText = text.toLowerCase().trim();
  const phoneId = Number(phone.replace(/\D/g, "")) || 0;
  const sanitizedSender = phone ? `${phone.slice(0, 4)}***${phone.slice(-3)}` : "unknown";

  // If D1 is not available, return safe error
  if (!env.DB) {
    return jsonResponse({
      success: false,
      error: "D1 Database binding 'DB' is not configured in Cloudflare environment"
    }, 500);
  }

  // Deduplication check: Prevent duplicate processing if Meta retries webhook (exclude Meta dashboard test button sample IDs)
  const isMetaTestSample = messageId.includes("3QT1E7A866106ECA98897") || messageId.startsWith("wamid.HBgLMTYzMTU1NTExODEV");
  if (messageId && messageId !== "simulated_id" && !isMetaTestSample) {
    try {
      const existing = await env.DB.prepare(
        "SELECT id FROM whatsapp_diagnostic_events WHERE message_id = ?"
      ).bind(messageId).first();
      if (existing) {
        return jsonResponse({ status: "already_processed", messageId }, 200);
      }
    } catch (_) {}
  }

  let replyText = "";
  let actionTaken = "";
  let buttonsToSend: Array<{ id: string; title: string }> | undefined;
  let listToSend: WhatsAppListConfig | undefined;
  const outboundQueue: Array<{
    text: string;
    buttons?: Array<{ id: string; title: string }>;
    list?: WhatsAppListConfig;
    imageUrl?: string | null;
    itemType?: "intro" | "listing_card" | "action_footer" | "preview" | "system";
    listingId?: number | string;
  }> = [];

  const getCategoryDisplayName = (cat?: string): string => {
    if (cat === "commercial") return "Commercial Properties";
    if (cat === "student") return "Student Accommodation";
    if (cat === "hospitality") return "Hospitality & Stays";
    return "Residential Rentals";
  };

  const buildListingCategoryList = (): WhatsAppListConfig => ({
    header: "Post on BunkBy",
    button: "Choose Category",
    footer: "Reply CANCEL anytime to exit",
    sections: [
      {
        title: "Property Categories",
        rows: [
          { id: "CAT_RESIDENTIAL", title: "Residential Rentals", description: "Rooms, cottages, flats & full houses" },
          { id: "CAT_HOSPITALITY", title: "Hospitality & Stays", description: "Guesthouses, lodges, hotels & B&Bs" },
          { id: "CAT_COMMERCIAL", title: "Commercial Properties", description: "Shops, offices, warehouses & tables" },
          { id: "CAT_STUDENT", title: "Student Accommodation", description: "Hostels, boarding houses & student rooms" }
        ]
      },
      {
        title: "Options",
        rows: [
          { id: "BTN_CANCEL", title: "❌ Cancel Session", description: "Cancel listing and return to main menu" }
        ]
      }
    ]
  });

  const buildPropertyTypeList = (category: string): WhatsAppListConfig => {
    if (category === "commercial") {
      return {
        header: "Commercial Space",
        button: "Choose Space Type",
        footer: "Reply CANCEL anytime to exit",
        sections: [
          {
            title: "Commercial Subtypes",
            rows: [
              { id: "CTYPE_SHOP", title: "Retail Shop", description: "Shops, boutiques & storefronts (Shop)" },
              { id: "CTYPE_COMMERCIAL", title: "Offices / Commercial", description: "Office suites & general commercial spaces" },
              { id: "CTYPE_WAREHOUSE", title: "Warehouse", description: "Warehouses & industrial storage" },
              { id: "CTYPE_TABLE", title: "Market Stall / Table", description: "Flea market tables, stalls & booths" }
            ]
          },
          {
            title: "Options",
            rows: [
              { id: "BTN_CANCEL", title: "❌ Cancel", description: "Exit listing and return to main menu" }
            ]
          }
        ]
      };
    }
    if (category === "student") {
      return {
        header: "Student Housing",
        button: "Choose Space Type",
        footer: "Reply CANCEL anytime to exit",
        sections: [
          {
            title: "Student Accommodation",
            rows: [
              { id: "STYPE_HOSTEL", title: "Student Hostel", description: "Purpose-built student hostel room" },
              { id: "STYPE_BOARDING", title: "Boarding House", description: "Student boarding house near campus" },
              { id: "STYPE_SINGLE", title: "Single Student Room", description: "Private room for one student" },
              { id: "STYPE_SHARED", title: "Shared Student Room", description: "2-sleeper or shared student room" }
            ]
          },
          {
            title: "Options",
            rows: [
              { id: "BTN_CANCEL", title: "❌ Cancel", description: "Exit listing and return to main menu" }
            ]
          }
        ]
      };
    }
    if (category === "hospitality") {
      return {
        header: "Hospitality & Stays",
        button: "Choose Stay Type",
        footer: "Reply CANCEL anytime to exit",
        sections: [
          {
            title: "Hospitality Subtypes",
            rows: [
              { id: "HTYPE_GUESTHOUSE", title: "Guesthouse", description: "Private guesthouse accommodation" },
              { id: "HTYPE_LODGE_GH", title: "Lodge / Guesthouse", description: "Lodge & guesthouse property" },
              { id: "HTYPE_LODGE", title: "Lodge", description: "Safari, bush or holiday lodge" },
              { id: "HTYPE_HOTEL", title: "Hotel", description: "Hotel room or suite" },
              { id: "HTYPE_BNB", title: "Bed & Breakfast", description: "Cozy B&B with breakfast option" }
            ]
          },
          {
            title: "Options",
            rows: [
              { id: "BTN_CANCEL", title: "❌ Cancel", description: "Exit listing and return to main menu" }
            ]
          }
        ]
      };
    }
    return {
      header: "Residential Rentals",
      button: "Select Property Type",
      footer: "Reply CANCEL anytime to exit",
      sections: [
        {
          title: "Residential Types",
          rows: [
            { id: "RTYPE_ROOM", title: "Single Room", description: "Single residential room" },
            { id: "RTYPE_COTTAGE", title: "Cottage", description: "Self-contained garden cottage" },
            { id: "RTYPE_2ROOMS", title: "2 rooms", description: "Two-room rental unit" },
            { id: "RTYPE_3ROOMS", title: "3 rooms", description: "Three-room rental home" },
            { id: "RTYPE_HOUSE", title: "Full house", description: "Entire residential house" },
            { id: "RTYPE_FLAT", title: "Apartment / Flat", description: "Apartment or flat" },
            { id: "RTYPE_TOWNHOUSE", title: "Townhouse / Cluster", description: "Cluster or townhouse" },
            { id: "RTYPE_SHARED", title: "Shared Space", description: "Shared flat or house space" },
            { id: "RTYPE_SALE", title: "House Sale", description: "Residential property for sale" }
          ]
        },
        {
          title: "Options",
          rows: [
            { id: "BTN_CANCEL", title: "❌ Cancel", description: "Exit listing and return to main menu" }
          ]
        }
      ]
    };
  };

  const buildCitySelectionList = (): WhatsAppListConfig => ({
    header: "Town or City",
    button: "Choose City / Town",
    footer: "Or type any town name directly",
    sections: [
      {
        title: "Major Cities & Towns",
        rows: [
          { id: "CITY_HARARE", title: "Harare", description: "Capital city & suburbs" },
          { id: "CITY_BULAWAYO", title: "Bulawayo", description: "City of Kings & suburbs" },
          { id: "CITY_CHITUNGWIZA", title: "Chitungwiza", description: "Chitungwiza urban area" },
          { id: "CITY_MUTARE", title: "Mutare", description: "Manicaland capital" },
          { id: "CITY_GWERU", title: "Gweru", description: "Midlands capital" },
          { id: "CITY_VICFALLS", title: "Victoria Falls", description: "Victoria Falls & resort area" },
          { id: "CITY_KADOMA", title: "Kadoma", description: "Mashonaland West" },
          { id: "CITY_KWEKWE", title: "Kwekwe", description: "Midlands" },
          { id: "CITY_MASVINGO", title: "Masvingo", description: "Masvingo & surrounds" }
        ]
      },
      {
        title: "Options",
        rows: [
          { id: "BTN_CANCEL", title: "❌ Cancel", description: "Cancel listing and return to main menu" }
        ]
      }
    ]
  });

  const buildTenantTypeList = (): WhatsAppListConfig => ({
    header: "Preferred Tenant",
    button: "Select Tenant Type",
    footer: "Reply CANCEL anytime to exit",
    sections: [
      {
        title: "Tenant Preference",
        rows: [
          { id: "TTYPE_GENERAL", title: "General", description: "Open to any suitable tenant" },
          { id: "TTYPE_SINGLE", title: "Single", description: "Best for a single individual" },
          { id: "TTYPE_FAMILY", title: "Family", description: "Best for couples or families" },
          { id: "TTYPE_PROFESSIONAL", title: "Professional", description: "Working professionals" },
          { id: "TTYPE_STUDENT", title: "Student", description: "University or college students" }
        ]
      },
      {
        title: "Options",
        rows: [
          { id: "BTN_CANCEL", title: "❌ Cancel", description: "Cancel listing and return to main menu" }
        ]
      }
    ]
  });

  const buildSearchCategoryList = (): WhatsAppListConfig => ({
    header: "Search BunkBy",
    button: "Choose Category",
    footer: "Or type e.g. 'shops in Harare'",
    sections: [
      {
        title: "Property Categories",
        rows: [
          { id: "SEARCH_CAT_RESIDENTIAL", title: "Residential Rentals", description: "Rooms, cottages, flats & houses" },
          { id: "SEARCH_CAT_HOSPITALITY", title: "Hospitality & Stays", description: "Guesthouses, lodges, hotels & B&Bs" },
          { id: "SEARCH_CAT_COMMERCIAL", title: "Commercial Properties", description: "Shops, offices, warehouses & tables" },
          { id: "SEARCH_CAT_STUDENT", title: "Student Accommodation", description: "Hostels, boarding houses & rooms" }
        ]
      },
      {
        title: "Options",
        rows: [
          { id: "BTN_CANCEL", title: "❌ Cancel Search", description: "Cancel search and return to main menu" }
        ]
      }
    ]
  });

  const buildSearchCommercialSubtypeList = (): WhatsAppListConfig => ({
    header: "Commercial Search",
    button: "Choose Space Type",
    footer: "Reply CANCEL anytime to exit",
    sections: [
      {
        title: "Commercial Subtypes",
        rows: [
          { id: "SEARCH_SUBTYPE_ALL", title: "All Commercial Spaces", description: "Show shops, offices, warehouses & tables" },
          { id: "SEARCH_SUBTYPE_SHOP", title: "Retail Shops", description: "Shops, boutiques & storefronts (Shop)" },
          { id: "SEARCH_SUBTYPE_COMMERCIAL", title: "Offices / Commercial", description: "Office suites & commercial spaces" },
          { id: "SEARCH_SUBTYPE_WAREHOUSE", title: "Warehouses", description: "Warehouses & industrial storage" },
          { id: "SEARCH_SUBTYPE_TABLE", title: "Market Stalls / Tables", description: "Flea market tables, stalls & booths" }
        ]
      },
      {
        title: "Options",
        rows: [
          { id: "BTN_CANCEL", title: "❌ Cancel Search", description: "Cancel search and return to main menu" }
        ]
      }
    ]
  });

  try {
    // Check for active session
    const session = await env.DB.prepare(
      "SELECT phone_number, current_step, collected_data FROM chatbot_sessions WHERE phone_number = ?"
    ).bind(phone).first();

    // -------------------------------------------------------------
    // PRIORITY 1: UNIVERSAL CANCEL / RESET / EXIT
    // Works across ANY active listing or search step without publishing
    // or deleting any published listings.
    // -------------------------------------------------------------
    const cancelTextCommands = [
      "cancel",
      "cancel session",
      "cancel listing",
      "cancel search",
      "❌ cancel",
      "❌ cancel session",
      "❌ cancel search",
      "❌ cancel listing",
      "reset",
      "exit",
      "quit"
    ];
    const cancelPayloadIds = ["BTN_CANCEL", "CMD_CANCEL", "CMD_CANCEL_LISTING", "SEARCH_CANCEL"];

    if (
      cancelTextCommands.includes(lowerText) ||
      cancelPayloadIds.includes(buttonPayload || "")
    ) {
      if (session) {
        await env.DB.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").bind(phone).run();
      }
      await env.DB.prepare("DELETE FROM whatsapp_search_state WHERE phone_number = ?").bind(phone).run();
      replyText = "🚫 *Your current session has been cancelled.* No listing was published.\n\nWhat would you like to do next?";
      buttonsToSend = [
        { id: "CMD_SEARCH", title: "🔍 Search Stays" },
        { id: "CMD_LIST", title: "🏡 Post Property" },
        { id: "CMD_MY_LISTINGS", title: "📋 My Listings" }
      ];
      actionTaken = "SESSION_CANCELLED";
    }

    // -------------------------------------------------------------
    // PRIORITY 2: ACTIVE LISTING SESSION STATE MACHINE
    // If user is currently creating a listing, the session MUST handle their input!
    // Words like "room", "cottage", "house", or titles like "Big Nice Single Room"
    // must NEVER be hijacked by accommodation search while in an active session.
    // -------------------------------------------------------------
    else if (session) {
      const currentStep = session.current_step;
      let collectedData: any = {};
      try {
        collectedData = JSON.parse(session.collected_data || "{}");
      } catch {
        collectedData = {};
      }

      const isHospitality = collectedData.category === "hospitality";

      // ---------------------------------------------------------
      // STEP 1: CATEGORY SELECTION
      // ---------------------------------------------------------
      // ---------------------------------------------------------
      // SEARCH SESSION STEP 1: USER CHOSE CATEGORY
      // ---------------------------------------------------------
      if (currentStep === "AWAITING_SEARCH_CATEGORY") {
        let chosenCategory = "";
        let categoryLabel = "";

        const normPayload = (buttonPayload || "").toUpperCase().trim();
        const normInput = text.toLowerCase().trim();

        if (normPayload === "SEARCH_CAT_COMMERCIAL" || normInput === "3" || normInput.includes("commercial") || normInput.includes("shop") || normInput.includes("office") || normInput.includes("warehouse") || normInput.includes("stall") || normInput.includes("table")) {
          chosenCategory = "commercial";
          categoryLabel = "Commercial Properties";
        } else if (normPayload === "SEARCH_CAT_HOSPITALITY" || normInput === "2" || normInput.includes("hospitality") || normInput.includes("lodge") || normInput.includes("hotel") || normInput.includes("guest") || normInput.includes("b&b")) {
          chosenCategory = "hospitality";
          categoryLabel = "Hospitality & Stays";
        } else if (normPayload === "SEARCH_CAT_STUDENT" || normInput === "4" || normInput.includes("student") || normInput.includes("hostel") || normInput.includes("boarding")) {
          chosenCategory = "student";
          categoryLabel = "Student Accommodation";
        } else if (normPayload === "SEARCH_CAT_RESIDENTIAL" || normInput === "1" || normInput.includes("residential") || normInput.includes("room") || normInput.includes("cottage") || normInput.includes("flat") || normInput.includes("house")) {
          chosenCategory = "residential";
          categoryLabel = "Residential Rentals";
        }

        if (!chosenCategory) {
          replyText = `⚠️ Please tap *Choose Category* below to select what you want to search for:`;
          listToSend = buildSearchCategoryList();
          actionTaken = "STEP_RETRY";
        } else if (chosenCategory === "commercial") {
          const searchSessionData = { searchCategory: "commercial", categoryLabel };
          await env.DB.prepare(`
            UPDATE chatbot_sessions
            SET current_step = 'AWAITING_SEARCH_SUBTYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE phone_number = ?
          `).bind(JSON.stringify(searchSessionData), phone).run();

          replyText = `🏢 *Commercial Properties Selected*\n\nWhich type of commercial space are you looking for?\nTap *Choose Space Type* below to filter by Shops, Offices, Warehouses, Market Stalls / Tables, or view all:`;
          listToSend = buildSearchCommercialSubtypeList();
          actionTaken = "SEARCH_PROMPT_SUBTYPE";
        } else {
          // Advance session to AWAITING_SEARCH_QUERY with selected category saved
          const searchSessionData = { searchCategory: chosenCategory, categoryLabel, searchPropertyType: "" };
          await env.DB.prepare(`
            UPDATE chatbot_sessions
            SET current_step = 'AWAITING_SEARCH_QUERY', collected_data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE phone_number = ?
          `).bind(JSON.stringify(searchSessionData), phone).run();

          const locationExample = chosenCategory === "hospitality"
            ? "*Victoria Falls*, *Harare*, *Vumba*, or *Bulawayo*"
            : chosenCategory === "student"
            ? "*Mt Pleasant Harare*, *Bulawayo*, *Chinhoyi*, or *Gweru*"
            : "*Avonlea*, *Harare*, *Khumalo Bulawayo*, or *Mutare*";

          replyText = `✅ Selected Category: *${categoryLabel}*\n\n*Now enter the City, Town, or Suburb:*\nWhere would you like to find ${chosenCategory === "hospitality" ? "lodges and guesthouses" : chosenCategory === "student" ? "student accommodation" : "residential rentals"}?\n\n_(e.g. ${locationExample}, or tap *All Locations* below)_`;
          buttonsToSend = [
            { id: "SEARCH_LOC_ALL", title: "🌍 All Locations" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "SEARCH_PROMPT_LOCATION";
        }
      }
      // ---------------------------------------------------------
      // SEARCH SESSION STEP 1B: COMMERCIAL SUBTYPE FILTER
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_SEARCH_SUBTYPE") {
        const normPayload = (buttonPayload || "").toUpperCase().trim();
        const normInput = text.toLowerCase().trim();

        let subtype = "";
        let subtypeLabel = "All Commercial Spaces";

        if (normPayload === "SEARCH_SUBTYPE_ALL" || normInput === "1" || normInput === "all" || normInput.includes("all commercial")) {
          subtype = "";
          subtypeLabel = "All Commercial Properties";
        } else if (normPayload === "SEARCH_SUBTYPE_SHOP" || normInput === "2" || normInput.includes("shop") || normInput.includes("retail")) {
          subtype = "Shop";
          subtypeLabel = "Retail Shops (Shop)";
        } else if (normPayload === "SEARCH_SUBTYPE_COMMERCIAL" || normInput === "3" || normInput.includes("office") || normInput.includes("commercial")) {
          subtype = "Commercial";
          subtypeLabel = "Offices & Commercial Spaces";
        } else if (normPayload === "SEARCH_SUBTYPE_WAREHOUSE" || normInput === "4" || normInput.includes("warehouse") || normInput.includes("storage")) {
          subtype = "Warehouse";
          subtypeLabel = "Warehouses";
        } else if (normPayload === "SEARCH_SUBTYPE_TABLE" || normInput === "5" || normInput.includes("table") || normInput.includes("stall") || normInput.includes("booth") || normInput.includes("market")) {
          subtype = "Table";
          subtypeLabel = "Market Stalls / Tables";
        } else {
          replyText = `⚠️ Please tap *Choose Space Type* below to pick the commercial subtype you want to search:`;
          listToSend = buildSearchCommercialSubtypeList();
          actionTaken = "STEP_RETRY";
          subtypeLabel = "";
        }

        if (subtypeLabel) {
          const searchSessionData = {
            searchCategory: "commercial",
            searchPropertyType: subtype,
            categoryLabel: subtypeLabel
          };
          await env.DB.prepare(`
            UPDATE chatbot_sessions
            SET current_step = 'AWAITING_SEARCH_QUERY', collected_data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE phone_number = ?
          `).bind(JSON.stringify(searchSessionData), phone).run();

          replyText = `✅ Commercial Filter: *${subtypeLabel}*\n\n*Now enter the City, Town, or Suburb:*\n_(e.g. *Harare CBD*, *Belmont Bulawayo*, *Eastlea*, or tap *All Locations* below)_`;
          buttonsToSend = [
            { id: "SEARCH_LOC_ALL", title: "🌍 All Locations" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "SEARCH_PROMPT_LOCATION";
        }
      }
      // ---------------------------------------------------------
      // SEARCH SESSION STEP 2: USER SEARCHING BY LOCATION / PLACE NAME
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_SEARCH_QUERY") {
        const searchCategory = collectedData.searchCategory || "";
        const searchPropertyType = collectedData.searchPropertyType || "";
        const categoryLabel = collectedData.categoryLabel || "";

        // Clear the guided search prompt session once executing search
        await env.DB.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").bind(phone).run();

        const isAllLocations = buttonPayload === "SEARCH_LOC_ALL" || lowerText === "all" || lowerText === "any";
        const cleanQuery = isAllLocations ? "" : text.replace(/^(search|find|show|looking for|i want a|need a)\s*/i, "").trim();

        const locationFilter = buildCategoryAndLocationClauses(searchCategory, cleanQuery, "listings", searchPropertyType);
        const countFilter = buildCategoryAndLocationClauses(searchCategory, cleanQuery, "", searchPropertyType);

        const countSql = `
          SELECT COUNT(*) as total
          FROM listings
          WHERE verification_status != 'Delisted'${countFilter.whereSql}
        `;
        const totalCountRes: any = countFilter.params.length > 0 
          ? await env.DB.prepare(countSql).bind(...countFilter.params).first()
          : await env.DB.prepare(countSql).first();
        const totalMatching = Number(totalCountRes?.total) || 0;

        const querySql = `
          SELECT listings.*, landlords.full_name as landlord_name
          FROM listings
          LEFT JOIN landlords ON listings.landlord_id = landlords.id
          WHERE listings.verification_status != 'Delisted'${locationFilter.whereSql}
          ORDER BY COALESCE(listings.is_premium, 0) DESC, listings.created_at DESC, listings.id DESC LIMIT ? OFFSET 0
        `;

        const stmt = env.DB.prepare(querySql);
        const { results } = await stmt.bind(...locationFilter.params, SEARCH_PAGE_SIZE).all();

        if (!results || results.length === 0) {
          await env.DB.prepare("DELETE FROM whatsapp_search_state WHERE phone_number = ?").bind(phone).run();
          const catNote = categoryLabel ? ` (${categoryLabel})` : "";
          const locDisp = cleanQuery || "All Locations";
          replyText = `🏡 No active listings currently found${catNote} in *"${locDisp}"*.\n\n💡 *Suggestions:*\n• Try searching a wider area like *Harare*, *Bulawayo*, or *All Locations*.\n• Tap *Search Again* to pick another category or commercial subtype.\n• Tap *Create a Listing* below to post your property on BunkBy!`;
          actionTaken = "SEARCH_NO_RESULTS";
          buttonsToSend = [
            { id: "CMD_SEARCH", title: "🔍 Search Again" },
            { id: "CMD_LIST", title: "🏡 Create a Listing" }
          ];
        } else {
          actionTaken = "SEARCH_RESULTS";
          const baseUrl = new URL(request.url).origin || "https://bunkby.com";

          const catSnippet = categoryLabel ? ` (${categoryLabel})` : "";
          const locSuffix = cleanQuery && cleanQuery.toLowerCase() !== "all" ? ` in "${cleanQuery}"` : "";
          const endNum = results.length;
          const headerMsg = `🏡 *Showing 1–${endNum} of ${totalMatching}${catSnippet}${locSuffix}:*`;
          outboundQueue.push({ text: headerMsg, itemType: "intro" });

          for (let idx = 0; idx < results.length; idx++) {
            const room = results[idx];
            outboundQueue.push({
              text: buildConciseSearchCardText(room, baseUrl, idx + 1),
              itemType: "listing_card",
              listingId: room.id
            });
          }

          const lastRoom: any = results[results.length - 1];
          const lastIsPremium = Number(lastRoom.is_premium) ? 1 : 0;
          const seenIds = results.map((r: any) => Number(r.id));
          const searchKey = JSON.stringify({
            cat: (searchCategory || "").toLowerCase(),
            sub: searchPropertyType || "",
            q: cleanQuery.toLowerCase()
          });

          await env.DB.prepare(`
            INSERT INTO whatsapp_search_state (
              phone_number, search_key, filters_json, total_matching, dispatched_count,
              cursor_is_premium, cursor_created_at, cursor_id, seen_ids, last_page_payload, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', CURRENT_TIMESTAMP)
            ON CONFLICT(phone_number) DO UPDATE SET
              search_key = excluded.search_key,
              filters_json = excluded.filters_json,
              total_matching = excluded.total_matching,
              dispatched_count = excluded.dispatched_count,
              cursor_is_premium = excluded.cursor_is_premium,
              cursor_created_at = excluded.cursor_created_at,
              cursor_id = excluded.cursor_id,
              seen_ids = excluded.seen_ids,
              last_page_payload = '',
              updated_at = CURRENT_TIMESTAMP
          `).bind(
            phone,
            searchKey,
            JSON.stringify({ category: searchCategory, propertyType: searchPropertyType, query: cleanQuery }),
            totalMatching,
            endNum,
            lastIsPremium,
            String(lastRoom.created_at || ""),
            Number(lastRoom.id),
            JSON.stringify(seenIds)
          ).run();

          const hasMore = endNum < totalMatching;
          const navButtons: Array<{ id: string; title: string }> = [];
          const remainingCount = totalMatching - endNum;
          if (hasMore) {
            navButtons.push({
              id: encodePageButtonId(endNum, searchCategory || "all", searchPropertyType, cleanQuery),
              title: "⏩ Next 5 Results"
            });
            navButtons.push({ id: "CMD_SEARCH", title: "🔍 New Search" });
            navButtons.push({ id: "CMD_LIST", title: "🏡 Add Listing" });
          } else {
            navButtons.push({ id: "CMD_SEARCH", title: "🔍 Search Again" });
            navButtons.push({ id: "CMD_MY_LISTINGS", title: "📋 My Listings" });
            navButtons.push({ id: "CMD_LIST", title: "🏡 Add Listing" });
          }

          const searchWebUrl = cleanQuery && cleanQuery.toLowerCase() !== "all"
            ? `https://bunkby.com/?q=${encodeURIComponent(cleanQuery)}`
            : "https://bunkby.com";
          const footerText = hasMore
            ? `📄 *Showing 1–${endNum} of ${totalMatching} matching properties* (${remainingCount} remaining).\nTap *Next 5 Results* below or browse full galleries on:\n🔗 ${searchWebUrl}`
            : `✅ *End of results (${endNum} of ${totalMatching} shown)${locSuffix}.*\nView full details and photo galleries on:\n🔗 ${searchWebUrl}`;

          outboundQueue.push({
            text: footerText,
            buttons: navButtons,
            itemType: "action_footer"
          });
        }
      } else if (currentStep === "AWAITING_CATEGORY") {
        if (buttonPayload === "CAT_STUDENT" || lowerText === "4" || lowerText.includes("student") || lowerText.includes("hostel") || lowerText.includes("boarding house")) {
          collectedData.category = "student";
          collectedData.rent_cycle = "Semester";
          collectedData.tenant_type = "Student";
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `🎓 *Student Accommodation Selected*\n\n*Step 2/11: Select Student Space Type*\nTap *Choose Space Type* below to select from:\n• Student Hostel\n• Boarding House\n• Single Student Room\n• Shared Student Room`;
          listToSend = buildPropertyTypeList("student");
          actionTaken = "LISTING_STEP_TYPE_STUDENT";
        } else if (buttonPayload === "CAT_COMMERCIAL" || lowerText === "3" || lowerText.includes("commercial") || lowerText.includes("shop") || lowerText.includes("office") || lowerText.includes("warehouse") || lowerText.includes("stall") || lowerText.includes("table")) {
          collectedData.category = "commercial";
          collectedData.rent_cycle = "Month";
          collectedData.tenant_type = "Professional";
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `🏢 *Commercial Properties Selected*\n\n*Step 2/11: Select Commercial Space Type*\nTap *Choose Space Type* below to pick:\n• Retail Shop\n• Offices / Commercial\n• Warehouse\n• Market Stall / Table`;
          listToSend = buildPropertyTypeList("commercial");
          actionTaken = "LISTING_STEP_TYPE_COMMERCIAL";
        } else if (buttonPayload === "CAT_HOSPITALITY" || lowerText === "2" || lowerText.includes("hospitality") || lowerText.includes("lodge") || lowerText.includes("hotel") || lowerText.includes("guest") || lowerText.includes("b&b")) {
          collectedData.category = "hospitality";
          collectedData.rent_cycle = "Night";
          collectedData.deposit = 0;
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `🏨 *Hospitality & Stays Selected*\n\n*Step 2/11: Select Stay Type*\nTap *Choose Stay Type* below to pick:\n• Guesthouse\n• Lodge / Guesthouse\n• Lodge\n• Hotel\n• Bed & Breakfast`;
          listToSend = buildPropertyTypeList("hospitality");
          actionTaken = "LISTING_STEP_TYPE_HOSPITALITY";
        } else if (buttonPayload === "CAT_RESIDENTIAL" || lowerText === "1" || lowerText.includes("residential") || lowerText.includes("rent")) {
          collectedData.category = "residential";
          collectedData.rent_cycle = "Month";
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `🏠 *Residential Rentals Selected*\n\n*Step 2/11: Select Property Type*\nTap *Select Property Type* below to choose (Single Room, Cottage, 2 rooms, 3 rooms, Full house, Apartment / Flat, Townhouse / Cluster, Shared Space, House Sale):`;
          listToSend = buildPropertyTypeList("residential");
          actionTaken = "LISTING_STEP_TYPE_RESIDENTIAL";
        } else {
          replyText = `⚠️ Please tap *Choose Category* below to select your property category:`;
          listToSend = buildListingCategoryList();
          actionTaken = "STEP_RETRY";
        }
      }

      // ---------------------------------------------------------
      // STEP 2: PROPERTY TYPE
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_PROPERTY_TYPE") {
        let chosenType = "";
        const normPayload = (buttonPayload || "").toLowerCase().trim();
        const normText = text.toLowerCase().trim();
        const isCommercialCat = collectedData.category === "commercial";
        const isStudentCat = collectedData.category === "student";

        if (isStudentCat) {
          const studentMap: Record<string, string> = {
            "1": "Student Hostel",
            "2": "Boarding House",
            "3": "Single Student Room",
            "4": "Shared Student Room",
            "stype_hostel": "Student Hostel",
            "stype_boarding": "Boarding House",
            "stype_single": "Single Student Room",
            "stype_shared": "Shared Student Room"
          };
          chosenType = studentMap[normPayload] || studentMap[normText] || "";
          if (!chosenType) {
            if (normText.includes("hostel")) chosenType = "Student Hostel";
            else if (normText.includes("boarding")) chosenType = "Boarding House";
            else if (normText.includes("shared")) chosenType = "Shared Student Room";
            else if (normText.includes("single")) chosenType = "Single Student Room";
          }
        } else if (isCommercialCat) {
          const commMap: Record<string, string> = {
            "1": "Commercial",
            "2": "Shop",
            "3": "Warehouse",
            "4": "Table",
            "ctype_commercial": "Commercial",
            "ctype_shop": "Shop",
            "ctype_warehouse": "Warehouse",
            "ctype_table": "Table",
            "retail shop": "Shop",
            "offices / commercial": "Commercial",
            "warehouse": "Warehouse",
            "market stall / table": "Table"
          };
          chosenType = commMap[normPayload] || commMap[normText] || "";
          if (!chosenType) {
            if (normText.includes("shop") || normText.includes("retail") || normText.includes("storefront")) chosenType = "Shop";
            else if (normText.includes("warehouse") || normText.includes("storage")) chosenType = "Warehouse";
            else if (normText.includes("table") || normText.includes("booth") || normText.includes("stall") || normText.includes("market")) chosenType = "Table";
            else if (normText.includes("commercial") || normText.includes("office")) chosenType = "Commercial";
          }
        } else if (isHospitality) {
          const hospMap: Record<string, string> = {
            "1": "Guesthouse",
            "2": "Lodge / Guesthouse",
            "3": "Lodge",
            "4": "Hotel",
            "5": "Bed & Breakfast",
            "htype_guesthouse": "Guesthouse",
            "htype_lodge_gh": "Lodge / Guesthouse",
            "htype_lodge": "Lodge",
            "htype_hotel": "Hotel",
            "htype_bnb": "Bed & Breakfast",
            "guesthouse": "Guesthouse",
            "guest house": "Guesthouse",
            "lodge / guesthouse": "Lodge / Guesthouse",
            "lodge": "Lodge",
            "hotel": "Hotel",
            "bed & breakfast": "Bed & Breakfast",
            "b&b": "Bed & Breakfast"
          };
          chosenType = hospMap[normPayload] || hospMap[normText] || "";
          if (!chosenType) {
            if (normText.includes("lodge / guesthouse")) chosenType = "Lodge / Guesthouse";
            else if (normText === "guesthouse" || normText.includes("guest house")) chosenType = "Guesthouse";
            else if (normText.includes("lodge")) chosenType = "Lodge";
            else if (normText.includes("hotel")) chosenType = "Hotel";
            else if (normText.includes("bed") || normText.includes("b&b") || normText.includes("breakfast")) chosenType = "Bed & Breakfast";
          }
        } else {
          const resMap: Record<string, string> = {
            "1": "Single Room",
            "2": "Cottage",
            "3": "2 rooms",
            "4": "3 rooms",
            "5": "Full house",
            "6": "Apartment / Flat",
            "7": "Townhouse / Cluster",
            "8": "Shared Space",
            "9": "House Sale",
            "rtype_room": "Single Room",
            "rtype_cottage": "Cottage",
            "rtype_2rooms": "2 rooms",
            "rtype_3rooms": "3 rooms",
            "rtype_house": "Full house",
            "rtype_flat": "Apartment / Flat",
            "rtype_townhouse": "Townhouse / Cluster",
            "rtype_shared": "Shared Space",
            "rtype_sale": "House Sale"
          };
          chosenType = resMap[normPayload] || resMap[normText] || "";
          if (!chosenType) {
            if (normText.includes("single") || normText === "room") chosenType = "Single Room";
            else if (normText.includes("cottage")) chosenType = "Cottage";
            else if (normText.includes("2 room") || normText.includes("two room")) chosenType = "2 rooms";
            else if (normText.includes("3 room") || normText.includes("three room")) chosenType = "3 rooms";
            else if (normText.includes("townhouse") || normText.includes("cluster")) chosenType = "Townhouse / Cluster";
            else if (normText.includes("apartment") || normText.includes("flat")) chosenType = "Apartment / Flat";
            else if (normText.includes("shared")) chosenType = "Shared Space";
            else if (normText.includes("sale")) chosenType = "House Sale";
            else if (normText.includes("full") || normText.includes("house")) chosenType = "Full house";
          }
        }

        if (!chosenType) {
          replyText = `⚠️ Please choose a property type from the list below:`;
          listToSend = buildPropertyTypeList(collectedData.category || "residential");
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.property_type = chosenType;
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_TITLE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          const titleExample = isStudentCat
            ? "Furnished 2-Sleeper Room near Campus with Wifi"
            : isCommercialCat
            ? (chosenType === "Shop"
              ? "Prime Retail Shop on First Street"
              : chosenType === "Warehouse"
              ? "Industrial Warehouse with Loading Bay in Msasa"
              : chosenType === "Table"
              ? "High-Footfall Flea Market Table in CBD"
              : "Modern Office Suite in Avondale")
            : isHospitality
            ? "Modern Ensuite Lodge with Solar & Pool"
            : "Spacious Cottage in Avonlea with Solar";

          replyText = `✅ Property Type: *${chosenType}*\n\n*Step 3/11: Listing Headline / Title*\nEnter a brief catchy headline for your property:\n_(e.g. *${titleExample}*)_`;
          buttonsToSend = [
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "LISTING_STEP_TITLE";
        }
      }

      // ---------------------------------------------------------
      // STEP 3: TITLE / HEADLINE -> TOWN OR CITY
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_TITLE") {
        if (!text || text.length < 3) {
          replyText = `⚠️ Please provide a clear headline (at least 3 characters).\n\n*Example:* "Spacious Cottage in Avonlea with Solar"`;
          buttonsToSend = [{ id: "BTN_CANCEL", title: "❌ Cancel" }];
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.title = text.trim();
          if (isHospitality) {
            collectedData.business_name = text.trim();
          }
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_CITY', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ Headline: *${collectedData.title}*\n\n*Step 4/11: Town or City*\nTap *Choose City / Town* below or type any Zimbabwean town or resort name (e.g. *Chinhoyi*, *Marondera*, *Bindura*, *Kariba*, *Nyanga*, *Chivhu*):`;
          listToSend = buildCitySelectionList();
          actionTaken = "LISTING_STEP_CITY";
        }
      }

      // ---------------------------------------------------------
      // STEP 4: TOWN OR CITY -> SUBURB
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_CITY") {
        const cityMap: Record<string, string> = {
          "1": "Harare",
          "2": "Bulawayo",
          "3": "Chitungwiza",
          "4": "Mutare",
          "5": "Gweru",
          "6": "Victoria Falls",
          "7": "Kadoma",
          "8": "Kwekwe",
          "9": "Chinhoyi",
          "10": "Masvingo",
          "11": "Marondera",
          "12": "Bindura",
          "13": "Kariba",
          "14": "Nyanga",
          "15": "Chivhu",
          "city_harare": "Harare",
          "city_bulawayo": "Bulawayo",
          "city_chitungwiza": "Chitungwiza",
          "city_mutare": "Mutare",
          "city_gweru": "Gweru",
          "city_vicfalls": "Victoria Falls",
          "city_victoria_falls": "Victoria Falls",
          "city_kadoma": "Kadoma",
          "city_kwekwe": "Kwekwe",
          "city_chinhoyi": "Chinhoyi",
          "city_masvingo": "Masvingo",
          "city_marondera": "Marondera",
          "city_bindura": "Bindura",
          "city_kariba": "Kariba",
          "city_nyanga": "Nyanga",
          "city_chivhu": "Chivhu"
        };
        const normCity = (buttonPayload || "").toLowerCase().trim();
        const normInput = text.toLowerCase().trim();

        let chosenCity = cityMap[normCity] || cityMap[normInput] || "";
        if (!chosenCity) {
          if (normInput.includes("harare")) chosenCity = "Harare";
          else if (normInput.includes("bulawayo")) chosenCity = "Bulawayo";
          else if (normInput.includes("mutare")) chosenCity = "Mutare";
          else if (normInput.includes("gweru")) chosenCity = "Gweru";
          else if (normInput.includes("kadoma")) chosenCity = "Kadoma";
          else if (normInput.includes("kariba")) chosenCity = "Kariba";
          else if (normInput.includes("nyanga")) chosenCity = "Nyanga";
          else if (normInput.includes("bindura")) chosenCity = "Bindura";
          else if (normInput.includes("chivhu")) chosenCity = "Chivhu";
          else if (normInput.includes("victoria falls") || normInput.includes("vic falls")) chosenCity = "Victoria Falls";
          else if (normInput.includes("chitungwiza")) chosenCity = "Chitungwiza";
          else if (normInput.includes("masvingo")) chosenCity = "Masvingo";
          else if (normInput.includes("chinhoyi")) chosenCity = "Chinhoyi";
          else if (normInput.includes("kwekwe")) chosenCity = "Kwekwe";
          else if (normInput.includes("marondera")) chosenCity = "Marondera";
          else if (normInput.includes("norton")) chosenCity = "Norton";
          else if (normInput.includes("rusape")) chosenCity = "Rusape";
          else if (normInput.includes("zvishavane")) chosenCity = "Zvishavane";
          else if (normInput.includes("hwange")) chosenCity = "Hwange";
          else if (text.trim().length >= 2) chosenCity = text.trim();
        }

        if (!chosenCity) {
          replyText = `⚠️ Please choose a city from the list or type any valid town name:`;
          listToSend = buildCitySelectionList();
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.city = chosenCity;
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_SUBURB', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ City: *${chosenCity}*\n\n*Step 5/11: Suburb or Area*\nWhich suburb or neighbourhood in ${chosenCity} is the property in?\n_(e.g. *Avonlea*, *Belvedere*, *Avenues*, *CBD*, *Khumalo*)_`;
          buttonsToSend = [{ id: "BTN_CANCEL", title: "❌ Cancel" }];
          actionTaken = "LISTING_STEP_SUBURB";
        }
      }

      // ---------------------------------------------------------
      // STEP 5: SUBURB -> LANDMARK
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_SUBURB") {
        if (!text || text.length < 2) {
          replyText = `⚠️ Please enter a valid suburb or area name.`;
          buttonsToSend = [{ id: "BTN_CANCEL", title: "❌ Cancel" }];
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.suburb = text.trim();
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_LANDMARK', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ Suburb: *${collectedData.suburb}* (${collectedData.city || "Harare"})\n\n*Step 6/11: Landmark or Directions*\nAny nearest landmark or directions?\n_(e.g. *Near Total Garage on Lomagundi Rd* or *Along Century Ave*)_\n\nTap a button or type directions:`;
          buttonsToSend = [
            { id: "LM_NONE", title: "⏭️ None / Skip" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "LISTING_STEP_LANDMARK";
        }
      }

      // ---------------------------------------------------------
      // STEP 6: LANDMARK -> RENT/RATE CYCLE
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_LANDMARK") {
        const landmark = (buttonPayload === "LM_NONE" || lowerText === "none" || lowerText === "no" || lowerText === "skip") ? "" : text.trim();
        collectedData.landmark = landmark;

        await env.DB.prepare(`
          UPDATE chatbot_sessions 
          SET current_step = 'AWAITING_RENT_CYCLE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE phone_number = ?
        `).bind(JSON.stringify(collectedData), phone).run();

        const isStudentListing = collectedData.category === "student";
        const isCommercialListing = collectedData.category === "commercial";

        replyText = `✅ Directions recorded.\n\n*Step 7/11: Rent or Rate Cycle*\nHow often is the rent or rate charged?\n\nTap an option below _(or reply CANCEL anytime)_:`;
        if (isStudentListing) {
          buttonsToSend = [
            { id: "CYCLE_SEMESTER", title: "🎓 Per Semester" },
            { id: "CYCLE_MONTH", title: "📅 Per Month" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
        } else if (isHospitality) {
          buttonsToSend = [
            { id: "CYCLE_NIGHT", title: "🌙 Per Night" },
            { id: "CYCLE_MONTH", title: "📅 Per Month" },
            { id: "CYCLE_HOUR", title: "⏱️ Per Hour" }
          ];
        } else if (isCommercialListing) {
          buttonsToSend = [
            { id: "CYCLE_MONTH", title: "📅 Per Month" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
        } else {
          buttonsToSend = [
            { id: "CYCLE_MONTH", title: "📅 Per Month" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
        }
        actionTaken = "LISTING_STEP_RENT_CYCLE";
      }

      // ---------------------------------------------------------
      // STEP 7: RENT / RATE CYCLE -> PRICE
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_RENT_CYCLE") {
        const cycleMap: Record<string, string> = {
          "1": "Month",
          "2": "Night",
          "3": "Semester",
          "4": "Hour",
          "cycle_month": "Month",
          "cycle_night": "Night",
          "cycle_semester": "Semester",
          "cycle_hour": "Hour",
          "month": "Month",
          "monthly": "Month",
          "night": "Night",
          "daily": "Night",
          "semester": "Semester",
          "hour": "Hour",
          "hourly": "Hour"
        };
        const normCycle = (buttonPayload || "").toLowerCase().trim();
        const normInput = text.toLowerCase().trim();
        let chosenCycle = cycleMap[normCycle] || cycleMap[normInput] || "";
        if (!chosenCycle) {
          if (normInput.includes("month")) chosenCycle = "Month";
          else if (normInput.includes("night") || normInput.includes("day")) chosenCycle = "Night";
          else if (normInput.includes("semester") || normInput.includes("term")) chosenCycle = "Semester";
          else if (normInput.includes("hour")) chosenCycle = "Hour";
          else chosenCycle = isHospitality ? "Night" : "Month";
        }

        collectedData.rent_cycle = chosenCycle;
        await env.DB.prepare(`
          UPDATE chatbot_sessions 
          SET current_step = 'AWAITING_PRICE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE phone_number = ?
        `).bind(JSON.stringify(collectedData), phone).run();

        const isStudentListing = collectedData.category === "student";
        const priceExample = isStudentListing ? "*350*, *450*, *600*" : (chosenCycle === "Night" ? "*35*, *50*, *80*" : "*80*, *150*, *250*");
        replyText = `✅ Rate Cycle: *Per ${chosenCycle}*\n\n*Step 8/11: Price in USD*\nWhat is the price in USD ($) per ${chosenCycle.toLowerCase()}?\n_(Reply with just the number, e.g. ${priceExample})_`;
        buttonsToSend = [{ id: "BTN_CANCEL", title: "❌ Cancel" }];
        actionTaken = "LISTING_STEP_PRICE";
      }

      // ---------------------------------------------------------
      // STEP 8: PRICE -> (Hosp: AMENITIES, Others: DEPOSIT)
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_PRICE") {
        const priceNum = parseInt(text.replace(/[^0-9]/g, ""), 10);
        if (isNaN(priceNum) || priceNum <= 0) {
          replyText = `⚠️ Please enter a valid number for the price in USD (e.g. *35*, *80*, *150*).`;
          buttonsToSend = [{ id: "BTN_CANCEL", title: "❌ Cancel" }];
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.price = priceNum;
          const cycleLabel = collectedData.rent_cycle || (isHospitality ? "Night" : "Month");

          if (isHospitality) {
            collectedData.deposit = 0;
            collectedData.tenant_type = "Guests";
            await env.DB.prepare(`
              UPDATE chatbot_sessions 
              SET current_step = 'AWAITING_AMENITIES', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE phone_number = ?
            `).bind(JSON.stringify(collectedData), phone).run();

            replyText = `✅ Rate: *$${priceNum} / ${cycleLabel.toLowerCase()}*\n\n*Step 9/10: Amenities Checklist*\nReply with numbers of included amenities (e.g. *1, 2, 7*):\n` +
              `1️⃣ Wifi / Internet\n` +
              `2️⃣ Swimming Pool\n` +
              `3️⃣ Breakfast Included\n` +
              `4️⃣ Solar Power Backup\n` +
              `5️⃣ Air Conditioning / Ensuite\n` +
              `6️⃣ Secure Parking\n` +
              `7️⃣ Generator Backup\n` +
              `8️⃣ DSTV / Satellite\n` +
              `9️⃣ Restaurant / Bar\n` +
              `🔟 Airport Shuttle\n\n` +
              `Or tap *Standard Amenities* to select all popular features:`;
            buttonsToSend = [
              { id: "AMEN_ALL_HOSP", title: "✨ Standard Amenities" },
              { id: "BTN_CANCEL", title: "❌ Cancel" }
            ];
            actionTaken = "LISTING_STEP_AMENITIES";
          } else {
            const isStudentListing = collectedData.category === "student";
            await env.DB.prepare(`
              UPDATE chatbot_sessions 
              SET current_step = 'AWAITING_DEPOSIT', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE phone_number = ?
            `).bind(JSON.stringify(collectedData), phone).run();

            const depStepNum = isStudentListing ? "9/10" : "9/11";
            replyText = `✅ Rent: *$${priceNum} / ${cycleLabel.toLowerCase()}*\n\n*Step ${depStepNum}: Deposit*\nIs a deposit required?\n\nTap a button or reply with the deposit amount in USD:`;
            buttonsToSend = [
              { id: "DEP_SAME", title: `$${priceNum} (1 ${cycleLabel})` },
              { id: "DEP_NONE", title: "No Deposit ($0)" },
              { id: "BTN_CANCEL", title: "❌ Cancel" }
            ];
            actionTaken = "LISTING_STEP_DEPOSIT";
          }
        }
      }

      // ---------------------------------------------------------
      // STEP 9: DEPOSIT -> (Commercial/Student: AMENITIES, Residential: TENANT_TYPE)
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_DEPOSIT") {
        let depositVal = 0;
        if (buttonPayload === "DEP_NONE" || lowerText === "0" || lowerText === "none" || lowerText === "no") {
          depositVal = 0;
        } else if (buttonPayload === "DEP_SAME") {
          depositVal = Number(collectedData.price || 0);
        } else {
          const parsed = parseInt(text.replace(/[^0-9]/g, ""), 10);
          depositVal = isNaN(parsed) ? 0 : parsed;
        }

        collectedData.deposit = depositVal;
        const isStudentListing = collectedData.category === "student";
        const isCommercialListing = collectedData.category === "commercial";

        if (isStudentListing) {
          collectedData.tenant_type = "Student";
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_AMENITIES', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ Deposit: *${depositVal > 0 ? "$" + depositVal : "No Deposit ($0)"}*\n\n*Step 10/10: Amenities Checklist*\nReply with numbers of included student amenities (e.g. *1, 2, 5*):\n` +
            `1️⃣ Reliable Water / Borehole\n` +
            `2️⃣ Solar Power Backup\n` +
            `3️⃣ Wifi / Study Internet\n` +
            `4️⃣ Study Desk & Bed\n` +
            `5️⃣ Walled & Gated Security\n` +
            `6️⃣ Fitted Wardrobe\n` +
            `7️⃣ Ensuite Bathroom\n` +
            `8️⃣ Caretaker / Security Guard\n\n` +
            `Or tap *Standard Amenities* to select all popular features:`;
          buttonsToSend = [
            { id: "AMEN_ALL_RES", title: "✨ Standard Amenities" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "LISTING_STEP_AMENITIES";
        } else if (isCommercialListing) {
          collectedData.tenant_type = "Professional";
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_AMENITIES', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ Deposit: *${depositVal > 0 ? "$" + depositVal : "No Deposit ($0)"}*\n\n*Step 10/10: Commercial Amenities*\nReply with numbers of included features (e.g. *1, 2, 4*):\n` +
            `1️⃣ Secure Parking / Loading Bay\n` +
            `2️⃣ Solar / Generator Backup\n` +
            `3️⃣ High Speed Internet / Fiber\n` +
            `4️⃣ Road Frontage / High Foot Traffic\n` +
            `5️⃣ Private Restroom / Kitchenette\n` +
            `6️⃣ 24/7 Security & Alarm\n\n` +
            `Or tap *Standard Amenities* to select all popular features:`;
          buttonsToSend = [
            { id: "AMEN_ALL_RES", title: "✨ Standard Amenities" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "LISTING_STEP_AMENITIES";
        } else {
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_TENANT_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ Deposit: *${depositVal > 0 ? "$" + depositVal : "No Deposit ($0)"}*\n\n*Step 10/11: Preferred Tenant Type*\nWho is this property best suited for?\n\nTap *Select Tenant Type* below:`;
          listToSend = buildTenantTypeList();
          actionTaken = "LISTING_STEP_TENANT_TYPE";
        }
      }

      // ---------------------------------------------------------
      // STEP 10: PREFERRED TENANT / AUDIENCE -> AMENITIES
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_TENANT_TYPE") {
        const tenantMap: Record<string, string> = {
          "1": "General",
          "2": "Student",
          "3": "Single",
          "4": "Family",
          "5": "Professional",
          "6": "Guest",
          "ttype_general": "General",
          "ttype_student": "Student",
          "ttype_single": "Single",
          "ttype_family": "Family",
          "ttype_professional": "Professional",
          "ttype_guest": "Guest"
        };
        const normPayload = (buttonPayload || "").toLowerCase().trim();
        const normInput = text.toLowerCase().trim();
        let chosenTenant = tenantMap[normPayload] || tenantMap[normInput] || "";
        if (!chosenTenant) {
          if (normInput.includes("student")) chosenTenant = "Student";
          else if (normInput.includes("single")) chosenTenant = "Single";
          else if (normInput.includes("family")) chosenTenant = "Family";
          else if (normInput.includes("professional") || normInput.includes("work") || normInput.includes("business")) chosenTenant = "Professional";
          else if (normInput.includes("guest") || normInput.includes("travel")) chosenTenant = "Guest";
          else chosenTenant = isHospitality ? "Guest" : "General";
        }

        collectedData.tenant_type = chosenTenant;
        await env.DB.prepare(`
          UPDATE chatbot_sessions 
          SET current_step = 'AWAITING_AMENITIES', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE phone_number = ?
        `).bind(JSON.stringify(collectedData), phone).run();

        if (isHospitality) {
          replyText = `✅ Preferred Audience: *${chosenTenant}*\n\n*Step 11/11: Amenities Checklist*\nReply with numbers of included amenities (e.g. *1, 2, 7*):\n` +
            `1️⃣ Wifi / Internet\n` +
            `2️⃣ Swimming Pool\n` +
            `3️⃣ Breakfast Included\n` +
            `4️⃣ Solar Power Backup\n` +
            `5️⃣ Air Conditioning / Ensuite\n` +
            `6️⃣ Secure Parking\n` +
            `7️⃣ Generator Backup\n` +
            `8️⃣ DSTV / Satellite\n` +
            `9️⃣ Restaurant / Bar\n` +
            `🔟 Airport Shuttle\n\n` +
            `Or tap *Standard Amenities* to select all popular features:`;
          buttonsToSend = [
            { id: "AMEN_ALL_HOSP", title: "✨ Standard Amenities" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
        } else {
          replyText = `✅ Preferred Tenant: *${chosenTenant}*\n\n*Step 11/11: Amenities Checklist*\nReply with numbers of included amenities (e.g. *1, 2, 5*):\n` +
            `1️⃣ Borehole\n` +
            `2️⃣ Solar Power Backup\n` +
            `3️⃣ Tiled Floors & Ceiling\n` +
            `4️⃣ Ensuite\n` +
            `5️⃣ Walled & Gated\n` +
            `6️⃣ Fitted wardrobe\n` +
            `7️⃣ Gated Community\n` +
            `8️⃣ Reliable water\n` +
            `9️⃣ Wifi / Internet\n` +
            `🔟 Care taker / Security guard\n\n` +
            `Or tap *Standard Amenities* to select all popular features:`;
          buttonsToSend = [
            { id: "AMEN_ALL_RES", title: "✨ Standard Amenities" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
        }
        actionTaken = "LISTING_STEP_AMENITIES";
      }

      // ---------------------------------------------------------
      // STEP 11: AMENITIES SELECTION -> PHOTOS
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_AMENITIES") {
        const selectedAmenities: string[] = [];

        if (buttonPayload === "AMEN_ALL_HOSP" || lowerText.includes("standard")) {
          selectedAmenities.push("Wifi / Internet", "Solar Power Backup", "Secure Parking", "Ensuite", "Air Conditioning");
        } else if (buttonPayload === "AMEN_ALL_RES" || lowerText.includes("standard")) {
          selectedAmenities.push("Borehole", "Solar Power Backup", "Walled & Gated", "Tiled Floors");
        } else if (isHospitality) {
          const hospAmenityMap: Record<string, string> = {
            "1": "Wifi / Internet",
            "2": "Swimming Pool",
            "3": "Breakfast Included",
            "4": "Solar Power Backup",
            "5": "Air Conditioning / Ensuite",
            "6": "Secure Parking",
            "7": "Generator Backup",
            "8": "DSTV / Satellite",
            "9": "Restaurant / Bar",
            "10": "Airport Shuttle"
          };
          const tokens = text.split(/[,\s+]+/).map(t => t.trim());
          for (const [key, val] of Object.entries(hospAmenityMap)) {
            if (tokens.includes(key) || lowerText.includes(val.toLowerCase())) {
              selectedAmenities.push(val);
            }
          }
          if (selectedAmenities.length === 0) {
            selectedAmenities.push("Wifi / Internet", "Solar Power Backup", "Secure Parking");
          }
        } else {
          const resAmenityMap: Record<string, string> = {
            "1": "Borehole",
            "2": "Solar Power Backup",
            "3": "Tiled Floors & Ceiling",
            "4": "Ensuite",
            "5": "Walled & Gated",
            "6": "Fitted wardrobe",
            "7": "Gated Community",
            "8": "Reliable water",
            "9": "Wifi / Internet",
            "10": "Care taker / Security guard"
          };
          const tokens = text.split(/[,\s+]+/).map(t => t.trim());
          for (const [key, val] of Object.entries(resAmenityMap)) {
            if (tokens.includes(key) || lowerText.includes(val.toLowerCase())) {
              selectedAmenities.push(val);
            }
          }
          if (selectedAmenities.length === 0) {
            selectedAmenities.push("Borehole", "Reliable water", "Solar Power Backup", "Walled & Gated");
          }
        }

        collectedData.amenities = selectedAmenities;
        await env.DB.prepare(`
          UPDATE chatbot_sessions 
          SET current_step = 'AWAITING_PHOTOS', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE phone_number = ?
        `).bind(JSON.stringify(collectedData), phone).run();

        const formattedAmenitiesList = selectedAmenities.map(a => "• " + a).join("\n");
        replyText = `✨ *Amenities recorded:*\n${formattedAmenitiesList}\n\n📸 *Property Photos*\nPlease send *1 to 3 photos* of the property directly here in WhatsApp!\n\n_(Attach photo from gallery or snap a photo. When finished, tap Done, Skip, or Cancel below)_`;
        buttonsToSend = [
          { id: "BTN_FINISH_PHOTOS", title: "✅ Done Uploading" },
          { id: "BTN_SKIP_PHOTOS", title: "⏭️ Skip Photos" },
          { id: "BTN_CANCEL", title: "❌ Cancel" }
        ];
        actionTaken = "LISTING_STEP_PHOTOS";
      }

      // ---------------------------------------------------------
      // STEP 12: PHOTOS UPLOAD -> CONFIRMATION PREVIEW
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_PHOTOS") {
        if (!Array.isArray(collectedData.photos)) {
          collectedData.photos = [];
        }

        let photoReceived = false;
        let photoDownloadFailed = false;

        if (incomingMediaId) {
          try {
            const downloadedDataUri = await downloadWhatsAppMediaAsDataUri(incomingMediaId, env);
            if (downloadedDataUri) {
              collectedData.photos.push(downloadedDataUri);
              photoReceived = true;
            } else {
              photoDownloadFailed = true;
            }
          } catch (e) {
            photoDownloadFailed = true;
          }
        } else if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("data:image")) {
          collectedData.photos.push(text.trim());
          photoReceived = true;
        }

        const isFinished = 
          buttonPayload === "BTN_FINISH_PHOTOS" || 
          buttonPayload === "BTN_SKIP_PHOTOS" || 
          lowerText === "done" || 
          lowerText === "skip" || 
          lowerText === "finish" || 
          lowerText === "next" ||
          lowerText === "no";

        if (photoReceived && !isFinished) {
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          const count = collectedData.photos.length;
          if (count >= 3) {
            await env.DB.prepare(`
              UPDATE chatbot_sessions 
              SET current_step = 'AWAITING_CONFIRMATION', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE phone_number = ?
            `).bind(JSON.stringify(collectedData), phone).run();

            const period = collectedData.rent_cycle || (isHospitality ? "night" : "month");
            const depositStr = collectedData.deposit > 0 ? `$${collectedData.deposit}` : "None";

            replyText = `📸 *All 3 photos received!*\n\n📋 *Listing Preview & Confirmation:*\n\n` +
              `• *Headline:* ${collectedData.title}\n` +
              `• *Type:* ${collectedData.property_type}\n` +
              `• *Category:* ${getCategoryDisplayName(collectedData.category)}\n` +
              `• *Location:* ${collectedData.suburb}, ${collectedData.city || "Harare"}${collectedData.landmark ? ` (${collectedData.landmark})` : ""}\n` +
              `• *Rate:* $${collectedData.price} / ${period}\n` +
              `• *Deposit:* ${depositStr}\n` +
              `• *Photos Attached:* 3 photos\n` +
              `• *Contact Number:* ${collectedData.contact_phone || phone}\n\n` +
              `Tap *Publish Listing* to make it live immediately on https://bunkby.com!`;

            buttonsToSend = [
              { id: "BTN_CONFIRM_PUBLISH", title: "🚀 Publish Listing" },
              { id: "BTN_EDIT_PHONE", title: "✏️ Change Contact" },
              { id: "BTN_CANCEL", title: "❌ Cancel" }
            ];
            actionTaken = "LISTING_PREVIEW";
          } else {
            replyText = `📸 *Photo ${count} received!*\n\nYou can send another photo (up to 3), or tap *Done Uploading* to preview your listing.`;
            buttonsToSend = [
              { id: "BTN_FINISH_PHOTOS", title: "✅ Done Uploading" },
              { id: "BTN_SKIP_PHOTOS", title: "⏭️ Skip / Continue" },
              { id: "BTN_CANCEL", title: "❌ Cancel" }
            ];
            actionTaken = "LISTING_PHOTO_UPLOADED";
          }
        } else if (photoDownloadFailed && !isFinished) {
          replyText = `📸 *Photo received!*\n\nWould you like to send another photo, or tap *Done Uploading* to continue to your preview?`;
          buttonsToSend = [
            { id: "BTN_FINISH_PHOTOS", title: "✅ Done Uploading" },
            { id: "BTN_SKIP_PHOTOS", title: "⏭️ Skip / Continue" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "LISTING_PHOTO_FALLBACK_ACK";
        } else if (isFinished || collectedData.photos.length >= 3) {
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_CONFIRMATION', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          const photoCount = collectedData.photos.length;
          const period = collectedData.rent_cycle || (isHospitality ? "night" : "month");
          const depositStr = collectedData.deposit > 0 ? `$${collectedData.deposit}` : "None";

          replyText = `📋 *Listing Preview & Confirmation:*\n\n` +
            `• *Headline:* ${collectedData.title}\n` +
            `• *Type:* ${collectedData.property_type}\n` +
            `• *Category:* ${getCategoryDisplayName(collectedData.category)}\n` +
            `• *Location:* ${collectedData.suburb}, ${collectedData.city || "Harare"}${collectedData.landmark ? ` (${collectedData.landmark})` : ""}\n` +
            `• *Rate:* $${collectedData.price} / ${period}\n` +
            `• *Deposit:* ${depositStr}\n` +
            `• *Photos Attached:* ${photoCount} photo${photoCount === 1 ? "" : "s"}\n` +
            `• *Contact Number:* ${collectedData.contact_phone || phone}\n\n` +
            `Tap *Publish Listing* to make it live immediately on https://bunkby.com!`;

          buttonsToSend = [
            { id: "BTN_CONFIRM_PUBLISH", title: "🚀 Publish Listing" },
            { id: "BTN_EDIT_PHONE", title: "✏️ Change Contact" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "LISTING_PREVIEW";
        } else {
          replyText = `📸 Please attach a photo from your gallery, or tap *Done Uploading* to finish without additional photos:`;
          buttonsToSend = [
            { id: "BTN_FINISH_PHOTOS", title: "✅ Done Uploading" },
            { id: "BTN_SKIP_PHOTOS", title: "⏭️ Skip Photos" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "STEP_RETRY";
        }
      }

      // ---------------------------------------------------------
      // STEP 13: PREVIEW, EDIT CONTACT & PUBLISH CONFIRMATION
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_CONFIRMATION") {
        if (buttonPayload === "BTN_EDIT_PHONE" || lowerText.includes("change contact") || lowerText.includes("edit phone")) {
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_CONTACT_PHONE', updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(phone).run();

          replyText = `📞 *Current Contact:* ${collectedData.contact_phone || phone}\n\nPlease enter the phone number tenants should call or WhatsApp:\n_(e.g. *0771234567* or *+263771234567*)_`;
          buttonsToSend = [{ id: "BTN_CANCEL", title: "❌ Cancel" }];
          actionTaken = "LISTING_STEP_EDIT_PHONE";
        } else if (
          buttonPayload === "BTN_CONFIRM_PUBLISH" ||
          buttonPayload === "btn_confirm_publish" ||
          buttonPayload === "CMD_CONFIRM_PUBLISH" ||
          buttonPayload === "PUBLISH_LISTING" ||
          lowerText === "publish listing" ||
          lowerText.includes("publish listing") ||
          lowerText === "publish" ||
          lowerText === "yes" ||
          lowerText === "confirm" ||
          lowerText === "1" ||
          lowerText.startsWith("publish") ||
          (lowerText.includes("publish") && !lowerText.includes("cancel"))
        ) {
          const isCommercialListing = collectedData.category === "commercial";
          const allPhotos = Array.isArray(collectedData.photos) && collectedData.photos.length > 0
            ? collectedData.photos
            : [
              isHospitality
                ? "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80"
                : isCommercialListing
                ? "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80"
                : "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80"
            ];

          const primaryImage = allPhotos[0];
          const storedImageField = allPhotos.length > 1 ? JSON.stringify(allPhotos) : primaryImage;

          const amenitiesJson = JSON.stringify(collectedData.amenities || ["Solar Backup", "Reliable Water"]);
          const categoryVal = collectedData.category || "residential";
          const businessNameVal = collectedData.business_name || (isHospitality ? collectedData.title : null);
          const isPremiumVal = 0;
          const tierVal = "free";
          const cityVal = collectedData.city || "Harare";

          const recentExisting = await env.DB.prepare(`
            SELECT id FROM listings 
            WHERE landlord_id = ? AND title = ? AND suburb = ? AND created_at >= datetime('now', '-60 seconds')
            ORDER BY id DESC LIMIT 1
          `).bind(collectedData.landlord_id || phoneId, collectedData.title, collectedData.suburb).first();

          let listingId: any = recentExisting?.id;

          if (!recentExisting) {
            let cols = ["title", "suburb", "price", "landlord_id", "verification_status", "image_url", "landmark", "city", "deposit", "property_type", "tenant_type", "rent_cycle", "contact_method", "contact_phone", "amenities"];
            try {
              const tableInfo = await env.DB.prepare("PRAGMA table_info(listings)").all();
              const existingCols = (tableInfo?.results || []).map((c: any) => c.name);
              if (existingCols.includes("category")) cols.push("category");
              if (existingCols.includes("business_name")) cols.push("business_name");
              if (existingCols.includes("is_premium")) cols.push("is_premium");
              if (existingCols.includes("listing_tier")) cols.push("listing_tier");
              if (existingCols.includes("expiry_date")) cols.push("expiry_date");
            } catch (_) {}

            const valuesMap: Record<string, any> = {
              title: collectedData.title,
              suburb: collectedData.suburb,
              price: Number(collectedData.price),
              landlord_id: collectedData.landlord_id || phoneId,
              verification_status: "Active",
              image_url: storedImageField,
              landmark: collectedData.landmark || null,
              city: cityVal,
              deposit: Number(collectedData.deposit || 0),
              property_type: collectedData.property_type || "Single Room",
              tenant_type: collectedData.tenant_type || (categoryVal === "student" ? "Student" : categoryVal === "commercial" ? "Professional" : categoryVal === "hospitality" ? "Guest" : "General"),
              rent_cycle: collectedData.rent_cycle || (isHospitality ? "Night" : "Month"),
              contact_method: "Call / Whatsapp",
              contact_phone: collectedData.contact_phone || phone,
              amenities: amenitiesJson,
              category: categoryVal,
              business_name: businessNameVal,
              is_premium: isPremiumVal,
              listing_tier: tierVal,
              expiry_date: null
            };

            const targetCols = cols.filter(c => valuesMap[c] !== undefined);
            const placeholders = targetCols.map(() => "?").join(", ");
            const bindValues = targetCols.map(c => valuesMap[c]);

            const insertRes = await env.DB.prepare(`
              INSERT INTO listings (${targetCols.join(", ")})
              VALUES (${placeholders})
            `).bind(...bindValues).run();

            listingId = insertRes?.meta?.last_row_id || "New";
          }

          await env.DB.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").bind(phone).run();

          replyText = `🎉 *Congratulations! Your listing is LIVE on BunkBy!* (Listing #${listingId})\n\n` +
            `📋 *Summary:*\n` +
            `• *Title:* ${collectedData.title}\n` +
            `• *Category:* ${getCategoryDisplayName(collectedData.category)}\n` +
            `• *Type:* ${collectedData.property_type}\n` +
            `• *Suburb:* ${collectedData.suburb}\n` +
            `• *Rate:* $${collectedData.price}/${collectedData.rent_cycle || "month"}\n` +
            `• *Contact:* ${collectedData.contact_phone || phone}\n\n` +
            `Visitors on WhatsApp and https://bunkby.com/#listing-${listingId} can now view your listing and contact you directly!`;

          buttonsToSend = [
            { id: "CMD_SEARCH", title: "🔍 Search Stays" },
            { id: "CMD_LIST", title: "🏡 Post Another" }
          ];
          actionTaken = "LISTING_CREATED";
        } else {
          replyText = `⚠️ Please tap *Publish Listing* to confirm, or tap *Cancel* to exit without publishing.`;
          buttonsToSend = [
            { id: "BTN_CONFIRM_PUBLISH", title: "🚀 Publish Listing" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "STEP_RETRY";
        }
      }

      // ---------------------------------------------------------
      // STEP 14: EDIT CONTACT PHONE
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_CONTACT_PHONE") {
        const cleanedContact = text.replace(/[^0-9+]/g, "").trim();
        if (!cleanedContact || cleanedContact.length < 6) {
          replyText = `⚠️ Please enter a valid phone number (e.g. *0771234567*).`;
          buttonsToSend = [{ id: "BTN_CANCEL", title: "❌ Cancel" }];
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.contact_phone = cleanedContact;
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_CONFIRMATION', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ Contact updated to: *${cleanedContact}*\n\nReady to publish your listing?`;
          buttonsToSend = [
            { id: "BTN_CONFIRM_PUBLISH", title: "🚀 Publish Listing" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "LISTING_PREVIEW";
        }
      }
    }

    // -------------------------------------------------------------
    // PRIORITY 3: START NEW LISTING CREATION (No Active Session)
    // -------------------------------------------------------------
    else if (
      buttonPayload === "CMD_LIST" ||
      buttonPayload === "CMD_START_LISTING" ||
      lowerText === "list" ||
      lowerText === "register" ||
      lowerText === "post" ||
      lowerText === "create a listing" ||
      lowerText === "create listing" ||
      lowerText === "new listing" ||
      lowerText === "list property" ||
      lowerText === "post a room" ||
      lowerText === "add room" ||
      lowerText.includes("create listing") ||
      lowerText.includes("create a listing") ||
      lowerText.includes("post a room") ||
      lowerText.includes("post room") ||
      lowerText.includes("list room")
    ) {
      let landlord = await env.DB.prepare("SELECT * FROM landlords WHERE id = ?").bind(phoneId).first();
      if (!landlord) {
        await env.DB.prepare(`
          INSERT INTO landlords (id, full_name, verification_status)
          VALUES (?, ?, 'pending')
        `).bind(phoneId, name || `WhatsApp Host (${phone})`).run();
        landlord = await env.DB.prepare("SELECT * FROM landlords WHERE id = ?").bind(phoneId).first();
      }

      const initialData = JSON.stringify({
        phone_number: phone,
        landlord_id: phoneId,
        landlord_name: landlord?.full_name || name || "WhatsApp Host",
        contact_phone: phone,
        photos: []
      });

      await env.DB.prepare(`
        INSERT INTO chatbot_sessions (phone_number, current_step, collected_data, updated_at)
        VALUES (?, 'AWAITING_CATEGORY', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(phone_number) DO UPDATE SET
          current_step = 'AWAITING_CATEGORY',
          collected_data = ?,
          updated_at = CURRENT_TIMESTAMP
      `).bind(phone, initialData, initialData).run();

      replyText = `🏡 *Welcome to BunkBy Property Listing!*\nLet's get your property posted on Zimbabwe's direct marketplace.\n\n*Step 1/11: Choose Property Category*\nTap *Choose Category* below to select from:\n• 🏠 Residential Rentals\n• 🏨 Hospitality & Stays\n• 🏢 Commercial Properties\n• 🎓 Student Accommodation`;
      listToSend = buildListingCategoryList();
      actionTaken = "LISTING_STEP_CATEGORY";
    }

    // -------------------------------------------------------------
    // PRIORITY 4: LANDLORD DELETE & MANAGE LISTINGS
    // -------------------------------------------------------------
    else if (
      buttonPayload === "CMD_MY_LISTINGS" ||
      buttonPayload === "CMD_DELETE_LISTINGS" ||
      buttonPayload?.startsWith("DEL_CONFIRM_") ||
      buttonPayload?.startsWith("DEL_PROMPT_") ||
      lowerText === "my listings" ||
      lowerText === "delete" ||
      lowerText === "delete listing" ||
      lowerText === "remove listing" ||
      lowerText === "manage listings" ||
      lowerText.startsWith("delete ") ||
      lowerText.startsWith("del ")
    ) {
      // 1. If confirming a specific deletion via button payload or "delete [id]"
      const confirmMatch = buttonPayload?.match(/^DEL_CONFIRM_(\d+)$/);
      const promptMatch = buttonPayload?.match(/^DEL_PROMPT_(\d+)$/);
      const textIdMatch = lowerText.match(/^(?:delete|del|remove)\s+(\d+)$/);

      if (confirmMatch) {
        const delId = confirmMatch[1];
        const last9 = phone.replace(/\D/g, "").slice(-9);
        // Mark listing as Delisted
        await env.DB.prepare(`
          UPDATE listings 
          SET verification_status = 'Delisted' 
          WHERE id = ? AND (
            landlord_id = ? OR 
            contact_phone = ? OR 
            contact_phone LIKE ? OR 
            contact_phone LIKE ?
          )
        `).bind(delId, phoneId, phone, `%${last9}%`, `%${phone}%`).run();

        replyText = `🗑️ *Listing #${delId} has been successfully deleted!*\n\nIt has been removed from BunkBy searches and the website.`;
        buttonsToSend = [
          { id: "CMD_MY_LISTINGS", title: "📋 My Listings" },
          { id: "CMD_LIST", title: "🏡 Create a Listing" },
          { id: "CMD_SEARCH", title: "🔍 Search Stays" }
        ];
        actionTaken = "LISTING_DELETED";
      } else if (promptMatch || textIdMatch) {
        const targetId = promptMatch ? promptMatch[1] : textIdMatch![1];
        // Find listing to confirm ownership
        const last9 = phone.replace(/\D/g, "").slice(-9);
        const targetListing = await env.DB.prepare(`
          SELECT id, title, suburb FROM listings 
          WHERE id = ? AND verification_status != 'Delisted' AND (
            landlord_id = ? OR 
            contact_phone = ? OR 
            contact_phone LIKE ? OR 
            contact_phone LIKE ?
          )
        `).bind(targetId, phoneId, phone, `%${last9}%`, `%${phone}%`).first();

        if (!targetListing) {
          replyText = `⚠️ Listing #${targetId} was not found under your phone number (${phone}).\n\nReply *my listings* to view your active properties.`;
          actionTaken = "DELETE_NOT_FOUND";
        } else {
          replyText = `⚠️ *Confirm Deletion of Listing #${targetListing.id}*\n\n"${targetListing.title}" in ${targetListing.suburb}\n\nAre you sure you want to delete this listing? It will be removed immediately.`;
          buttonsToSend = [
            { id: `DEL_CONFIRM_${targetListing.id}`, title: "🗑️ Yes, Delete" },
            { id: "CMD_MY_LISTINGS", title: "❌ Cancel / Keep" }
          ];
          actionTaken = "DELETE_CONFIRMATION_PROMPT";
        }
      } else {
        // List all active listings owned by this phone number
        const myProperties = await env.DB.prepare(`
          SELECT id, title, suburb, price, rent_cycle, property_type 
          FROM listings 
          WHERE verification_status != 'Delisted' AND (landlord_id = ? OR contact_phone = ? OR contact_phone LIKE ?)
          ORDER BY id DESC LIMIT 10
        `).bind(phoneId, phone, `%${phone.slice(-9)}%`).all();

        const items = myProperties?.results || [];

        if (items.length === 0) {
          replyText = `📋 *You currently have no active listings on BunkBy.*\n\nWould you like to list a property?`;
          buttonsToSend = [
            { id: "CMD_LIST", title: "🏡 Create a Listing" },
            { id: "CMD_SEARCH", title: "🔍 Search Stays" }
          ];
          actionTaken = "NO_MY_LISTINGS";
        } else if (items.length === 1) {
          const single = items[0] as any;
          replyText = `📋 *Your Active BunkBy Listing:*\n\n` +
            `• *#${single.id}:* ${single.title}\n` +
            `• *Location:* ${single.suburb}\n` +
            `• *Rate:* $${single.price}/${single.rent_cycle || "month"}\n\n` +
            `To delete this listing, tap *Delete Listing* below:`;
          buttonsToSend = [
            { id: `DEL_PROMPT_${single.id}`, title: `🗑️ Delete #${single.id}` },
            { id: "CMD_LIST", title: "🏡 Add Another" }
          ];
          actionTaken = "MY_LISTINGS_SINGLE";
        } else {
          let listSummary = `📋 *Your Active BunkBy Listings (${items.length}):*\n\n`;
          for (const item of items as any[]) {
            listSummary += `• *#${item.id}*: ${item.title} (${item.suburb}) - $${item.price}\n  _Reply *delete ${item.id}* to remove_\n\n`;
          }
          listSummary += `Tap a quick delete button below, or reply *delete [id]*:`;
          replyText = listSummary;

          // Provide quick delete button for the most recent listing
          const firstItem = items[0] as any;
          buttonsToSend = [
            { id: `DEL_PROMPT_${firstItem.id}`, title: `🗑️ Delete #${firstItem.id}` },
            { id: "CMD_LIST", title: "🏡 Add Listing" }
          ];
          actionTaken = "MY_LISTINGS_MULTIPLE";
        }
      }
    }

    // -------------------------------------------------------------
    // PRIORITY 4.5: ON-DEMAND PROPERTY PHOTOS IN WHATSAPP
    // Lets users view all 2 or 3 photos of any listing right inside WhatsApp!
    // Triggers on: button SHOW_PHOTOS_{id}, or text "photos 123", "pics 123", "pictures 123"
    // -------------------------------------------------------------
    else if (
      buttonPayload?.startsWith("SHOW_PHOTOS_") ||
      buttonPayload?.startsWith("PHOTOS_") ||
      lowerText.startsWith("photo ") ||
      lowerText.startsWith("photos ") ||
      lowerText.startsWith("pic ") ||
      lowerText.startsWith("pics ") ||
      lowerText.startsWith("pictures ")
    ) {
      let targetId = "";
      if (buttonPayload?.startsWith("SHOW_PHOTOS_")) {
        targetId = buttonPayload.replace("SHOW_PHOTOS_", "");
      } else if (buttonPayload?.startsWith("PHOTOS_")) {
        targetId = buttonPayload.replace("PHOTOS_", "");
      } else {
        const match = lowerText.match(/(?:photo|photos|pic|pics|pictures)\s+(\d+)/);
        if (match) targetId = match[1];
      }

      if (targetId) {
        const listing = await env.DB.prepare(
          "SELECT * FROM listings WHERE id = ?"
        ).bind(targetId).first();

        if (!listing) {
          replyText = `⚠️ Listing #${targetId} was not found. Reply *search* to find active properties!`;
          buttonsToSend = [
            { id: "CMD_SEARCH", title: "🔍 Search Stays" },
            { id: "CMD_LIST", title: "🏡 Add Listing" }
          ];
          actionTaken = "PHOTOS_NOT_FOUND";
        } else {
          // Unpack all available photos
          const raw = String(listing.image_url || "").trim();
          let allPhotos: string[] = [];
          if (raw.startsWith("[")) {
            try {
              const arr = JSON.parse(raw);
              if (Array.isArray(arr)) {
                allPhotos = arr.map((item: any) => String(item).trim()).filter(Boolean);
              }
            } catch (_) {}
          }
          if (allPhotos.length === 0 && raw) {
            allPhotos = [raw];
          }

          const baseUrl = new URL(request.url).origin || "https://bunkby.com";
          const totalPhotos = allPhotos.length;
          const listingUrl = `${baseUrl.replace(/\/+$/, "")}/#listing-${listing.id}`;

          // Header message for the photo gallery
          const title = listing.business_name || listing.title;
          const headerMsg = `📸 *Photo Gallery for #${listing.id}: ${title}*\n📍 ${listing.suburb}, ${listing.city || "Harare"}\n💰 $${listing.price} / ${listing.rent_cycle || "month"}\n\nDisplaying ${totalPhotos} verified photo${totalPhotos === 1 ? "" : "s"} below:`;
          outboundQueue.push({ text: headerMsg, itemType: "intro" });

          // Send each photo directly into WhatsApp chat
          for (let i = 0; i < totalPhotos; i++) {
            const photoDataOrUrl = allPhotos[i];
            const cleanBase = (baseUrl && (baseUrl.startsWith("https://") || baseUrl.startsWith("http://")))
              ? baseUrl.replace(/\/+$/, "")
              : "https://bunkby.com";
            const photoUrl = `${cleanBase}/api/rooms/${listing.id}/photo?index=${i}`;
            const photoCaption = `📸 Photo ${i + 1} of ${totalPhotos} · #${listing.id} ${title}`;

            outboundQueue.push({
              imageUrl: photoUrl,
              rawPhoto: photoDataOrUrl,
              text: photoCaption,
              itemType: "card"
            });
          }

          // Footer with contact and return to search
          const cleanPhone = (listing.contact_phone || "").replace(/\D/g, "");
          const waLink = cleanPhone ? `https://wa.me/${cleanPhone.startsWith("0") ? "263" + cleanPhone.slice(1) : cleanPhone}` : null;
          let footerMsg = `✅ *All ${totalPhotos} photo${totalPhotos === 1 ? "" : "s"} shown for #${listing.id}.*\n\n`;
          if (waLink) {
            footerMsg += `💬 *Chat Landlord directly:* ${waLink}\n`;
          }
          footerMsg += `🔗 *View on Web & Map:* ${listingUrl}`;

          outboundQueue.push({
            text: footerMsg,
            buttons: [
              { id: "CMD_SEARCH", title: "🔍 Back to Search" },
              { id: "CMD_LIST", title: "🏡 Add Listing" }
            ],
            itemType: "action_footer"
          });
          actionTaken = "PHOTOS_DELIVERED";
        }
      } else {
        replyText = `📸 To view property photos, reply *photos [listing number]* (for example: *photos 105*) or tap a button on any property card.`;
        buttonsToSend = [
          { id: "CMD_SEARCH", title: "🔍 Search Stays" }
        ];
        actionTaken = "PHOTOS_USAGE_HELP";
      }
    }
    // -------------------------------------------------------------
    // PRIORITY 5: ACCOMMODATION SEARCH (No Active Session)
    // -------------------------------------------------------------
    else if (
      buttonPayload?.startsWith("PAGE_") ||
      buttonPayload?.startsWith("SEARCH_CAT_") ||
      buttonPayload?.startsWith("SEARCH_SUBTYPE_") ||
      buttonPayload === "CMD_SEARCH" ||
      buttonPayload === "CMD_SEARCH_MENU" ||
      lowerText === "search" ||
      lowerText === "1" ||
      lowerText === "2" ||
      lowerText === "3" ||
      lowerText === "4" ||
      lowerText === "residential" ||
      lowerText === "hospitality" ||
      lowerText === "commercial" ||
      lowerText === "student" ||
      lowerText === "student accommodation" ||
      lowerText === "guesthouse" ||
      lowerText === "lodge" ||
      lowerText.startsWith("search ") ||
      lowerText.startsWith("find ") ||
      lowerText.startsWith("show ") ||
      lowerText.startsWith("looking for ") ||
      lowerText.includes("all available") ||
      lowerText.includes("all properties") ||
      lowerText.includes("properties") ||
      lowerText.includes("accommodation") ||
      lowerText.includes("zimbabwe") ||
      lowerText.includes("room") ||
      lowerText.includes("cottage") ||
      lowerText.includes("apartment") ||
      lowerText.includes("flat") ||
      lowerText.includes("lodge") ||
      lowerText.includes("guest house") ||
      lowerText.includes("shop") ||
      lowerText.includes("warehouse") ||
      lowerText.includes("office") ||
      lowerText.includes("stall") ||
      lowerText.includes("table") ||
      lowerText.includes("hostel") ||
      lowerText.includes("boarding") ||
      lowerText.includes("harare") ||
      lowerText.includes("bulawayo") ||
      lowerText.includes("mutare") ||
      lowerText.includes("gweru") ||
      lowerText.includes("kadoma") ||
      lowerText.includes("kariba") ||
      lowerText.includes("nyanga") ||
      lowerText.includes("bindura") ||
      lowerText.includes("chivhu") ||
      lowerText.includes("victoria falls") ||
      lowerText.includes("mount pleasant") ||
      lowerText.includes("mt pleasant") ||
      lowerText.includes("avonlea") ||
      lowerText.includes("avondale") ||
      lowerText.includes("borrowdale") ||
      lowerText.includes("belvedere") ||
      lowerText.includes("avenues") ||
      lowerText.includes("msasa")
    ) {
      // Initiate a conversational SEARCH SESSION with Category Selection
      if (buttonPayload === "CMD_SEARCH" || buttonPayload === "CMD_SEARCH_MENU" || lowerText === "search") {
        await env.DB.prepare(`
          INSERT INTO chatbot_sessions (phone_number, current_step, collected_data, updated_at)
          VALUES (?, 'AWAITING_SEARCH_CATEGORY', '{}', CURRENT_TIMESTAMP)
          ON CONFLICT(phone_number) DO UPDATE SET
            current_step = 'AWAITING_SEARCH_CATEGORY',
            collected_data = '{}',
            updated_at = CURRENT_TIMESTAMP
        `).bind(phone).run();

        replyText = `🔍 *Search BunkBy Properties & Accommodation*\n_Verified pricing, real photos & direct contact with zero agent fees._\n\nTap *Choose Category* below to pick:\n• Residential Rentals\n• Hospitality & Stays\n• Commercial Properties\n• Student Accommodation`;
        listToSend = buildSearchCategoryList();
        actionTaken = "SEARCH_PROMPT_CATEGORY";
      } else {
        let cleanQuery = text.replace(/^(search|find|show|looking for|i want a|need a)\s*/i, "").trim();
        let searchOffset = 0;
        let paginatedCategory = "";
        let paginatedPropertyType = "";
        const isPageClick = Boolean(buttonPayload?.startsWith("PAGE_"));

        if (isPageClick && buttonPayload) {
          // Format: PAGE_{offset}_{cat[:subtype]}_{encodedQuery}
          const parsedPage = parsePageButtonId(buttonPayload);
          searchOffset = parsedPage.offset;
          paginatedCategory = parsedPage.category;
          paginatedPropertyType = parsedPage.propertyType;
          cleanQuery = parsedPage.query;
        } else if (buttonPayload === "SEARCH_HARARE") {
          cleanQuery = "Harare";
        } else if (buttonPayload === "SEARCH_BULAWAYO") {
          cleanQuery = "Bulawayo";
        } else if (buttonPayload === "SEARCH_VICFALLS") {
          cleanQuery = "Victoria Falls";
        }

        if (
          !isPageClick && (
            buttonPayload === "SEARCH_CAT_RESIDENTIAL" ||
            buttonPayload === "SEARCH_CAT_HOSPITALITY" ||
            buttonPayload === "SEARCH_CAT_COMMERCIAL" ||
            buttonPayload === "SEARCH_CAT_STUDENT" ||
            lowerText === "1" ||
            lowerText === "2" ||
            lowerText === "3" ||
            lowerText === "4" ||
            lowerText === "residential" ||
            lowerText === "hospitality" ||
            lowerText === "commercial" ||
            lowerText === "student" ||
            lowerText === "student accommodation" ||
            lowerText === "guesthouse" ||
            lowerText === "lodge"
          )
        ) {
          let chosenCategory = "residential";
          let categoryLabel = "Residential Rentals";
          if (buttonPayload === "SEARCH_CAT_COMMERCIAL" || lowerText === "3" || lowerText === "commercial") {
            chosenCategory = "commercial";
            categoryLabel = "Commercial Properties";
          } else if (buttonPayload === "SEARCH_CAT_HOSPITALITY" || lowerText === "2" || lowerText === "hospitality" || lowerText === "guesthouse" || lowerText === "lodge") {
            chosenCategory = "hospitality";
            categoryLabel = "Hospitality & Stays";
          } else if (buttonPayload === "SEARCH_CAT_STUDENT" || lowerText === "4" || lowerText === "student" || lowerText === "student accommodation") {
            chosenCategory = "student";
            categoryLabel = "Student Accommodation";
          } else {
            chosenCategory = "residential";
            categoryLabel = "Residential Rentals";
          }

          if (chosenCategory === "commercial") {
            const sessionPayload = JSON.stringify({ searchCategory: "commercial", categoryLabel });
            await env.DB.prepare(`
              INSERT INTO chatbot_sessions (phone_number, current_step, collected_data, updated_at)
              VALUES (?, 'AWAITING_SEARCH_SUBTYPE', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(phone_number) DO UPDATE SET
                current_step = 'AWAITING_SEARCH_SUBTYPE',
                collected_data = ?,
                updated_at = CURRENT_TIMESTAMP
            `).bind(phone, sessionPayload, sessionPayload).run();

            replyText = `🏢 *Commercial Properties Selected*\n\nWhich type of commercial space are you looking for?\nTap *Choose Space Type* below to pick a specific subtype or view all commercial properties:`;
            listToSend = buildSearchCommercialSubtypeList();
            actionTaken = "SEARCH_PROMPT_SUBTYPE";
          } else {
            const sessionPayload = JSON.stringify({ searchCategory: chosenCategory, categoryLabel, searchPropertyType: "" });
            await env.DB.prepare(`
              INSERT INTO chatbot_sessions (phone_number, current_step, collected_data, updated_at)
              VALUES (?, 'AWAITING_SEARCH_QUERY', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(phone_number) DO UPDATE SET
                current_step = 'AWAITING_SEARCH_QUERY',
                collected_data = ?,
                updated_at = CURRENT_TIMESTAMP
            `).bind(phone, sessionPayload, sessionPayload).run();

            const locationExample = chosenCategory === "hospitality"
              ? "*Victoria Falls*, *Harare*, *Vumba*, or *Bulawayo*"
              : chosenCategory === "student"
              ? "*Mt Pleasant Harare*, *Bulawayo*, *Chinhoyi*, or *Gweru*"
              : "*Avonlea*, *Harare*, *Khumalo Bulawayo*, or *Mutare*";

            replyText = `✅ Selected Category: *${categoryLabel}*\n\n*Now enter the City, Town, or Suburb:*\nWhere would you like to find ${chosenCategory === "hospitality" ? "lodges and guesthouses" : chosenCategory === "student" ? "student accommodation" : "residential rentals"}?\n\n_(e.g. ${locationExample}, or tap *All Locations* below)_`;
            buttonsToSend = [
              { id: "SEARCH_LOC_ALL", title: "🌍 All Locations" },
              { id: "BTN_CANCEL", title: "❌ Cancel" }
            ];
            actionTaken = "SEARCH_PROMPT_LOCATION";
          }
        } else {
          // Direct natural-language or paginated search (5 results per page)
          const locationFilter = paginatedCategory || paginatedPropertyType
            ? buildCategoryAndLocationClauses(paginatedCategory, cleanQuery, "listings", paginatedPropertyType)
            : (cleanQuery ? buildLocationSearchClauses(cleanQuery, "listings") : { whereSql: "", params: [] });
          const countFilter = paginatedCategory || paginatedPropertyType
            ? buildCategoryAndLocationClauses(paginatedCategory, cleanQuery, "", paginatedPropertyType)
            : (cleanQuery ? buildLocationSearchClauses(cleanQuery) : { whereSql: "", params: [] });

          const searchKey = JSON.stringify({
            cat: (paginatedCategory || "").toLowerCase(),
            sub: paginatedPropertyType || "",
            q: cleanQuery.toLowerCase()
          });

          const existingSearchState = await env.DB.prepare(
            "SELECT * FROM whatsapp_search_state WHERE phone_number = ?"
          ).bind(phone).first();

          // Repeated click guard: prevent sending duplicate properties if user taps an already-dispatched Next button
          if (
            isPageClick &&
            existingSearchState &&
            existingSearchState.search_key === searchKey &&
            (existingSearchState.last_page_payload === buttonPayload || searchOffset < Number(existingSearchState.dispatched_count || 0))
          ) {
            const dispatched = Number(existingSearchState.dispatched_count || 0);
            const totalStored = Number(existingSearchState.total_matching || dispatched);
            actionTaken = "SEARCH_DUPLICATE_PAGE_GUARDED";
            if (dispatched < totalStored) {
              const nextBtnId = encodePageButtonId(dispatched, paginatedCategory || "all", paginatedPropertyType, cleanQuery);
              replyText = `ℹ️ *Results 1–${dispatched} of ${totalStored} were already sent above.*\nTap *Next 5 Results* below to view the next batch (${totalStored - dispatched} remaining), or start a new search.`;
              buttonsToSend = [
                { id: nextBtnId, title: "⏩ Next 5 Results" },
                { id: "CMD_SEARCH", title: "🔍 New Search" },
                { id: "CMD_LIST", title: "🏡 Add Listing" }
              ];
            } else {
              replyText = `✅ *All ${totalStored} matching properties have already been sent above.*`;
              buttonsToSend = [
                { id: "CMD_SEARCH", title: "🔍 New Search" },
                { id: "CMD_MY_LISTINGS", title: "📋 My Listings" },
                { id: "CMD_LIST", title: "🏡 Add Listing" }
              ];
            }
          } else {
            const countSql = `
              SELECT COUNT(*) as total
              FROM listings
              WHERE verification_status != 'Delisted'${countFilter.whereSql}
            `;
            const totalCountRes: any = countFilter.params.length > 0 
              ? await env.DB.prepare(countSql).bind(...countFilter.params).first()
              : await env.DB.prepare(countSql).first();
            const totalMatching = Number(totalCountRes?.total) || 0;

            let seenIds: number[] = [];
            let useCursor = false;
            let cursorIsPremium = 0;
            let cursorCreatedAt = "";
            let cursorId = 0;
            let startOffset = searchOffset;

            if (
              isPageClick &&
              existingSearchState &&
              existingSearchState.search_key === searchKey &&
              searchOffset === Number(existingSearchState.dispatched_count || 0)
            ) {
              try {
                seenIds = JSON.parse(existingSearchState.seen_ids || "[]");
              } catch {
                seenIds = [];
              }
              if (existingSearchState.cursor_created_at && existingSearchState.cursor_id) {
                useCursor = true;
                cursorIsPremium = Number(existingSearchState.cursor_is_premium ?? 0) ? 1 : 0;
                cursorCreatedAt = String(existingSearchState.cursor_created_at);
                cursorId = Number(existingSearchState.cursor_id);
              }
              startOffset = Number(existingSearchState.dispatched_count || searchOffset);
            } else if (!isPageClick) {
              await env.DB.prepare("DELETE FROM whatsapp_search_state WHERE phone_number = ?").bind(phone).run();
            }

            let extraWhere = "";
            const pageBindParams: any[] = [...locationFilter.params];
            if (seenIds.length > 0) {
              extraWhere += ` AND listings.id NOT IN (${seenIds.map(() => "?").join(", ")})`;
              pageBindParams.push(...seenIds);
            }
            if (useCursor) {
              extraWhere += ` AND (COALESCE(listings.is_premium, 0) < ? OR (COALESCE(listings.is_premium, 0) = ? AND (listings.created_at < ? OR (listings.created_at = ? AND listings.id < ?))))`;
              pageBindParams.push(cursorIsPremium, cursorIsPremium, cursorCreatedAt, cursorCreatedAt, cursorId);
            }

            const sqlOffset = useCursor ? 0 : Math.max(0, searchOffset);
            const querySql = `
              SELECT listings.*, landlords.full_name as landlord_name
              FROM listings
              LEFT JOIN landlords ON listings.landlord_id = landlords.id
              WHERE listings.verification_status != 'Delisted'${locationFilter.whereSql}${extraWhere}
              ORDER BY COALESCE(listings.is_premium, 0) DESC, listings.created_at DESC, listings.id DESC LIMIT ? OFFSET ?
            `;

            pageBindParams.push(SEARCH_PAGE_SIZE, sqlOffset);
            const { results } = await env.DB.prepare(querySql).bind(...pageBindParams).all();

            if (!results || results.length === 0) {
              if (isPageClick && startOffset > 0) {
                replyText = `✅ *You have reached the end of all matching listings.*`;
                actionTaken = "SEARCH_END_OF_RESULTS";
                buttonsToSend = [
                  { id: "CMD_SEARCH", title: "🔍 New Search" },
                  { id: "CMD_MY_LISTINGS", title: "📋 My Listings" },
                  { id: "CMD_LIST", title: "🏡 Add Listing" }
                ];
              } else {
                replyText = `🏡 No active listings found matching *"${cleanQuery || "your search"}"*.\n\n💡 *Suggestions:*\n• Try searching a major city or town (e.g. *Harare*, *Bulawayo*, *Victoria Falls*).\n• Tap *Search Again* to pick a category or commercial subtype.\n• Tap *Create a Listing* below to post a property on BunkBy!`;
                actionTaken = "SEARCH_NO_RESULTS";
                buttonsToSend = [
                  { id: "CMD_SEARCH", title: "🔍 Search Again" },
                  { id: "CMD_LIST", title: "🏡 Create a Listing" }
                ];
              }
            } else {
              actionTaken = "SEARCH_RESULTS";
              const baseUrl = new URL(request.url).origin || "https://bunkby.com";

              const startNum = startOffset + 1;
              const endNum = startOffset + results.length;
              const labelCtx = paginatedPropertyType ? ` (${paginatedPropertyType})` : "";
              const locSuffix = cleanQuery && cleanQuery.toLowerCase() !== "all" ? ` in "${cleanQuery}"` : "";
              const headerMsg = `🏡 *Showing ${startNum}–${endNum} of ${totalMatching}${labelCtx}${locSuffix}:*`;
              outboundQueue.push({ text: headerMsg, itemType: "intro" });

              for (let idx = 0; idx < results.length; idx++) {
                const room = results[idx];
                outboundQueue.push({
                  text: buildConciseSearchCardText(room, baseUrl, startNum + idx),
                  itemType: "listing_card",
                  listingId: room.id
                });
              }

              const lastRoom: any = results[results.length - 1];
              const lastIsPremium = Number(lastRoom.is_premium) ? 1 : 0;
              const updatedSeenIds = Array.from(new Set([...seenIds, ...results.map((r: any) => Number(r.id))]));
              const updatedDispatched = isPageClick ? endNum : results.length;
              const hasMore = results.length === SEARCH_PAGE_SIZE && endNum < totalMatching;

              await env.DB.prepare(`
                INSERT INTO whatsapp_search_state (
                  phone_number, search_key, filters_json, total_matching, dispatched_count,
                  cursor_is_premium, cursor_created_at, cursor_id, seen_ids, last_page_payload, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(phone_number) DO UPDATE SET
                  search_key = excluded.search_key,
                  filters_json = excluded.filters_json,
                  total_matching = excluded.total_matching,
                  dispatched_count = excluded.dispatched_count,
                  cursor_is_premium = excluded.cursor_is_premium,
                  cursor_created_at = excluded.cursor_created_at,
                  cursor_id = excluded.cursor_id,
                  seen_ids = excluded.seen_ids,
                  last_page_payload = excluded.last_page_payload,
                  updated_at = CURRENT_TIMESTAMP
              `).bind(
                phone,
                searchKey,
                JSON.stringify({ category: paginatedCategory, propertyType: paginatedPropertyType, query: cleanQuery }),
                totalMatching,
                updatedDispatched,
                lastIsPremium,
                String(lastRoom.created_at || ""),
                Number(lastRoom.id),
                JSON.stringify(updatedSeenIds),
                isPageClick ? (buttonPayload || "") : ""
              ).run();

              const navButtons: Array<{ id: string; title: string }> = [];
              const remainingCount = Math.max(0, totalMatching - endNum);
              if (hasMore) {
                navButtons.push({
                  id: encodePageButtonId(endNum, paginatedCategory || "all", paginatedPropertyType, cleanQuery),
                  title: "⏩ Next 5 Results"
                });
                navButtons.push({ id: "CMD_SEARCH", title: "🔍 New Search" });
                navButtons.push({ id: "CMD_LIST", title: "🏡 Add Listing" });
              } else {
                navButtons.push({ id: "CMD_SEARCH", title: "🔍 Search Again" });
                navButtons.push({ id: "CMD_MY_LISTINGS", title: "📋 My Listings" });
                navButtons.push({ id: "CMD_LIST", title: "🏡 Add Listing" });
              }

              const searchWebUrl = cleanQuery && cleanQuery.toLowerCase() !== "all"
                ? `https://bunkby.com/?q=${encodeURIComponent(cleanQuery)}`
                : "https://bunkby.com";
              const footerText = hasMore
                ? `📄 *Showing ${startNum}–${endNum} of ${totalMatching} matching properties* (${remainingCount} remaining).\nTap *Next 5 Results* below or browse full galleries on:\n🔗 ${searchWebUrl}`
                : `✅ *End of results (${endNum} of ${totalMatching} shown)${locSuffix}.*\nExplore all areas or view galleries on:\n🔗 ${searchWebUrl}`;

              outboundQueue.push({
                text: footerText,
                buttons: navButtons,
                itemType: "action_footer"
              });
            }
          }
        }
      }
    }

    // -------------------------------------------------------------
    // DEFAULT GREETING / WELCOME MENU
    // -------------------------------------------------------------
    else {
      replyText = `👋 *Welcome to BunkBy!*\nYour direct marketplace for *Hospitality Stays, Commercial Properties & Rentals* with transparent pricing and zero agent fees.\n\n🌍 *What are you looking for today?*\n🏨 *Lodges & Hotels* (e.g. *Victoria Falls*, *Nyanga*, *Harare*)\n🏢 *Commercial Spaces* (Shops, Offices, Warehouses, Market Tables)\n🏠 *Residential Rentals* (Rooms, Cottages, Flats)\n🎓 *Student Hostels* (Near Universities)\n\n🔍 Tap *Search Stays* or send any location\n🏡 Tap *Post Property* to list free\n📋 Tap *My Listings* to manage or delete`;
      actionTaken = "WELCOME_MENU";
      buttonsToSend = [
        { id: "CMD_SEARCH", title: "🔍 Search Stays" },
        { id: "CMD_LIST", title: "🏡 Post Property" },
        { id: "CMD_MY_LISTINGS", title: "📋 My Listings" }
      ];
    }

    // DISPATCH OUTBOUND MESSAGES VIA META CLOUD API (Supports text, interactive lists, interactive buttons, and real photos)
    const dispatchResults: OutboundDispatchResult[] = [];

    if (outboundQueue.length > 0) {
      for (let i = 0; i < outboundQueue.length; i++) {
        const item = outboundQueue[i];
        
        if (i > 0) {
          await new Promise(r => setTimeout(r, item.imageUrl ? 600 : 120));
        }

        let effectiveImageUrl = item.imageUrl;
        const rawPhoto = (item as any).rawPhoto;
        const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
        const phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();

        if (item.imageUrl && token && phoneId) {
          const photoToUpload = rawPhoto || item.imageUrl;
          try {
            const uploadedMediaId = await uploadListingPhotoToMeta(photoToUpload, token, phoneId);
            if (uploadedMediaId) {
              effectiveImageUrl = `meta_id:${uploadedMediaId}`;
            }
          } catch (_) {}
        }

        let res = await sendMetaWhatsAppMessage(phone, item.text, env, item.buttons, effectiveImageUrl, item.list);
        
        res.itemType = item.itemType || "message";
        if (item.listingId) res.listingId = item.listingId;
        res.hasImage = Boolean(item.imageUrl);
        res.imageUrl = item.imageUrl || null;

        if (!res.success && item.imageUrl) {
          const imgFailureReason = res.error || `HTTP ${res.httpStatus} on image dispatch`;
          console.warn(`[Meta Image Notice #${item.listingId || "N/A"}]: HTTP ${res.httpStatus || "error"} - ${res.error || "failed"}`);
          
          const fallbackRes = await sendMetaWhatsAppMessage(phone, item.text, env, item.buttons, undefined, item.list);
          fallbackRes.itemType = "image_fallback_text";
          if (item.listingId) fallbackRes.listingId = item.listingId;
          fallbackRes.error = `[Image dispatch failed: ${imgFailureReason}]` + (fallbackRes.error ? ` | ${fallbackRes.error}` : "");
          res = fallbackRes;
        }
        dispatchResults.push(res);
      }
    } else if (replyText) {
      const res = await sendMetaWhatsAppMessage(phone, replyText, env, buttonsToSend, undefined, listToSend);
      res.itemType = "single_reply";
      dispatchResults.push(res);
    }

    const primaryResult = dispatchResults[0] || { success: true };
    const allSuccessful = dispatchResults.every(r => r.success);

    // RECORD SANITIZED EVENT TO D1 DIAGNOSTICS TABLE
    try {
      await env.DB.prepare(`
        INSERT INTO whatsapp_diagnostic_events (
          timestamp, message_id, sender, sender_name, incoming_preview, action_taken, outbound_count, outbound_delivery, status, error
        ) VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        messageId || null,
        sanitizedSender,
        name ? `${name.slice(0, 20)}` : "WhatsApp User",
        text ? text.slice(0, 60) : "",
        actionTaken,
        dispatchResults.length,
        JSON.stringify(dispatchResults),
        allSuccessful ? "delivered" : "dispatch_failed",
        dispatchResults.find(r => !r.success)?.error || null
      ).run();
    } catch (_) {}

    return jsonResponse({
      status: "processed",
      action: actionTaken,
      delivery: primaryResult,
      totalDispatched: dispatchResults.length,
      allDeliveries: dispatchResults
    }, 200);

  } catch (error: any) {
    // Record error in diagnostics
    try {
      await env.DB.prepare(`
        INSERT INTO whatsapp_diagnostic_events (
          timestamp, message_id, sender, sender_name, incoming_preview, action_taken, outbound_count, status, error
        ) VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, 'ERROR', 0, 'exception', ?)
      `).bind(
        messageId || null,
        sanitizedSender,
        name || "User",
        text ? text.slice(0, 60) : "",
        error.message || String(error)
      ).run();
    } catch (_) {}

    return jsonResponse({
      status: "error",
      error: error.message || "Internal processing error"
    }, 500);
  }
}
