import type { Database } from "better-sqlite3";
import {
  parseIncomingWhatsAppWebhook,
  parseNaturalLanguageQuery,
  searchListings,
  buildListingCard,
  createTextMessage,
  createButtonMessage,
  createListMessage,
  sendWhatsAppMessage,
  WhatsAppMessagePayload,
  ParsedWhatsAppInput
} from "./whatsappService";

export interface BotProcessResult {
  phone: string;
  action: string;
  replyText?: string;
  outboundPayloads: WhatsAppMessagePayload[];
  searchResultsCount?: number;
  createdListingId?: number | string;
  step?: string;
  deliveryResults?: Array<{
    success: boolean;
    error?: string;
    simulated?: boolean;
    messageId?: string;
  }>;
}

/**
 * Ensures chatbot_sessions table exists in the database
 */
export function ensureChatbotTable(db: Database) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS chatbot_sessions (
      phone_number TEXT PRIMARY KEY,
      current_step TEXT NOT NULL,
      collected_data TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

/**
 * Core WhatsApp Bot Engine
 * Processes incoming message, updates session state or searches database,
 * constructs outbound Meta WhatsApp payloads, and sends them via Cloud API.
 */
export async function processWhatsAppMessage(
  db: Database,
  rawBody: any,
  baseUrl: string,
  metaConfig?: { accessToken?: string; phoneNumberId?: string; businessAccountId?: string }
): Promise<BotProcessResult> {
  const deliveryResults: Array<{
    success: boolean;
    error?: string;
    simulated?: boolean;
    messageId?: string;
  }> = [];
  const result = await processWhatsAppMessageInternal(db, rawBody, baseUrl, metaConfig, deliveryResults);
  result.deliveryResults = deliveryResults;
  return result;
}

async function processWhatsAppMessageInternal(
  db: Database,
  rawBody: any,
  baseUrl: string,
  metaConfig?: { accessToken?: string; phoneNumberId?: string; businessAccountId?: string },
  deliveryResults: Array<{
    success: boolean;
    error?: string;
    simulated?: boolean;
    messageId?: string;
  }> = []
): Promise<BotProcessResult> {
  ensureChatbotTable(db);

  const input = parseIncomingWhatsAppWebhook(rawBody);

  if (!input) {
    return {
      phone: "",
      action: "IGNORED_EMPTY",
      outboundPayloads: []
    };
  }

  // If this is a Meta delivery/read status update, acknowledge without sending a message
  if (input.isStatusUpdate) {
    return {
      phone: input.phone,
      action: "STATUS_ACKNOWLEDGED",
      outboundPayloads: []
    };
  }

  const phone = input.phone;
  const text = input.text.trim();
  const lowerText = text.toLowerCase();
  const buttonPayload = input.buttonPayload || "";
  const phoneId = Number(phone.replace(/\D/g, "")) || 0;
  const sanitizedSender = phone ? `${phone.slice(0, 4)}***${phone.slice(-3)}` : "unknown";

  console.log(`[WhatsApp Engine Invoked] Processing message from ${sanitizedSender}: "${text.slice(0, 40)}" (Type: ${input.type})`);

  const outboundPayloads: WhatsAppMessagePayload[] = [];

  // Helper to append a payload
  const queuePayload = (payload: WhatsAppMessagePayload) => {
    outboundPayloads.push(payload);
  };

  // Helper to dispatch queued payloads to Meta
  const dispatchAll = async () => {
    console.log(`[WhatsApp Engine Dispatch] Dispatching ${outboundPayloads.length} response message(s) to ${sanitizedSender}`);
    for (const p of outboundPayloads) {
      const res = await sendWhatsAppMessage(p, metaConfig);
      deliveryResults.push({
        success: res.success,
        error: res.error,
        simulated: res.simulated,
        messageId: res.data?.messages?.[0]?.id
      });
      if (!res.success) {
        console.warn(`[WhatsApp Engine Dispatch Warning] Failed sending payload to ${sanitizedSender}: ${res.error}`);
      }
    }
  };

  // Check for active conversation session
  const session = db.prepare("SELECT * FROM chatbot_sessions WHERE phone_number = ?").get(phone) as any;

  // =========================================================================
  // COMMAND: CANCEL / RESET / EXIT
  // =========================================================================
  if (
    lowerText === "cancel" ||
    lowerText === "reset" ||
    lowerText === "exit" ||
    lowerText === "quit" ||
    buttonPayload === "CMD_CANCEL" ||
    buttonPayload === "CMD_CANCEL_LISTING"
  ) {
    if (session) {
      db.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").run(phone);
    }
    const cancelMsg = "🚫 *Session cancelled.*\n\nYou can search for places anytime by typing e.g. *\"rooms in Avondale under $250\"*, or type *\"list\"* to post accommodation!";
    queuePayload(
      createButtonMessage(
        phone,
        cancelMsg,
        [
          { id: "CMD_SEARCH_MENU", title: "🔍 Search Stays" },
          { id: "CMD_START_LISTING", title: "🏡 Post Listing" }
        ],
        "BunkBy Zimbabwe"
      )
    );
    await dispatchAll();
    return {
      phone,
      action: "SESSION_CANCELLED",
      replyText: cancelMsg,
      outboundPayloads
    };
  }

  // =========================================================================
  // COMMAND: START LISTING FLOW (LANDLORD / HOST)
  // =========================================================================
  if (
    (!session && (
      lowerText === "list" ||
      lowerText === "post" ||
      lowerText === "register" ||
      lowerText === "add room" ||
      lowerText === "new listing" ||
      lowerText === "host" ||
      buttonPayload === "CMD_START_LISTING" ||
      buttonPayload === "CMD_LIST"
    )) ||
    buttonPayload === "CMD_START_LISTING" ||
    buttonPayload === "CMD_LIST"
  ) {
    // Ensure landlord record exists in database
    const existingLandlord = db.prepare("SELECT * FROM landlords WHERE id = ?").get(phoneId);
    if (!existingLandlord) {
      db.prepare("INSERT INTO landlords (id, full_name, verification_status) VALUES (?, ?, 'pending')")
        .run(phoneId, input.name || `WhatsApp Host (${phone})`);
    }

    const initialData = JSON.stringify({
      phone_number: phone,
      landlord_id: phoneId,
      contact_phone: phone,
      landlord_name: input.name || `WhatsApp Host (${phone})`
    });

    db.prepare(`
      INSERT INTO chatbot_sessions (phone_number, current_step, collected_data, updated_at)
      VALUES (?, 'AWAITING_CATEGORY', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(phone_number) DO UPDATE SET
        current_step = 'AWAITING_CATEGORY',
        collected_data = excluded.collected_data,
        updated_at = CURRENT_TIMESTAMP
    `).run(phone, initialData);

    const stepMsg = "🏡 *Welcome to BunkBy Listing Assistant!*\n\nLet's get your accommodation published to thousands of Zimbabwean tenants and guests.\n\n*Step 1/8: What kind of property are you listing?*\n\n1️⃣ *Residential Rental* (Room, Cottage, Flat)\n2️⃣ *Hospitality & Stay* (Lodge, Guesthouse, B&B)";

    queuePayload(
      createButtonMessage(
        phone,
        stepMsg,
        [
          { id: "CAT_RESIDENTIAL", title: "🏠 Residential" },
          { id: "CAT_HOSPITALITY", title: "🏨 Hospitality/Lodge" }
        ],
        "Post on BunkBy"
      )
    );

    await dispatchAll();
    return {
      phone,
      action: "SESSION_STARTED",
      step: "AWAITING_CATEGORY",
      replyText: stepMsg,
      outboundPayloads
    };
  }

  // =========================================================================
  // ACTIVE LANDLORD LISTING STATE MACHINE
  // =========================================================================
  if (session) {
    const currentStep = session.current_step;
    let data: any = {};
    try {
      data = JSON.parse(session.collected_data || "{}");
    } catch {
      data = {};
    }

    // --- STEP 1: AWAITING_CATEGORY ---
    if (currentStep === "AWAITING_CATEGORY") {
      let category = "residential";
      if (lowerText.includes("hospitality") || lowerText.includes("lodge") || buttonPayload === "CAT_HOSPITALITY" || text === "2") {
        category = "hospitality";
      }

      data.category = category;

      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const propMsg = category === "hospitality"
        ? "🏨 *Hospitality Property Type:*\n\nReply with the number:\n1️⃣ Guesthouse\n2️⃣ Lodge\n3️⃣ Bed & Breakfast\n4️⃣ Boutique Hotel\n5️⃣ Executive Apartment"
        : "🏠 *Residential Property Type:*\n\nReply with the number:\n1️⃣ Single Room\n2️⃣ Cottage\n3️⃣ Bed-sitter\n4️⃣ 2-Room / Flat\n5️⃣ Full House\n6️⃣ Student Boarding";

      queuePayload(createTextMessage(phone, propMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_PROPERTY_TYPE", outboundPayloads };
    }

    // --- STEP 2: AWAITING_PROPERTY_TYPE ---
    if (currentStep === "AWAITING_PROPERTY_TYPE") {
      let chosenType = "";
      const normPayload = (buttonPayload || "").toLowerCase().trim();
      const normText = text.toLowerCase().trim();

      if (data.category === "hospitality") {
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
          else chosenType = "Guest House";
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
          else chosenType = "Single Room";
        }
      }

      data.property_type = chosenType;

      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_CITY', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const cityMsg = `✅ Property Type: *${chosenType}*\n\n*Step 3/8: In which City or Town is the property located?*\n_(e.g. Harare, Bulawayo, Mutare, Gweru, Victoria Falls)_`;
      queuePayload(createTextMessage(phone, cityMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_CITY", outboundPayloads };
    }

    // --- STEP 3: AWAITING_CITY ---
    if (currentStep === "AWAITING_CITY") {
      if (!text || text.length < 3) {
        queuePayload(createTextMessage(phone, "⚠️ Please enter a valid city name (e.g. Harare, Bulawayo, Mutare)."));
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_CITY", outboundPayloads };
      }

      data.city = text.trim();

      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_SUBURB', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const subMsg = `✅ City: *${data.city}*\n\n*Step 4/8: Which Suburb or Neighborhood?*\n_(e.g. Avonlea, Avondale, Belvedere, Mt Pleasant, Avenues, Kumalo)_`;
      queuePayload(createTextMessage(phone, subMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_SUBURB", outboundPayloads };
    }

    // --- STEP 4: AWAITING_SUBURB ---
    if (currentStep === "AWAITING_SUBURB") {
      if (!text || text.length < 2) {
        queuePayload(createTextMessage(phone, "⚠️ Please enter the suburb name (e.g. Avondale, Belvedere)."));
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_SUBURB", outboundPayloads };
      }

      data.suburb = text.trim();

      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_TITLE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const titlePrompt = data.category === "hospitality"
        ? `✅ Suburb: *${data.suburb}*\n\n*Step 5/8: What is the Business/Lodge Name & Room Title?*\n_(e.g. "Bronte Gardens Guesthouse - Executive Suite")_`
        : `✅ Suburb: *${data.suburb}*\n\n*Step 5/8: Give your listing a short headline:*\n_(e.g. "Spacious Ensuite Room with Solar & Borehole" or "Modern 1-Bed Garden Cottage")_`;

      queuePayload(createTextMessage(phone, titlePrompt));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_TITLE", outboundPayloads };
    }

    // --- STEP 5: AWAITING_TITLE ---
    if (currentStep === "AWAITING_TITLE") {
      if (!text || text.length < 3) {
        queuePayload(createTextMessage(phone, "⚠️ Please provide a descriptive title (at least 3 characters)."));
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_TITLE", outboundPayloads };
      }

      data.title = text.trim();
      if (data.category === "hospitality" && text.includes("-")) {
        const parts = text.split("-");
        data.business_name = parts[0].trim();
      }

      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_PRICE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const cycleStr = data.category === "hospitality" ? "per NIGHT" : "per MONTH";
      const priceMsg = `✅ Title set!\n\n*Step 6/8: What is the price in USD ($) ${cycleStr}?*\n_(Reply with the number only, e.g. 35, 90, 150, 220)_`;
      queuePayload(createTextMessage(phone, priceMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_PRICE", outboundPayloads };
    }

    // --- STEP 6: AWAITING_PRICE ---
    if (currentStep === "AWAITING_PRICE") {
      const priceNum = parseInt(text.replace(/[^0-9]/g, ""), 10);
      if (isNaN(priceNum) || priceNum <= 0) {
        queuePayload(createTextMessage(phone, "⚠️ Please reply with a valid numerical price in USD (e.g. 120)."));
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_PRICE", outboundPayloads };
      }

      data.price = priceNum;
      data.rent_cycle = data.category === "hospitality" ? "Night" : "Month";
      data.deposit = data.category === "hospitality" ? 0 : priceNum;

      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_AMENITIES', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const amenMsg = `💰 Price set: *$${priceNum} / ${data.rent_cycle}*\n\n*Step 7/8: Which amenities are included?*\n_(Reply with comma-separated list or numbers)_\n\n1. Borehole Water\n2. Solar Backup\n3. Wifi / Internet\n4. Ensuite Bathroom\n5. Breakfast Included\n6. Swimming Pool\n7. Secure Parking\n\n_(or reply "none" or "standard")_`;
      queuePayload(createTextMessage(phone, amenMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_AMENITIES", outboundPayloads };
    }

    // --- STEP 7: AWAITING_AMENITIES ---
    if (currentStep === "AWAITING_AMENITIES") {
      const amenityMap: Record<string, string> = {
        "1": "Borehole Water",
        "2": "Solar Power Backup",
        "3": "Wifi / Internet",
        "4": "Ensuite",
        "5": "Breakfast Included",
        "6": "Swimming Pool",
        "7": "Secure Parking"
      };

      const amenitiesList: string[] = [];
      const tokens = text.split(/[,;\n]+/);
      for (const tok of tokens) {
        const trimmed = tok.trim();
        if (amenityMap[trimmed]) {
          amenitiesList.push(amenityMap[trimmed]);
        } else if (trimmed.length > 2 && trimmed.toLowerCase() !== "none" && trimmed.toLowerCase() !== "standard") {
          amenitiesList.push(trimmed);
        }
      }

      if (amenitiesList.length === 0) {
        amenitiesList.push("Borehole Water", "Solar Backup");
      }

      data.amenities = amenitiesList;

      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_PHOTOS', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const photoMsg = `📸 *Step 8/8: Send real property photographs*\n\nPlease attach and send 1 to 3 real photos of this property directly in this WhatsApp chat!\n\n_Tenants strongly prefer verified photos. (Or reply *skip* if you will upload pictures later on the website)_`;
      queuePayload(createTextMessage(phone, photoMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_PHOTOS", outboundPayloads };
    }

    // --- STEP 8: AWAITING_PHOTOS ---
    if (currentStep === "AWAITING_PHOTOS") {
      if (!Array.isArray(data.photos)) {
        data.photos = [];
        if (data.image_url) data.photos.push(data.image_url);
      }

      const isFinishing = 
        buttonPayload === "BTN_FINISH_PHOTOS" || 
        buttonPayload === "BTN_SKIP_PHOTOS" || 
        lowerText === "done" || 
        lowerText === "finish" || 
        lowerText === "skip" || 
        lowerText === "no";

      if (input.type === "image" && input.mediaId) {
        const photoUrl = `https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80`;
        data.photos.push(photoUrl);
        data.image_url = data.photos.length > 1 ? JSON.stringify(data.photos) : data.photos[0];
        db.prepare("UPDATE chatbot_sessions SET collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
          .run(JSON.stringify(data), phone);

        queuePayload(createTextMessage(phone, `📸 *Photo ${data.photos.length} received!*

You can send another photo, or reply *done* to preview your listing.`));
        await dispatchAll();
        return { phone, action: "PHOTO_RECEIVED", step: "AWAITING_PHOTOS", outboundPayloads };
      } else if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("data:")) {
        data.photos.push(text.trim());
        data.image_url = data.photos.length > 1 ? JSON.stringify(data.photos) : data.photos[0];
        db.prepare("UPDATE chatbot_sessions SET collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
          .run(JSON.stringify(data), phone);

        queuePayload(createTextMessage(phone, `📸 *Photo ${data.photos.length} added!*

Send another photo, or reply *done* to proceed.`));
        await dispatchAll();
        return { phone, action: "PHOTO_RECEIVED", step: "AWAITING_PHOTOS", outboundPayloads };
      } else if (isFinishing || data.photos.length > 0) {
        if (data.photos.length === 0) {
          data.image_url = data.category === "hospitality"
            ? "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80"
            : "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80";
        } else {
          data.image_url = data.photos.length > 1 ? JSON.stringify(data.photos) : data.photos[0];
        }
      } else {
        data.image_url = data.category === "hospitality"
          ? "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80"
          : "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80";
      }

      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_CONFIRMATION', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const summary = `📋 *Listing Preview:*\n\n` +
        `• *Category:* ${data.category === "hospitality" ? "Hospitality / Stay" : "Residential Rental"}\n` +
        `• *Title:* ${data.title}\n` +
        `• *Location:* ${data.suburb}, ${data.city}\n` +
        `• *Type:* ${data.property_type}\n` +
        `• *Rate:* $${data.price} / ${data.rent_cycle}\n` +
        `• *Amenities:* ${data.amenities.join(", ")}\n` +
        `• *Contact:* ${data.contact_phone}\n\n` +
        `Ready to publish live on BunkBy?`;

      queuePayload(
        createButtonMessage(
          phone,
          summary,
          [
            { id: "BTN_CONFIRM_PUBLISH", title: "🚀 Publish Listing" },
            { id: "CMD_CANCEL_LISTING", title: "❌ Cancel" }
          ],
          "Listing Ready",
          "Tap to publish live to BunkBy directory"
        )
      );

      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_CONFIRMATION", outboundPayloads };
    }

    // --- STEP 9: AWAITING_CONFIRMATION -> PUBLISH ---
    if (currentStep === "AWAITING_CONFIRMATION") {
      if (
        buttonPayload === "BTN_CONFIRM_PUBLISH" ||
        buttonPayload === "btn_confirm_publish" ||
        buttonPayload === "CMD_CONFIRM_PUBLISH" ||
        buttonPayload === "PUBLISH_LISTING" ||
        lowerText === "publish listing" ||
        lowerText.includes("publish listing") ||
        lowerText === "publish" ||
        lowerText.includes("publish") ||
        lowerText === "yes" ||
        lowerText === "confirm" ||
        text === "1"
      ) {
        // Idempotency check: prevent duplicate listing within 60s
        const recentExisting = db.prepare(`
          SELECT id FROM listings 
          WHERE landlord_id = ? AND title = ? AND suburb = ? AND created_at >= datetime('now', '-60 seconds')
          ORDER BY id DESC LIMIT 1
        `).get(data.landlord_id || phoneId, data.title, data.suburb) as any;

        let newId: number;
        if (recentExisting) {
          newId = Number(recentExisting.id);
        } else {
          // Insert directly into real listings table!
          const stmt = db.prepare(`
            INSERT INTO listings (
              title, suburb, price, landlord_id, verification_status, image_url, landmark, city, deposit,
              property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities,
              category, business_name, is_premium, listing_tier, expiry_date
            ) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, 'Call / Whatsapp', ?, ?, ?, ?, ?, ?, ?)
          `);

          const isPremium = data.category === "hospitality" ? 1 : 0;
          const tier = isPremium ? "paid" : "free";
          const expiry = isPremium ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : null;

          const result = stmt.run(
            data.title,
            data.suburb,
            Number(data.price),
            data.landlord_id || phoneId,
            data.image_url || null,
            data.landmark || null,
            data.city || "Harare",
            Number(data.deposit || 0),
            data.property_type || "Single Room",
            data.tenant_type || (data.category === "hospitality" ? "Guest" : "General"),
            data.rent_cycle || "Month",
            data.contact_phone || phone,
            JSON.stringify(data.amenities || []),
            data.category || "residential",
            data.business_name || null,
            isPremium,
            tier,
            expiry
          );
          newId = Number(result.lastInsertRowid);
        }

        // Delete session
        db.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").run(phone);
        const liveUrl = `${baseUrl.replace(/\/+$/, "")}/#listing-${newId}`;

        const successMsg = `🎉 *CONGRATULATIONS! Your listing is now LIVE on BunkBy!* (Listing #${newId})\n\n` +
          `🌐 *Live URL:* ${liveUrl}\n\n` +
          `Tenants and visitors across Zimbabwe will now see your accommodation on the website and via WhatsApp chatbot!\n\n` +
          `Type *list* to add another property or *search* to find stays.`;

        queuePayload(
          createButtonMessage(
            phone,
            successMsg,
            [
              { id: "CMD_SEARCH_MENU", title: "🔍 Search Stays" },
              { id: "CMD_START_LISTING", title: "🏡 Add Another" }
            ],
            "Listing Published"
          )
        );

        await dispatchAll();
        return {
          phone,
          action: "LISTING_PUBLISHED",
          createdListingId: newId,
          replyText: successMsg,
          outboundPayloads
        };
      }
    }
  }

  // =========================================================================
  // SEARCH / RETRIEVAL FLOW (Only when NO active session is running!)
  // =========================================================================
  const isSearchIntent =
    !session && (
      lowerText.startsWith("search") ||
      lowerText.startsWith("find") ||
      lowerText.startsWith("show") ||
      lowerText.startsWith("looking for") ||
      lowerText.includes("room") ||
      lowerText.includes("cottage") ||
      lowerText.includes("lodge") ||
      lowerText.includes("apartment") ||
      lowerText.includes("in ") ||
      lowerText.includes("under ") ||
      buttonPayload.startsWith("SEARCH_") ||
      buttonPayload === "CMD_SEARCH_MENU"
    );

  if (isSearchIntent) {
    // If user clicked search button with no query
    if (buttonPayload === "CMD_SEARCH_MENU" || text === "search") {
      const searchPrompt = "🔍 *How to Search BunkBy Stays:*\n\nType whatever you're looking for in plain English!\n\n*Examples:*\n• *rooms in Avondale under $250*\n• *cottage in Belvedere*\n• *lodges in Victoria Falls*\n• *student rooms near UZ with wifi and solar*\n• *guesthouse in Harare under $100*";
      queuePayload(createTextMessage(phone, searchPrompt));
      await dispatchAll();
      return { phone, action: "SEARCH_HELP", replyText: searchPrompt, outboundPayloads };
    }

    // Clean search text
    const cleanSearchText = text.replace(/^(search|find|show|looking for)\s*/i, "").trim();

    // Parse deterministic search criteria
    const filters = parseNaturalLanguageQuery(cleanSearchText || text);

    // Query the database
    const results = searchListings(db, filters, 3);

    if (results.length === 0) {
      const location = filters.suburb || filters.city || cleanSearchText;
      const noResultsMsg = `🏡 No active listings currently found matching *"${location}"*.\n\n` +
        `💡 *Suggestions:*\n` +
        `• Try searching nearby suburbs like *Avonlea*, *Belvedere*, *Avenues*, or *Mt Pleasant*.\n` +
        `• Adjust your price filter (e.g. *under $200*).\n` +
        `• Switch between *residential* or *hospitality*.\n\n` +
        `Are you a landlord or lodge owner in this area? Tap below to list for free!`;

      queuePayload(
        createButtonMessage(
          phone,
          noResultsMsg,
          [
            { id: "CMD_START_LISTING", title: "🏡 Post Listing" },
            { id: "CMD_SEARCH_MENU", title: "🔍 Search Again" }
          ],
          "No Listings Found"
        )
      );

      await dispatchAll();
      return {
        phone,
        action: "SEARCH_RESULTS",
        searchResultsCount: 0,
        replyText: noResultsMsg,
        outboundPayloads
      };
    }

    // Send header intro
    const countMsg = `🏡 *Found ${results.length} active stay${results.length === 1 ? "" : "s"} on BunkBy:*`;
    queuePayload(createTextMessage(phone, countMsg));

    // Send real photographic listing cards
    for (const listing of results) {
      const card = buildListingCard(listing, baseUrl, phone);
      queuePayload(card);
    }

    // Send action navigation footer
    queuePayload(
      createButtonMessage(
        phone,
        `👉 Visit *bunkby.com* for all listings, filters, and maps.`,
        [
          { id: "CMD_SEARCH_MENU", title: "🔍 New Search" },
          { id: "CMD_START_LISTING", title: "🏡 Create a Listing" }
        ],
        "BunkBy Accommodation"
      )
    );

    await dispatchAll();
    return {
      phone,
      action: "SEARCH_RESULTS",
      searchResultsCount: results.length,
      outboundPayloads
    };
  }

  // =========================================================================
  // DEFAULT / WELCOME MENU
  // =========================================================================
  const welcomeMsg = `👋 *Welcome to BunkBy Zimbabwe!*\n\n` +
    `Your independent, agent-free platform connecting you directly with verified landlords and hosts without agency fees.\n\n` +
    `What would you like to do today?`;

  queuePayload(
    createButtonMessage(
      phone,
      welcomeMsg,
      [
        { id: "CMD_SEARCH_MENU", title: "🔍 Find Stays" },
        { id: "CMD_START_LISTING", title: "🏡 Post a Listing" }
      ],
      "BunkBy Zimbabwe",
      "Agent-free Accommodation Marketplace"
    )
  );

  await dispatchAll();
  return {
    phone,
    action: "WELCOME_MENU",
    replyText: welcomeMsg,
    outboundPayloads
  };
}
