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
      version: "2026-10-18_diagnostic_v12_delete_listings_and_easy_search",
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
  listingId?: number | string;
  hasImage?: boolean;
  imageUrl?: string | null;
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
    return `${cleanBase}/api/rooms/${listing.id}/photo.jpg`;
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

  let text = "";
  if (isHospitality) {
    text += `🏨 *${listing.business_name || listing.title}*\n`;
    if (listing.business_name && listing.title && listing.business_name !== listing.title) {
      text += `"${listing.title}"\n`;
    }
    text += `✨ _[Hospitality & Guest Stay]_\n\n`;
  } else {
    text += `🏠 *${listing.title}*\n`;
    text += `🏷️ _[${listing.property_type || "Residential Rental"}]_\n\n`;
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

  if (listing.tenant_type) {
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

  text += `\n📞 *Direct Landlord/Host:* ${listing.contact_phone || "Contact via BunkBy"}\n`;
  if (waContactLink) {
    text += `💬 *WhatsApp Host Directly:* ${waContactLink}\n`;
  }
  text += `🔗 *Full Gallery & Map:* ${listingUrl}`;

  return {
    imageUrl: photoUrl,
    text
  };
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
  imageUrl?: string | null
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
      tokenFingerprint,
      phoneNumberIdUsed: phoneId ? `${phoneId.slice(0, 4)}***` : "missing"
    };
  }

  const endpoint = `https://graph.facebook.com/v26.0/${phoneId}/messages`;

  let payload: any;
  if (imageUrl) {
    // Outbound Meta Image Message with Caption
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "image",
      image: {
        link: imageUrl,
        caption: replyText.slice(0, 1024)
      }
    };
  } else if (buttons && buttons.length > 0 && buttons.length <= 3) {
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: replyText },
        action: {
          buttons: buttons.map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title.slice(0, 20) }
          }))
        }
      }
    };
  } else {
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "text",
      text: { body: replyText }
    };
  }

  try {
    const res = await fetch(endpoint, {
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

    if (!res.ok) {
      const errObj = data.error || {};
      const metaCode = errObj.code;
      const metaSubcode = errObj.error_subcode;
      const metaType = errObj.type;
      const metaMessage = errObj.message || `HTTP ${res.status} dispatch error`;
      const fbtraceId = errObj.fbtrace_id;

      const codePart = metaCode ? `(Meta Code ${metaCode}${metaSubcode ? `, Subcode ${metaSubcode}` : ""}) ` : "";
      const errorSummary = `${codePart}${metaMessage}${fbtraceId ? ` [fbtrace_id: ${fbtraceId}]` : ""}`;

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
      return {
        phone: change.statuses[0].recipient_id || "",
        text: "",
        messageId: change.statuses[0].id || "",
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
          ) VALUES (CURRENT_TIMESTAMP, ?, 'status_receipt', 'Meta Status Update', 'status update receipt', 'STATUS_RECEIPT_ACK', 0, 'status_acknowledged', NULL)
        `).bind(incoming.messageId || null).run();
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
  const outboundQueue: Array<{
    text: string;
    buttons?: Array<{ id: string; title: string }>;
    imageUrl?: string | null;
    itemType?: "intro" | "listing_card" | "action_footer" | "preview" | "system";
    listingId?: number | string;
  }> = [];

  try {
    // Check for active session
    const session = await env.DB.prepare(
      "SELECT phone_number, current_step, collected_data FROM chatbot_sessions WHERE phone_number = ?"
    ).bind(phone).first();

    // -------------------------------------------------------------
    // PRIORITY 1: GLOBAL CANCEL / RESET / EXIT
    // -------------------------------------------------------------
    if (
      lowerText === "cancel" || 
      lowerText === "reset" || 
      lowerText === "exit" || 
      lowerText === "quit" || 
      buttonPayload === "BTN_CANCEL"
    ) {
      if (session) {
        await env.DB.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").bind(phone).run();
      }
      replyText = "🚫 *Session cancelled.*\n\nYou can search anytime by typing *\"rooms in Avondale under $250\"*, or type *\"list\"* to post accommodation!";
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
      // SEARCH SESSION: USER SEARCHING BY LOCATION / PLACE NAME
      // ---------------------------------------------------------
      if (currentStep === "AWAITING_SEARCH_QUERY") {
        // User entered their search term directly (e.g. "Mt Pleasant", "Harare", "Avonlea")
        // Clear the search session immediately
        await env.DB.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").bind(phone).run();

        const cleanQuery = text.replace(/^(search|find|looking for|i want a|need a)\s*/i, "").trim();

        // Count total matching listings
        let countSql = `
          SELECT COUNT(*) as total
          FROM listings
          WHERE verification_status != 'Delisted'
        `;
        const countParams: any[] = [];
        if (cleanQuery) {
          countSql += ` AND (suburb LIKE ? OR city LIKE ? OR title LIKE ? OR landmark LIKE ?)`;
          countParams.push(`%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`);
        }
        const totalCountRes: any = countParams.length > 0 
          ? await env.DB.prepare(countSql).bind(...countParams).first()
          : await env.DB.prepare(countSql).first();
        const totalMatching = Number(totalCountRes?.total) || 0;

        // Query up to 3 listings for the first page
        let querySql = `
          SELECT listings.*, landlords.full_name as landlord_name
          FROM listings
          LEFT JOIN landlords ON listings.landlord_id = landlords.id
          WHERE listings.verification_status != 'Delisted'
        `;
        const params: any[] = [];
        if (cleanQuery) {
          querySql += ` AND (listings.suburb LIKE ? OR listings.city LIKE ? OR listings.title LIKE ? OR listings.landmark LIKE ?)`;
          params.push(`%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`);
        }

        querySql += ` ORDER BY listings.created_at DESC LIMIT 3 OFFSET 0`;

        const stmt = env.DB.prepare(querySql);
        const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

        if (!results || results.length === 0) {
          replyText = `🏡 No active listings currently found in *"${cleanQuery}"*.\n\n💡 *Suggestions:*\n• Try searching a wider area like *Harare*, *Bulawayo*, or nearby suburbs (*Avonlea*, *Belvedere*, *Avenues*, *Mt Pleasant*).\n• Tap *Create a Listing* below to post your property on BunkBy!`;
          actionTaken = "SEARCH_NO_RESULTS";
          buttonsToSend = [
            { id: "CMD_SEARCH", title: "🔍 Search Again" },
            { id: "CMD_LIST", title: "🏡 Create a Listing" }
          ];
        } else {
          actionTaken = "SEARCH_RESULTS";
          const baseUrl = new URL(request.url).origin || "https://bunkby.com";

          const headerMsg = totalMatching > results.length
            ? `🏡 *Showing stays 1–${results.length} of ${totalMatching} in "${cleanQuery}":*`
            : `🏡 *Found ${totalMatching} active stay${totalMatching === 1 ? "" : "s"} in "${cleanQuery}":*`;
          
          outboundQueue.push({ text: headerMsg, itemType: "intro" });

          // Send up to 3 property cards
          for (const room of results) {
            const card = buildListingCardMessage(room, baseUrl, phone);
            outboundQueue.push({
              text: card.text,
              imageUrl: card.imageUrl,
              itemType: "listing_card",
              listingId: room.id
            });
          }

          // Build navigation buttons
          const hasMore = results.length < totalMatching;
          const safeQuery = cleanQuery.slice(0, 15).replace(/[^a-zA-Z0-9]/g, "");

          const navButtons: Array<{ id: string; title: string }> = [];
          if (hasMore) {
            navButtons.push({
              id: `PAGE_3_${safeQuery}`,
              title: `⏩ Next 3 Stays (${totalMatching - results.length} left)`
            });
            navButtons.push({ id: "CMD_SEARCH", title: "🔍 New Search" });
            navButtons.push({ id: "CMD_LIST", title: "🏡 Add Listing" });
          } else {
            navButtons.push({ id: "CMD_SEARCH", title: "🔍 Search Again" });
            navButtons.push({ id: "CMD_MY_LISTINGS", title: "📋 My Listings" });
            navButtons.push({ id: "CMD_LIST", title: "🏡 Add Listing" });
          }

          const footerText = hasMore
            ? `📄 *Viewing ${results.length} of ${totalMatching} stays.* Tap *Next 3 Stays* below to see the next batch, or visit https://bunkby.com for full galleries:`
            : `✅ *You have reached the end of listings in "${cleanQuery}".* Tap below to search another area or create a listing:`;

          outboundQueue.push({
            text: footerText,
            buttons: navButtons,
            itemType: "action_footer"
          });
        }
      } else if (currentStep === "AWAITING_CATEGORY") {
        if (buttonPayload === "CAT_HOSPITALITY" || lowerText === "2" || lowerText.includes("hospitality") || lowerText.includes("lodge") || lowerText.includes("hotel") || lowerText.includes("guest")) {
          collectedData.category = "hospitality";
          collectedData.rent_cycle = "Night";
          collectedData.deposit = 0;
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `🏨 *Hospitality & Stays Selected*\n\n*Step 2/11: Select Property Type*\nTap an option or reply with number:\n` +
            `1️⃣ Guest House\n` +
            `2️⃣ Lodge / Guesthouse\n` +
            `3️⃣ Lodge\n` +
            `4️⃣ Hotel\n` +
            `5️⃣ Bed & Breakfast`;
          buttonsToSend = [
            { id: "HTYPE_GUESTHOUSE", title: "🏡 Guest House" },
            { id: "HTYPE_LODGE", title: "🌿 Lodge" },
            { id: "HTYPE_BNB", title: "☕ B&B" }
          ];
          actionTaken = "LISTING_STEP_TYPE_HOSPITALITY";
        } else if (buttonPayload === "CAT_RESIDENTIAL" || lowerText === "1" || lowerText.includes("residential") || lowerText.includes("rent")) {
          collectedData.category = "residential";
          collectedData.rent_cycle = "Month";
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `🏠 *Residential Rentals Selected*\n\n*Step 2/11: Select Property Type*\nTap an option or reply with number:\n` +
            `1️⃣ Single Room\n` +
            `2️⃣ Cottage\n` +
            `3️⃣ 2 rooms\n` +
            `4️⃣ 3 rooms\n` +
            `5️⃣ Full house\n` +
            `6️⃣ Apartment / Flat\n` +
            `7️⃣ Townhouse / Cluster\n` +
            `8️⃣ Boarding House\n` +
            `9️⃣ Shared Space\n` +
            `🔟 Student Hostel\n` +
            `1️⃣1️⃣ Warehouse\n` +
            `1️⃣2️⃣ Shop\n` +
            `1️⃣3️⃣ Table\n` +
            `1️⃣4️⃣ House Sale`;
          buttonsToSend = [
            { id: "RTYPE_ROOM", title: "🚪 Single Room" },
            { id: "RTYPE_COTTAGE", title: "🏡 Cottage" },
            { id: "RTYPE_FLAT", title: "🏢 Apartment/Flat" }
          ];
          actionTaken = "LISTING_STEP_TYPE_RESIDENTIAL";
        } else {
          replyText = `⚠️ Please select a listing category below:`;
          buttonsToSend = [
            { id: "CAT_RESIDENTIAL", title: "🏠 Residential" },
            { id: "CAT_HOSPITALITY", title: "🏨 Hospitality" }
          ];
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

        if (isHospitality) {
          const hospMap: Record<string, string> = {
            "1": "Guest House",
            "2": "Lodge / Guesthouse",
            "3": "Lodge",
            "4": "Hotel",
            "5": "Bed & Breakfast",
            "htype_guesthouse": "Guest House",
            "htype_lodge": "Lodge",
            "htype_bnb": "Bed & Breakfast"
          };
          chosenType = hospMap[normPayload] || hospMap[normText] || "";
          if (!chosenType) {
            if (normText === "guesthouse" || normText.includes("guest house")) chosenType = "Guest House";
            else if (normText.includes("lodge / guesthouse")) chosenType = "Lodge / Guesthouse";
            else if (normText === "lodge" || normText.includes("lodge")) chosenType = "Lodge";
            else if (normText.includes("hotel")) chosenType = "Hotel";
            else if (normText.includes("bed") || normText.includes("b&b") || normText.includes("breakfast")) chosenType = "Bed & Breakfast";
            else if (text.trim().length >= 3) chosenType = text.trim();
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
            "8": "Boarding House",
            "9": "Shared Space",
            "10": "Student Hostel",
            "11": "Warehouse",
            "12": "Shop",
            "13": "Table",
            "14": "House Sale",
            "rtype_room": "Single Room",
            "rtype_cottage": "Cottage",
            "rtype_flat": "Apartment / Flat"
          };
          chosenType = resMap[normPayload] || resMap[normText] || "";
          if (!chosenType) {
            if (normText.includes("single") || normText === "room") chosenType = "Single Room";
            else if (normText.includes("cottage")) chosenType = "Cottage";
            else if (normText.includes("2 room") || normText.includes("two room")) chosenType = "2 rooms";
            else if (normText.includes("3 room") || normText.includes("three room")) chosenType = "3 rooms";
            else if (normText.includes("townhouse") || normText.includes("cluster")) chosenType = "Townhouse / Cluster";
            else if (normText.includes("apartment") || normText.includes("flat")) chosenType = "Apartment / Flat";
            else if (normText.includes("boarding")) chosenType = "Boarding House";
            else if (normText.includes("shared")) chosenType = "Shared Space";
            else if (normText.includes("student") || normText.includes("hostel")) chosenType = "Student Hostel";
            else if (normText.includes("warehouse")) chosenType = "Warehouse";
            else if (normText.includes("shop")) chosenType = "Shop";
            else if (normText.includes("table")) chosenType = "Table";
            else if (normText.includes("sale")) chosenType = "House Sale";
            else if (normText.includes("full") || normText.includes("house")) chosenType = "Full house";
            else if (text.trim().length >= 2) chosenType = text.trim();
          }
        }

        if (!chosenType) {
          replyText = `⚠️ Please select a property type by replying with its number or tapping a button below:`;
          buttonsToSend = isHospitality ? [
            { id: "HTYPE_GUESTHOUSE", title: "🏡 Guest House" },
            { id: "HTYPE_LODGE", title: "🌿 Lodge" },
            { id: "HTYPE_BNB", title: "☕ B&B" }
          ] : [
            { id: "RTYPE_ROOM", title: "🚪 Single Room" },
            { id: "RTYPE_COTTAGE", title: "🏡 Cottage" },
            { id: "RTYPE_FLAT", title: "🏢 Apartment/Flat" }
          ];
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.property_type = chosenType;
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_TITLE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ Property Type: *${chosenType}*\n\n*Step 3/11: Listing Headline / Title*\nEnter a brief catchy headline for your property:\n_(e.g. *Spacious Cottage in Avonlea* or *Modern Ensuite Lodge with Solar & Pool*)_`;
          actionTaken = "LISTING_STEP_TITLE";
        }
      }

      // ---------------------------------------------------------
      // STEP 3: TITLE / HEADLINE -> TOWN OR CITY
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_TITLE") {
        if (!text || text.length < 3) {
          replyText = `⚠️ Please provide a clear headline (at least 3 characters).\n\n*Example:* "Spacious Cottage in Avonlea with Solar"`;
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

          replyText = `✅ Headline: *${collectedData.title}*\n\n*Step 4/11: Town or City*\nSelect or enter the town or city where the property is located (ranked by population & relevance):\n\n` +
            `1️⃣ Harare\n` +
            `2️⃣ Bulawayo\n` +
            `3️⃣ Chitungwiza\n` +
            `4️⃣ Mutare\n` +
            `5️⃣ Gweru\n` +
            `6️⃣ Victoria Falls\n` +
            `7️⃣ Kadoma\n` +
            `8️⃣ Kwekwe\n` +
            `9️⃣ Chinhoyi\n` +
            `🔟 Masvingo\n` +
            `1️⃣1️⃣ Marondera\n` +
            `1️⃣2️⃣ Bindura\n` +
            `1️⃣3️⃣ Kariba\n` +
            `1️⃣4️⃣ Nyanga\n` +
            `1️⃣5️⃣ Chivhu\n\n` +
            `_(Tap a quick button below or type any town or resort name)_`;
          buttonsToSend = [
            { id: "CITY_HARARE", title: "📍 Harare" },
            { id: "CITY_BULAWAYO", title: "📍 Bulawayo" },
            { id: "CITY_VICFALLS", title: "📍 Victoria Falls" }
          ];
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
          replyText = `⚠️ Please select or enter a valid town or city name (e.g. *Harare*, *Bulawayo*, *Victoria Falls*, *Mutare*):`;
          buttonsToSend = [
            { id: "CITY_HARARE", title: "📍 Harare" },
            { id: "CITY_BULAWAYO", title: "📍 Bulawayo" },
            { id: "CITY_VICFALLS", title: "📍 Victoria Falls" }
          ];
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.city = chosenCity;
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_SUBURB', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ City: *${chosenCity}*\n\n*Step 5/11: Suburb or Area*\nWhich suburb or neighbourhood in ${chosenCity} is the property in?\n_(e.g. *Avonlea*, *Belvedere*, *Avenues*, *Rhodene*, *Khumalo*)_`;
          actionTaken = "LISTING_STEP_SUBURB";
        }
      }

      // ---------------------------------------------------------
      // STEP 5: SUBURB -> LANDMARK
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_SUBURB") {
        if (!text || text.length < 2) {
          replyText = `⚠️ Please enter a valid suburb or area name.`;
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
            { id: "LM_NONE", title: "⏭️ None / Skip" }
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

        replyText = `✅ Directions recorded.\n\n*Step 7/11: Rent or Rate Cycle*\nHow often is the rent or rate charged?\n\nTap an option below:`;
        buttonsToSend = isHospitality ? [
          { id: "CYCLE_NIGHT", title: "🌙 Per Night" },
          { id: "CYCLE_MONTH", title: "📅 Per Month" },
          { id: "CYCLE_HOUR", title: "⏱️ Per Hour" }
        ] : [
          { id: "CYCLE_MONTH", title: "📅 Per Month" },
          { id: "CYCLE_SEMESTER", title: "🎓 Per Semester" },
          { id: "CYCLE_NIGHT", title: "🌙 Per Night" }
        ];
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

        replyText = `✅ Rate Cycle: *Per ${chosenCycle}*\n\n*Step 8/11: Price in USD*\nWhat is the price in USD ($) per ${chosenCycle.toLowerCase()}?\n_(Reply with just the number, e.g. *35*, *80*, *150*)_`;
        actionTaken = "LISTING_STEP_PRICE";
      }

      // ---------------------------------------------------------
      // STEP 8: PRICE -> (Hosp: TENANT_TYPE, Res: DEPOSIT)
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_PRICE") {
        const priceNum = parseInt(text.replace(/[^0-9]/g, ""), 10);
        if (isNaN(priceNum) || priceNum <= 0) {
          replyText = `⚠️ Please enter a valid number for the price in USD (e.g. *35*, *80*, *150*).`;
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.price = priceNum;
          const cycleLabel = collectedData.rent_cycle || (isHospitality ? "Night" : "Month");

          if (isHospitality) {
            // Hospitality stays typically do not have security deposits, proceed directly to audience
            collectedData.deposit = 0;
            await env.DB.prepare(`
              UPDATE chatbot_sessions 
              SET current_step = 'AWAITING_TENANT_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE phone_number = ?
            `).bind(JSON.stringify(collectedData), phone).run();

            replyText = `✅ Rate: *$${priceNum} / ${cycleLabel.toLowerCase()}*\n\n*Step 9/11: Preferred Audience / Guests*\nWho is this accommodation best suited for?\n\nTap an option below:`;
            buttonsToSend = [
              { id: "TTYPE_GUEST", title: "🧳 Travelers / Guests" },
              { id: "TTYPE_GENERAL", title: "👥 General Public" },
              { id: "TTYPE_PROFESSIONAL", title: "💼 Business / Work" }
            ];
            actionTaken = "LISTING_STEP_TENANT_TYPE";
          } else {
            // Residential rentals ask for deposit with buttons
            await env.DB.prepare(`
              UPDATE chatbot_sessions 
              SET current_step = 'AWAITING_DEPOSIT', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE phone_number = ?
            `).bind(JSON.stringify(collectedData), phone).run();

            replyText = `✅ Rent: *$${priceNum} / ${cycleLabel.toLowerCase()}*\n\n*Step 9/11: Deposit*\nIs a deposit required?\n\nTap a button or reply with the deposit amount in USD:`;
            buttonsToSend = [
              { id: "DEP_SAME", title: `$${priceNum} (1 ${cycleLabel})` },
              { id: "DEP_NONE", title: "No Deposit ($0)" }
            ];
            actionTaken = "LISTING_STEP_DEPOSIT";
          }
        }
      }

      // ---------------------------------------------------------
      // STEP 9: DEPOSIT (Residential only) -> TENANT_TYPE
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
        await env.DB.prepare(`
          UPDATE chatbot_sessions 
          SET current_step = 'AWAITING_TENANT_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE phone_number = ?
        `).bind(JSON.stringify(collectedData), phone).run();

        replyText = `✅ Deposit: *${depositVal > 0 ? "$" + depositVal : "No Deposit ($0)"}*\n\n*Step 10/11: Preferred Tenant Type*\nWho is this property best suited for?\n\nTap an option below:`;
        buttonsToSend = [
          { id: "TTYPE_GENERAL", title: "👥 General sought" },
          { id: "TTYPE_STUDENT", title: "🎓 Student sought" },
          { id: "TTYPE_PROFESSIONAL", title: "💼 Professional" }
        ];
        actionTaken = "LISTING_STEP_TENANT_TYPE";
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
            { id: "AMEN_ALL_HOSP", title: "✨ Standard Amenities" }
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
            { id: "AMEN_ALL_RES", title: "✨ Standard Amenities" }
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
        replyText = `✨ *Amenities recorded:*\n${formattedAmenitiesList}\n\n📸 *Property Photos*\nPlease send *1 to 3 photos* of the accommodation directly here in WhatsApp!\n\n_(Attach photo from gallery or snap a photo. When finished, tap Done or Skip below)_`;
        buttonsToSend = [
          { id: "BTN_FINISH_PHOTOS", title: "✅ Done Uploading" },
          { id: "BTN_SKIP_PHOTOS", title: "⏭️ Skip Photos" }
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

        // Check if an image attachment or image link was received
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
            // Automatically advance if maximum photos reached
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
              `• *Category:* ${isHospitality ? "Hospitality & Stays" : "Residential Rental"}\n` +
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
              { id: "BTN_SKIP_PHOTOS", title: "⏭️ Skip / Continue" }
            ];
            actionTaken = "LISTING_PHOTO_UPLOADED";
          }
        } else if (photoDownloadFailed && !isFinished) {
          // If media token is expired or Meta download failed, never freeze! Acknowledge and allow continuation
          replyText = `📸 *Photo received!*\n\nWould you like to send another photo, or tap *Done Uploading* to continue to your preview?`;
          buttonsToSend = [
            { id: "BTN_FINISH_PHOTOS", title: "✅ Done Uploading" },
            { id: "BTN_SKIP_PHOTOS", title: "⏭️ Skip / Continue" }
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

          replyText = `📋 *Listing Preview & Confirmation:*

` +
            `• *Headline:* ${collectedData.title}
` +
            `• *Type:* ${collectedData.property_type}
` +
            `• *Category:* ${isHospitality ? "Hospitality & Stays" : "Residential Rental"}
` +
            `• *Location:* ${collectedData.suburb}, ${collectedData.city || "Harare"}${collectedData.landmark ? ` (${collectedData.landmark})` : ""}
` +
            `• *Rate:* $${collectedData.price} / ${period}
` +
            `• *Deposit:* ${depositStr}
` +
            `• *Photos Attached:* ${photoCount} photo${photoCount === 1 ? "" : "s"}
` +
            `• *Contact Number:* ${collectedData.contact_phone || phone}

` +
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
            { id: "BTN_SKIP_PHOTOS", title: "⏭️ Skip Photos" }
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
          // Resolve Primary and Multi-Photos
          const allPhotos = Array.isArray(collectedData.photos) && collectedData.photos.length > 0
            ? collectedData.photos
            : [
              isHospitality
                ? "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80"
                : "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80"
            ];

          // Primary photo stored in image_url for maximum backward and forward compatibility
          const primaryImage = allPhotos[0];
          // If multiple photos exist, store as JSON array string or primary string
          const storedImageField = allPhotos.length > 1 ? JSON.stringify(allPhotos) : primaryImage;

          const amenitiesJson = JSON.stringify(collectedData.amenities || ["Solar Backup", "Reliable Water"]);
          const categoryVal = collectedData.category || "residential";
          const businessNameVal = collectedData.business_name || (isHospitality ? collectedData.title : null);
          const isPremiumVal = 0;
          const tierVal = "free";
          const cityVal = collectedData.city || "Harare";

          // Idempotency & Duplicate Publish Protection:
          // Check if identical listing was created within the last 60 seconds by this host
          const recentExisting = await env.DB.prepare(`
            SELECT id FROM listings 
            WHERE landlord_id = ? AND title = ? AND suburb = ? AND created_at >= datetime('now', '-60 seconds')
            ORDER BY id DESC LIMIT 1
          `).bind(collectedData.landlord_id || phoneId, collectedData.title, collectedData.suburb).first();

          let listingId: any = recentExisting?.id;

          if (!recentExisting) {
            // Dynamic column detection: inspect table columns to support both migrated and unmigrated D1 databases
            let cols = ["title", "suburb", "price", "landlord_id", "verification_status", "image_url", "landmark", "city", "deposit", "property_type", "tenant_type", "rent_cycle", "contact_method", "contact_phone", "amenities"];
            try {
              const tableInfo = await env.DB.prepare("PRAGMA table_info(listings)").all();
              const existingCols = (tableInfo?.results || []).map((c: any) => c.name);
              if (existingCols.includes("category")) cols.push("category");
              if (existingCols.includes("business_name")) cols.push("business_name");
              if (existingCols.includes("is_premium")) cols.push("is_premium");
              if (existingCols.includes("listing_tier")) cols.push("listing_tier");
              if (existingCols.includes("expiry_date")) cols.push("expiry_date");
            } catch (_) {
              // Fallback default
            }

            // Build dynamic SQL
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
              tenant_type: "General",
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

          // Clear session after successful publication
          await env.DB.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").bind(phone).run();

          replyText = `🎉 *Congratulations! Your accommodation is LIVE on BunkBy!* (Listing #${listingId})\n\n` +
            `📋 *Summary:*\n` +
            `• *Title:* ${collectedData.title}\n` +
            `• *Category:* ${isHospitality ? "Hospitality & Stays" : "Residential Rental"}\n` +
            `• *Suburb:* ${collectedData.suburb}\n` +
            `• *Rate:* $${collectedData.price}/${collectedData.rent_cycle || "month"}\n` +
            `• *Contact:* ${collectedData.contact_phone || phone}\n\n` +
            `Tenants on WhatsApp and https://bunkby.com/#listing-${listingId} can now view your listing and contact you directly!`;

          buttonsToSend = [
            { id: "CMD_SEARCH", title: "🔍 Search Stays" },
            { id: "CMD_LIST", title: "🏡 Post Another" }
          ];
          actionTaken = "LISTING_CREATED";
        } else {
          replyText = `⚠️ Please tap *Publish Listing* to confirm, or reply *cancel* to exit.`;
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
      // Landlord Account & Identity check: reuse or auto-provision landlord profile
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

      replyText = `🏡 *Welcome to BunkBy Property Listing!*\nLet's get your property posted on Zimbabwe's direct marketplace.\n\n*Step 1/11: Choose Category*\n\n1️⃣ *Residential Rentals*\n_(Rooms, Cottages, Flats, Houses, Hostels, Commercial)_\n\n2️⃣ *Hospitality & Stays*\n_(Lodges, Guest Houses, Hotels, B&Bs)_\n\nReply *1* or *2*:`;
      buttonsToSend = [
        { id: "CAT_RESIDENTIAL", title: "🏠 Residential" },
        { id: "CAT_HOSPITALITY", title: "🏨 Hospitality" }
      ];
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
        // Mark listing as Delisted
        await env.DB.prepare(`
          UPDATE listings 
          SET verification_status = 'Delisted' 
          WHERE id = ? AND (landlord_id = ? OR contact_phone = ? OR contact_phone LIKE ?)
        `).bind(delId, phoneId, phone, `%${phone.slice(-9)}%`).run();

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
        const targetListing = await env.DB.prepare(`
          SELECT id, title, suburb FROM listings 
          WHERE id = ? AND verification_status != 'Delisted' AND (landlord_id = ? OR contact_phone = ? OR contact_phone LIKE ?)
        `).bind(targetId, phoneId, phone, `%${phone.slice(-9)}%`).first();

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
    // PRIORITY 5: ACCOMMODATION SEARCH (No Active Session)
    // -------------------------------------------------------------
    else if (
      buttonPayload?.startsWith("PAGE_") ||
      buttonPayload === "CMD_SEARCH" ||
      buttonPayload === "CMD_SEARCH_MENU" ||
      lowerText === "search" ||
      lowerText.startsWith("search ") ||
      lowerText.startsWith("find ") ||
      lowerText.startsWith("looking for ") ||
      lowerText.includes("room") ||
      lowerText.includes("cottage") ||
      lowerText.includes("apartment") ||
      lowerText.includes("flat") ||
      lowerText.includes("lodge") ||
      lowerText.includes("guest house") ||
      lowerText.includes("harare") ||
      lowerText.includes("bulawayo") ||
      lowerText.includes("mutare") ||
      lowerText.includes("gweru") ||
      lowerText.includes("kadoma") ||
      lowerText.includes("kariba") ||
      lowerText.includes("nyanga") ||
      lowerText.includes("bindura") ||
      lowerText.includes("chivhu") ||
      lowerText.includes("mt pleasant") ||
      lowerText.includes("avonlea") ||
      lowerText.includes("belvedere") ||
      lowerText.includes("avenues")
    ) {
      // If user tapped the Search button or typed "search" without a query:
      // Initiate a conversational SEARCH SESSION!
      if (buttonPayload === "CMD_SEARCH" || buttonPayload === "CMD_SEARCH_MENU" || lowerText === "search") {
        await env.DB.prepare(`
          INSERT INTO chatbot_sessions (phone_number, current_step, collected_data, updated_at)
          VALUES (?, 'AWAITING_SEARCH_QUERY', '{}', CURRENT_TIMESTAMP)
          ON CONFLICT(phone_number) DO UPDATE SET
            current_step = 'AWAITING_SEARCH_QUERY',
            collected_data = '{}',
            updated_at = CURRENT_TIMESTAMP
        `).bind(phone).run();

        replyText = `🔍 *Search BunkBy Listings*\n\nPlease reply with the *town, city, or suburb* you are looking for:\n\n_(e.g. *Mt Pleasant*, *Harare*, *Kadoma*, *Kariba*, *Bindura*, *Chivhu*, *Bulawayo*)_`;
        buttonsToSend = [
          { id: "SEARCH_HARARE", title: "📍 Harare" },
          { id: "SEARCH_BULAWAYO", title: "📍 Bulawayo" },
          { id: "SEARCH_VICFALLS", title: "📍 Victoria Falls" }
        ];
        actionTaken = "SEARCH_PROMPT_LOCATION";
      } else {
        // User typed a place name directly or tapped a pagination button
        let cleanQuery = text.replace(/^(search|find|looking for|i want a|need a)\s*/i, "").trim();
        let searchOffset = 0;

        if (buttonPayload?.startsWith("PAGE_")) {
          // Format: PAGE_{offset}_{encodedQuery}
          const pageParts = buttonPayload.split("_");
          searchOffset = parseInt(pageParts[1], 10) || 0;
          cleanQuery = pageParts.slice(2).join("_") || cleanQuery;
        } else if (buttonPayload === "SEARCH_HARARE") {
          cleanQuery = "Harare";
        } else if (buttonPayload === "SEARCH_BULAWAYO") {
          cleanQuery = "Bulawayo";
        } else if (buttonPayload === "SEARCH_VICFALLS") {
          cleanQuery = "Victoria Falls";
        }

        // Count total matching listings
        let countSql = `
          SELECT COUNT(*) as total
          FROM listings
          WHERE verification_status != 'Delisted'
        `;
        const countParams: any[] = [];
        if (cleanQuery) {
          countSql += ` AND (suburb LIKE ? OR city LIKE ? OR title LIKE ? OR landmark LIKE ?)`;
          countParams.push(`%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`);
        }
        const totalCountRes: any = countParams.length > 0 
          ? await env.DB.prepare(countSql).bind(...countParams).first()
          : await env.DB.prepare(countSql).first();
        const totalMatching = Number(totalCountRes?.total) || 0;

        // Query up to 3 listings per page with OFFSET
        let querySql = `
          SELECT listings.*, landlords.full_name as landlord_name
          FROM listings
          LEFT JOIN landlords ON listings.landlord_id = landlords.id
          WHERE listings.verification_status != 'Delisted'
        `;
        const params: any[] = [];
        if (cleanQuery) {
          querySql += ` AND (listings.suburb LIKE ? OR listings.city LIKE ? OR listings.title LIKE ? OR listings.landmark LIKE ?)`;
          params.push(`%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`);
        }

        querySql += ` ORDER BY listings.created_at DESC LIMIT 3 OFFSET ?`;
        params.push(searchOffset);

        const stmt = env.DB.prepare(querySql);
        const { results } = await stmt.bind(...params).all();

        if (!results || results.length === 0) {
          replyText = `🏡 No active listings found in *"${cleanQuery || "your search"}"*.\n\n💡 *Suggestions:*\n• Try searching a major city or town (e.g. *Harare*, *Bulawayo*, *Victoria Falls*, *Mutare*, *Kadoma*).\n• Tap *Create a Listing* below to post a property on BunkBy!`;
          actionTaken = "SEARCH_NO_RESULTS";
          buttonsToSend = [
            { id: "CMD_SEARCH", title: "🔍 Search Again" },
            { id: "CMD_LIST", title: "🏡 Create a Listing" }
          ];
        } else {
          actionTaken = "SEARCH_RESULTS";
          const baseUrl = new URL(request.url).origin || "https://bunkby.com";

          // Header message indicating results count and range
          const startNum = searchOffset + 1;
          const endNum = searchOffset + results.length;
          const headerMsg = totalMatching > results.length
            ? `🏡 *Showing stays ${startNum}–${endNum} of ${totalMatching} in "${cleanQuery}":*`
            : `🏡 *Found ${totalMatching} active stay${totalMatching === 1 ? "" : "s"} in "${cleanQuery}":*`;
          
          outboundQueue.push({ text: headerMsg, itemType: "intro" });

          // Send up to 3 individual property cards, each with its image and complete specs
          for (const room of results) {
            const card = buildListingCardMessage(room, baseUrl, phone);
            outboundQueue.push({
              text: card.text,
              imageUrl: card.imageUrl,
              itemType: "listing_card",
              listingId: room.id
            });
          }

          // Build navigation footer with Next Batch if more properties exist
          const hasMore = searchOffset + results.length < totalMatching;
          const nextOffset = searchOffset + 3;
          const safeQuery = cleanQuery.slice(0, 15).replace(/[^a-zA-Z0-9]/g, "");

          const navButtons: Array<{ id: string; title: string }> = [];
          if (hasMore) {
            navButtons.push({
              id: `PAGE_${nextOffset}_${safeQuery}`,
              title: `⏩ Next 3 Stays (${totalMatching - endNum} left)`
            });
            navButtons.push({ id: "CMD_SEARCH", title: "🔍 New Search" });
            navButtons.push({ id: "CMD_LIST", title: "🏡 Add Listing" });
          } else {
            navButtons.push({ id: "CMD_SEARCH", title: "🔍 Search Again" });
            navButtons.push({ id: "CMD_MY_LISTINGS", title: "📋 My Listings" });
            navButtons.push({ id: "CMD_LIST", title: "🏡 Add Listing" });
          }

          const footerText = hasMore
            ? `📄 *Viewing ${endNum} of ${totalMatching} stays.* Tap *Next 3 Stays* below to see the next batch, or visit https://bunkby.com for full galleries:`
            : `✅ *You have reached the end of listings in "${cleanQuery}".* Tap below to search another area or create a listing:`;

          outboundQueue.push({
            text: footerText,
            buttons: navButtons,
            itemType: "action_footer"
          });
        }
      }
    }

    // -------------------------------------------------------------
    // DEFAULT GREETING / WELCOME MENU
    // -------------------------------------------------------------
    else {
      replyText = `👋 *Welcome to BunkBy Zimbabwe!*\nYour direct accommodation marketplace with zero agent fees.\n\n*What would you like to do?*\n🔍 Tap *Search Stays* or type any place (e.g. *Mt Pleasant*, *Harare*)\n🏡 Tap *Create a Listing* to post your property\n📋 Tap *My Listings* to view or delete your listings\n❌ Type *cancel* anytime to reset`;
      actionTaken = "WELCOME_MENU";
      buttonsToSend = [
        { id: "CMD_SEARCH", title: "🔍 Search Stays" },
        { id: "CMD_LIST", title: "🏡 Create a Listing" },
        { id: "CMD_MY_LISTINGS", title: "📋 My Listings" }
      ];
    }

    // DISPATCH OUTBOUND MESSAGES VIA META CLOUD API (Supports text, interactive buttons, and real photos)
    const dispatchResults: OutboundDispatchResult[] = [];

    if (outboundQueue.length > 0) {
      for (let i = 0; i < outboundQueue.length; i++) {
        const item = outboundQueue[i];
        
        // Rate-limit buffer: WhatsApp Cloud API recommends sequential pacing between multi-message payloads
        if (i > 0) {
          await new Promise(r => setTimeout(r, 220));
        }

        let res = await sendMetaWhatsAppMessage(phone, item.text, env, item.buttons, item.imageUrl);
        
        // Granular diagnostic metadata attached to result
        res.itemType = item.itemType || "message";
        if (item.listingId) res.listingId = item.listingId;
        res.hasImage = Boolean(item.imageUrl);
        res.imageUrl = item.imageUrl || null;

        if (!res.success && item.imageUrl) {
          const imgFailureReason = res.error || `HTTP ${res.httpStatus} on image dispatch`;
          console.warn(`[WhatsApp Image Dispatch Failed for ${item.imageUrl}]: ${imgFailureReason}. Delivering full property text.`);
          
          // Fallback immediately to full text card so landlord/tenant NEVER misses details
          const fallbackRes = await sendMetaWhatsAppMessage(phone, item.text, env, item.buttons);
          fallbackRes.itemType = "image_fallback_text";
          if (item.listingId) fallbackRes.listingId = item.listingId;
          fallbackRes.error = `[Image dispatch failed: ${imgFailureReason}]` + (fallbackRes.error ? ` | ${fallbackRes.error}` : "");
          res = fallbackRes;
        }
        dispatchResults.push(res);
      }
    } else if (replyText) {
      const res = await sendMetaWhatsAppMessage(phone, replyText, env, buttonsToSend);
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
