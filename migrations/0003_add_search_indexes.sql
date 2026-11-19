-- ====================================================================
-- BunkBy Production Cloudflare D1 Migration 0003
-- Add search performance indexes & WhatsApp per-user search pagination state
-- Safe, additive-only migration. Does NOT alter or delete existing listings.
-- ====================================================================

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
);

-- Partial covering indexes excluding delisted listings for O(log N) keyset pagination
CREATE INDEX IF NOT EXISTS idx_listings_active_created_id
  ON listings(created_at DESC, id DESC)
  WHERE verification_status != 'Delisted';

CREATE INDEX IF NOT EXISTS idx_listings_active_cat_created_id
  ON listings(category, created_at DESC, id DESC)
  WHERE verification_status != 'Delisted';

CREATE INDEX IF NOT EXISTS idx_listings_active_type_created_id
  ON listings(property_type, created_at DESC, id DESC)
  WHERE verification_status != 'Delisted';

CREATE INDEX IF NOT EXISTS idx_listings_active_premium_created_id
  ON listings(is_premium DESC, created_at DESC, id DESC)
  WHERE verification_status != 'Delisted';

CREATE INDEX IF NOT EXISTS idx_listings_active_coalesce_premium_created_id
  ON listings(COALESCE(is_premium, 0) DESC, created_at DESC, id DESC)
  WHERE verification_status != 'Delisted';

-- Lookup indexes for city, suburb, and landlord queries
CREATE INDEX IF NOT EXISTS idx_listings_city_status
  ON listings(city, verification_status);

CREATE INDEX IF NOT EXISTS idx_listings_suburb_status
  ON listings(suburb, verification_status);

CREATE INDEX IF NOT EXISTS idx_listings_landlord_status
  ON listings(landlord_id, verification_status, id DESC);
