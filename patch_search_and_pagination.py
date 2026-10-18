with open("functions/api/whatsapp.ts", "r", encoding="utf-8") as f:
    text = f.read()

# Let's inspect where CMD_PAGE_ or SEARCH pagination can be hooked.
# When a user types a town/place (e.g. "Harare", "Avonlea", "Kadoma", "Kariba", "Nyanga")
# OR taps a pagination button like "PAGE_SEARCH_query_offset"
# We want:
# 1. Page size of exactly 3 properties: LIMIT 3 OFFSET ?
# 2. Count total matches: SELECT COUNT(*) as total FROM listings ...
# 3. For each of the properties (1 to 3):
#    Format clean details with location, price, tenant type, amenities, direct contact, and direct image.
# 4. Outbound queue:
#    If offset == 0:
#      Intro: `🏡 *Found ${total} active stay${total === 1 ? "" : "s"} in "${cleanQuery}":*`
#    Else:
#      Intro: `🏡 *Showing stays ${offset + 1} - ${offset + results.length} of ${total} in "${cleanQuery}":*`
#    Then for each property:
#      outboundQueue.push({ text: card.text, imageUrl: card.imageUrl, itemType: "listing_card", listingId: room.id })
#    Footer with pagination button:
#      If (offset + results.length < total):
#         Next Batch button: { id: `PAGE_${offset + 3}_${encodeQuery}`, title: "⏩ Next 3 Stays" }
#         Buttons: [ Next Batch, Search Again, Create Listing ]
#      Else:
#         Buttons: [ Search Again, My Listings, Create Listing ]
