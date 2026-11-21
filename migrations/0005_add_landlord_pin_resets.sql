-- Migration 0005: WhatsApp One-Time PIN Reset Codes for Landlords
-- Additive migration for the existing BunkBy D1 database.
-- Stores PBKDF2-hashed 6-digit one-time verification codes with short expiry,
-- attempt caps, and hourly request rate limiting. Never stores plaintext codes.

CREATE TABLE IF NOT EXISTS landlord_pin_resets (
  landlord_id INTEGER PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  request_count INTEGER NOT NULL DEFAULT 1,
  window_started_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT,
  FOREIGN KEY (landlord_id) REFERENCES landlords(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_landlord_pin_resets_expires_at
  ON landlord_pin_resets(expires_at);
