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

    const stepMsg = "🏡 *Welcome to BunkBy Listing Assistant!*\n\nLet's get your accommodation or property published to verified tenants, businesses, and guests.\n\n*Step 1/8: Choose Property Category*\n\n1️⃣ 🏠 *Residential Rental* (Room, Cottage, Flat, House)\n2️⃣ 🏨 *Hospitality & Stay* (Lodge, Guesthouse, Hotel, B&B)\n3️⃣ 🏢 *Commercial Property* (Shop, Office, Warehouse, Table)\n4️⃣ 🎓 *Student Accommodation* (Hostel, Boarding House)\n\nReply with number (1, 2, 3, or 4) or tap an option below:";
    queuePayload(
      createButtonMessage(
        phone,
        stepMsg,
        [
          { id: "CAT_RESIDENTIAL", title: "🏠 Residential" },
          { id: "CAT_COMMERCIAL", title: "🏢 Commercial" },
          { id: "CAT_HOSPITALITY", title: "🏨 Hospitality" }
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
      const normPayload = (buttonPayload || "").toLowerCase();
      const normText = lowerText.trim();

      if (normPayload === "cat_commercial" || normText === "3" || normText.includes("commercial") || normText.includes("shop") || normText.includes("office") || normText.includes("warehouse")) {
        category = "commercial";
        data.rent_cycle = "Month";
        data.tenant_type = "Professional";
      } else if (normPayload === "cat_student" || normText === "4" || normText.includes("student") || normText.includes("hostel") || normText.includes("boarding house")) {
        category = "student";
        data.rent_cycle = "Semester";
        data.tenant_type = "Student";
      } else if (normPayload === "cat_hospitality" || normText === "2" || normText.includes("hospitality") || normText.includes("lodge") || normText.includes("hotel") || normText.includes("guest house")) {
        category = "hospitality";
        data.rent_cycle = "Night";
        data.tenant_type = "Guest";
      } else {
        category = "residential";
        data.rent_cycle = "Month";
        data.tenant_type = "General";
      }

      data.category = category;
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      let propMsg = "";
      if (category === "commercial") {
        propMsg = "🏢 *Commercial Space Type:*\n\nReply with the number:\n1️⃣ Commercial Space (Offices / General)\n2️⃣ Retail Shop / Storefront\n3️⃣ Warehouse / Industrial Storage\n4️⃣ Flea Market Table / Booth";
      } else if (category === "student") {
        propMsg = "🎓 *Student Accommodation Type:*\n\nReply with the number:\n1️⃣ Student Hostel\n2️⃣ Boarding House\n3️⃣ Single Student Room\n4️⃣ Shared Student Room";
      } else if (category === "hospitality") {
        propMsg = "🏨 *Hospitality Property Type:*\n\nReply with the number:\n1️⃣ Guest House\n2️⃣ Lodge\n3️⃣ Hotel\n4️⃣ Bed & Breakfast\n5️⃣ Short-Stay Apartment";
      } else {
        propMsg = "🏠 *Residential Property Type:*\n\nReply with the number:\n1️⃣ Single Room\n2️⃣ Cottage\n3️⃣ Bed-sitter\n4️⃣ 2-Room / Flat\n5️⃣ Full House";
      }

      queuePayload(createTextMessage(phone, propMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_PROPERTY_TYPE", outboundPayloads };
    }

    // --- STEP 2: AWAITING_PROPERTY_TYPE ---
    if (currentStep === "AWAITING_PROPERTY_TYPE") {
      let chosenType = "";
      const normPayload = (buttonPayload || "").toLowerCase().trim();
      const normText = text.toLowerCase().trim();

      if (data.category === "commercial") {
        const commMap: Record<string, string> = {
          "1": "Commercial",
          "2": "Shop",
          "3": "Warehouse",
          "4": "Table",
          "ctype_commercial": "Commercial",
          "ctype_shop": "Shop",
          "ctype_warehouse": "Warehouse",
          "ctype_table": "Table"
        };
        chosenType = commMap[normPayload] || commMap[normText] || "";
        if (!chosenType) {
          if (normText.includes("shop") || normText.includes("retail")) chosenType = "Shop";
          else if (normText.includes("warehouse") || normText.includes("storage")) chosenType = "Warehouse";
          else if (normText.includes("table") || normText.includes("booth")) chosenType = "Table";
          else if (normText.includes("commercial") || normText.includes("office")) chosenType = "Commercial";
          else if (text.trim().length >= 2) chosenType = text.trim();
          else chosenType = "Commercial";
        }
      } else if (data.category === "student") {
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
          else if (text.trim().length >= 2) chosenType = text.trim();
          else chosenType = "Student Hostel";
        }
      } else if (data.category === "hospitality") {
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
          "3": "Bed-sitter",
          "4": "2-Room / Flat",
          "5": "Full House",
          "ptype_single": "Single Room",
          "ptype_cottage": "Cottage",
          "ptype_bedsitter": "Bed-sitter",
          "ptype_flat": "2-Room / Flat",
          "single room": "Single Room",
          "cottage": "Cottage",
          "bedsitter": "Bed-sitter",
          "bed-sitter": "Bed-sitter",
          "flat": "2-Room / Flat",
          "apartment": "2-Room / Flat",
          "full house": "Full House"
        };
        chosenType = resMap[normPayload] || resMap[normText] || "";
        if (!chosenType) {
          if (normText.includes("cottage")) chosenType = "Cottage";
          else if (normText.includes("flat") || normText.includes("apartment")) chosenType = "2-Room / Flat";
          else if (normText.includes("sitter") || normText.includes("bedsitter")) chosenType = "Bed-sitter";
          else if (normText.includes("house")) chosenType = "Full House";
          else if (text.trim().length >= 3) chosenType = text.trim();
          else chosenType = "Single Room";
        }
      }

      data.property_type = chosenType;
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_TITLE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      let titleEx = "Cozy Garden Cottage in Avondale";
      if (data.category === "commercial") {
        titleEx = "Prime Retail Storefront in CBD First Street";
      } else if (data.category === "student") {
        titleEx = "Modern Student Hostel Single Room near Campus";
      } else if (data.category === "hospitality") {
        titleEx = "Sunset Safari Lodge Luxury Suite";
      }

      const titleMsg = `📝 *Step 3/8: Property Title / Headline*\n\nGive your listing an attractive headline:\n*Example:* "${titleEx}"`;
      queuePayload(createTextMessage(phone, titleMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_TITLE", outboundPayloads };
    }

    // --- STEP 3: AWAITING_TITLE ---
    if (currentStep === "AWAITING_TITLE") {
      if (!text || text.trim().length < 3) {
        queuePayload(createTextMessage(phone, "⚠️ Please provide a clear headline (at least 3 characters).\n\n*Example:* 'Spacious Cottage in Avonlea with Solar'"));
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_TITLE", outboundPayloads };
      }
      data.title = text.trim();
      if (data.category === "hospitality") {
        data.business_name = text.trim();
      }
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_SUBURB', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const suburbMsg = `📍 *Step 4/8: Locality / Suburb*\n\nIn which suburb or neighborhood is the property situated?\n*Examples:* Avondale, Mt Pleasant, Belvedere, Victoria Falls, CBD`;
      queuePayload(createTextMessage(phone, suburbMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_SUBURB", outboundPayloads };
    }

    // --- STEP 4: AWAITING_SUBURB ---
    if (currentStep === "AWAITING_SUBURB") {
      if (!text || text.trim().length < 2) {
        queuePayload(createTextMessage(phone, "⚠️ Please provide a valid suburb or area name."));
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_SUBURB", outboundPayloads };
      }
      data.suburb = text.trim();
      data.city = data.city || "Harare";
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_PRICE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const priceLabel = data.category === "hospitality" ? "Rate per night" : "Rent per month";
      const priceMsg = `💵 *Step 5/8: ${priceLabel} (in USD)*\n\nEnter just the number (e.g. *120* or *350*):`;
      queuePayload(createTextMessage(phone, priceMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_PRICE", outboundPayloads };
    }

    // --- STEP 5: AWAITING_PRICE ---
    if (currentStep === "AWAITING_PRICE") {
      const parsedPrice = parseFloat(text.replace(/[^0-9.]/g, ""));
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        queuePayload(createTextMessage(phone, "⚠️ Please enter a valid price (e.g. 150)."));
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_PRICE", outboundPayloads };
      }
      data.price = parsedPrice;
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_IMAGE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const imageMsg = `📸 *Step 6/8: Property Photo*\n\nSend a photograph of the property or room directly into this chat.\n\n_(Or reply *skip* if you do not have a photo right now)_`;
      queuePayload(createTextMessage(phone, imageMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_IMAGE", outboundPayloads };
    }

    // --- STEP 6: AWAITING_IMAGE ---
    if (currentStep === "AWAITING_IMAGE") {
      let imageUrl = "";
      if (input.mediaId) {
        imageUrl = input.mediaId;
      } else if (text.trim().startsWith("http://") || text.trim().startsWith("https://")) {
        imageUrl = text.trim();
      } else if (lowerText === "skip" || lowerText === "none") {
        imageUrl = "";
      }
      data.image_url = imageUrl;
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_LANDMARK', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const landmarkMsg = `📍 *Step 7/8: Nearest Landmark / Key Feature*\n\nWhat is nearby to help people identify the location?\n*Examples:* Near Shopping Centre, Opposite Secondary School, Near UZ Campus`;
      queuePayload(createTextMessage(phone, landmarkMsg));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_LANDMARK", outboundPayloads };
    }

    // --- STEP 7: AWAITING_LANDMARK ---
    if (currentStep === "AWAITING_LANDMARK") {
      data.landmark = text.trim();
      data.amenities = data.amenities || ["Borehole", "Solar Power Backup"];
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_CONFIRMATION', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const catLabel = data.category === "commercial" 
        ? "Commercial Property" 
        : data.category === "student" 
        ? "Student Accommodation" 
        : data.category === "hospitality" 
        ? "Hospitality & Stay" 
        : "Residential Rental";

      const summaryMsg = `📋 *Step 8/8: Confirm Your Listing*\n\n` +
        `• *Category:* ${catLabel}\n` +
        `• *Type:* ${data.property_type}\n` +
        `• *Headline:* ${data.title}\n` +
        `• *Suburb:* ${data.suburb}\n` +
        `• *Price:* $${data.price} / ${data.category === "hospitality" ? "Night" : "Month"}\n` +
        `• *Contact:* ${phone}\n\n` +
        `Ready to publish? Tap *Publish Listing* or reply *1*!`;

      queuePayload(
        createButtonMessage(
          phone,
          summaryMsg,
          [
            { id: "BTN_CONFIRM_PUBLISH", title: "🚀 Publish Live" },
            { id: "CMD_CANCEL", title: "❌ Cancel" }
          ],
          "Publish to BunkBy"
        )
      );
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_CONFIRMATION", outboundPayloads };
    }

    // --- STEP 8: AWAITING_CONFIRMATION -> PUBLISH ---
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

          const resolvedCategory = data.category || (
            ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(data.property_type)
              ? "hospitality"
              : ["Commercial", "Shop", "Warehouse", "Table", "Office"].includes(data.property_type)
              ? "commercial"
              : ["Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"].includes(data.property_type) || data.tenant_type === "Student"
              ? "student"
              : "residential"
          );

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
            data.tenant_type || (resolvedCategory === "commercial" ? "Professional" : resolvedCategory === "student" ? "Student" : resolvedCategory === "hospitality" ? "Guest" : "General"),
            data.rent_cycle || (resolvedCategory === "hospitality" ? "Night" : "Month"),
            data.contact_phone || phone,
            JSON.stringify(data.amenities || ["Borehole", "Solar Power Backup"]),
            resolvedCategory,
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
      const searchPrompt = "🔍 *How to Search BunkBy Stays:*\n\nType whatever you're looking for in plain English!\n\n*Examples:*\n• *rooms in Avondale under $250*\n• *cottage in Belvedere*\n• *lodges in Victoria Falls*\n• *shops in Harare CBD*\n• *student rooms near UZ with wifi and solar*\n• *guesthouse in Harare under $100*";
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
        `• Switch between *residential*, *commercial*, or *hospitality*.\n\n` +
        `Are you a landlord or property owner in this area? Tap below to list for free!`;

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
  const welcomeMsg = `👋 *Welcome to BunkBy!*\n\n` +
    `Your independent, agent-free platform connecting you directly with verified landlords and hosts for *residential rentals, commercial properties, and hospitality stays* without agency fees.\n\n` +
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
      "Property & Accommodation Marketplace"
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
