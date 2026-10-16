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
      version: "2026-10-16_diagnostic_v8_publish_search_parity",
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
  if (
    lower.includes("fba8ec567cb5f69b") ||
    (trimmed.length === 152391 && trimmed.includes("AIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiA/9k="))
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

  // Filter out any corporate branding, company logos, or placeholder graphics
  if (isBrandingOrLogoImage(raw)) {
    return null;
  }

  // 1. If standard HTTP/HTTPS URL
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  // 2. If base64 data URI or relative path, serve via public photo endpoint
  if (raw.startsWith("data:") || raw.startsWith("/")) {
    const cleanBase = baseUrl.replace(/\/+$/, "");
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
    // 1. Retrieve temporary media URL from Meta Graph API
    const metaMediaRes = await fetch(`https://graph.facebook.com/v26.0/${mediaId}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!metaMediaRes.ok) {
      console.warn(`[WhatsApp Media] Failed to resolve media URL for ID ${mediaId}: HTTP ${metaMediaRes.status}`);
      return null;
    }

    const metaMediaData: any = await metaMediaRes.json();
    const mediaUrl = metaMediaData.url;
    const mimeType = metaMediaData.mime_type || "image/jpeg";

    if (!mediaUrl) return null;

    // 2. Download binary bytes with Authorization header
    const binaryRes = await fetch(mediaUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "BunkBy-WhatsApp-Bot/1.0"
      }
    });

    if (!binaryRes.ok) {
      console.warn(`[WhatsApp Media] Failed to download media binary: HTTP ${binaryRes.status}`);
      return null;
    }

    const arrayBuffer = await binaryRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // In Cloudflare Worker environment, btoa chunk conversion
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
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

  const { phone, text, messageId, name, buttonPayload } = incoming;
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
      if (currentStep === "AWAITING_CATEGORY") {
        if (buttonPayload === "CAT_HOSPITALITY" || lowerText === "2" || lowerText.includes("hospitality") || lowerText.includes("lodge") || lowerText.includes("guest")) {
          collectedData.category = "hospitality";
          collectedData.rent_cycle = "Night";
          collectedData.deposit = 0;
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `🏨 *Hospitality & Stays Selected*\n\n*Step 2/9: Select Property Type*\nReply with the number:\n1️⃣ Guest House\n2️⃣ Lodge\n3️⃣ Hotel\n4️⃣ Bed & Breakfast\n5️⃣ Short-Stay Apartment`;
          buttonsToSend = [
            { id: "HTYPE_GUESTHOUSE", title: "🏡 Guest House" },
            { id: "HTYPE_LODGE", title: "🌿 Lodge" },
            { id: "HTYPE_BNB", title: "☕ B&B" }
          ];
          actionTaken = "LISTING_STEP_TYPE_HOSPITALITY";
        } else if (buttonPayload === "CAT_RESIDENTIAL" || lowerText === "1" || lowerText.includes("residential") || lowerText.includes("room") || lowerText.includes("cottage")) {
          collectedData.category = "residential";
          collectedData.rent_cycle = "Month";
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `🏠 *Residential Rentals Selected*\n\n*Step 2/9: Select Property Type*\nReply with the number:\n1️⃣ Single Room\n2️⃣ Cottage\n3️⃣ 2 Rooms\n4️⃣ Boarding House\n5️⃣ Full House\n6️⃣ Student Hostel`;
          buttonsToSend = [
            { id: "RTYPE_ROOM", title: "🚪 Single Room" },
            { id: "RTYPE_COTTAGE", title: "🏡 Cottage" },
            { id: "RTYPE_2ROOM", title: "🔑 2 Rooms" }
          ];
          actionTaken = "LISTING_STEP_TYPE_RESIDENTIAL";
        } else {
          replyText = `⚠️ Please reply with *1* for Residential Rentals or *2* for Hospitality & Stays.`;
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
            "2": "Lodge",
            "3": "Hotel",
            "4": "Bed & Breakfast",
            "5": "Short-Stay Apartment",
            "htype_guesthouse": "Guest House",
            "htype_lodge": "Lodge",
            "htype_bnb": "Bed & Breakfast",
            "guest house": "Guest House",
            "lodge": "Lodge",
            "hotel": "Hotel",
            "bed & breakfast": "Bed & Breakfast",
            "b&b": "Bed & Breakfast",
            "short-stay apartment": "Short-Stay Apartment"
          };
          chosenType = hospMap[normPayload] || hospMap[normText] || "";
          if (!chosenType) {
            if (normText.includes("guest")) chosenType = "Guest House";
            else if (normText.includes("lodge")) chosenType = "Lodge";
            else if (normText.includes("hotel")) chosenType = "Hotel";
            else if (normText.includes("b&b") || normText.includes("bed")) chosenType = "Bed & Breakfast";
            else if (normText.includes("short") || normText.includes("apartment")) chosenType = "Short-Stay Apartment";
            else if (text.trim().length >= 3) chosenType = text.trim();
          }
        } else {
          const resMap: Record<string, string> = {
            "1": "Single Room",
            "2": "Cottage",
            "3": "2 Rooms",
            "4": "Boarding House",
            "5": "Full House",
            "6": "Student Hostel",
            "rtype_room": "Single Room",
            "rtype_cottage": "Cottage",
            "rtype_2room": "2 Rooms",
            "single room": "Single Room",
            "cottage": "Cottage",
            "2 rooms": "2 Rooms",
            "boarding house": "Boarding House",
            "full house": "Full House",
            "student hostel": "Student Hostel"
          };
          chosenType = resMap[normPayload] || resMap[normText] || "";
          if (!chosenType) {
            if (normText.includes("single")) chosenType = "Single Room";
            else if (normText.includes("cottage")) chosenType = "Cottage";
            else if (normText.includes("2 room") || normText.includes("two room")) chosenType = "2 Rooms";
            else if (normText.includes("boarding")) chosenType = "Boarding House";
            else if (normText.includes("full")) chosenType = "Full House";
            else if (normText.includes("hostel") || normText.includes("student")) chosenType = "Student Hostel";
            else if (text.trim().length >= 3) chosenType = text.trim();
          }
        }

        if (!chosenType || chosenType.length < 2) {
          replyText = `⚠️ Please select a valid property type from the list above.`;
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.property_type = chosenType;
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_TITLE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          const example = isHospitality 
            ? `"Serene Executive Guest Wing" or "Avonlea Boutique Lodge"` 
            : `"Neat Single Room with Solar & Borehole" or "Spacious 2-Room Cottage"`;

          replyText = `✅ Property Type: *${chosenType}*\n\n*Step 3/9: Listing Title*\nWhat is the name or title of your listing?\n_(e.g. ${example})_`;
          actionTaken = "LISTING_STEP_TITLE";
        }
      }

      // ---------------------------------------------------------
      // STEP 3: TITLE
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_TITLE") {
        if (!text || text.length < 3) {
          replyText = `⚠️ Please provide a descriptive title (at least 3 characters).\n\n*Example:* "Neat Cottage in Avonlea with Solar"`;
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.title = text.trim();
          if (isHospitality) {
            collectedData.business_name = text.trim();
          }
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_PRICE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          const period = isHospitality ? "per night" : "per month";
          replyText = `✅ Title set to: *${collectedData.title}*\n\n*Step 4/9: Price*\nWhat is the rate in USD ($) ${period}?\n_(Reply with just the number, e.g. *35*, *80*, *150*)_`;
          actionTaken = "LISTING_STEP_PRICE";
        }
      }

      // ---------------------------------------------------------
      // STEP 4: PRICE & RENT PERIOD
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_PRICE") {
        const priceNum = parseInt(text.replace(/[^0-9]/g, ""), 10);
        if (isNaN(priceNum) || priceNum <= 0) {
          replyText = `⚠️ Please enter a valid numerical price in USD (e.g. *40*, *120*).`;
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.price = priceNum;
          if (isHospitality) {
            // Hospitality stays typically do not have security deposits, skip deposit question
            collectedData.deposit = 0;
            collectedData.rent_cycle = "Night";
            await env.DB.prepare(`
              UPDATE chatbot_sessions 
              SET current_step = 'AWAITING_SUBURB', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE phone_number = ?
            `).bind(JSON.stringify(collectedData), phone).run();

            replyText = `✅ Rate set to: *$${priceNum}/night*\n\n*Step 5/8: Suburb & Location*\nIn which suburb or area is this property located?\n_(e.g. *Avonlea*, *Belvedere*, *Newlands*, *Victoria Falls*)_`;
            actionTaken = "LISTING_STEP_SUBURB";
          } else {
            collectedData.rent_cycle = "Month";
            await env.DB.prepare(`
              UPDATE chatbot_sessions 
              SET current_step = 'AWAITING_DEPOSIT', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE phone_number = ?
            `).bind(JSON.stringify(collectedData), phone).run();

            replyText = `✅ Rent set to: *$${priceNum}/month*\n\n*Step 5/9: Security Deposit*\nIs a deposit required?\n\nReply with the deposit amount in USD (e.g. *${priceNum}*, *50*), or reply *0* / *none* for no deposit.`;
            buttonsToSend = [
              { id: "DEP_SAME", title: `$${priceNum} (1 Month)` },
              { id: "DEP_NONE", title: "No Deposit ($0)" }
            ];
            actionTaken = "LISTING_STEP_DEPOSIT";
          }
        }
      }

      // ---------------------------------------------------------
      // STEP 5: DEPOSIT (Residential only)
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
          SET current_step = 'AWAITING_SUBURB', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE phone_number = ?
        `).bind(JSON.stringify(collectedData), phone).run();

        replyText = `✅ Deposit set to: *${depositVal > 0 ? "$" + depositVal : "No Deposit ($0)"}*\n\n*Step 6/9: Suburb & Location*\nIn which suburb or area is the property located?\n_(e.g. *Avonlea*, *Belvedere*, *Mt Pleasant*, *Avenues*)_`;
        actionTaken = "LISTING_STEP_SUBURB";
      }

      // ---------------------------------------------------------
      // STEP 6: SUBURB & LANDMARK / DIRECTIONS
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_SUBURB") {
        if (!text || text.length < 2) {
          replyText = `⚠️ Please enter a valid suburb or area name.`;
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.suburb = text.trim();
          collectedData.city = "Harare";
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_LANDMARK', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ Location set to: *${collectedData.suburb}*\n\n*Step 7/9: Landmark / Directions*\nAny nearest landmark or directions? *(or reply "None")*\n_(e.g. "Near Total Garage on Lomagundi Rd" or "5 min walk to shopping centre")_`;
          actionTaken = "LISTING_STEP_LANDMARK";
        }
      }

      // ---------------------------------------------------------
      // STEP 7: LANDMARK & AMENITIES
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_LANDMARK") {
        const landmark = (lowerText === "none" || lowerText === "no") ? "" : text.trim();
        collectedData.landmark = landmark;

        await env.DB.prepare(`
          UPDATE chatbot_sessions 
          SET current_step = 'AWAITING_AMENITIES', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE phone_number = ?
        `).bind(JSON.stringify(collectedData), phone).run();

        if (isHospitality) {
          replyText = `✅ Directions recorded.\n\n*Step 8/9: Amenities*\nReply with numbers of included amenities (e.g. *1, 2, 4*):\n1️⃣ Wi-Fi & Workspace\n2️⃣ Swimming Pool\n3️⃣ Breakfast Included\n4️⃣ Solar Power Backup\n5️⃣ Air Conditioning / Ensuite\n6️⃣ Secure Parking`;
        } else {
          replyText = `✅ Directions recorded.\n\n*Step 8/9: Amenities*\nReply with numbers of included amenities (e.g. *1, 2, 3*):\n1️⃣ Borehole / Reliable Water\n2️⃣ Solar Power Backup\n3️⃣ Tiled Floors & Ceiling\n4️⃣ Ensuite Bathroom\n5️⃣ Walled & Gated\n6️⃣ Fitted Wardrobes`;
        }
        actionTaken = "LISTING_STEP_AMENITIES";
      }

      // ---------------------------------------------------------
      // STEP 8: AMENITIES SELECTION
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_AMENITIES") {
        const selectedAmenities: string[] = [];
        if (isHospitality) {
          const hospAmenityMap: Record<string, string> = {
            "1": "Wi-Fi & Workspace",
            "2": "Swimming Pool",
            "3": "Breakfast Included",
            "4": "Solar Power Backup",
            "5": "Air Conditioning / Ensuite",
            "6": "Secure Parking"
          };
          const digits = text.match(/[1-6]/g) || [];
          for (const d of digits) {
            if (hospAmenityMap[d] && !selectedAmenities.includes(hospAmenityMap[d])) {
              selectedAmenities.push(hospAmenityMap[d]);
            }
          }
          if (selectedAmenities.length === 0) {
            selectedAmenities.push("Wi-Fi & Workspace", "Solar Power Backup", "Secure Parking");
          }
        } else {
          const resAmenityMap: Record<string, string> = {
            "1": "Borehole / Reliable Water",
            "2": "Solar Power Backup",
            "3": "Tiled Floors & Ceiling",
            "4": "Ensuite Bathroom",
            "5": "Walled & Gated",
            "6": "Fitted Wardrobes"
          };
          const digits = text.match(/[1-6]/g) || [];
          for (const d of digits) {
            if (resAmenityMap[d] && !selectedAmenities.includes(resAmenityMap[d])) {
              selectedAmenities.push(resAmenityMap[d]);
            }
          }
          if (selectedAmenities.length === 0) {
            selectedAmenities.push("Borehole / Reliable Water", "Solar Power Backup", "Walled & Gated");
          }
        }

        collectedData.amenities = selectedAmenities;
        await env.DB.prepare(`
          UPDATE chatbot_sessions 
          SET current_step = 'AWAITING_PHOTOS', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE phone_number = ?
        `).bind(JSON.stringify(collectedData), phone).run();

        replyText = `✨ *Amenities recorded:*\n${selectedAmenities.map(a => "• " + a).join("\n")}\n\n📸 *Step 9/9: Property Photos*\nPlease send *1 to 3 photos* of the accommodation directly here in WhatsApp!\n\n_(Attach photo from gallery or snap a photo. When finished, reply *done* or *skip*)_`;
        buttonsToSend = [
          { id: "BTN_FINISH_PHOTOS", title: "✅ Done Uploading" },
          { id: "BTN_SKIP_PHOTOS", title: "⏭️ Skip Photos" }
        ];
        actionTaken = "LISTING_STEP_PHOTOS";
      }

      // ---------------------------------------------------------
      // STEP 9: PHOTO UPLOADS (Supports incoming WhatsApp media & multi-photos)
      // ---------------------------------------------------------
      else if (currentStep === "AWAITING_PHOTOS") {
        if (!Array.isArray(collectedData.photos)) {
          collectedData.photos = [];
        }

        const isFinishing = 
          buttonPayload === "BTN_FINISH_PHOTOS" || 
          buttonPayload === "BTN_SKIP_PHOTOS" || 
          lowerText === "done" || 
          lowerText === "finish" || 
          lowerText === "skip" || 
          lowerText === "no";

        // Check if an actual image message was received
        if (incoming.type === "image" && incoming.mediaId) {
          const downloadedDataUri = await downloadWhatsAppMediaAsDataUri(incoming.mediaId, env);
          if (downloadedDataUri) {
            collectedData.photos.push(downloadedDataUri);
          } else {
            // High-quality fallback photo
            const fallbackImg = isHospitality
              ? "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80"
              : "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80";
            collectedData.photos.push(fallbackImg);
          }

          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `📸 *Photo ${collectedData.photos.length} received!*\n\nYou can send another photo, or tap *Done Uploading* below to preview your listing.`;
          buttonsToSend = [
            { id: "BTN_FINISH_PHOTOS", title: "✅ Done Uploading" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ];
          actionTaken = "LISTING_PHOTO_RECEIVED";
        } else if (isFinishing) {
          // Transition to Confirmation & Preview
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_CONFIRMATION', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          const photoCount = collectedData.photos?.length || 0;
          const depositStr = collectedData.deposit > 0 ? `$${collectedData.deposit}` : "None";
          const period = isHospitality ? "night" : "month";

          replyText = `📋 *Listing Preview & Confirmation*\n\n` +
            `• *Title:* ${collectedData.title}\n` +
            `• *Category:* ${isHospitality ? "Hospitality & Stays" : "Residential Rental"}\n` +
            `• *Type:* ${collectedData.property_type}\n` +
            `• *Location:* ${collectedData.suburb}${collectedData.landmark ? ` (${collectedData.landmark})` : ""}\n` +
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
          replyText = `📸 Please attach a photo from your gallery, or reply *done* to finish without additional photos.`;
          buttonsToSend = [
            { id: "BTN_FINISH_PHOTOS", title: "✅ Done Uploading" },
            { id: "BTN_SKIP_PHOTOS", title: "⏭️ Skip Photos" }
          ];
          actionTaken = "STEP_RETRY";
        }
      }

      // ---------------------------------------------------------
      // STEP 10: PREVIEW, EDIT CONTACT & PUBLISH CONFIRMATION
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
          const isPremiumVal = categoryVal === "hospitality" ? 1 : 0;
          const tierVal = categoryVal === "hospitality" ? "paid" : "free";
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
            // Insert into live Cloudflare D1 listings table
            const insertRes = await env.DB.prepare(`
              INSERT INTO listings (
                title, suburb, price, landlord_id, verification_status,
                image_url, landmark, city, deposit, property_type,
                tenant_type, rent_cycle, contact_method, contact_phone, amenities,
                category, business_name, is_premium, listing_tier
              ) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, 'General', ?, 'Call / Whatsapp', ?, ?, ?, ?, ?, ?)
            `).bind(
            collectedData.title,
            collectedData.suburb,
            Number(collectedData.price),
            collectedData.landlord_id || phoneId,
            storedImageField,
            collectedData.landmark || null,
            cityVal,
            Number(collectedData.deposit || 0),
            collectedData.property_type || "Single Room",
            collectedData.rent_cycle || (isHospitality ? "Night" : "Month"),
            collectedData.contact_phone || phone,
            amenitiesJson,
            categoryVal,
            businessNameVal,
            isPremiumVal,
            tierVal
          ).run();

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
            `Tenants on WhatsApp and https://bunkby.com/#listing-${listingId} can now view your listing and contact you directly!\n\nType *list* to post another property or *search* to find stays.`;

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
      // STEP 11: EDIT CONTACT PHONE
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
      lowerText === "post a room" ||
      lowerText === "add room" ||
      lowerText === "new listing" ||
      lowerText === "list property" ||
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

      replyText = `🏡 *Welcome to BunkBy Accommodation Listing!*\nLet's get your property posted on Zimbabwe's agent-free marketplace.\n\n*Step 1/9: Choose Listing Category*\n\n1️⃣ *Residential Rentals*\n_(Rooms, Cottages, Apartments, Flats, Student Hostels)_\n\n2️⃣ *Hospitality & Stays*\n_(Lodges, Guest Houses, Hotels, B&Bs, Short-Stay Stays)_\n\nReply *1* or *2*:`;
      buttonsToSend = [
        { id: "CAT_RESIDENTIAL", title: "🏠 Residential" },
        { id: "CAT_HOSPITALITY", title: "🏨 Hospitality" }
      ];
      actionTaken = "LISTING_STEP_CATEGORY";
    }

    // -------------------------------------------------------------
    // PRIORITY 4: ACCOMMODATION SEARCH (No Active Session)
    // -------------------------------------------------------------
    else if (
      buttonPayload === "CMD_SEARCH" ||
      buttonPayload === "CMD_SEARCH_MENU" ||
      lowerText.startsWith("search") ||
      lowerText.startsWith("find") ||
      lowerText.includes("room") ||
      lowerText.includes("cottage") ||
      lowerText.includes("apartment") ||
      lowerText.includes("bedsit") ||
      lowerText.includes("lodge") ||
      lowerText.includes("guest house")
    ) {
      // If user tapped a blank search button without query
      if (buttonPayload === "CMD_SEARCH" || buttonPayload === "CMD_SEARCH_MENU" || lowerText === "search") {
        replyText = `🔍 *How to Search BunkBy Stays:*\n\nType whatever you're looking for, e.g.:\n• *search Avonlea*\n• *rooms in Belvedere*\n• *cottage in Mt Pleasant*\n• *lodge in Victoria Falls*\n\nOr visit https://bunkby.com to browse with interactive maps!`;
        actionTaken = "SEARCH_HELP";
      } else {
        // Extract suburb keywords
        const cleanQuery = text.replace(/^(search|find|looking for|i want a|need a)\s*/i, "").trim();
        const searchTerms = cleanQuery.split(/\s+/).filter(w => w.length > 2);
        const suburbTerm = searchTerms[0] || "";

        // Query live D1 listings
        let querySql = `
          SELECT listings.*, landlords.full_name as landlord_name
          FROM listings
          LEFT JOIN landlords ON listings.landlord_id = landlords.id
          WHERE listings.verification_status != 'Delisted'
        `;
        const params: any[] = [];

        if (suburbTerm) {
          querySql += ` AND (listings.suburb LIKE ? OR listings.title LIKE ? OR listings.landmark LIKE ?)`;
          params.push(`%${suburbTerm}%`, `%${suburbTerm}%`, `%${suburbTerm}%`);
        }

        querySql += ` ORDER BY listings.created_at DESC LIMIT 4`;

        const stmt = env.DB.prepare(querySql);
        const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

        if (!results || results.length === 0) {
          replyText = `🏡 No active accommodations currently found matching *"${cleanQuery || "your search"}"*.\n\n💡 *Suggestions:*\n• Try searching nearby suburbs like *Avonlea*, *Belvedere*, *Avenues*, or *Mt Pleasant*.\n• Adjust your budget or search by city (e.g. *Harare*, *Bulawayo*).\n\nAre you a landlord or lodge host? Type *list* to post your property for free!`;
          actionTaken = "SEARCH_NO_RESULTS";
        } else {
          actionTaken = "SEARCH_RESULTS";
          const baseUrl = new URL(request.url).origin || "https://bunkby.com";
          const introMsg = `🏡 *Found ${results.length} active stay${results.length === 1 ? "" : "s"} on BunkBy:*`;
          
          // Queue intro message
          outboundQueue.push({ text: introMsg, itemType: "intro" });

          // Queue each listing card
          for (const room of results) {
            const card = buildListingCardMessage(room, baseUrl, phone);
            outboundQueue.push({
              text: card.text,
              imageUrl: card.imageUrl,
              itemType: "listing_card",
              listingId: room.id
            });
          }

          // Action footer with link to full gallery on website
          outboundQueue.push({
            text: `👉 Visit https://bunkby.com to browse with full interactive maps and gallery filters.\n\nType *list* to post accommodation or *search* to find more stays!`,
            buttons: [
              { id: "CMD_SEARCH", title: "🔍 Search Again" },
              { id: "CMD_LIST", title: "🏡 Post a Room" }
            ],
            itemType: "action_footer"
          });
        }
      }
    }

    // -------------------------------------------------------------
    // DEFAULT GREETING / WELCOME MENU
    // -------------------------------------------------------------
    else {
      replyText = `👋 *Welcome to BunkBy Zimbabwe!*\nYour agent-free accommodation marketplace.\n\n*What would you like to do?*\n🔍 Type *search [suburb]* (e.g. *search Avonlea*)\n🏡 Type *list* to post your room for free\n❌ Type *cancel* to exit anytime\n\nVisit https://bunkby.com to browse with full photos!`;
      actionTaken = "WELCOME_MENU";
      buttonsToSend = [
        { id: "CMD_SEARCH", title: "🔍 Search Stays" },
        { id: "CMD_LIST", title: "🏡 Post a Room" }
      ];
    }

    // DISPATCH OUTBOUND MESSAGES VIA META CLOUD API (Supports text, interactive buttons, and real photos)
    const dispatchResults: OutboundDispatchResult[] = [];

    if (outboundQueue.length > 0) {
      for (let i = 0; i < outboundQueue.length; i++) {
        const item = outboundQueue[i];
        
        // Rate-limit buffer: WhatsApp Cloud API recommends sequential pacing between multi-message payloads
        if (i > 0) {
          await new Promise(r => setTimeout(r, 120));
        }

        let res = await sendMetaWhatsAppMessage(phone, item.text, env, item.buttons, item.imageUrl);
        
        // Granular diagnostic metadata attached to result
        res.itemType = item.itemType || "message";
        if (item.listingId) res.listingId = item.listingId;
        res.hasImage = Boolean(item.imageUrl);
        res.imageUrl = item.imageUrl || null;

        if (!res.success && item.imageUrl) {
          const imgFailureReason = res.error || `HTTP ${res.httpStatus} on image dispatch`;
          console.warn(`[WhatsApp Image Dispatch Failed for ${item.imageUrl}]: ${imgFailureReason}. Falling back to text.`);
          
          // Fallback to text message with explicit diagnostic trail
          const fallbackRes = await sendMetaWhatsAppMessage(phone, `${item.text}\n\n🖼️ Photo: ${item.imageUrl}`, env, item.buttons);
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
