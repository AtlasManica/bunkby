-- ====================================================================
-- BunkBy Production Cloudflare D1 Migration
-- Add category, hospitality, and monetization columns to listings table
-- Safe, additive-only migration. Does NOT delete or reset existing data.
-- ====================================================================

ALTER TABLE listings ADD COLUMN category TEXT DEFAULT 'residential';
ALTER TABLE listings ADD COLUMN business_name TEXT;
ALTER TABLE listings ADD COLUMN is_premium INTEGER DEFAULT 0;
ALTER TABLE listings ADD COLUMN listing_tier TEXT DEFAULT 'free';
ALTER TABLE listings ADD COLUMN expiry_date TEXT;
ALTER TABLE listings ADD COLUMN is_sample INTEGER DEFAULT 0;
ALTER TABLE listings ADD COLUMN reports_count INTEGER DEFAULT 0;
