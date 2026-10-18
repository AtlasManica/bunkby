with open("functions/api/whatsapp.ts", "r", encoding="utf-8") as f:
    text = f.read()

# Let's see: We want search:
# 1. To support pagination: "PAGE_{offset}_{query}" e.g. "PAGE_3_Harare"
# 2. To fetch batches of 3 properties: LIMIT 3 OFFSET {offset}
# 3. To count total matches: SELECT COUNT(*) as total FROM listings ...
# 4. For each property:
#    Format card with title, property type, location, rate, deposit, seeking, amenities, direct phone and WhatsApp link
#    Send real photo URL (or public photo endpoint link) with full details
# 5. Outbound queue:
#    Message 1 (if offset === 0):
#      "🏡 *Found {total} active stay(s) in "{cleanQuery}":*"
#    Message 2, 3, 4:
#      The 3 property cards, each with its full image & full text details
#    Message 5 (Footer & Navigation):
#      If total > offset + 3:
#        Buttons:
#          - "⏩ Next 3 Stays" (id: `PAGE_${offset + 3}_${cleanQuery.slice(0, 15)}`)
#          - "🔍 Search Again" (id: "CMD_SEARCH")
#          - "🏡 Create Listing" (id: "CMD_LIST")
#      Else:
#        Buttons:
#          - "🔍 Search Again" (id: "CMD_SEARCH")
#          - "📋 My Listings" (id: "CMD_MY_LISTINGS")
#          - "🏡 Create Listing" (id: "CMD_LIST")
# 6. Crucial Outbound Dispatch fix:
#    DO NOT send the image message alone and rely on caption!
#    In Meta WhatsApp Cloud API:
#    An image message can be sent WITH the property details caption (up to 1024 characters).
#    HOWEVER: If the image URL fails, or if Meta fails to fetch it from the domain,
#    the fallback text message MUST be delivered immediately without truncation!
#    AND: Ensure the rate limit buffer between multiple messages is paced (e.g. 250ms) so Meta delivers all 3 cards in order!

