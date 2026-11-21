import type { Database } from "better-sqlite3";
import { issueLandlordPinResetCodeSync } from "./pinReset";
import {
  SEARCH_PAGE_SIZE,
  parseIncomingWhatsAppWebhook,
  parseNaturalLanguageQuery,
  searchListingsPaginated,
  encodeSearchPaginationId,
  parseSearchPaginationId,
  buildListingCard,
  extractValidListingImages,
  createTextMessage,
  createButtonMessage,
  createListMessage,
  sendWhatsAppMessage,
  WhatsAppMessagePayload,
  ParsedWhatsAppInput,
  SearchFilters
} from "./whatsappService";

export interface BotProcessResult {
  phone: string;
  action: string;
  replyText?: string;
  outboundPayloads: WhatsAppMessagePayload[];
  searchResultsCount?: number;
  totalMatching?: number;
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
 * Ensures chatbot_sessions and whatsapp_search_state tables exist in the database
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

  db.prepare(`
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

  const outboundRawPhotos: Array<string | null> = [];

  // Helper to append a payload
  const queuePayload = (payload: WhatsAppMessagePayload, rawPhoto?: string | null) => {
    outboundPayloads.push(payload);
    outboundRawPhotos.push(rawPhoto || null);
  };

  // Helper to dispatch queued payloads to Meta
  const dispatchAll = async () => {
    console.log(`[WhatsApp Engine Dispatch] Dispatching ${outboundPayloads.length} response message(s) to ${sanitizedSender}`);
    for (let i = 0; i < outboundPayloads.length; i++) {
      const p = outboundPayloads[i];
      const rawPhoto = outboundRawPhotos[i];
      const res = await sendWhatsAppMessage(p, metaConfig ? { ...metaConfig, rawPhoto } : { rawPhoto });
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
  // COMMAND: LANDLORD SECURITY PIN RESET VIA WHATSAPP
  // =========================================================================
  const pinResetPhrases = [
    "reset pin",
    "pin reset",
    "forgot pin",
    "reset my pin",
    "forgot my pin",
    "landlord pin reset",
    "reset landlord pin"
  ];
  const isPinResetRequest =
    buttonPayload === "CMD_RESET_PIN" ||
    pinResetPhrases.includes(lowerText) ||
    /\b(reset|forgot)\s+(my\s+)?(landlord\s+|account\s+|security\s+)*pin\b/i.test(lowerText);

  if (isPinResetRequest) {
    const resetResult = issueLandlordPinResetCodeSync(db, phone);
    let pinMsg = "";
    let pinAction = "PIN_RESET_ACCOUNT_NOT_FOUND";

    if (resetResult.ok) {
      pinMsg =
        `🔐 *BunkBy Security PIN Reset*\n\n` +
        `Your one-time verification code is:\n\n` +
        `*${resetResult.code}*\n\n` +
        `• Valid for *${resetResult.expiresMinutes} minutes*\n` +
        `• Single use only\n` +
        `• Do not share this code with anyone\n\n` +
        `Return to the BunkBy website, enter this 6-digit code, and set your new Security PIN.`;
      pinAction = "PIN_RESET_CODE_ISSUED";
    } else if (resetResult.reason === "RATE_LIMITED") {
      pinMsg =
        `⏳ *Too Many Reset Requests*\n\n` +
        `You have reached the hourly limit for PIN reset codes. Please wait about *${resetResult.retryMinutes || 15} minutes* before requesting a new code.`;
      pinAction = "PIN_RESET_RATE_LIMITED";
    } else {
      pinMsg =
        `ℹ️ *No Landlord Account Found*\n\n` +
        `We could not find a BunkBy landlord account registered with this WhatsApp number.\n\n` +
        `If you registered using a different phone number, please send *RESET PIN* from that WhatsApp number, or create a new landlord account on the BunkBy website.`;
    }

    queuePayload(createTextMessage(phone, pinMsg));
    await dispatchAll();
    return {
      phone,
      action: pinAction,
      replyText: pinMsg,
      outboundPayloads
    };
  }

  // =========================================================================
  // COMMAND: UNIVERSAL CANCEL / RESET / EXIT (Works at ANY step)
  // =========================================================================
  const cancelPhrases = [
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
  const cancelPayloads = ["BTN_CANCEL", "CMD_CANCEL", "CMD_CANCEL_LISTING", "SEARCH_CANCEL"];

  if (
    cancelPhrases.includes(lowerText) ||
    cancelPayloads.includes(buttonPayload)
  ) {
    if (session) {
      db.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").run(phone);
    }
    db.prepare("DELETE FROM whatsapp_search_state WHERE phone_number = ?").run(phone);
    const cancelMsg = "🚫 *Your current session has been cancelled.* No listing was published.\n\nWhat would you like to do next?";
    queuePayload(
      createButtonMessage(
        phone,
        cancelMsg,
        [
          { id: "CMD_SEARCH_MENU", title: "🔍 Search Stays" },
          { id: "CMD_START_LISTING", title: "🏡 Post Property" },
          { id: "CMD_MY_LISTINGS", title: "📋 My Listings" }
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

  // Helper: Execute scalable paginated search (5 listings per page) & persist per-user cursor/seen state
  const executeAndSendSearchPage = async (opts: {
    filters: SearchFilters;
    displayQuery: string;
    categoryLabel?: string;
    requestedOffset: number;
    pagePayloadId?: string;
  }): Promise<BotProcessResult> => {
    const cleanQ = (opts.displayQuery || "").trim();
    const catToken = opts.filters.category && opts.filters.category !== "all" ? opts.filters.category : "";
    const propTypeToken = opts.filters.propertyType || "";
    const canonicalFilters = {
      category: catToken || "all",
      propertyType: propTypeToken,
      city: opts.filters.city || "",
      suburb: opts.filters.suburb || "",
      minPrice: opts.filters.minPrice ?? null,
      maxPrice: opts.filters.maxPrice ?? null,
      amenities: opts.filters.amenities || [],
      query: cleanQ.toLowerCase()
    };
    const searchKey = JSON.stringify(canonicalFilters);

    const existingState = db
      .prepare("SELECT * FROM whatsapp_search_state WHERE phone_number = ?")
      .get(phone) as any;

    // 1. Protect against accidental repeated taps on an already-dispatched Next button
    if (
      opts.pagePayloadId &&
      existingState &&
      existingState.search_key === searchKey &&
      (existingState.last_page_payload === opts.pagePayloadId || opts.requestedOffset < Number(existingState.dispatched_count || 0))
    ) {
      const dispatched = Number(existingState.dispatched_count || 0);
      const total = Number(existingState.total_matching || dispatched);
      if (dispatched < total) {
        const nextBtnId = encodeSearchPaginationId(dispatched, catToken || "all", propTypeToken, cleanQ);
        const dupNotice = `ℹ️ *Results 1–${dispatched} of ${total} were already sent above.*\nTap *Next 5 Results* below to view the next batch (${total - dispatched} remaining), or start a new search.`;
        queuePayload(
          createButtonMessage(
            phone,
            dupNotice,
            [
              { id: nextBtnId, title: "⏩ Next 5 Results" },
              { id: "CMD_SEARCH_MENU", title: "🔍 New Search" },
              { id: "CMD_START_LISTING", title: "🏡 Post Property" }
            ],
            "Search Navigation"
          )
        );
      } else {
        const doneNotice = `✅ *All ${total} matching properties have already been sent above.*`;
        queuePayload(
          createButtonMessage(
            phone,
            doneNotice,
            [
              { id: "CMD_SEARCH_MENU", title: "🔍 New Search" },
              { id: "CMD_MY_LISTINGS", title: "📋 My Listings" },
              { id: "CMD_START_LISTING", title: "🏡 Post Property" }
            ],
            "End of Results"
          )
        );
      }
      await dispatchAll();
      return {
        phone,
        action: "SEARCH_DUPLICATE_PAGE_GUARDED",
        searchResultsCount: 0,
        totalMatching: total,
        outboundPayloads
      };
    }

    // 2. Build DB query filters (use keyset cursor + seen IDs when advancing from stored state)
    const queryFilters: SearchFilters = { ...opts.filters };
    let priorSeenIds: number[] = [];
    let startIndexOffset = opts.requestedOffset;

    if (
      opts.requestedOffset > 0 &&
      existingState &&
      existingState.search_key === searchKey &&
      opts.requestedOffset === Number(existingState.dispatched_count || 0)
    ) {
      try {
        priorSeenIds = JSON.parse(existingState.seen_ids || "[]");
      } catch {
        priorSeenIds = [];
      }
      if (existingState.cursor_created_at && existingState.cursor_id !== null && existingState.cursor_id !== undefined) {
        queryFilters.cursorIsPremium = Number(existingState.cursor_is_premium ?? 0);
        queryFilters.cursorCreatedAt = String(existingState.cursor_created_at);
        queryFilters.cursorId = Number(existingState.cursor_id);
      } else {
        queryFilters.offset = opts.requestedOffset;
      }
      queryFilters.excludeIds = priorSeenIds;
      startIndexOffset = Number(existingState.dispatched_count || opts.requestedOffset);
    } else if (opts.requestedOffset > 0) {
      // Check if an older state exists or if this is a stateless PAGE_ jump
      if (existingState && existingState.search_key === searchKey) {
        try {
          priorSeenIds = JSON.parse(existingState.seen_ids || "[]");
        } catch {
          priorSeenIds = [];
        }
        queryFilters.excludeIds = priorSeenIds;
      }
      queryFilters.offset = opts.requestedOffset;
    } else {
      // Fresh search resets prior search state for this phone number
      db.prepare("DELETE FROM whatsapp_search_state WHERE phone_number = ?").run(phone);
    }

    const pageRes = searchListingsPaginated(db, queryFilters, SEARCH_PAGE_SIZE);
    const { results, totalMatching, nextCursor, hasMore } = pageRes;

    const locDisplay = cleanQ || "All Locations";
    const catNote = opts.categoryLabel
      ? ` (${opts.categoryLabel})`
      : propTypeToken
      ? ` (${propTypeToken})`
      : catToken
      ? ` (${catToken})`
      : "";
    const locNote = cleanQ && cleanQ.toLowerCase() !== "all" ? ` in "${cleanQ}"` : "";

    if (results.length === 0) {
      const noResultsMsg =
        opts.requestedOffset > 0
          ? `✅ *You have reached the end of all matching listings${catNote}${locNote}.*\n\nTap *New Search* to refine your search or explore another area.`
          : `🏡 No active${catNote} listings found${locNote ? locNote : ` in *"${locDisplay}"*`}.\n\n💡 *Try:* Broadening your area (e.g. *Harare*, *Bulawayo*, or *All Locations*), switching category, or posting a listing for free.`;
      queuePayload(
        createButtonMessage(
          phone,
          noResultsMsg,
          [
            { id: "CMD_SEARCH_MENU", title: "🔍 New Search" },
            { id: "CMD_START_LISTING", title: "🏡 Post Property" }
          ],
          opts.requestedOffset > 0 ? "End of Results" : "No Listings Found"
        )
      );
      await dispatchAll();
      return {
        phone,
        action: opts.requestedOffset > 0 ? "SEARCH_END_OF_RESULTS" : "SEARCH_RESULTS",
        searchResultsCount: 0,
        totalMatching,
        replyText: noResultsMsg,
        outboundPayloads
      };
    }

    const startNum = startIndexOffset + 1;
    const endNum = startIndexOffset + results.length;
    const newSeenIds = Array.from(new Set([...priorSeenIds, ...results.map(r => Number(r.id))]));
    const updatedDispatched = opts.requestedOffset > 0 ? startIndexOffset + results.length : results.length;
    const realHasMore = hasMore && updatedDispatched < totalMatching;

    db.prepare(`
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
    `).run(
      phone,
      searchKey,
      JSON.stringify(opts.filters),
      totalMatching,
      updatedDispatched,
      nextCursor ? nextCursor.is_premium : 0,
      nextCursor ? nextCursor.created_at : null,
      nextCursor ? nextCursor.id : null,
      JSON.stringify(newSeenIds),
      opts.pagePayloadId || ""
    );

    const headerMsg = `🏡 *Showing ${startNum}–${endNum} of ${totalMatching}${catNote}${locNote}:*`;
    queuePayload(createTextMessage(phone, headerMsg, false));

    for (let i = 0; i < results.length; i++) {
      const listing = results[i];
      const validPhotos = extractValidListingImages(listing.image_url);
      queuePayload(
        buildListingCard(listing, baseUrl, phone, startNum + i),
        validPhotos[0] || null
      );
    }

    const navButtons: Array<{ id: string; title: string }> = [];
    if (realHasMore) {
      const nextId = encodeSearchPaginationId(updatedDispatched, catToken || "all", propTypeToken, cleanQ);
      navButtons.push({ id: nextId, title: "⏩ Next 5 Results" });
      navButtons.push({ id: "CMD_SEARCH_MENU", title: "🔍 New Search" });
      navButtons.push({ id: "CMD_START_LISTING", title: "🏡 Post Property" });
    } else {
      navButtons.push({ id: "CMD_SEARCH_MENU", title: "🔍 New Search" });
      navButtons.push({ id: "CMD_MY_LISTINGS", title: "📋 My Listings" });
      navButtons.push({ id: "CMD_START_LISTING", title: "🏡 Post Property" });
    }

    const remaining = Math.max(0, totalMatching - endNum);
    const footerText = realHasMore
      ? `📄 *Showing ${startNum}–${endNum} of ${totalMatching}* (${remaining} more available).\nTap *Next 5 Results* below or visit *bunkby.com* for maps & full galleries.`
      : `✅ *End of results (${endNum} of ${totalMatching} shown).*\nVisit *bunkby.com* to see full galleries or refine your search.`;

    queuePayload(
      createButtonMessage(
        phone,
        footerText,
        navButtons,
        "BunkBy Search"
      )
    );

    await dispatchAll();
    return {
      phone,
      action: "SEARCH_RESULTS",
      searchResultsCount: results.length,
      totalMatching,
      replyText: headerMsg,
      outboundPayloads
    };
  };

  // Helper: Send 4-category Interactive List for Listing Creation
  const queueListingCategoryMenu = (bodyText: string) => {
    queuePayload(
      createListMessage(
        phone,
        "Post on BunkBy",
        bodyText,
        "Choose Category",
        [
          {
            title: "Property Categories",
            rows: [
              { id: "CAT_RESIDENTIAL", title: "Residential Rentals", description: "Rooms, cottages, flats & full houses" },
              { id: "CAT_HOSPITALITY", title: "Hospitality & Stays", description: "Guesthouses, lodges, hotels & B&Bs" },
              { id: "CAT_COMMERCIAL", title: "Commercial Properties", description: "Shops, offices, warehouses & market tables" },
              { id: "CAT_STUDENT", title: "Student Accommodation", description: "Student hostels, boarding houses & rooms" }
            ]
          },
          {
            title: "Options",
            rows: [
              { id: "BTN_CANCEL", title: "❌ Cancel Session", description: "Cancel listing and return to main menu" }
            ]
          }
        ],
        "Select a category or reply CANCEL anytime"
      )
    );
  };

  // Helper: Send Subtype Interactive List for any category
  const queuePropertyTypeMenu = (category: string, bodyText: string) => {
    if (category === "commercial") {
      queuePayload(
        createListMessage(
          phone,
          "Commercial Space Type",
          bodyText,
          "Choose Space Type",
          [
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
        )
      );
    } else if (category === "student") {
      queuePayload(
        createListMessage(
          phone,
          "Student Accommodation",
          bodyText,
          "Choose Space Type",
          [
            {
              title: "Student Housing Types",
              rows: [
                { id: "STYPE_HOSTEL", title: "Student Hostel", description: "Purpose-built student hostel accommodation" },
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
        )
      );
    } else if (category === "hospitality") {
      queuePayload(
        createListMessage(
          phone,
          "Hospitality & Stays",
          bodyText,
          "Choose Stay Type",
          [
            {
              title: "Hospitality Types",
              rows: [
                { id: "HTYPE_GUESTHOUSE", title: "Guesthouse", description: "Private guesthouse accommodation" },
                { id: "HTYPE_LODGE_GH", title: "Lodge / Guesthouse", description: "Lodge & guesthouse property" },
                { id: "HTYPE_LODGE", title: "Lodge", description: "Safari, bush or holiday lodge" },
                { id: "HTYPE_HOTEL", title: "Hotel", description: "Hotel room or suite" },
                { id: "HTYPE_BNB", title: "Bed & Breakfast", description: "Cozy B&B with morning breakfast" }
              ]
            },
            {
              title: "Options",
              rows: [
                { id: "BTN_CANCEL", title: "❌ Cancel", description: "Exit listing and return to main menu" }
              ]
            }
          ]
        )
      );
    } else {
      queuePayload(
        createListMessage(
          phone,
          "Residential Property",
          bodyText,
          "Select Property Type",
          [
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
                { id: "RTYPE_SALE", title: "House Sale", description: "Property available for sale" }
              ]
            },
            {
              title: "Options",
              rows: [
                { id: "BTN_CANCEL", title: "❌ Cancel", description: "Exit listing and return to main menu" }
              ]
            }
          ]
        )
      );
    }
  };

  // Helper: Send 4-category Interactive List for Property Search
  const queueSearchCategoryMenu = (bodyText: string) => {
    queuePayload(
      createListMessage(
        phone,
        "Search BunkBy",
        bodyText,
        "Choose Category",
        [
          {
            title: "Property Categories",
            rows: [
              { id: "SEARCH_CAT_RESIDENTIAL", title: "Residential Rentals", description: "Rooms, cottages, flats & houses" },
              { id: "SEARCH_CAT_HOSPITALITY", title: "Hospitality & Stays", description: "Guesthouses, lodges, hotels & B&Bs" },
              { id: "SEARCH_CAT_COMMERCIAL", title: "Commercial Properties", description: "Shops, offices, warehouses & stalls" },
              { id: "SEARCH_CAT_STUDENT", title: "Student Accommodation", description: "Hostels, boarding houses & rooms" }
            ]
          },
          {
            title: "Options",
            rows: [
              { id: "BTN_CANCEL", title: "❌ Cancel Search", description: "Exit search and return to main menu" }
            ]
          }
        ],
        "Or type e.g. 'shops in Harare' anytime"
      )
    );
  };

  // Helper: Send Commercial Subtype Filter List for Search
  const queueSearchCommercialSubtypeMenu = (bodyText: string) => {
    queuePayload(
      createListMessage(
        phone,
        "Commercial Search",
        bodyText,
        "Choose Space Type",
        [
          {
            title: "Commercial Subtypes",
            rows: [
              { id: "SEARCH_SUBTYPE_ALL", title: "All Commercial Spaces", description: "Show shops, offices, warehouses & tables" },
              { id: "SEARCH_SUBTYPE_SHOP", title: "Retail Shops", description: "Shops, boutiques & storefronts (Shop)" },
              { id: "SEARCH_SUBTYPE_COMMERCIAL", title: "Offices / Commercial", description: "Office suites & general commercial spaces" },
              { id: "SEARCH_SUBTYPE_WAREHOUSE", title: "Warehouses", description: "Industrial warehouses & storage spaces" },
              { id: "SEARCH_SUBTYPE_TABLE", title: "Market Stalls / Tables", description: "Flea market tables, stalls & booths" }
            ]
          },
          {
            title: "Options",
            rows: [
              { id: "BTN_CANCEL", title: "❌ Cancel Search", description: "Exit search and return to main menu" }
            ]
          }
        ]
      )
    );
  };

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
      lowerText === "host"
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

    const stepMsg = "🏡 *Welcome to BunkBy Listing Assistant!*\n\nLet's get your property published directly with zero agent fees.\n\n*Step 1/8: Choose Property Category*\nTap *Choose Category* below to select from:\n• Residential Rentals\n• Hospitality & Stays\n• Commercial Properties\n• Student Accommodation";
    queueListingCategoryMenu(stepMsg);

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
  // ACTIVE CONVERSATION STATE MACHINE (LISTING & GUIDED SEARCH)
  // =========================================================================
  if (session) {
    const currentStep = session.current_step;
    let data: any = {};
    try {
      data = JSON.parse(session.collected_data || "{}");
    } catch {
      data = {};
    }

    // --- SEARCH STEP 1: AWAITING_SEARCH_CATEGORY ---
    if (currentStep === "AWAITING_SEARCH_CATEGORY") {
      const normPayload = (buttonPayload || "").toUpperCase().trim();
      const normInput = lowerText.trim();

      let chosenCategory = "";
      let categoryLabel = "";

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
        const retryMsg = "⚠️ Please tap *Choose Category* below to select the type of property you are looking for:";
        queueSearchCategoryMenu(retryMsg);
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_SEARCH_CATEGORY", replyText: retryMsg, outboundPayloads };
      }

      if (chosenCategory === "commercial") {
        const nextData = { searchCategory: "commercial", categoryLabel };
        db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_SEARCH_SUBTYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
          .run(JSON.stringify(nextData), phone);

        const subMsg = "🏢 *Commercial Properties Selected*\n\nWhich type of commercial space are you searching for?\n\nTap *Choose Space Type* below to pick a specific subtype or view all commercial properties:";
        queueSearchCommercialSubtypeMenu(subMsg);
        await dispatchAll();
        return { phone, action: "SEARCH_PROMPT_SUBTYPE", step: "AWAITING_SEARCH_SUBTYPE", replyText: subMsg, outboundPayloads };
      }

      const nextData = { searchCategory: chosenCategory, categoryLabel, searchPropertyType: "" };
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_SEARCH_QUERY', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(nextData), phone);

      const locEx = chosenCategory === "hospitality"
        ? "*Victoria Falls*, *Harare*, or *Bulawayo*"
        : chosenCategory === "student"
        ? "*Mt Pleasant*, *Bulawayo*, or *Gweru*"
        : "*Avondale*, *Harare*, or *Belvedere*";
      const locMsg = `✅ *Category:* ${categoryLabel}\n\n📍 Enter the *City, Town, or Suburb* you are looking in (e.g. ${locEx}), or tap *All Locations* below:`;
      queuePayload(
        createButtonMessage(
          phone,
          locMsg,
          [
            { id: "SEARCH_LOC_ALL", title: "🌍 All Locations" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ],
          "Location Filter"
        )
      );
      await dispatchAll();
      return { phone, action: "SEARCH_PROMPT_LOCATION", step: "AWAITING_SEARCH_QUERY", replyText: locMsg, outboundPayloads };
    }

    // --- SEARCH STEP 1B: AWAITING_SEARCH_SUBTYPE (Commercial Subtype Filter) ---
    if (currentStep === "AWAITING_SEARCH_SUBTYPE") {
      const normPayload = (buttonPayload || "").toUpperCase().trim();
      const normInput = lowerText.trim();

      let subtype = "";
      let subtypeLabel = "All Commercial Spaces";

      if (normPayload === "SEARCH_SUBTYPE_ALL" || normInput === "1" || normInput === "all") {
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
        const retryMsg = "⚠️ Please tap *Choose Space Type* to select the commercial property subtype:";
        queueSearchCommercialSubtypeMenu(retryMsg);
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_SEARCH_SUBTYPE", replyText: retryMsg, outboundPayloads };
      }

      data.searchCategory = "commercial";
      data.searchPropertyType = subtype;
      data.categoryLabel = subtypeLabel;
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_SEARCH_QUERY', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const locMsg = `✅ *Commercial Filter:* ${subtypeLabel}\n\n📍 Enter the *City or Suburb* (e.g. *Harare*, *CBD*, *Bulawayo*), or tap *All Locations* below:`;
      queuePayload(
        createButtonMessage(
          phone,
          locMsg,
          [
            { id: "SEARCH_LOC_ALL", title: "🌍 All Locations" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ],
          "Location Filter"
        )
      );
      await dispatchAll();
      return { phone, action: "SEARCH_PROMPT_LOCATION", step: "AWAITING_SEARCH_QUERY", replyText: locMsg, outboundPayloads };
    }

    // --- SEARCH STEP 2: AWAITING_SEARCH_QUERY ---
    if (currentStep === "AWAITING_SEARCH_QUERY") {
      const searchCategory = (data.searchCategory || "all") as any;
      const searchPropertyType = data.searchPropertyType || undefined;
      const categoryLabel = data.categoryLabel || "Properties";

      db.prepare("DELETE FROM chatbot_sessions WHERE phone_number = ?").run(phone);

      const isAllLoc = buttonPayload === "SEARCH_LOC_ALL" || lowerText === "all" || lowerText === "any";
      const cleanQuery = isAllLoc ? "" : text.replace(/^(search|find|show|looking for)\s*/i, "").trim();

      const filters: SearchFilters = cleanQuery
        ? parseNaturalLanguageQuery(cleanQuery)
        : { rawQuery: "all", category: searchCategory };

      filters.category = searchCategory;
      if (searchPropertyType) {
        filters.propertyType = searchPropertyType;
      }

      return await executeAndSendSearchPage({
        filters,
        displayQuery: cleanQuery,
        categoryLabel,
        requestedOffset: 0
      });
    }

    // --- LISTING STEP 1: AWAITING_CATEGORY ---
    if (currentStep === "AWAITING_CATEGORY") {
      let category = "";
      const normPayload = (buttonPayload || "").toLowerCase();
      const normText = lowerText.trim();

      if (normPayload === "cat_commercial" || normText === "3" || normText.includes("commercial") || normText.includes("shop") || normText.includes("office") || normText.includes("warehouse") || normText.includes("stall") || normText.includes("table")) {
        category = "commercial";
        data.rent_cycle = "Month";
        data.tenant_type = "Professional";
      } else if (normPayload === "cat_student" || normText === "4" || normText.includes("student") || normText.includes("hostel") || normText.includes("boarding house")) {
        category = "student";
        data.rent_cycle = "Semester";
        data.tenant_type = "Student";
      } else if (normPayload === "cat_hospitality" || normText === "2" || normText.includes("hospitality") || normText.includes("lodge") || normText.includes("hotel") || normText.includes("guesthouse") || normText.includes("guest house") || normText.includes("b&b")) {
        category = "hospitality";
        data.rent_cycle = "Night";
        data.tenant_type = "Guest";
      } else if (normPayload === "cat_residential" || normText === "1" || normText.includes("residential") || normText.includes("room") || normText.includes("cottage") || normText.includes("flat") || normText.includes("house")) {
        category = "residential";
        data.rent_cycle = "Month";
        data.tenant_type = "General";
      }

      if (!category) {
        const retryMsg = "⚠️ Please tap *Choose Category* below to pick your property category:";
        queueListingCategoryMenu(retryMsg);
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_CATEGORY", replyText: retryMsg, outboundPayloads };
      }

      data.category = category;
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_PROPERTY_TYPE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      let propMsg = "";
      if (category === "commercial") {
        propMsg = "🏢 *Commercial Properties Selected*\n\n*Step 2/8: Choose Commercial Space Type*\nTap *Choose Space Type* below to pick:\n• Retail Shop\n• Offices / Commercial\n• Warehouse\n• Market Stall / Table";
      } else if (category === "student") {
        propMsg = "🎓 *Student Accommodation Selected*\n\n*Step 2/8: Choose Student Space Type*\nTap *Choose Space Type* below:";
      } else if (category === "hospitality") {
        propMsg = "🏨 *Hospitality & Stays Selected*\n\n*Step 2/8: Choose Stay Type*\nTap *Choose Stay Type* below:";
      } else {
        propMsg = "🏠 *Residential Rentals Selected*\n\n*Step 2/8: Choose Property Type*\nTap *Select Property Type* below:";
      }

      queuePropertyTypeMenu(category, propMsg);
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_PROPERTY_TYPE", replyText: propMsg, outboundPayloads };
    }

    // --- LISTING STEP 2: AWAITING_PROPERTY_TYPE ---
    if (currentStep === "AWAITING_PROPERTY_TYPE") {
      let chosenType = "";
      const normPayload = (buttonPayload || "").toLowerCase().trim();
      const normText = text.toLowerCase().trim();

      if (data.category === "commercial") {
        const commMap: Record<string, string> = {
          "1": "Shop",
          "2": "Commercial",
          "3": "Warehouse",
          "4": "Table",
          "ctype_commercial": "Commercial",
          "ctype_shop": "Shop",
          "ctype_warehouse": "Warehouse",
          "ctype_table": "Table"
        };
        chosenType = commMap[normPayload] || commMap[normText] || "";
        if (!chosenType) {
          if (normText.includes("shop") || normText.includes("retail") || normText.includes("storefront")) chosenType = "Shop";
          else if (normText.includes("warehouse") || normText.includes("storage")) chosenType = "Warehouse";
          else if (normText.includes("table") || normText.includes("booth") || normText.includes("stall") || normText.includes("market")) chosenType = "Table";
          else if (normText.includes("commercial") || normText.includes("office")) chosenType = "Commercial";
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
        }
      } else if (data.category === "hospitality") {
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
          else if (normText.includes("guest")) chosenType = "Guesthouse";
          else if (normText.includes("lodge")) chosenType = "Lodge";
          else if (normText.includes("hotel")) chosenType = "Hotel";
          else if (normText.includes("b&b") || normText.includes("bed")) chosenType = "Bed & Breakfast";
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
          "rtype_sale": "House Sale",
          "ptype_single": "Single Room",
          "ptype_cottage": "Cottage",
          "ptype_flat": "Apartment / Flat",
          "single room": "Single Room",
          "cottage": "Cottage",
          "2 rooms": "2 rooms",
          "3 rooms": "3 rooms",
          "flat": "Apartment / Flat",
          "apartment": "Apartment / Flat",
          "apartment / flat": "Apartment / Flat",
          "townhouse / cluster": "Townhouse / Cluster",
          "shared space": "Shared Space",
          "house sale": "House Sale",
          "full house": "Full house"
        };
        chosenType = resMap[normPayload] || resMap[normText] || "";
        if (!chosenType) {
          if (normText.includes("cottage")) chosenType = "Cottage";
          else if (normText.includes("2 room")) chosenType = "2 rooms";
          else if (normText.includes("3 room")) chosenType = "3 rooms";
          else if (normText.includes("townhouse") || normText.includes("cluster")) chosenType = "Townhouse / Cluster";
          else if (normText.includes("flat") || normText.includes("apartment")) chosenType = "Apartment / Flat";
          else if (normText.includes("shared")) chosenType = "Shared Space";
          else if (normText.includes("sale")) chosenType = "House Sale";
          else if (normText.includes("house")) chosenType = "Full house";
          else if (normText.includes("single") || normText === "room") chosenType = "Single Room";
        }
      }

      if (!chosenType) {
        const retryMsg = "⚠️ Please choose a property type from the list below:";
        queuePropertyTypeMenu(data.category || "residential", retryMsg);
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_PROPERTY_TYPE", replyText: retryMsg, outboundPayloads };
      }

      data.property_type = chosenType;
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_TITLE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      let titleEx = "Cozy Garden Cottage in Avondale";
      if (data.category === "commercial") {
        titleEx = chosenType === "Shop"
          ? "Prime Retail Shop on First Street CBD"
          : chosenType === "Warehouse"
          ? "Spacious Industrial Warehouse in Msasa"
          : chosenType === "Table"
          ? "Busy Flea Market Table / Stall in Town"
          : "Modern Office Suite in Avondale";
      } else if (data.category === "student") {
        titleEx = "Modern Student Hostel Single Room near Campus";
      } else if (data.category === "hospitality") {
        titleEx = "Sunset Safari Lodge Luxury Suite";
      }

      const titleMsg = `✅ Property Type: *${chosenType}*\n\n*Step 3/8: Property Title / Headline*\n\nGive your listing an attractive headline:\n*Example:* "${titleEx}"`;
      queuePayload(
        createButtonMessage(
          phone,
          titleMsg,
          [{ id: "BTN_CANCEL", title: "❌ Cancel" }],
          "Step 3/8"
        )
      );
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_TITLE", replyText: titleMsg, outboundPayloads };
    }

    // --- LISTING STEP 3: AWAITING_TITLE ---
    if (currentStep === "AWAITING_TITLE") {
      if (!text || text.trim().length < 3) {
        const retryMsg = "⚠️ Please provide a clear headline (at least 3 characters).\n\n*Example:* 'Spacious Cottage in Avonlea with Solar'";
        queuePayload(createButtonMessage(phone, retryMsg, [{ id: "BTN_CANCEL", title: "❌ Cancel" }]));
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_TITLE", replyText: retryMsg, outboundPayloads };
      }
      data.title = text.trim();
      if (data.category === "hospitality") {
        data.business_name = text.trim();
      }
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_SUBURB', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const suburbMsg = `📍 *Step 4/8: Locality / Suburb*\n\nIn which suburb or neighborhood is the property situated?\n*Examples:* Avondale, Mt Pleasant, Belvedere, Victoria Falls, CBD`;
      queuePayload(createButtonMessage(phone, suburbMsg, [{ id: "BTN_CANCEL", title: "❌ Cancel" }], "Step 4/8"));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_SUBURB", replyText: suburbMsg, outboundPayloads };
    }

    // --- LISTING STEP 4: AWAITING_SUBURB ---
    if (currentStep === "AWAITING_SUBURB") {
      if (!text || text.trim().length < 2) {
        const retryMsg = "⚠️ Please provide a valid suburb or area name.";
        queuePayload(createButtonMessage(phone, retryMsg, [{ id: "BTN_CANCEL", title: "❌ Cancel" }]));
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_SUBURB", replyText: retryMsg, outboundPayloads };
      }
      data.suburb = text.trim();
      data.city = data.city || "Harare";
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_PRICE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const priceLabel = data.category === "hospitality" ? "Rate per night" : data.category === "student" ? "Fee per semester/month" : "Rent per month";
      const priceMsg = `💵 *Step 5/8: ${priceLabel} (in USD)*\n\nEnter just the number (e.g. *120* or *350*):`;
      queuePayload(createButtonMessage(phone, priceMsg, [{ id: "BTN_CANCEL", title: "❌ Cancel" }], "Step 5/8"));
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_PRICE", replyText: priceMsg, outboundPayloads };
    }

    // --- LISTING STEP 5: AWAITING_PRICE ---
    if (currentStep === "AWAITING_PRICE") {
      const parsedPrice = parseFloat(text.replace(/[^0-9.]/g, ""));
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        const retryMsg = "⚠️ Please enter a valid price in USD (e.g. 150).";
        queuePayload(createButtonMessage(phone, retryMsg, [{ id: "BTN_CANCEL", title: "❌ Cancel" }]));
        await dispatchAll();
        return { phone, action: "STEP_RETRY", step: "AWAITING_PRICE", replyText: retryMsg, outboundPayloads };
      }
      data.price = parsedPrice;
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_IMAGE', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const imageMsg = `📸 *Step 6/8: Property Photo*\n\nSend a photograph of the property directly into this chat, or tap *Skip Photo* below:`;
      queuePayload(
        createButtonMessage(
          phone,
          imageMsg,
          [
            { id: "BTN_SKIP_IMAGE", title: "⏭️ Skip Photo" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ],
          "Step 6/8"
        )
      );
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_IMAGE", replyText: imageMsg, outboundPayloads };
    }

    // --- LISTING STEP 6: AWAITING_IMAGE ---
    if (currentStep === "AWAITING_IMAGE") {
      let imageUrl = "";
      if (input.mediaId) {
        imageUrl = input.mediaId;
      } else if (text.trim().startsWith("http://") || text.trim().startsWith("https://")) {
        imageUrl = text.trim();
      } else if (buttonPayload === "BTN_SKIP_IMAGE" || lowerText === "skip" || lowerText === "none") {
        imageUrl = "";
      }
      data.image_url = imageUrl;
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_LANDMARK', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const landmarkMsg = `📍 *Step 7/8: Nearest Landmark / Key Feature*\n\nWhat is nearby to help people identify the location?\n*Examples:* Near Shopping Centre, Opposite School, Next to Main Road`;
      queuePayload(
        createButtonMessage(
          phone,
          landmarkMsg,
          [
            { id: "LM_NONE", title: "⏭️ None / Skip" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ],
          "Step 7/8"
        )
      );
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_LANDMARK", replyText: landmarkMsg, outboundPayloads };
    }

    // --- LISTING STEP 7: AWAITING_LANDMARK ---
    if (currentStep === "AWAITING_LANDMARK") {
      data.landmark = (buttonPayload === "LM_NONE" || lowerText === "skip" || lowerText === "none") ? "" : text.trim();
      data.amenities = data.amenities || ["Borehole", "Solar Power Backup"];
      db.prepare("UPDATE chatbot_sessions SET current_step = 'AWAITING_CONFIRMATION', collected_data = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?")
        .run(JSON.stringify(data), phone);

      const catLabel = data.category === "commercial"
        ? "Commercial Properties"
        : data.category === "student"
        ? "Student Accommodation"
        : data.category === "hospitality"
        ? "Hospitality & Stays"
        : "Residential Rentals";

      const summaryMsg = `📋 *Step 8/8: Confirm Your Listing*\n\n` +
        `• *Category:* ${catLabel}\n` +
        `• *Type:* ${data.property_type}\n` +
        `• *Headline:* ${data.title}\n` +
        `• *Suburb:* ${data.suburb}\n` +
        `• *Price:* $${data.price} / ${data.rent_cycle || (data.category === "hospitality" ? "Night" : "Month")}\n` +
        `• *Contact:* ${phone}\n\n` +
        `Ready to publish? Tap *Publish Live* or *Cancel* below:`;

      queuePayload(
        createButtonMessage(
          phone,
          summaryMsg,
          [
            { id: "BTN_CONFIRM_PUBLISH", title: "🚀 Publish Live" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ],
          "Publish to BunkBy"
        )
      );
      await dispatchAll();
      return { phone, action: "ADVANCE_STEP", step: "AWAITING_CONFIRMATION", replyText: summaryMsg, outboundPayloads };
    }

    // --- LISTING STEP 8: AWAITING_CONFIRMATION -> PUBLISH ---
    if (currentStep === "AWAITING_CONFIRMATION") {
      if (
        buttonPayload === "BTN_CONFIRM_PUBLISH" ||
        buttonPayload === "btn_confirm_publish" ||
        buttonPayload === "CMD_CONFIRM_PUBLISH" ||
        buttonPayload === "PUBLISH_LISTING" ||
        lowerText === "publish listing" ||
        lowerText.includes("publish listing") ||
        lowerText === "publish live" ||
        lowerText === "publish" ||
        (lowerText.includes("publish") && !lowerText.includes("cancel")) ||
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
            ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Guest House", "Bed & Breakfast"].includes(data.property_type)
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
            data.rent_cycle || (resolvedCategory === "hospitality" ? "Night" : resolvedCategory === "student" ? "Semester" : "Month"),
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
          `Tenants and visitors across Zimbabwe will now see your property on the website and via WhatsApp chatbot!\n\n` +
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

      const retryConfirmMsg = "⚠️ Please tap *Publish Live* to publish your listing, or tap *Cancel* to discard and return to the main menu.";
      queuePayload(
        createButtonMessage(
          phone,
          retryConfirmMsg,
          [
            { id: "BTN_CONFIRM_PUBLISH", title: "🚀 Publish Live" },
            { id: "BTN_CANCEL", title: "❌ Cancel" }
          ]
        )
      );
      await dispatchAll();
      return { phone, action: "STEP_RETRY", step: "AWAITING_CONFIRMATION", replyText: retryConfirmMsg, outboundPayloads };
    }
  }

  // =========================================================================
  // MY LISTINGS / DELETE MANAGEMENT (No active session)
  // =========================================================================
  if (
    !session && (
      buttonPayload === "CMD_MY_LISTINGS" ||
      buttonPayload?.startsWith("DEL_PROMPT_") ||
      buttonPayload?.startsWith("DEL_CONFIRM_") ||
      lowerText === "my listings" ||
      lowerText.startsWith("delete ")
    )
  ) {
    const confirmMatch = buttonPayload?.match(/^DEL_CONFIRM_(\d+)$/);
    const promptMatch = buttonPayload?.match(/^DEL_PROMPT_(\d+)$/);
    const textDelMatch = lowerText.match(/^delete\s+(\d+)$/);

    if (confirmMatch) {
      const delId = Number(confirmMatch[1]);
      db.prepare("UPDATE listings SET verification_status = 'Delisted' WHERE id = ? AND (landlord_id = ? OR contact_phone = ?)")
        .run(delId, phoneId, phone);
      const delMsg = `🗑️ *Listing #${delId} has been removed from BunkBy.*`;
      queuePayload(
        createButtonMessage(
          phone,
          delMsg,
          [
            { id: "CMD_MY_LISTINGS", title: "📋 My Listings" },
            { id: "CMD_START_LISTING", title: "🏡 Post Property" },
            { id: "CMD_SEARCH_MENU", title: "🔍 Search Stays" }
          ]
        )
      );
      await dispatchAll();
      return { phone, action: "LISTING_DELETED", replyText: delMsg, outboundPayloads };
    }

    if (promptMatch || textDelMatch) {
      const targetId = Number(promptMatch ? promptMatch[1] : textDelMatch![1]);
      const target = db.prepare("SELECT id, title, suburb FROM listings WHERE id = ? AND verification_status != 'Delisted' AND COALESCE(verification_status, 'Active') NOT IN ('Hidden', 'Removed') AND (landlord_id = ? OR contact_phone = ?)")
        .get(targetId, phoneId, phone) as any;
      if (!target) {
        const notFoundMsg = `⚠️ Listing #${targetId} was not found under your phone number.`;
        queuePayload(createTextMessage(phone, notFoundMsg));
        await dispatchAll();
        return { phone, action: "DELETE_NOT_FOUND", replyText: notFoundMsg, outboundPayloads };
      }
      const confirmPrompt = `⚠️ *Confirm Deletion of Listing #${target.id}*\n\n"${target.title}" in ${target.suburb}\n\nAre you sure?`;
      queuePayload(
        createButtonMessage(
          phone,
          confirmPrompt,
          [
            { id: `DEL_CONFIRM_${target.id}`, title: "🗑️ Yes, Delete" },
            { id: "CMD_MY_LISTINGS", title: "❌ Cancel / Keep" }
          ]
        )
      );
      await dispatchAll();
      return { phone, action: "DELETE_CONFIRMATION_PROMPT", replyText: confirmPrompt, outboundPayloads };
    }

    const items = db.prepare("SELECT id, title, suburb, price, rent_cycle FROM listings WHERE verification_status != 'Delisted' AND COALESCE(verification_status, 'Active') NOT IN ('Hidden', 'Removed') AND (landlord_id = ? OR contact_phone = ?) ORDER BY id DESC LIMIT 10")
      .all(phoneId, phone) as any[];
    if (items.length === 0) {
      const emptyMsg = "📋 *You currently have no active listings on BunkBy.*\n\nWould you like to post a property?";
      queuePayload(
        createButtonMessage(
          phone,
          emptyMsg,
          [
            { id: "CMD_START_LISTING", title: "🏡 Post Property" },
            { id: "CMD_SEARCH_MENU", title: "🔍 Search Stays" }
          ]
        )
      );
      await dispatchAll();
      return { phone, action: "NO_MY_LISTINGS", replyText: emptyMsg, outboundPayloads };
    }

    let listSummary = `📋 *Your Active BunkBy Listings (${items.length}):*\n\n`;
    for (const item of items) {
      listSummary += `• *#${item.id}*: ${item.title} (${item.suburb}) - $${item.price}/${item.rent_cycle || "Month"}\n`;
    }
    listSummary += `\nReply *delete [id]* to remove a listing, or tap below:`;
    queuePayload(
      createButtonMessage(
        phone,
        listSummary,
        [
          { id: `DEL_PROMPT_${items[0].id}`, title: `🗑️ Delete #${items[0].id}` },
          { id: "CMD_START_LISTING", title: "🏡 Add Listing" }
        ]
      )
    );
    await dispatchAll();
    return { phone, action: "MY_LISTINGS_LISTED", replyText: listSummary, outboundPayloads };
  }

  // =========================================================================
  // SEARCH / RETRIEVAL FLOW (Only when NO active session is running!)
  // =========================================================================
  const isSearchIntent =
    !session && (
      buttonPayload?.startsWith("PAGE_") ||
      buttonPayload?.startsWith("SEARCH_") ||
      buttonPayload === "CMD_SEARCH_MENU" ||
      buttonPayload === "CMD_SEARCH" ||
      lowerText.startsWith("search") ||
      lowerText.startsWith("find") ||
      lowerText.startsWith("show") ||
      lowerText.startsWith("looking for") ||
      lowerText.includes("all available") ||
      lowerText.includes("all properties") ||
      lowerText.includes("properties") ||
      lowerText.includes("accommodation") ||
      lowerText.includes("zimbabwe") ||
      lowerText.includes("mount pleasant") ||
      lowerText.includes("mt pleasant") ||
      lowerText.includes("room") ||
      lowerText.includes("cottage") ||
      lowerText.includes("lodge") ||
      lowerText.includes("apartment") ||
      lowerText.includes("shop") ||
      lowerText.includes("warehouse") ||
      lowerText.includes("office") ||
      lowerText.includes("stall") ||
      lowerText.includes("table") ||
      lowerText.includes("commercial") ||
      lowerText.includes("student") ||
      lowerText.includes("hostel") ||
      lowerText.includes("in ") ||
      lowerText.includes("under ")
    );

  if (isSearchIntent) {
    // Open guided search 4-category list menu when user taps Search or types "search"
    if (buttonPayload === "CMD_SEARCH_MENU" || buttonPayload === "CMD_SEARCH" || lowerText === "search") {
      db.prepare(`
        INSERT INTO chatbot_sessions (phone_number, current_step, collected_data, updated_at)
        VALUES (?, 'AWAITING_SEARCH_CATEGORY', '{}', CURRENT_TIMESTAMP)
        ON CONFLICT(phone_number) DO UPDATE SET
          current_step = 'AWAITING_SEARCH_CATEGORY',
          collected_data = '{}',
          updated_at = CURRENT_TIMESTAMP
      `).run(phone);

      const searchIntro = "🔍 *Search BunkBy Properties & Accommodation*\n\nTap *Choose Category* below to browse by category (including specific commercial subtypes), or type a query like *\"shops in Harare\"* or *\"rooms in Avondale under $250\"*.";
      queueSearchCategoryMenu(searchIntro);
      await dispatchAll();
      return { phone, action: "SEARCH_PROMPT_CATEGORY", step: "AWAITING_SEARCH_CATEGORY", replyText: searchIntro, outboundPayloads };
    }

    // Direct shortcut into Commercial Subtype Search
    if (buttonPayload === "SEARCH_CAT_COMMERCIAL") {
      const nextData = { searchCategory: "commercial", categoryLabel: "Commercial Properties" };
      db.prepare(`
        INSERT INTO chatbot_sessions (phone_number, current_step, collected_data, updated_at)
        VALUES (?, 'AWAITING_SEARCH_SUBTYPE', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(phone_number) DO UPDATE SET
          current_step = 'AWAITING_SEARCH_SUBTYPE',
          collected_data = excluded.collected_data,
          updated_at = CURRENT_TIMESTAMP
      `).run(phone, JSON.stringify(nextData));

      const subMsg = "🏢 *Commercial Properties Selected*\n\nWhich commercial subtype are you looking for?";
      queueSearchCommercialSubtypeMenu(subMsg);
      await dispatchAll();
      return { phone, action: "SEARCH_PROMPT_SUBTYPE", step: "AWAITING_SEARCH_SUBTYPE", replyText: subMsg, outboundPayloads };
    }

    // Handle paginated next-page button clicks: PAGE_{offset}_{cat}:{subtype}_{query}
    if (buttonPayload?.startsWith("PAGE_")) {
      const parsedPage = parseSearchPaginationId(buttonPayload);
      if (parsedPage) {
        const filters: SearchFilters = parsedPage.query
          ? parseNaturalLanguageQuery(parsedPage.query)
          : { rawQuery: "", category: "all" };
        if (parsedPage.category) {
          filters.category = parsedPage.category as any;
        }
        if (parsedPage.propertyType) {
          filters.propertyType = parsedPage.propertyType;
        }
        return await executeAndSendSearchPage({
          filters,
          displayQuery: parsedPage.query,
          categoryLabel: parsedPage.propertyType || (parsedPage.category || undefined),
          requestedOffset: parsedPage.offset,
          pagePayloadId: buttonPayload
        });
      }
    }

    // Natural-language first page search (page size = 5)
    const cleanSearchText = text.replace(/^(search|find|show|looking for)\s*/i, "").trim();
    const filters = parseNaturalLanguageQuery(cleanSearchText || text);

    return await executeAndSendSearchPage({
      filters,
      displayQuery: cleanSearchText,
      categoryLabel: filters.propertyType || (filters.category && filters.category !== "all" ? filters.category : undefined),
      requestedOffset: 0
    });
  }

  // =========================================================================
  // DEFAULT / WELCOME MENU
  // =========================================================================
  const welcomeMsg = `👋 *Welcome to BunkBy!*\n\n` +
    `Your independent, agent-free platform connecting you directly with verified landlords and hosts for *residential rentals, commercial properties, hospitality stays, and student accommodation* without agency fees.\n\n` +
    `What would you like to do today?`;

  queuePayload(
    createButtonMessage(
      phone,
      welcomeMsg,
      [
        { id: "CMD_SEARCH_MENU", title: "🔍 Search Stays" },
        { id: "CMD_START_LISTING", title: "🏡 Post a Listing" },
        { id: "CMD_MY_LISTINGS", title: "📋 My Listings" }
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
