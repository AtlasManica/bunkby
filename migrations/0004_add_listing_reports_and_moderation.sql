-- ====================================================================
-- BunkBy Production Cloudflare D1 Migration 0004
-- Add Listing Reports & Moderation Audit Tables
-- Safe, additive-only migration. Does NOT alter or delete existing records.
-- ====================================================================

CREATE TABLE IF NOT EXISTS listing_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  reporter_name TEXT,
  reporter_phone TEXT,
  reporter_token_hash TEXT NOT NULL,
  ip_hash TEXT,
  ip_hash_expires_at DATETIME,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'action_taken', 'dismissed', 'resolved')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  reviewed_by INTEGER,
  reviewed_by_name TEXT,
  moderation_notes TEXT,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by) REFERENCES landlords(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS listing_moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  report_id INTEGER,
  admin_id INTEGER,
  admin_name TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'mark_under_review',
      'dismiss_report',
      'hide_listing',
      'restore_listing',
      'remove_listing',
      'resolve_report',
      'add_note'
    )),
  previous_listing_status TEXT,
  new_listing_status TEXT,
  reason TEXT,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE RESTRICT,
  FOREIGN KEY (report_id) REFERENCES listing_reports(id) ON DELETE SET NULL,
  FOREIGN KEY (admin_id) REFERENCES landlords(id) ON DELETE SET NULL
);

-- Duplicate-prevention constraint: one open report per listing per pseudonymous reporter
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_reports_unique_open_reporter
  ON listing_reports(listing_id, reporter_token_hash)
  WHERE status IN ('pending', 'under_review') AND reporter_token_hash IS NOT NULL;

-- Query & moderation indexes for listing_reports
CREATE INDEX IF NOT EXISTS idx_listing_reports_status_created
  ON listing_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_reports_listing_status
  ON listing_reports(listing_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_reports_ip_hash_created
  ON listing_reports(ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_reports_ip_expires
  ON listing_reports(ip_hash_expires_at)
  WHERE ip_hash IS NOT NULL;

-- Audit trail indexes for listing_moderation_actions
CREATE INDEX IF NOT EXISTS idx_moderation_actions_listing_created
  ON listing_moderation_actions(listing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_report_created
  ON listing_moderation_actions(report_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_admin_created
  ON listing_moderation_actions(admin_id, created_at DESC);
