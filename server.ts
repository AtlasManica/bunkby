/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import crypto from "crypto";
import Database from "better-sqlite3";
import { processWhatsAppMessage, ensureChatbotTable } from "./server/whatsappEngine";
import {
  ensureLandlordPinResetTableSync,
  findLandlordByPhoneSync,
  verifyAndConsumeLandlordPinResetCodeSync,
} from "./server/pinReset";
import {
  buildHomeSeo,
  buildWhatsAppSeo,
  buildPrivacySeo,
  buildListingSeo,
  buildCategorySeo,
  buildLocationSeo,
  buildSitemapXml,
  normalizeListingRow,
  isListingAvailable,
  SeoPagePayload,
} from "./shared/seoData";
import { injectSeoIntoHtml, isCrawlerUserAgent } from "./shared/seoHtml";

const app = express();
const PORT = 3000;

// Body parsing middleware with generous size limit for high-res images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Initialize SQLite database with auto-recovery from file corruption
function initDatabase() {
  const dbPath = path.join(process.cwd(), "bunkby.db");
  let instance: any;

  try {
    instance = new Database(dbPath);
    instance.pragma("journal_mode = WAL");
    // Verify connection by running a simple query
    instance.prepare("SELECT 1").get();
  } catch (err) {
    console.error("Database connection error:", err);
    // Open in standard rollback journal mode to recover safely without unlinking existing data
    instance = new Database(dbPath);
    instance.pragma("journal_mode = WAL");
  }

  instance.exec(`
    CREATE TABLE IF NOT EXISTS landlords (
      id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL,
      national_id_url TEXT,
      rates_bill_url TEXT,
      verification_status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      suburb TEXT NOT NULL,
      price INTEGER NOT NULL,
      landlord_id INTEGER,
      verification_status TEXT DEFAULT 'Active',
      image_url TEXT,
      landmark TEXT,
      city TEXT DEFAULT 'Harare',
      deposit INTEGER,
      property_type TEXT,
      tenant_type TEXT,
      rent_cycle TEXT,
      contact_method TEXT,
      contact_phone TEXT,
      amenities TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      leads_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chatbot_sessions (
      phone_number TEXT PRIMARY KEY,
      current_step TEXT NOT NULL,
      collected_data TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe backward-compatible schema migrations (additive only)
  try {
    const existingColumns = (instance.prepare("PRAGMA table_info(listings)").all() as any[]).map(c => c.name);
    if (!existingColumns.includes("category")) {
      instance.exec("ALTER TABLE listings ADD COLUMN category TEXT DEFAULT 'residential'");
    }
    if (!existingColumns.includes("business_name")) {
      instance.exec("ALTER TABLE listings ADD COLUMN business_name TEXT");
    }
    if (!existingColumns.includes("is_premium")) {
      instance.exec("ALTER TABLE listings ADD COLUMN is_premium INTEGER DEFAULT 0");
    }
    if (!existingColumns.includes("expiry_date")) {
      instance.exec("ALTER TABLE listings ADD COLUMN expiry_date TEXT");
    }
    if (!existingColumns.includes("listing_tier")) {
      instance.exec("ALTER TABLE listings ADD COLUMN listing_tier TEXT DEFAULT 'free'");
    }
    if (!existingColumns.includes("is_sample")) {
      instance.exec("ALTER TABLE listings ADD COLUMN is_sample INTEGER DEFAULT 0");
    }
    if (!existingColumns.includes("reports_count")) {
      instance.exec("ALTER TABLE listings ADD COLUMN reports_count INTEGER DEFAULT 0");
    }

    const landlordColumns = (instance.prepare("PRAGMA table_info(landlords)").all() as any[]).map(c => c.name);
    if (!landlordColumns.includes("account_pin")) {
      instance.exec("ALTER TABLE landlords ADD COLUMN account_pin TEXT");
    }
    if (!landlordColumns.includes("auth_token")) {
      instance.exec("ALTER TABLE landlords ADD COLUMN auth_token TEXT");
    }

    instance.exec(`
      CREATE TABLE IF NOT EXISTS listing_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        details TEXT,
        reporter_name TEXT,
        reporter_phone TEXT,
        reporter_token_hash TEXT NOT NULL DEFAULT '',
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

      CREATE TABLE IF NOT EXISTS whatsapp_diagnostic_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        field TEXT,
        sender TEXT,
        sender_name TEXT,
        incoming_preview TEXT,
        message_type TEXT,
        action_taken TEXT,
        outbound_count INTEGER DEFAULT 0,
        outbound_delivery TEXT,
        status TEXT,
        error TEXT
      );

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

      CREATE INDEX IF NOT EXISTS idx_listings_city_status
        ON listings(city, verification_status);

      CREATE INDEX IF NOT EXISTS idx_listings_suburb_status
        ON listings(suburb, verification_status);

      CREATE INDEX IF NOT EXISTS idx_listings_landlord_status
        ON listings(landlord_id, verification_status, id DESC);
    `);

    // Additive upgrade for pre-existing local listing_reports table
    const reportCols = (instance.prepare("PRAGMA table_info(listing_reports)").all() as any[]).map(c => c.name);
    if (reportCols.length > 0) {
      if (!reportCols.includes("reporter_token_hash")) {
        instance.exec("ALTER TABLE listing_reports ADD COLUMN reporter_token_hash TEXT NOT NULL DEFAULT ''");
      }
      if (!reportCols.includes("ip_hash")) {
        instance.exec("ALTER TABLE listing_reports ADD COLUMN ip_hash TEXT");
      }
      if (!reportCols.includes("ip_hash_expires_at")) {
        instance.exec("ALTER TABLE listing_reports ADD COLUMN ip_hash_expires_at DATETIME");
      }
      if (!reportCols.includes("status")) {
        instance.exec("ALTER TABLE listing_reports ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
      }
      if (!reportCols.includes("reviewed_at")) {
        instance.exec("ALTER TABLE listing_reports ADD COLUMN reviewed_at DATETIME");
      }
      if (!reportCols.includes("reviewed_by")) {
        instance.exec("ALTER TABLE listing_reports ADD COLUMN reviewed_by INTEGER");
      }
      if (!reportCols.includes("reviewed_by_name")) {
        instance.exec("ALTER TABLE listing_reports ADD COLUMN reviewed_by_name TEXT");
      }
      if (!reportCols.includes("moderation_notes")) {
        instance.exec("ALTER TABLE listing_reports ADD COLUMN moderation_notes TEXT");
      }
    }

    instance.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_reports_unique_open_reporter
        ON listing_reports(listing_id, reporter_token_hash)
        WHERE status IN ('pending', 'under_review') AND reporter_token_hash IS NOT NULL AND reporter_token_hash != '';
      CREATE INDEX IF NOT EXISTS idx_listing_reports_status_created
        ON listing_reports(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_listing_reports_listing_status
        ON listing_reports(listing_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_listing_reports_ip_hash_created
        ON listing_reports(ip_hash, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_listing_reports_ip_expires
        ON listing_reports(ip_hash_expires_at)
        WHERE ip_hash IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_moderation_actions_listing_created
        ON listing_moderation_actions(listing_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_moderation_actions_report_created
        ON listing_moderation_actions(report_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_moderation_actions_admin_created
        ON listing_moderation_actions(admin_id, created_at DESC);
    `);

    ensureLandlordPinResetTableSync(instance);

    // Flag demo seed landlords/listings and assign demo PIN (1234) so they remain testable and secure
    instance.exec(`
      UPDATE listings SET is_sample = 1 WHERE landlord_id IN (263771122334, 263772233445, 263773344556);
      UPDATE landlords SET account_pin = '1234' WHERE id IN (263771122334, 263772233445, 263773344556) AND account_pin IS NULL;
      INSERT OR IGNORE INTO landlords (id, full_name, verification_status, account_pin) VALUES (263773043376, 'Tatenda E. Chikura', 'admin', '1234');
    `);
  } catch (migErr) {
    console.warn("Migration warning:", migErr);
  }
  return instance;
}

const db = initDatabase();

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Endpoint to store exact custom background image directly onto disk
app.post("/api/upload-hero-image", (req, res) => {
  try {
    const { imageData } = req.body;
    if (!imageData) return res.status(400).json({ error: "No image data provided" });
    
    const matches = imageData.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    const buffer = matches ? Buffer.from(matches[2], "base64") : Buffer.from(imageData, "base64");
    
    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    
    // Save under all standard names so every route finds it immediately
    fs.writeFileSync(path.join(publicDir, "hero-background.png"), buffer);
    fs.writeFileSync(path.join(publicDir, "Midnight Tribal Geometry with Copper Accents.png"), buffer);
    fs.writeFileSync(path.join(publicDir, "hero-pattern.jpg"), buffer);
    
    const distDir = path.join(process.cwd(), "dist");
    if (fs.existsSync(distDir)) {
      fs.writeFileSync(path.join(distDir, "hero-background.png"), buffer);
      fs.writeFileSync(path.join(distDir, "Midnight Tribal Geometry with Copper Accents.png"), buffer);
      fs.writeFileSync(path.join(distDir, "hero-pattern.jpg"), buffer);
    }
    
    res.json({ success: true, url: "/hero-background.png?t=" + Date.now() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cryptographic PIN hashing & verification helpers (Node.js crypto scrypt)
const PIN_SALT = "bunkby_pin_salt_v1";

function hashPin(pin: string): string {
  const clean = String(pin).trim();
  const hash = crypto.scryptSync(clean, PIN_SALT, 32);
  return `scrypt:${hash.toString("hex")}`;
}

function verifyPin(candidatePin: string, storedHashOrPin: string | null): boolean {
  if (!storedHashOrPin) return false;
  const cleanCandidate = String(candidatePin).trim();
  if (storedHashOrPin.startsWith("scrypt:")) {
    const candidateHash = hashPin(cleanCandidate);
    try {
      return crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(storedHashOrPin));
    } catch {
      return false;
    }
  }
  if (storedHashOrPin.startsWith("pbkdf2:")) {
    const parts = storedHashOrPin.split(":");
    if (parts.length !== 3) return false;
    try {
      const derived = crypto.pbkdf2Sync(cleanCandidate, Buffer.from(parts[1], "hex"), 100000, 32, "sha256").toString("hex");
      return crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(parts[2]));
    } catch {
      return false;
    }
  }
  // Backward compatibility with un-hashed plaintext PINs in existing database
  return cleanCandidate === String(storedHashOrPin).trim();
}

const EPHEMERAL_REPORT_HASH_KEY = crypto.randomBytes(32);

function computeExpressKeyedHash(domain: string, value: string): string {
  const envSecret = process.env.REPORT_HASH_SECRET?.trim();
  const key = envSecret && envSecret.length >= 8 ? Buffer.from(envSecret, "utf8") : EPHEMERAL_REPORT_HASH_KEY;
  return crypto.createHmac("sha256", key).update(`${domain}:${value}`).digest("hex");
}

function getExpressClientIp(req: express.Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) return cfIp.trim();
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || "unknown";
}

function scrubExpiredExpressIpHashes(): void {
  try {
    db.prepare(`
      UPDATE listing_reports
      SET ip_hash = NULL
      WHERE ip_hash IS NOT NULL
        AND ip_hash_expires_at IS NOT NULL
        AND ip_hash_expires_at <= datetime('now')
    `).run();
  } catch (_) {}
}

// Authentication and Ownership verification helper (Strict Bearer / Header Token only)
function getAuthenticatedLandlord(req: express.Request): { id: number; name: string; isAdmin: boolean } | null {
  const token = (req.headers["x-landlord-token"] as string) || 
    (req.headers.authorization && req.headers.authorization.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null) ||
    req.body?.token;

  if (token && typeof token === "string" && token.trim().length >= 8) {
    const landlord = db.prepare("SELECT id, full_name, verification_status FROM landlords WHERE auth_token = ?").get(token.trim()) as any;
    if (landlord) {
      return {
        id: landlord.id,
        name: landlord.full_name,
        isAdmin: landlord.full_name === "Tatenda E. Chikura" || landlord.verification_status === "admin"
      };
    }
  }

  return null;
}

// REST API Endpoints: Landlord Account & Authentication
app.get("/api/landlords", (_req, res) => {
  try {
    const landlords = db.prepare("SELECT id, full_name, verification_status FROM landlords").all();
    res.json({ landlords });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/landlords", (req, res) => {
  const { action, name, phone, pin, newPin, resetCode } = req.body; 
  if (!action || !phone) return res.status(400).json({ error: "Missing action or phone parameter." });
  const cleanName = (name || "").trim();
  const phoneId = Number(String(phone).replace(/\D/g, ""));

  if (!phoneId || phoneId < 1000000) {
    return res.status(400).json({ error: "Please enter a valid phone number with digits." });
  }

  try {
    if (action === "login") {
      const landlord = findLandlordByPhoneSync(db, String(phone));
      if (!landlord) {
        return res.status(404).json({
          success: false,
          error: "No account found with this phone number. Please Create an Account first.",
          code: "ACCOUNT_NOT_FOUND"
        });
      }

      // Security PIN requirement
      if (!pin || String(pin).trim().length < 4) {
        return res.status(401).json({
          success: false,
          error: "A 4-digit Security PIN is required to access your landlord account.",
          code: "PIN_REQUIRED"
        });
      }

      if (landlord.account_pin) {
        if (!verifyPin(String(pin), landlord.account_pin)) {
          return res.status(401).json({
            success: false,
            error: "Incorrect Security PIN. Please verify your PIN or use Account Recovery.",
            code: "INVALID_PIN"
          });
        }
        // Transparent upgrade from legacy plaintext to scrypt hash upon successful authentication
        if (!landlord.account_pin.startsWith("scrypt:")) {
          db.prepare("UPDATE landlords SET account_pin = ? WHERE id = ?").run(hashPin(String(pin)), landlord.id);
        }
      } else {
        // Legacy unpinned landlord: must verify registered full name before establishing permanent PIN
        if (cleanName && landlord.full_name.toLowerCase().trim() !== cleanName.toLowerCase().trim()) {
          return res.status(401).json({
            success: false,
            error: "Name provided does not match the registered account details.",
            code: "NAME_MISMATCH"
          });
        }
        db.prepare("UPDATE landlords SET account_pin = ? WHERE id = ?").run(hashPin(String(pin)), landlord.id);
      }

      // Issue fresh cryptographically secure auth session token
      const token = crypto.randomUUID();
      db.prepare("UPDATE landlords SET auth_token = ? WHERE id = ?").run(token, landlord.id);

      return res.json({
        success: true,
        token,
        hasPin: true,
        landlord: {
          id: landlord.id,
          name: landlord.full_name,
          phone: String(landlord.id),
          isVerified: landlord.verification_status === "approved" || landlord.verification_status === "verified",
          status: landlord.verification_status,
          role: (landlord.full_name === "Tatenda E. Chikura" || landlord.verification_status === "admin") ? "Admin" : "Landlord"
        }
      });
    } else if (action === "signup") {
      if (!cleanName || cleanName.length < 2) {
        return res.status(400).json({ error: "Your full name is required to create an account." });
      }

      const existing = findLandlordByPhoneSync(db, String(phone));
      if (existing) {
        return res.status(400).json({
          success: false,
          error: "An account already exists with this phone number. Please Log In.",
          code: "ALREADY_EXISTS"
        });
      }

      if (!pin || String(pin).trim().length < 4) {
        return res.status(400).json({
          success: false,
          error: "A Security PIN of at least 4 digits is required to protect your account.",
          code: "PIN_REQUIRED"
        });
      }

      const hashedPin = hashPin(String(pin));
      const token = crypto.randomUUID();

      const stmt = db.prepare("INSERT INTO landlords (id, full_name, account_pin, auth_token, verification_status) VALUES (?, ?, ?, ?, 'pending')");
      stmt.run(phoneId, cleanName, hashedPin, token);
      
      return res.status(201).json({
        success: true,
        token,
        hasPin: true,
        landlord: {
          id: phoneId,
          name: cleanName,
          phone: String(phoneId),
          isVerified: false,
          status: "pending",
          role: cleanName === "Tatenda E. Chikura" ? "Admin" : "Landlord"
        }
      });
    } else if (action === "recover" || action === "reset_pin") {
      const landlord = findLandlordByPhoneSync(db, String(phone));
      if (!landlord) {
        return res.status(404).json({
          success: false,
          code: "ACCOUNT_NOT_FOUND",
          error: "No landlord account found with this phone number."
        });
      }

      const cleanNewPin = String(newPin || pin || "").trim();
      if (!/^\d{4,8}$/.test(cleanNewPin)) {
        return res.status(400).json({
          success: false,
          code: "INVALID_NEW_PIN",
          error: "New Security PIN must be 4 to 8 digits."
        });
      }

      const verification = verifyAndConsumeLandlordPinResetCodeSync(
        db,
        Number(landlord.id),
        String(resetCode || "")
      );
      if (!verification.ok) {
        return res.status(verification.status || 400).json({
          success: false,
          code: verification.code || "INVALID_RESET_CODE",
          error: verification.error || "Invalid or expired reset code."
        });
      }

      const hashedNewPin = hashPin(cleanNewPin);
      const token = crypto.randomUUID();
      db.prepare("UPDATE landlords SET account_pin = ?, auth_token = ? WHERE id = ?").run(hashedNewPin, token, landlord.id);

      return res.json({
        success: true,
        message: "Security PIN updated successfully. Your account is now logged in.",
        token,
        hasPin: true,
        landlord: {
          id: landlord.id,
          name: landlord.full_name,
          phone: String(landlord.id),
          isVerified: landlord.verification_status === "approved" || landlord.verification_status === "verified",
          status: landlord.verification_status,
          role: (landlord.full_name === "Tatenda E. Chikura" || landlord.verification_status === "admin") ? "Admin" : "Landlord"
        }
      });
    } else if (action === "set_pin") {
      const requester = getAuthenticatedLandlord(req);
      if (!requester || requester.id !== phoneId) {
        return res.status(401).json({ error: "Authentication required to update PIN." });
      }
      if (!pin || String(pin).trim().length < 4) {
        return res.status(400).json({ error: "PIN must be at least 4 digits." });
      }
      db.prepare("UPDATE landlords SET account_pin = ? WHERE id = ?").run(hashPin(String(pin)), phoneId);
      return res.json({ success: true, message: "Security PIN saved successfully." });
    }

    res.status(400).json({ error: "Unsupported action." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Logout and token revocation endpoint
app.post("/api/landlords/logout", (req, res) => {
  const requester = getAuthenticatedLandlord(req);
  if (requester) {
    db.prepare("UPDATE landlords SET auth_token = NULL WHERE id = ?").run(requester.id);
  }
  res.json({ success: true, message: "Logged out successfully" });
});

app.get("/api/listings", (req, res) => {
  try {
    const listings = db.prepare(`
      SELECT 
        listings.*, 
        landlords.full_name as landlordName 
      FROM listings 
      LEFT JOIN landlords ON listings.landlord_id = landlords.id 
      WHERE listings.verification_status != 'Delisted'
        AND COALESCE(listings.verification_status, 'Active') NOT IN ('Hidden', 'Removed')
      ORDER BY listings.created_at DESC
    `).all().map((row: any) => ({
        ...row,
        category: row.category || (
          ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(row.property_type)
            ? "hospitality"
            : ["Commercial", "Shop", "Warehouse", "Table", "Office"].includes(row.property_type)
            ? "commercial"
            : ["Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"].includes(row.property_type) || row.tenant_type === "Student"
            ? "student"
            : "residential"
        ),
        businessName: row.business_name || null,
        frequency: row.rent_cycle,
        propertyType: row.property_type,
        tenantType: row.tenant_type,
        amenities: typeof row.amenities === "string" ? JSON.parse(row.amenities || "[]") : (row.amenities || []),
        contactMethod: row.contact_method,
        phone: row.contact_phone,
        images: (() => {
        if (!row.image_url) return [];
        const str = String(row.image_url).trim();
        if (str.startsWith("[")) {
          try {
            const arr = JSON.parse(str);
            if (Array.isArray(arr)) return arr;
          } catch (_) {}
        }
        return [str];
      })(),
        status: row.verification_status,
        createdAt: row.created_at,
        leadsCount: row.leads_count,
        isPremium: Boolean(row.is_premium),
        listingTier: row.listing_tier || (row.is_premium ? "paid" : "free"),
        expiryDate: row.expiry_date,
        isSample: Boolean(row.is_sample),
        reportsCount: row.reports_count || 0
    }));
    res.json({ listings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/listings", (req, res) => {
  const {
    title, suburb, price, landlord_id, verification_status, image_url, images, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities,
    category, business_name, businessName, is_premium, isPremium, listing_tier, listingTier, expiry_date, expiryDate
  } = req.body;

  const placeholderIds = [
    "photo-1522771739844-6a9f6d5f14af",
    "photo-1586023492125-27b2c045efd7",
    "photo-1598928506311-c55ded91a20c",
    "photo-1505691938895-1758d7feb511",
    "photo-1560185007-cde436f6a4d0",
    "photo-1566073771259-6a8506099945",
    "photo-1497366216548-37526070297c",
  ];
  const collectedImgs: string[] = [];
  if (Array.isArray(images)) {
    for (const item of images) {
      if (typeof item === "string" && item.trim()) collectedImgs.push(item.trim());
    }
  }
  if (collectedImgs.length === 0 && typeof image_url === "string" && image_url.trim()) {
    const trimmed = image_url.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === "string" && item.trim()) collectedImgs.push(item.trim());
          }
        }
      } catch (_) {}
    } else {
      collectedImgs.push(trimmed);
    }
  }
  const realImgs = collectedImgs.filter(
    (img) =>
      (img.startsWith("data:image/") || img.startsWith("https://") || img.startsWith("http://") || img.startsWith("/")) &&
      !placeholderIds.some((id) => img.includes(id))
  );
  if (realImgs.length === 0) {
    return res.status(400).json({
      error: "At least one real property photo is required to publish a listing.",
      code: "IMAGE_REQUIRED",
    });
  }
  const sanitizedImageUrl = realImgs.length > 1 ? JSON.stringify(realImgs) : realImgs[0];

  const resolvedCategory = category || (
    ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(property_type)
      ? "hospitality"
      : ["Commercial", "Shop", "Warehouse", "Table", "Office"].includes(property_type)
      ? "commercial"
      : ["Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"].includes(property_type) || tenant_type === "Student"
      ? "student"
      : "residential"
  );
  const resolvedBusinessName = business_name || businessName || null;
  const resolvedIsPremium = (is_premium !== undefined ? is_premium : isPremium) ? 1 : (resolvedCategory === "hospitality" ? 1 : 0);
  const resolvedTier = listing_tier || listingTier || (resolvedCategory === "hospitality" ? "paid" : "free");
  const resolvedExpiry = expiry_date || expiryDate || (resolvedIsPremium ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : null);

  try {
    const stmt = db.prepare(`
      INSERT INTO listings 
      (title, suburb, price, landlord_id, verification_status, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities, category, business_name, is_premium, listing_tier, expiry_date, is_sample)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const result = stmt.run(
      title, suburb, Number(price), landlord_id || null, verification_status || 'Active', 
      sanitizedImageUrl, landmark || null, city || null, Number(deposit || 0), 
      property_type || null, tenant_type || null, rent_cycle || 'Month', 
      contact_method || null, contact_phone || null, typeof amenities === "string" ? amenities : JSON.stringify(amenities || []),
      resolvedCategory, resolvedBusinessName, resolvedIsPremium, resolvedTier, resolvedExpiry
    );

    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Report listing endpoint (supports both /api/rooms/:id/report and /api/listings/:id/report)
app.post(["/api/rooms/:id/report", "/api/listings/:id/report"], (req, res) => {
  const cleanListingId = Number(req.params.id);
  if (!Number.isInteger(cleanListingId) || cleanListingId <= 0) {
    return res.status(400).json({ error: "Invalid listing ID." });
  }

  const { reason, details, reporterName, reporterPhone, name, phone, reporterToken } = req.body || {};
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return res.status(400).json({ error: "A valid reason is required to submit a report." });
  }

  const finalReason = reason.trim().slice(0, 200);
  const finalDetails = details && typeof details === "string" && details.trim() ? details.trim().slice(0, 1000) : null;
  const finalReporterName = (reporterName || name || "").toString().trim().slice(0, 100) || null;
  const finalReporterPhone = (reporterPhone || phone || "").toString().trim().slice(0, 50) || null;
  const clientReporterToken = (
    (req.headers["x-reporter-token"] as string) ||
    reporterToken ||
    ""
  ).toString().trim().slice(0, 128);

  const clientIp = getExpressClientIp(req);
  const userAgent = String(req.headers["user-agent"] || "unknown").slice(0, 200);
  const ipHash = computeExpressKeyedHash("ip", clientIp);

  const normalizedPhoneDigits = finalReporterPhone ? finalReporterPhone.replace(/\D/g, "") : "";
  const reporterRawSeed =
    clientReporterToken.length >= 8
      ? `tok:${clientReporterToken}`
      : normalizedPhoneDigits.length >= 7
      ? `ph:${normalizedPhoneDigits}`
      : `anon:${clientIp}|${userAgent}`;
  const reporterTokenHash = computeExpressKeyedHash("reporter", reporterRawSeed);

  try {
    scrubExpiredExpressIpHashes();

    const listing = db.prepare("SELECT id, verification_status FROM listings WHERE id = ?").get(cleanListingId) as any;
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (listing.verification_status === "Removed") {
      return res.status(410).json({ error: "This listing has already been removed by moderation." });
    }

    // 1. IP-hash rate limit (max 5 reports per 15 minutes)
    const rateRow = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM listing_reports
      WHERE ip_hash = ? AND created_at > datetime('now', '-15 minutes')
    `).get(ipHash) as any;
    if (Number(rateRow?.cnt || 0) >= 5) {
      return res.status(429).json({
        error: "Too many reports submitted recently from your connection. Please wait a few minutes before submitting another report.",
        code: "RATE_LIMITED"
      });
    }

    // 2. Duplicate detection: primary check is the pseudonymous browser/device token
    //    (IP hashes are reserved for rate limiting & suspicious cluster detection, not rejecting shared IPs)
    const existingOpen = db.prepare(`
      SELECT id FROM listing_reports
      WHERE listing_id = ? AND reporter_token_hash = ? AND status IN ('pending', 'under_review')
      LIMIT 1
    `).get(cleanListingId, reporterTokenHash);
    if (existingOpen) {
      return res.status(409).json({
        error: "You have already reported this listing and it is currently awaiting or under moderation review.",
        code: "DUPLICATE_REPORT"
      });
    }

    const insertRes = db.prepare(`
      INSERT INTO listing_reports (
        listing_id, reason, details, reporter_name, reporter_phone,
        reporter_token_hash, ip_hash, ip_hash_expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+30 days'), 'pending')
    `).run(cleanListingId, finalReason, finalDetails, finalReporterName, finalReporterPhone, reporterTokenHash, ipHash);

    try {
      db.prepare("UPDATE listings SET reports_count = COALESCE(reports_count, 0) + 1 WHERE id = ?").run(cleanListingId);
    } catch (_) {}

    res.status(201).json({
      success: true,
      reportId: insertRes.lastInsertRowid,
      message: "Thank you for reporting. Our moderation team will investigate this listing."
    });
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("UNIQUE constraint failed")) {
      return res.status(409).json({
        error: "You have already submitted an open report for this listing.",
        code: "DUPLICATE_REPORT"
      });
    }
    res.status(500).json({ error: err.message });
  }
});

function executeExpressModeration({
  admin,
  reportId,
  listingId,
  body,
}: {
  admin: { id: number; name: string };
  reportId?: string | number | null;
  listingId?: string | number | null;
  body: any;
}): { status: number; payload: any } {
  const validActions = [
    "mark_under_review",
    "dismiss",
    "dismiss_report",
    "hide_listing",
    "restore_listing",
    "remove_listing",
    "resolve",
    "resolve_report",
    "add_note",
  ];
  const rawAction = typeof body?.action === "string" ? body.action.trim() : "";
  if (!validActions.includes(rawAction)) {
    return { status: 400, payload: { error: `Unsupported moderation action: "${rawAction}".` } };
  }

  const notes =
    typeof body?.notes === "string"
      ? body.notes.trim().slice(0, 1000)
      : typeof body?.moderation_notes === "string"
      ? body.moderation_notes.trim().slice(0, 1000)
      : null;
  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 300)
      : null;

  let targetReport: any = null;
  if (reportId !== undefined && reportId !== null && String(reportId).trim() !== "") {
    const cleanReportId = Number(reportId);
    if (!Number.isInteger(cleanReportId) || cleanReportId <= 0) {
      return { status: 400, payload: { error: "Invalid report ID." } };
    }
    targetReport = db.prepare("SELECT * FROM listing_reports WHERE id = ?").get(cleanReportId);
    if (!targetReport) {
      return { status: 404, payload: { error: "Report not found." } };
    }
  }

  const resolvedListingId = Number(listingId ?? targetReport?.listing_id ?? body?.listingId ?? 0);
  if (!Number.isInteger(resolvedListingId) || resolvedListingId <= 0) {
    return { status: 400, payload: { error: "Valid listing ID is required." } };
  }

  const listing = db.prepare("SELECT * FROM listings WHERE id = ?").get(resolvedListingId) as any;
  if (!listing) {
    return { status: 404, payload: { error: "Associated listing not found." } };
  }

  const prevStatus = String(listing.verification_status || "Active");
  let nextListingStatus = prevStatus;
  let nextReportStatus: string | null = null;
  let normalizedActionType = rawAction;

  if (rawAction === "mark_under_review") {
    normalizedActionType = "mark_under_review";
    nextReportStatus = "under_review";
  } else if (rawAction === "dismiss" || rawAction === "dismiss_report") {
    normalizedActionType = "dismiss_report";
    nextReportStatus = "dismissed";
  } else if (rawAction === "resolve" || rawAction === "resolve_report") {
    normalizedActionType = "resolve_report";
    nextReportStatus = "resolved";
  } else if (rawAction === "hide_listing") {
    normalizedActionType = "hide_listing";
    nextListingStatus = "Hidden";
    nextReportStatus = "action_taken";
  } else if (rawAction === "remove_listing") {
    normalizedActionType = "remove_listing";
    nextListingStatus = "Removed";
    nextReportStatus = "action_taken";
  } else if (rawAction === "restore_listing") {
    normalizedActionType = "restore_listing";
    const lastHide = db.prepare(`
      SELECT previous_listing_status FROM listing_moderation_actions
      WHERE listing_id = ?
        AND new_listing_status IN ('Hidden', 'Removed')
        AND previous_listing_status IN ('Active', 'verified')
      ORDER BY id DESC LIMIT 1
    `).get(resolvedListingId) as any;
    nextListingStatus = lastHide?.previous_listing_status || "Active";
    nextReportStatus = targetReport ? "resolved" : null;
  } else if (rawAction === "add_note") {
    normalizedActionType = "add_note";
    nextReportStatus = targetReport ? String(targetReport.status) : null;
  }

  if (nextListingStatus !== prevStatus) {
    db.prepare("UPDATE listings SET verification_status = ? WHERE id = ?").run(nextListingStatus, resolvedListingId);
  }

  if (targetReport && nextReportStatus) {
    db.prepare(`
      UPDATE listing_reports
      SET status = ?,
          reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by = ?,
          reviewed_by_name = ?,
          moderation_notes = COALESCE(?, moderation_notes)
      WHERE id = ?
    `).run(nextReportStatus, admin.id, admin.name, notes, targetReport.id);
  }

  if (normalizedActionType === "hide_listing" || normalizedActionType === "remove_listing") {
    db.prepare(`
      UPDATE listing_reports
      SET status = 'action_taken',
          reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by = ?,
          reviewed_by_name = ?,
          moderation_notes = COALESCE(?, moderation_notes)
      WHERE listing_id = ?
        AND status IN ('pending', 'under_review')
    `).run(admin.id, admin.name, notes, resolvedListingId);
  }

  const auditRes = db.prepare(`
    INSERT INTO listing_moderation_actions (
      listing_id, report_id, admin_id, admin_name, action_type,
      previous_listing_status, new_listing_status, reason, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    resolvedListingId,
    targetReport ? targetReport.id : null,
    admin.id,
    admin.name,
    normalizedActionType,
    prevStatus,
    nextListingStatus,
    reason,
    notes
  );

  return {
    status: 200,
    payload: {
      success: true,
      actionId: auditRes.lastInsertRowid,
      actionType: normalizedActionType,
      listingId: resolvedListingId,
      previousListingStatus: prevStatus,
      newListingStatus: nextListingStatus,
      reportId: targetReport ? targetReport.id : null,
      reportStatus: nextReportStatus,
    }
  };
}

app.get("/api/admin", (req, res) => {
  const requester = getAuthenticatedLandlord(req);
  if (!requester) {
    return res.status(401).json({ error: "Authentication required: Please log in as an administrator." });
  }
  if (!requester.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Administrator privileges required." });
  }

  try {
    scrubExpiredExpressIpHashes();
    const landlords = db.prepare("SELECT id, full_name, national_id_url, rates_bill_url, verification_status FROM landlords").all();
    const listings = db.prepare("SELECT * FROM listings ORDER BY created_at DESC, id DESC").all();
    const reports = db.prepare(`
      SELECT
        r.id, r.listing_id, r.reason, r.details, r.reporter_name, r.reporter_phone,
        CASE
          WHEN r.reporter_token_hash IS NOT NULL AND r.reporter_token_hash != ''
            THEN 'TEN-' || UPPER(SUBSTR(r.reporter_token_hash, 1, 8))
          ELSE 'TEN-' || r.id
        END AS reporter_id,
        r.status, r.created_at, r.reviewed_at, r.reviewed_by, r.reviewed_by_name,
        r.moderation_notes,
        l.title AS listing_title, l.city AS listing_city, l.suburb AS listing_suburb,
        l.price AS listing_price, l.rent_cycle AS listing_frequency,
        l.property_type AS listing_property_type, l.category AS listing_category,
        l.verification_status AS listing_status, l.landlord_id AS listing_landlord_id,
        l.contact_phone AS listing_contact_phone,
        l.reports_count AS listing_reports_count,
        ld.full_name AS listing_landlord_name,
        (
          SELECT COUNT(*) FROM listing_reports r2
          WHERE r2.listing_id = r.listing_id AND r2.ip_hash IS NOT NULL AND r2.ip_hash = r.ip_hash
        ) AS same_ip_reports_count
      FROM listing_reports r
      LEFT JOIN listings l ON l.id = r.listing_id
      LEFT JOIN landlords ld ON ld.id = l.landlord_id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 200
    `).all();
    const moderationActions = db.prepare(`
      SELECT a.*, l.title AS listing_title
      FROM listing_moderation_actions a
      LEFT JOIN listings l ON l.id = a.listing_id
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 100
    `).all();
    res.json({ landlords, listings, reports, moderationActions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/reports", (req, res) => {
  const requester = getAuthenticatedLandlord(req);
  if (!requester) {
    return res.status(401).json({ error: "Authentication required: Please log in as an administrator." });
  }
  if (!requester.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Administrator privileges required." });
  }

  try {
    scrubExpiredExpressIpHashes();
    const statusFilter = String(req.query.status || "all").trim();
    const listingIdParam = String(req.query.listingId || "").trim();
    const searchQuery = String(req.query.q || "").trim();

    const whereClauses: string[] = [];
    const params: any[] = [];
    if (statusFilter && statusFilter !== "all" && ["pending", "under_review", "action_taken", "dismissed", "resolved"].includes(statusFilter)) {
      whereClauses.push("r.status = ?");
      params.push(statusFilter);
    }
    if (listingIdParam && /^\d+$/.test(listingIdParam)) {
      whereClauses.push("r.listing_id = ?");
      params.push(Number(listingIdParam));
    }
    if (searchQuery) {
      whereClauses.push("(r.reason LIKE ? OR r.details LIKE ? OR l.title LIKE ? OR l.suburb LIKE ? OR l.city LIKE ? OR COALESCE(r.reporter_name, '') LIKE ? OR COALESCE(r.reporter_phone, '') LIKE ? OR ('TEN-' || UPPER(SUBSTR(COALESCE(r.reporter_token_hash, ''), 1, 8))) LIKE ? OR CAST(r.id AS TEXT) LIKE ? OR CAST(r.listing_id AS TEXT) LIKE ? OR CAST(l.landlord_id AS TEXT) LIKE ?)");
      const qLike = `%${searchQuery}%`;
      const qUpperLike = `%${searchQuery.toUpperCase()}%`;
      params.push(qLike, qLike, qLike, qLike, qLike, qLike, qLike, qUpperLike, qLike, qLike, qLike);
    }
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const reports = db.prepare(`
      SELECT
        r.id, r.listing_id, r.reason, r.details, r.reporter_name, r.reporter_phone,
        CASE
          WHEN r.reporter_token_hash IS NOT NULL AND r.reporter_token_hash != ''
            THEN 'TEN-' || UPPER(SUBSTR(r.reporter_token_hash, 1, 8))
          ELSE 'TEN-' || r.id
        END AS reporter_id,
        r.status, r.created_at, r.reviewed_at, r.reviewed_by, r.reviewed_by_name,
        r.moderation_notes,
        l.title AS listing_title, l.city AS listing_city, l.suburb AS listing_suburb,
        l.price AS listing_price, l.rent_cycle AS listing_frequency,
        l.property_type AS listing_property_type, l.category AS listing_category,
        l.verification_status AS listing_status, l.landlord_id AS listing_landlord_id,
        l.contact_phone AS listing_contact_phone,
        l.reports_count AS listing_reports_count,
        ld.full_name AS listing_landlord_name,
        (
          SELECT COUNT(*) FROM listing_reports r2
          WHERE r2.listing_id = r.listing_id AND r2.ip_hash IS NOT NULL AND r2.ip_hash = r.ip_hash
        ) AS same_ip_reports_count
      FROM listing_reports r
      LEFT JOIN listings l ON l.id = r.listing_id
      LEFT JOIN landlords ld ON ld.id = l.landlord_id
      ${whereSql}
      ORDER BY
        CASE r.status
          WHEN 'pending' THEN 0
          WHEN 'under_review' THEN 1
          WHEN 'action_taken' THEN 2
          WHEN 'resolved' THEN 3
          WHEN 'dismissed' THEN 4
          ELSE 5
        END,
        r.created_at DESC,
        r.id DESC
      LIMIT 200
    `).all(...params);

    const countsRows = db.prepare("SELECT status, COUNT(*) as cnt FROM listing_reports GROUP BY status").all() as any[];
    const visRow = db.prepare(`
      SELECT
        SUM(CASE WHEN verification_status = 'Hidden' THEN 1 ELSE 0 END) as hidden_listings,
        SUM(CASE WHEN verification_status = 'Removed' THEN 1 ELSE 0 END) as removed_listings
      FROM listings
    `).get() as any;

    const moderationActions = db.prepare(`
      SELECT a.*, l.title AS listing_title
      FROM listing_moderation_actions a
      LEFT JOIN listings l ON l.id = a.listing_id
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 100
    `).all();

    const statusCounts: Record<string, number> = {
      pending: 0,
      under_review: 0,
      action_taken: 0,
      dismissed: 0,
      resolved: 0,
      total: 0,
    };
    for (const row of countsRows) {
      statusCounts[String(row.status)] = Number(row.cnt || 0);
      statusCounts.total += Number(row.cnt || 0);
    }

    res.json({
      reports,
      moderationActions,
      stats: {
        ...statusCounts,
        hiddenListings: Number(visRow?.hidden_listings || 0),
        removedListings: Number(visRow?.removed_listings || 0),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/reports/:id", (req, res) => {
  const requester = getAuthenticatedLandlord(req);
  if (!requester) return res.status(401).json({ error: "Authentication required." });
  if (!requester.isAdmin) return res.status(403).json({ error: "Forbidden: Administrator privileges required." });

  const cleanId = Number(req.params.id);
  if (!Number.isInteger(cleanId) || cleanId <= 0) {
    return res.status(400).json({ error: "Invalid report ID." });
  }

  try {
    const report = db.prepare(`
      SELECT
        r.id, r.listing_id, r.reason, r.details, r.reporter_name, r.reporter_phone,
        CASE
          WHEN r.reporter_token_hash IS NOT NULL AND r.reporter_token_hash != ''
            THEN 'TEN-' || UPPER(SUBSTR(r.reporter_token_hash, 1, 8))
          ELSE 'TEN-' || r.id
        END AS reporter_id,
        r.status, r.created_at, r.reviewed_at, r.reviewed_by, r.reviewed_by_name,
        r.moderation_notes,
        l.title AS listing_title, l.city AS listing_city, l.suburb AS listing_suburb,
        l.landmark AS listing_landmark, l.price AS listing_price, l.deposit AS listing_deposit,
        l.rent_cycle AS listing_frequency, l.property_type AS listing_property_type,
        l.category AS listing_category, l.verification_status AS listing_status,
        l.landlord_id AS listing_landlord_id, l.contact_phone AS listing_contact_phone,
        l.image_url AS listing_image_url, l.reports_count AS listing_reports_count,
        ld.full_name AS listing_landlord_name,
        (
          SELECT COUNT(*) FROM listing_reports r2
          WHERE r2.listing_id = r.listing_id AND r2.ip_hash IS NOT NULL AND r2.ip_hash = r.ip_hash
        ) AS same_ip_reports_count
      FROM listing_reports r
      LEFT JOIN listings l ON l.id = r.listing_id
      LEFT JOIN landlords ld ON ld.id = l.landlord_id
      WHERE r.id = ?
    `).get(cleanId) as any;

    if (!report) return res.status(404).json({ error: "Report not found." });

    const siblingReports = db.prepare(`
      SELECT
        id, reason, details, reporter_name, reporter_phone,
        CASE
          WHEN reporter_token_hash IS NOT NULL AND reporter_token_hash != ''
            THEN 'TEN-' || UPPER(SUBSTR(reporter_token_hash, 1, 8))
          ELSE 'TEN-' || id
        END AS reporter_id,
        status, created_at, reviewed_at, reviewed_by_name, moderation_notes
      FROM listing_reports
      WHERE listing_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(report.listing_id);

    const moderationActions = db.prepare(`
      SELECT * FROM listing_moderation_actions
      WHERE listing_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(report.listing_id);

    res.json({ report, siblingReports, moderationActions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/api/admin/reports/:id", "/api/admin/reports/:id/moderate"], (req, res) => {
  const requester = getAuthenticatedLandlord(req);
  if (!requester) return res.status(401).json({ error: "Authentication required." });
  if (!requester.isAdmin) return res.status(403).json({ error: "Forbidden: Administrator privileges required." });
  try {
    const out = executeExpressModeration({ admin: requester, reportId: req.params.id, body: req.body });
    res.status(out.status).json(out.payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/admin/reports/:id", (req, res) => {
  const requester = getAuthenticatedLandlord(req);
  if (!requester) return res.status(401).json({ error: "Authentication required." });
  if (!requester.isAdmin) return res.status(403).json({ error: "Forbidden: Administrator privileges required." });
  try {
    const out = executeExpressModeration({ admin: requester, reportId: req.params.id, body: req.body });
    res.status(out.status).json(out.payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/listings/:id/moderate", (req, res) => {
  const requester = getAuthenticatedLandlord(req);
  if (!requester) return res.status(401).json({ error: "Authentication required." });
  if (!requester.isAdmin) return res.status(403).json({ error: "Forbidden: Administrator privileges required." });
  try {
    const out = executeExpressModeration({
      admin: requester,
      listingId: req.params.id,
      reportId: req.body?.reportId ?? null,
      body: req.body,
    });
    res.status(out.status).json(out.payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin", (req, res) => {
  const requester = getAuthenticatedLandlord(req);
  if (!requester || !requester.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Administrator privileges required to perform administrative mutations." });
  }

  const { action, id, targetId, phone, status, reportId, listingId } = req.body;
  const targetLandlordId = id || (phone ? Number(String(phone).replace(/\D/g, "")) : null);
  const targetListingId = id || targetId || listingId;

  try {
    if (action === "verify") {
      const nextStatus = status || "verified";
      db.prepare("UPDATE landlords SET verification_status = ? WHERE id = ?").run(nextStatus, targetLandlordId);
      db.prepare("UPDATE listings SET verification_status = ? WHERE landlord_id = ? AND COALESCE(verification_status, 'Active') NOT IN ('Hidden', 'Removed')").run(nextStatus === "verified" ? "Active" : "Delisted", targetLandlordId);
      return res.json({ success: true, updated: targetLandlordId, status: nextStatus });
    } else if (action === "deleteLandlord") {
      db.prepare(`
        UPDATE listings
        SET verification_status = 'Removed', landlord_id = NULL
        WHERE landlord_id = ?
          AND (
            EXISTS (SELECT 1 FROM listing_reports r WHERE r.listing_id = listings.id)
            OR EXISTS (SELECT 1 FROM listing_moderation_actions a WHERE a.listing_id = listings.id)
          )
      `).run(targetLandlordId);
      db.prepare(`
        DELETE FROM listings
        WHERE landlord_id = ?
          AND NOT EXISTS (SELECT 1 FROM listing_reports r WHERE r.listing_id = listings.id)
          AND NOT EXISTS (SELECT 1 FROM listing_moderation_actions a WHERE a.listing_id = listings.id)
      `).run(targetLandlordId);
      db.prepare("DELETE FROM landlords WHERE id = ?").run(targetLandlordId);
      return res.json({ success: true });
    } else if (action === "deleteListing") {
      const out = executeExpressModeration({
        admin: requester,
        reportId: reportId ?? null,
        listingId: targetListingId ?? null,
        body: {
          ...req.body,
          action: "remove_listing",
          notes:
            req.body?.notes ||
            "Removed by administrator (record and report history preserved)",
        },
      });
      return res.status(out.status).json(out.payload);
    } else if ([
      "mark_under_review", "dismiss", "dismiss_report", "hide_listing",
      "restore_listing", "remove_listing", "resolve", "resolve_report", "add_note"
    ].includes(action)) {
      const out = executeExpressModeration({
        admin: requester,
        reportId: reportId ?? null,
        listingId: targetListingId ?? null,
        body: req.body,
      });
      return res.status(out.status).json(out.payload);
    }
    res.status(400).json({ error: "Unknown action" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(["/api/rooms/:id", "/api/listings/:id"], (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const row = db.prepare(`
      SELECT
        listings.*,
        landlords.full_name as landlordName,
        landlords.verification_status as landlordVerificationStatus
      FROM listings
      LEFT JOIN landlords ON listings.landlord_id = landlords.id
      WHERE listings.id = ?
    `).get(id) as any;

    if (!row) {
      return res.status(404).json({ error: "Listing not found" });
    }

    const mapped = normalizeListingRow(row);
    const available = isListingAvailable(mapped);

    if (!available) {
      return res.status(410).json({
        available: false,
        listing: {
          id: mapped.id,
          title: mapped.title,
          city: mapped.city,
          suburb: mapped.suburb,
          propertyType: mapped.propertyType,
          category: mapped.category,
          status: mapped.status,
        },
      });
    }

    return res.json({ available: true, listing: mapped });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/rooms/:id", (req, res) => {
  const { id } = req.params;
  const {
    title, suburb, price, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities,
    category, business_name, businessName, is_premium, isPremium, listing_tier, listingTier, verification_status, status
  } = req.body;

  try {
    const existingListing = db.prepare("SELECT * FROM listings WHERE id = ?").get(id) as any;
    if (!existingListing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    // Server-side authentication and ownership check
    const requester = getAuthenticatedLandlord(req);
    if (!requester) {
      return res.status(401).json({ error: "Unauthorized: Valid landlord authentication token is required." });
    }
    if (existingListing.landlord_id && requester.id !== existingListing.landlord_id && !requester.isAdmin) {
      return res.status(403).json({ error: "Forbidden: You do not have permission to modify another landlord's listing." });
    }

    const resolvedCategory = category || (["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(property_type) ? "hospitality" : "residential");
    const resolvedBusinessName = business_name || businessName || null;
    const resolvedIsPremium = (is_premium !== undefined ? is_premium : isPremium) ? 1 : 0;
    const resolvedTier = listing_tier || listingTier || (resolvedIsPremium ? "paid" : "free");
    const isModeratedLocked =
      !requester.isAdmin &&
      (existingListing.verification_status === "Hidden" || existingListing.verification_status === "Removed");
    const resolvedStatus = isModeratedLocked
      ? existingListing.verification_status
      : verification_status || status || existingListing.verification_status || 'Active';

    const stmt = db.prepare(`
      UPDATE listings SET
        title = ?, suburb = ?, price = ?, image_url = ?, landmark = ?, city = ?, deposit = ?, property_type = ?, tenant_type = ?, rent_cycle = ?, contact_method = ?, contact_phone = ?, amenities = ?,
        category = ?, business_name = ?, is_premium = ?, listing_tier = ?, verification_status = ?
      WHERE id = ?
    `);

    stmt.run(
      title, suburb, Number(price), image_url || null, landmark || null, city || null, Number(deposit || 0), 
      property_type || null, tenant_type || null, rent_cycle || 'Month', 
      contact_method || null, contact_phone || null, typeof amenities === "string" ? amenities : JSON.stringify(amenities || []),
      resolvedCategory, resolvedBusinessName, resolvedIsPremium, resolvedTier, resolvedStatus,
      id
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/rooms/:id/set-status", (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "Missing status parameter" });
  try {
    const existingListing = db.prepare("SELECT * FROM listings WHERE id = ?").get(req.params.id) as any;
    if (!existingListing) return res.status(404).json({ error: "Listing not found" });

    const requester = getAuthenticatedLandlord(req);
    if (!requester) {
      return res.status(401).json({ error: "Unauthorized: Valid landlord authentication token is required." });
    }
    if (existingListing.landlord_id && requester.id !== existingListing.landlord_id && !requester.isAdmin) {
      return res.status(403).json({ error: "Forbidden: You do not have permission to change this listing status." });
    }

    if (
      !requester.isAdmin &&
      (existingListing.verification_status === "Hidden" || existingListing.verification_status === "Removed")
    ) {
      return res.status(403).json({
        error: `This listing is currently ${existingListing.verification_status.toLowerCase()} by BunkBy moderation and cannot be reactivated without administrator review.`
      });
    }

    db.prepare("UPDATE listings SET verification_status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/rooms/:id", (req, res) => {
  try {
    const existingListing = db.prepare("SELECT * FROM listings WHERE id = ?").get(req.params.id) as any;
    if (!existingListing) return res.status(404).json({ error: "Listing not found" });

    const requester = getAuthenticatedLandlord(req);
    if (!requester) {
      return res.status(401).json({ error: "Unauthorized: Valid landlord authentication token is required." });
    }
    if (existingListing.landlord_id && requester.id !== existingListing.landlord_id && !requester.isAdmin) {
      return res.status(403).json({ error: "Forbidden: You do not have permission to delete this listing." });
    }
    if (
      !requester.isAdmin &&
      (existingListing.verification_status === "Hidden" || existingListing.verification_status === "Removed")
    ) {
      return res.status(403).json({
        error: `Forbidden: This listing is currently ${String(existingListing.verification_status).toLowerCase()} by BunkBy moderation and cannot be deleted without administrator review.`
      });
    }

    const hasReport = db.prepare("SELECT id FROM listing_reports WHERE listing_id = ? LIMIT 1").get(req.params.id);
    const hasAction = db.prepare("SELECT id FROM listing_moderation_actions WHERE listing_id = ? LIMIT 1").get(req.params.id);
    if (hasReport || hasAction || requester.isAdmin) {
      const nextStatus = requester.isAdmin ? "Removed" : "Delisted";
      db.prepare("UPDATE listings SET verification_status = ? WHERE id = ?").run(nextStatus, req.params.id);
      if (requester.isAdmin) {
        db.prepare(`
          INSERT INTO listing_moderation_actions (
            listing_id, report_id, admin_id, admin_name, action_type,
            previous_listing_status, new_listing_status, reason, notes
          ) VALUES (?, NULL, ?, ?, 'remove_listing', ?, 'Removed', 'Admin removal', 'Removed via listing endpoint (report history preserved)')
        `).run(req.params.id, requester.id, requester.name, existingListing.verification_status || "Active");
      }
      return res.json({ success: true, preservedHistory: true, status: nextStatus });
    }

    db.prepare("DELETE FROM listings WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/rooms/:id/toggle-status", (req, res) => {
  try {
    const listing = db.prepare("SELECT * FROM listings WHERE id = ?").get(req.params.id) as any;
    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    const requester = getAuthenticatedLandlord(req);
    if (!requester) {
      return res.status(401).json({ error: "Unauthorized: Valid landlord authentication token is required." });
    }
    if (listing.landlord_id && requester.id !== listing.landlord_id && !requester.isAdmin) {
      return res.status(403).json({ error: "Forbidden: You do not have permission to modify this listing." });
    }

    if (
      !requester.isAdmin &&
      (listing.verification_status === "Hidden" || listing.verification_status === "Removed")
    ) {
      return res.status(403).json({
        error: `This listing is currently ${listing.verification_status.toLowerCase()} by BunkBy moderation and cannot be reactivated without administrator review.`
      });
    }

    const nextStatus = listing.verification_status === "Active" ? "Delisted" : "Active";
    db.prepare("UPDATE listings SET verification_status = ? WHERE id = ?").run(nextStatus, req.params.id);
    res.json({ success: true, status: nextStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/rooms/:id/lead", (req, res) => {
  try {
    db.prepare("UPDATE listings SET leads_count = leads_count + 1 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Public endpoint to serve listing photographs to WhatsApp & external clients
app.get(["/api/listings/:id/photo", "/api/rooms/:id/photo", "/api/listings/:id/photo.jpg", "/api/rooms/:id/photo.jpg"], (req, res) => {
  try {
    const cleanId = String(req.params.id || "").replace(/\.[a-zA-Z0-9]+$/, "");
    const listing = db.prepare("SELECT image_url, title FROM listings WHERE id = ?").get(cleanId) as any;
    if (!listing || !listing.image_url) {
      return res.status(404).send("Photograph not found");
    }

    const idxRaw = req.query.index ?? req.query.idx ?? req.query.i;
    const requestedIdx = idxRaw !== undefined ? parseInt(String(idxRaw), 10) : NaN;
    const photoIndex = !Number.isNaN(requestedIdx) && requestedIdx >= 0 ? requestedIdx : null;

    let raw = String(listing.image_url).trim();

    // If stored as JSON array of multiple photos, extract requested index or primary valid photo
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const entries = parsed.map((item: any) => String(item || "").trim()).filter(Boolean);
          if (photoIndex !== null) {
            raw = entries[photoIndex] !== undefined ? entries[photoIndex] : (entries[0] || "");
          } else {
            raw = entries.find((item: string) => !/logo|bunkbylogo|watermark|favicon|brand-mark/i.test(item)) || entries[0] || "";
          }
        }
      } catch (_) {}
    }

    if (!raw) {
      return res.status(404).send("Photograph not found");
    }

    // If it's a data URI (base64 image from web camera / upload)
    if (raw.startsWith("data:")) {
      const matches = raw.match(/^data:([a-zA-Z0-9.+_-]+\/[a-zA-Z0-9.+_-]+)(?:;[a-zA-Z0-9=_-]+)*;base64,([\s\S]+)$/i);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2].replace(/\s+/g, ""), "base64");
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.send(buffer);
      }
    }

    // If it's an HTTP/HTTPS URL
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return res.redirect(302, raw);
    }

    // If it's a relative URL
    if (raw.startsWith("/")) {
      return res.redirect(302, raw);
    }

    res.status(404).send("Photograph not found");
  } catch (err: any) {
    res.status(500).send("Error serving photograph");
  }
});

// Meta WhatsApp Cloud API Webhook Verification (GET)
app.get("/api/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe") {
    if (expectedToken && token !== expectedToken) {
      console.warn("[WhatsApp Webhook] Verification token mismatch. Provided:", token);
      return res.status(403).send("Forbidden: verification token mismatch");
    }
    if (challenge) {
      console.log("[WhatsApp Webhook] Challenge verified successfully.");
      return res.status(200).send(challenge);
    }
  }

  res.json({
    status: "online",
    service: "BunkBy Meta WhatsApp Cloud API Integration",
    metaConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    endpoints: {
      webhook: "/api/whatsapp",
      test: "/api/whatsapp/test",
      chatSimulator: "/api/whatsapp/chat",
      photo: "/api/listings/:id/photo"
    }
  });
});

// WhatsApp Live Diagnostic History (in-memory, sanitized, no secrets, max 20 events)
interface WhatsAppDiagnosticLog {
  timestamp: string;
  field?: string;
  sender?: string;
  senderName?: string;
  incomingTextPreview?: string;
  messageType?: string;
  actionTaken?: string;
  outboundCount?: number;
  outboundDelivery?: Array<{
    success: boolean;
    error?: string;
    simulated?: boolean;
    messageId?: string;
  }>;
  status?: string;
  error?: string;
}

const recentWhatsAppEvents: WhatsAppDiagnosticLog[] = [];

function recordWhatsAppDiagnostic(log: WhatsAppDiagnosticLog) {
  recentWhatsAppEvents.unshift(log);
  if (recentWhatsAppEvents.length > 25) {
    recentWhatsAppEvents.pop();
  }

  // Also persist to SQLite database so restarts or multi-worker recycling preserve logs
  try {
    db.prepare(`
      INSERT INTO whatsapp_diagnostic_events (
        timestamp, field, sender, sender_name, incoming_preview, message_type, action_taken, outbound_count, outbound_delivery, status, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.timestamp || new Date().toISOString(),
      log.field || null,
      log.sender || null,
      log.senderName || null,
      log.incomingTextPreview || null,
      log.messageType || null,
      log.actionTaken || null,
      log.outboundCount || 0,
      log.outboundDelivery ? JSON.stringify(log.outboundDelivery) : null,
      log.status || "processed",
      log.error || null
    );

    // Keep table trimmed to last 50 events
    db.exec(`
      DELETE FROM whatsapp_diagnostic_events 
      WHERE id NOT IN (SELECT id FROM whatsapp_diagnostic_events ORDER BY id DESC LIMIT 50)
    `);
  } catch (dbErr) {
    console.warn("[WhatsApp Diagnostic DB Warning]:", dbErr);
  }
}

// Endpoint to view latest WhatsApp processing status and Meta error codes safely
app.get("/api/whatsapp/diagnostics", (req, res) => {
  let dbEvents: any[] = [];
  try {
    dbEvents = db.prepare(`
      SELECT 
        id, timestamp, field, sender, sender_name as senderName, 
        incoming_preview as incomingTextPreview, message_type as messageType, 
        action_taken as actionTaken, outbound_count as outboundCount, 
        outbound_delivery as outboundDelivery, status, error 
      FROM whatsapp_diagnostic_events 
      ORDER BY id DESC LIMIT 25
    `).all().map((r: any) => ({
      ...r,
      outboundDelivery: r.outboundDelivery ? JSON.parse(r.outboundDelivery) : []
    }));
  } catch (_) {
    dbEvents = recentWhatsAppEvents;
  }

  res.json({
    status: "ok",
    metaConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    hasAccessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    hasPhoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? `${process.env.WHATSAPP_PHONE_NUMBER_ID.slice(0, 4)}***` : null,
    totalEventsTracked: dbEvents.length,
    events: dbEvents,
    serverTimestamp: new Date().toISOString()
  });
});

// Meta WhatsApp Cloud API Webhook Events (POST)
app.post("/api/whatsapp", async (req, res) => {
  // Always acknowledge Meta with 200 OK immediately to avoid webhook timeouts
  res.status(200).json({ status: "received" });

  const eventTimestamp = new Date().toISOString();
  const field = req.body?.entry?.[0]?.changes?.[0]?.field || "unknown";

  try {
    const changeVal = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = changeVal?.messages?.[0];
    const contact = changeVal?.contacts?.[0];
    const rawSender = msg?.from || contact?.wa_id || "";
    const sanitizedSender = rawSender ? `${rawSender.slice(0, 4)}***${rawSender.slice(-3)}` : "unknown";
    const textPreview = msg?.text?.body || msg?.interactive?.button_reply?.title || msg?.interactive?.list_reply?.title || msg?.type || "";

    console.log(`[WhatsApp Webhook Received] Incoming event (Field: ${field}, Sender: ${sanitizedSender})`);

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const metaConfig = {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
    };

    const result = await processWhatsAppMessage(db, req.body, baseUrl, metaConfig);
    console.log(`[WhatsApp Webhook Processed] Event processing complete. Action: ${result.action}`);

    recordWhatsAppDiagnostic({
      timestamp: eventTimestamp,
      field,
      sender: sanitizedSender,
      senderName: contact?.profile?.name || "WhatsApp User",
      incomingTextPreview: typeof textPreview === "string" ? textPreview.slice(0, 60) : "",
      messageType: msg?.type || (changeVal?.statuses ? "status_receipt" : "unknown"),
      actionTaken: result.action,
      outboundCount: result.outboundPayloads?.length || 0,
      outboundDelivery: result.deliveryResults || [],
      status: "processed"
    });
  } catch (err: any) {
    console.error("[WhatsApp Webhook Error]:", err.message || err);
    recordWhatsAppDiagnostic({
      timestamp: eventTimestamp,
      field,
      status: "error",
      error: err.message || String(err)
    });
  }
});

// Safe Test & Development Endpoint for WhatsApp messages
// Allows testing search, state machine, and payload generation without calling Meta
app.post("/api/whatsapp/test", async (req, res) => {
  try {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const metaConfig = {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
    };

    const result = await processWhatsAppMessage(db, req.body, baseUrl, metaConfig);
    res.json({
      success: true,
      result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// In-app WhatsApp Simulator Endpoint (Used by web UI WhatsApp Tab)
app.post("/api/whatsapp/chat", async (req, res) => {
  try {
    const { message, phone = "263771122334" } = req.body;
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

    const testPayload = {
      phone,
      text: message
    };

    const result = await processWhatsAppMessage(db, testPayload, baseUrl);

    // Combine formatted text response for the chat UI
    let combinedText = result.replyText || "";

    if (result.outboundPayloads && result.outboundPayloads.length > 0) {
      const textParts: string[] = [];
      for (const p of result.outboundPayloads) {
        if (p.type === "text" && p.text?.body) {
          textParts.push(p.text.body);
        } else if (p.type === "image" && p.image?.caption) {
          textParts.push(`🖼️ [Photo: ${p.image.link}]\n${p.image.caption}`);
        } else if (p.type === "interactive" && p.interactive?.body?.text) {
          let interactiveDesc = p.interactive.body.text;
          if (p.interactive.action?.buttons) {
            interactiveDesc += "\n\n🔘 Buttons:\n" + p.interactive.action.buttons.map(b => `[${b.reply.title}]`).join(" ");
          }
          if (p.interactive.action?.sections) {
            interactiveDesc += `\n\n📋 List [${p.interactive.action.button || "Options"}]:\n` +
              p.interactive.action.sections
                .map(s => `*${s.title}*\n` + s.rows.map(r => `• ${r.title}`).join("\n"))
                .join("\n\n");
          }
          textParts.push(interactiveDesc);
        }
      }
      if (textParts.length > 0) {
        combinedText = textParts.join("\n\n---\n\n");
      }
    }

    res.json({
      response: combinedText,
      action: result.action,
      outboundPayloads: result.outboundPayloads
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function querySqliteActiveListings(): any[] {
  try {
    const rows = db.prepare(`
      SELECT
        listings.*,
        landlords.full_name as landlordName,
        landlords.verification_status as landlordVerificationStatus
      FROM listings
      LEFT JOIN landlords ON listings.landlord_id = landlords.id
      WHERE listings.verification_status IN ('Active', 'verified')
      ORDER BY COALESCE(listings.is_premium, 0) DESC, listings.created_at DESC, listings.id DESC
    `).all() as any[];
    return rows.map(normalizeListingRow).filter((l) => l && isListingAvailable(l));
  } catch {
    return [];
  }
}

function querySqliteSingleListing(id: string): any | null {
  try {
    const row = db.prepare(`
      SELECT
        listings.*,
        landlords.full_name as landlordName,
        landlords.verification_status as landlordVerificationStatus
      FROM listings
      LEFT JOIN landlords ON listings.landlord_id = landlords.id
      WHERE listings.id = ?
    `).get(id) as any;
    return row ? normalizeListingRow(row) : null;
  } catch {
    return null;
  }
}

function resolveExpressSeoPayload(req: express.Request): SeoPagePayload | null {
  const pathname = req.path || "/";
  if (pathname === "/") {
    const listingQueryId = typeof req.query.listing === "string" ? req.query.listing.trim() : "";
    if (listingQueryId) {
      return buildListingSeo(querySqliteSingleListing(listingQueryId), listingQueryId);
    }
    return buildHomeSeo(querySqliteActiveListings());
  }
  if (pathname === "/whatsapp") {
    return buildWhatsAppSeo();
  }
  if (pathname === "/privacy-policy") {
    return buildPrivacySeo();
  }
  const listingMatch = pathname.match(/^\/listing\/([^/]+)\/?$/);
  if (listingMatch) {
    const id = decodeURIComponent(listingMatch[1]);
    return buildListingSeo(querySqliteSingleListing(id), id);
  }
  const categoryMatch = pathname.match(/^\/categories\/([^/]+)\/?$/);
  if (categoryMatch) {
    const category = decodeURIComponent(categoryMatch[1]);
    return buildCategorySeo(category, querySqliteActiveListings());
  }
  const locationSuburbMatch = pathname.match(/^\/locations\/([^/]+)\/([^/]+)\/?$/);
  if (locationSuburbMatch) {
    const city = decodeURIComponent(locationSuburbMatch[1]);
    const suburb = decodeURIComponent(locationSuburbMatch[2]);
    return buildLocationSeo(city, suburb, querySqliteActiveListings());
  }
  const locationCityMatch = pathname.match(/^\/locations\/([^/]+)\/?$/);
  if (locationCityMatch) {
    const city = decodeURIComponent(locationCityMatch[1]);
    return buildLocationSeo(city, querySqliteActiveListings());
  }
  return null;
}

// Configure Vite or Serve SPA static files
async function startServer() {
  // Dynamic XML Sitemap reflecting live DB listings and indexable location/category hubs
  app.get("/sitemap.xml", (req, res) => {
    const listings = querySqliteActiveListings();
    const xml = buildSitemapXml(listings);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.status(200).send(xml);
  });

  // Standalone server route for the raw private administration board
  app.get(["/admin.html", "/admin"], (req, res) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.sendFile(path.join(process.cwd(), "admin.html"));
  });

  // Serve public static assets with fast browser caching
  app.use(express.static(path.join(process.cwd(), "public"), { maxAge: "1d" }));

  // Ensure unmatched /api/* routes always return JSON 404 instead of SPA HTML fallback
  app.use("/api", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  if (process.env.NODE_ENV !== "production") {
    // Dev Mode - integrate Vite
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });

    // Dynamic SSR HTML & SEO metadata routes before Vite's SPA fallback
    app.get(
      [
        "/",
        "/whatsapp",
        "/privacy-policy",
        "/listing/:id",
        "/categories/:category",
        "/locations/:city",
        "/locations/:city/:suburb",
      ],
      async (req, res, next) => {
        try {
          const seo = resolveExpressSeoPayload(req);
          if (!seo) return next();
          const rawTemplate = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");
          const isCrawler = isCrawlerUserAgent(req.headers["user-agent"]);
          const injected = injectSeoIntoHtml(rawTemplate, seo, { includeSsrBody: isCrawler });
          const transformed = await vite.transformIndexHtml(req.originalUrl, injected);
          res
            .status(seo.httpStatus)
            .set({
              "Content-Type": "text/html; charset=utf-8",
              "Vary": "User-Agent",
              "Cache-Control": "no-cache, no-store, must-revalidate",
            })
            .end(transformed);
        } catch (err) {
          next(err);
        }
      }
    );

    app.use(vite.middlewares);
    console.log("Vite dev middleware loaded onto Express server.");
  } else {
    // Production Mode - serve built client assets with long immutable cache for hashed bundles
    const distPath = path.join(process.cwd(), "dist");
    app.use(
      express.static(distPath, {
        index: false,
        maxAge: "7d",
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      })
    );

    app.get(
      [
        "/",
        "/whatsapp",
        "/privacy-policy",
        "/listing/:id",
        "/categories/:category",
        "/locations/:city",
        "/locations/:city/:suburb",
      ],
      (req, res) => {
        const seo = resolveExpressSeoPayload(req) || buildHomeSeo(querySqliteActiveListings());
        const distIndex = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
        const isCrawler = isCrawlerUserAgent(req.headers["user-agent"]);
        const rendered = injectSeoIntoHtml(distIndex, seo, { includeSsrBody: isCrawler });
        res
          .status(seo.httpStatus)
          .set({
            "Content-Type": "text/html; charset=utf-8",
            "Vary": "User-Agent",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          })
          .send(rendered);
      }
    );

    app.get("*", (req, res) => {
      res.status(404).set({ "X-Robots-Tag": "noindex, nofollow" }).sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BunkBy server running on http://localhost:${PORT}`);
  });
}

startServer();
