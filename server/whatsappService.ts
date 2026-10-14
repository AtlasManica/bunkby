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

export interface SearchFilters {
  category?: "residential" | "hospitality" | "all";
  city?: string;
  suburb?: string;
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  rawQuery?: string;
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
  "Avonlea", "Avondale", "Belvedere", "Mt Pleasant", "Avenues", "Braeside", 
  "Mabelreign", "Marlborough", "Borrowdale", "Eastlea", "Greendale", "Highlands",
  "Hatfield", "Waterfalls", "Westgate", "Madokero", "Bluffhill", "Mbare",
  "Highfield", "Glen View", "Budiriro", "Warren Park", "Dzivarasekwa", "Kambuzuma",
  "CBD", "Chitungwiza", "Norton", "Ruwa",
  // Bulawayo
  "Suburbs", "Kumalo", "Hillside", "Bradfield", "Famona", "Woodville", "Matsheumhlope",
  "Khumalo", "Burnside", "Morningside", "Selborne Park", "Luveve", "Nkulumane",
  // Gweru
  "Senga", "Southdowns", "Lundi Park", "Daylesford",
  // Mutare
  "Murambi", "Palmerstone", "Fairbridge Park", "Chikanga", "Dangamvura",
  // Victoria Falls
  "Chinotimba", "Aerodrome"
];

const PROPERTY_TYPES_KEYWORDS: Record<string, string> = {
  "single room": "Single Room",
  "bed-sitter": "Bed-sitter",
  "bedsitter": "Bed-sitter",
  "cottage": "Cottage",
  "cottages": "Cottage",
  "apartment": "Apartment",
  "apartments": "Apartment",
  "flat": "Apartment",
  "flats": "Apartment",
  "boarding house": "Boarding House",
  "boarding": "Boarding House",
  "hostel": "Student Hostel",
  "student hostel": "Student Hostel",
  "lodge": "Lodge",
  "lodges": "Lodge",
  "guesthouse": "Guesthouse",
  "guesthouses": "Guesthouse",
  "guest house": "Guesthouse",
  "hotel": "Hotel",
  "b&b": "Bed & Breakfast",
  "bed and breakfast": "Bed & Breakfast"
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
  const hospitalityMatches = ["lodge", "guesthouse", "guest house", "hotel", "b&b", "bed & breakfast", "night", "per night"];
  const residentialMatches = ["cottage", "single room", "rooms", "bed-sitter", "bedsitter", "flat", "apartment", "boarding", "monthly", "tenant", "student"];

  let hospScore = 0;
  let resScore = 0;

  for (const w of hospitalityMatches) {
    if (lower.includes(w)) hospScore++;
  }
  for (const w of residentialMatches) {
    if (lower.includes(w)) resScore++;
  }

  if (hospScore > resScore && hospScore > 0) {
    filters.category = "hospitality";
  } else if (resScore > hospScore && resScore > 0) {
    filters.category = "residential";
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
    const regex = new RegExp(`\\b${key}\\b`, "i");
    if (regex.test(lower)) {
      filters.propertyType = val;
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
 * Queries the real SQLite database using extracted filters
 */
export function searchListings(db: Database, filters: SearchFilters, limit = 5): any[] {
  const conditions: string[] = ["listings.verification_status != 'Delisted'"];
  const params: any[] = [];

  // Category filter
  if (filters.category && filters.category !== "all") {
    conditions.push("listings.category = ?");
    params.push(filters.category);
  }

  // City filter
  if (filters.city) {
    conditions.push("listings.city LIKE ?");
    params.push(`%${filters.city}%`);
  }

  // Suburb filter
  if (filters.suburb) {
    conditions.push("listings.suburb LIKE ?");
    params.push(`%${filters.suburb}%`);
  }

  // Property Type filter
  if (filters.propertyType) {
    conditions.push("listings.property_type LIKE ?");
    params.push(`%${filters.propertyType}%`);
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

  // Fallback: If no suburb/city/price extracted, do a general keyword LIKE match across title, suburb, landmark
  if (!filters.suburb && !filters.city && !filters.propertyType && filters.rawQuery) {
    const cleanTokens = filters.rawQuery
      .replace(/^(search|find|show|looking for|room in|house in)\s*/i, "")
      .trim();

    if (cleanTokens && cleanTokens.length >= 2) {
      conditions.push("(listings.suburb LIKE ? OR listings.title LIKE ? OR listings.landmark LIKE ? OR listings.city LIKE ?)");
      params.push(`%${cleanTokens}%`, `%${cleanTokens}%`, `%${cleanTokens}%`, `%${cleanTokens}%`);
    }
  }

  const sql = `
    SELECT 
      listings.*, 
      landlords.full_name as landlord_name
    FROM listings
    LEFT JOIN landlords ON listings.landlord_id = landlords.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY listings.is_premium DESC, listings.created_at DESC
    LIMIT ?
  `;

  params.push(limit);

  try {
    const rows = db.prepare(sql).all(...params);
    return rows.map((r: any) => ({
      ...r,
      amenities: typeof r.amenities === "string" ? JSON.parse(r.amenities || "[]") : (r.amenities || []),
      is_premium: Boolean(r.is_premium)
    }));
  } catch (err) {
    console.error("Error executing searchListings:", err);
    return [];
  }
}

/**
 * Resolves the public image URL for a listing photograph.
 * Handles HTTP/HTTPS URLs as well as base64 images served via /api/listings/:id/photo
 */
export function getListingPhotoUrl(listing: any, baseUrl: string): string | null {
  if (!listing) return null;

  const raw = listing.image_url;
  if (!raw || typeof raw !== "string") return null;

  // If it is already a public HTTP/HTTPS URL, use it directly
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  // If it's a data URI or relative path, point to our public photo endpoint
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/api/listings/${listing.id}/photo`;
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
  const isHospitality = listing.category === "hospitality";
  const cycle = listing.rent_cycle || (isHospitality ? "Night" : "Month");
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
    caption += `✨ _[Hospitality & Guest Stay]_\n\n`;
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
