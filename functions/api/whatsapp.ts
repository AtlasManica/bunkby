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
      version: "2026-10-12_diagnostic_v2",
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
}

async function sendMetaWhatsAppMessage(
  recipientPhone: string,
  replyText: string,
  env: Env,
  buttons?: Array<{ id: string; title: string }>
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

  const endpoint = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  let payload: any;
  if (buttons && buttons.length > 0 && buttons.length <= 3) {
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
    }

    return {
      phone: senderPhone,
      text: (text || buttonPayload || "").trim(),
      messageId: message.id || "",
      name: senderName,
      isStatusUpdate: false,
      type: messageType,
      buttonPayload
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
      type: "text",
      buttonPayload: body.buttonPayload
    };
  }

  return null;
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

  // Parse incoming payload
  const incoming = parseIncomingWebhook(body);
  if (!incoming) {
    return jsonResponse({ status: "ignored_empty" }, 200);
  }

  // Ignore delivery receipts/status updates promptly
  if (incoming.isStatusUpdate) {
    return jsonResponse({ status: "status_acknowledged" }, 200);
  }

  const { phone, text, messageId, name } = incoming;
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

  // Initialize tables safely
  await ensureDiagnosticTable(env.DB);

  // Deduplication check: Prevent duplicate processing if Meta retries webhook
  if (messageId && messageId !== "simulated_id") {
    try {
      const existing = await env.DB.prepare(
        "SELECT id FROM whatsapp_diagnostic_events WHERE message_id = ?"
      ).bind(messageId).first();
      if (existing) {
        return jsonResponse({ status: "already_processed" }, 200);
      }
    } catch (_) {}
  }

  let replyText = "";
  let actionTaken = "";
  let buttonsToSend: Array<{ id: string; title: string }> | undefined;

  try {
    // Check for active session
    const session = await env.DB.prepare(
      "SELECT phone_number, current_step, collected_data FROM chatbot_sessions WHERE phone_number = ?"
    ).bind(phone).first();

    // -------------------------------------------------------------
    // COMMAND: CANCEL / RESET / EXIT
    // -------------------------------------------------------------
    if (lowerText === "cancel" || lowerText === "reset" || lowerText === "exit" || lowerText === "quit") {
      if (session) {
        await env.DB.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").bind(phone).run();
      }
      replyText = "🚫 *Session cancelled.*\n\nYou can search anytime by typing *\"rooms in Avondale under $250\"*, or type *\"list\"* to post accommodation!";
      actionTaken = "SESSION_CANCELLED";
    }

    // -------------------------------------------------------------
    // COMMAND: SEARCH [SUBURB / QUERY]
    // -------------------------------------------------------------
    else if (
      lowerText.startsWith("search") ||
      lowerText.startsWith("find") ||
      lowerText.includes("room") ||
      lowerText.includes("cottage") ||
      lowerText.includes("apartment") ||
      lowerText.includes("bedsit")
    ) {
      if (session) {
        await env.DB.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").bind(phone).run();
      }

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
        replyText = `🏡 No active listings currently found for *"${cleanQuery || "your search"}"*.\n\nTry searching nearby suburbs like *Avonlea*, *Belvedere*, *Avenues*, or *Mt Pleasant*.\n\nAre you a landlord? Type *list* to post your room for free!`;
        actionTaken = "SEARCH_NO_RESULTS";
      } else {
        replyText = `🏡 *Available Accommodations (${results.length} found):*\n\n`;
        results.forEach((room: any, index: number) => {
          const rentCycle = room.rent_cycle || "mo";
          const landmarkStr = room.landmark ? ` (${room.landmark})` : "";
          const contactNum = room.contact_phone || "Contact on bunkby.com";
          const propType = room.property_type ? `[${room.property_type}] ` : "";

          replyText += `*${index + 1}. ${room.title}*\n`;
          replyText += `📍 ${room.suburb}${landmarkStr}\n`;
          replyText += `💰 $${room.price}/${rentCycle} ${propType}\n`;
          replyText += `📞 Contact: ${contactNum}\n\n`;
        });
        replyText += `👉 View photos and full details on https://bunkby.com\nType *list* to post a room or search another suburb!`;
        actionTaken = "SEARCH_RESULTS";
      }
    }

    // -------------------------------------------------------------
    // COMMAND: LIST / REGISTER (Start Listing Flow)
    // -------------------------------------------------------------
    else if (
      lowerText === "list" ||
      lowerText === "register" ||
      lowerText === "post" ||
      lowerText === "add room" ||
      lowerText === "new listing"
    ) {
      // Ensure landlord exists in D1
      const existingLandlord = await env.DB.prepare(
        "SELECT id FROM landlords WHERE id = ?"
      ).bind(phoneId).first();

      if (!existingLandlord) {
        await env.DB.prepare(`
          INSERT INTO landlords (id, full_name, verification_status)
          VALUES (?, ?, 'pending')
        `).bind(phoneId, name || `WhatsApp Host (${phone})`).run();
      }

      const initialData = JSON.stringify({
        phone_number: phone,
        landlord_id: phoneId,
        contact_phone: phone
      });

      await env.DB.prepare(`
        INSERT INTO chatbot_sessions (phone_number, current_step, collected_data, updated_at)
        VALUES (?, 'AWAITING_TITLE', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(phone_number) DO UPDATE SET
          current_step = 'AWAITING_TITLE',
          collected_data = ?,
          updated_at = CURRENT_TIMESTAMP
      `).bind(phone, initialData, initialData).run();

      replyText = `🏡 *Welcome to BunkBy Accommodation Listing!*\n\nLet's get your accommodation posted for free without middleman fees.\n\n*Step 1/5:* What is the *title* of your listing?\n_(e.g. "Neat Bed-sitter with Solar & Borehole" or "Spacious Cottage in Avonlea")_`;
      actionTaken = "LISTING_STEP_TITLE";
    }

    // -------------------------------------------------------------
    // STATE MACHINE: User is in an Active Multi-Step Flow
    // -------------------------------------------------------------
    else if (session) {
      const currentStep = session.current_step;
      let collectedData: any = {};
      try {
        collectedData = JSON.parse(session.collected_data || "{}");
      } catch {
        collectedData = {};
      }

      if (currentStep === "AWAITING_TITLE") {
        if (!text || text.length < 3) {
          replyText = `⚠️ Please provide a descriptive title (at least 3 characters).\n\n*Example:* "Neat Room with Ensuite in Mt Pleasant"`;
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.title = text;
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_PRICE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ Title set to: *${text}*\n\n*Step 2/5:* What is the monthly rent in USD ($)?\n_(Reply with just the number, e.g. *80*, *120*, or *150*)_`;
          actionTaken = "LISTING_STEP_PRICE";
        }
      } else if (currentStep === "AWAITING_PRICE") {
        const priceNum = parseInt(text.replace(/[^0-9]/g, ""), 10);
        if (isNaN(priceNum) || priceNum <= 0) {
          replyText = `⚠️ Please enter a valid numerical price in USD.\n\n*Example:* 120`;
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.price = priceNum;
          collectedData.deposit = priceNum;
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_SUBURB', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ Rent set to: *$${priceNum}/month*\n\n*Step 3/5:* In which *suburb* is the property located?\n_(e.g. *Avonlea*, *Belvedere*, *Mt Pleasant*, *Avenues*)_`;
          actionTaken = "LISTING_STEP_SUBURB";
        }
      } else if (currentStep === "AWAITING_SUBURB") {
        if (!text || text.length < 2) {
          replyText = `⚠️ Please enter a valid suburb name.`;
          actionTaken = "STEP_RETRY";
        } else {
          collectedData.suburb = text;
          collectedData.city = "Harare";
          await env.DB.prepare(`
            UPDATE chatbot_sessions 
            SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE phone_number = ?
          `).bind(JSON.stringify(collectedData), phone).run();

          replyText = `✅ Location set to: *${text}*\n\n*Step 4/5:* What type of property is this?\nReply with the number:\n1️⃣ Single Room\n2️⃣ Cottage\n3️⃣ 2 rooms\n4️⃣ Boarding House\n5️⃣ Full house\n6️⃣ Student Hostel`;
          actionTaken = "LISTING_STEP_TYPE";
        }
      } else if (currentStep === "AWAITING_PROPERTY_TYPE") {
        const typeMap: Record<string, string> = {
          "1": "Single Room",
          "2": "Cottage",
          "3": "2 rooms",
          "4": "Boarding House",
          "5": "Full house",
          "6": "Student Hostel"
        };
        const chosenType = typeMap[text.trim()] || text.trim() || "Single Room";
        collectedData.property_type = chosenType;

        await env.DB.prepare(`
          UPDATE chatbot_sessions 
          SET current_step = 'AWAITING_LANDMARK', collected_data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE phone_number = ?
        `).bind(JSON.stringify(collectedData), phone).run();

        replyText = `✅ Property type set to: *${chosenType}*\n\n*Step 5/5:* Any nearest landmark or directions? *(or reply "None")*\n_(e.g. "Near Total Garage", "5 min walk to UZ gate")_`;
        actionTaken = "LISTING_STEP_LANDMARK";
      } else if (currentStep === "AWAITING_LANDMARK") {
        const landmark = (lowerText === "none" || lowerText === "no") ? "" : text;
        collectedData.landmark = landmark;

        const defaultImage = "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80";
        const amenitiesJson = JSON.stringify(["Borehole Water", "Solar Backup", "Fenced & Secure"]);

        // Save directly to D1 listings
        const insertRes = await env.DB.prepare(`
          INSERT INTO listings (
            title, suburb, price, landlord_id, verification_status,
            image_url, landmark, city, deposit, property_type,
            tenant_type, rent_cycle, contact_method, contact_phone, amenities
          ) VALUES (?, ?, ?, ?, 'Active', ?, ?, 'Harare', ?, ?, 'General', 'Month', 'Call / Whatsapp', ?, ?)
        `).bind(
          collectedData.title,
          collectedData.suburb,
          Number(collectedData.price),
          collectedData.landlord_id || phoneId,
          defaultImage,
          collectedData.landmark || null,
          Number(collectedData.deposit || collectedData.price),
          collectedData.property_type || "Single Room",
          collectedData.contact_phone || phone,
          amenitiesJson
        ).run();

        await env.DB.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").bind(phone).run();
        const listingId = insertRes?.meta?.last_row_id || "New";

        replyText = `🎉 *Congratulations! Your accommodation is LIVE on BunkBy!* (Listing #${listingId})\n\n📋 *Summary:*\n• *Title:* ${collectedData.title}\n• *Suburb:* ${collectedData.suburb}\n• *Rent:* $${collectedData.price}/month\n• *Type:* ${collectedData.property_type}\n• *Contact:* ${collectedData.contact_phone || phone}\n\nTenants on WhatsApp and https://bunkby.com can now connect with you directly!`;
        actionTaken = "LISTING_CREATED";
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

    // DISPATCH OUTBOUND MESSAGE VIA META CLOUD API
    const dispatchResult = await sendMetaWhatsAppMessage(phone, replyText, env, buttonsToSend);

    // RECORD SANITIZED EVENT TO D1 DIAGNOSTICS TABLE
    try {
      await env.DB.prepare(`
        INSERT INTO whatsapp_diagnostic_events (
          timestamp, message_id, sender, sender_name, incoming_preview, action_taken, outbound_count, outbound_delivery, status, error
        ) VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).bind(
        messageId || null,
        sanitizedSender,
        name ? `${name.slice(0, 20)}` : "WhatsApp User",
        text ? text.slice(0, 60) : "",
        actionTaken,
        JSON.stringify([dispatchResult]),
        dispatchResult.success ? "delivered" : "dispatch_failed",
        dispatchResult.error || null
      ).run();
    } catch (_) {}

    return jsonResponse({
      status: "processed",
      action: actionTaken,
      delivery: dispatchResult
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
