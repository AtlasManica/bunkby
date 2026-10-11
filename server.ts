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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    `);

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
  // Backward compatibility with un-hashed plaintext PINs in existing database
  return cleanCandidate === String(storedHashOrPin).trim();
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
app.post("/api/landlords", (req, res) => {
  const { action, name, phone, pin, newPin } = req.body; 
  if (!action || !phone) return res.status(400).json({ error: "Missing action or phone parameter." });
  const cleanName = (name || "").trim();
  const phoneId = Number(String(phone).replace(/\D/g, ""));

  if (!phoneId || phoneId < 1000000) {
    return res.status(400).json({ error: "Please enter a valid phone number with digits." });
  }

  try {
    if (action === "login") {
      const landlord = db.prepare("SELECT * FROM landlords WHERE id = ?").get(phoneId) as any;
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
          db.prepare("UPDATE landlords SET account_pin = ? WHERE id = ?").run(hashPin(String(pin)), phoneId);
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
        db.prepare("UPDATE landlords SET account_pin = ? WHERE id = ?").run(hashPin(String(pin)), phoneId);
      }

      // Issue fresh cryptographically secure auth session token
      const token = crypto.randomUUID();
      db.prepare("UPDATE landlords SET auth_token = ? WHERE id = ?").run(token, phoneId);

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

      const existing = db.prepare("SELECT * FROM landlords WHERE id = ?").get(phoneId) as any;
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
      const landlord = db.prepare("SELECT * FROM landlords WHERE id = ?").get(phoneId) as any;
      if (!landlord) {
        return res.status(404).json({ error: "No landlord account found with this phone number." });
      }

      if (!cleanName || landlord.full_name.toLowerCase().trim() !== cleanName.toLowerCase().trim()) {
        return res.status(401).json({ 
          error: "Full name does not match the registered account details. For manual recovery, please contact BunkBy Support on WhatsApp." 
        });
      }

      const targetNewPin = newPin || pin;
      if (!targetNewPin || String(targetNewPin).trim().length < 4) {
        return res.status(400).json({ error: "New Security PIN must be at least 4 digits." });
      }

      const hashedNewPin = hashPin(String(targetNewPin));
      const token = crypto.randomUUID();
      db.prepare("UPDATE landlords SET account_pin = ?, auth_token = ? WHERE id = ?").run(hashedNewPin, token, phoneId);

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
      ORDER BY listings.created_at DESC
    `).all().map((row: any) => ({
        ...row,
        category: row.category || (["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(row.property_type) ? "hospitality" : "residential"),
        businessName: row.business_name || null,
        frequency: row.rent_cycle,
        propertyType: row.property_type,
        tenantType: row.tenant_type,
        amenities: typeof row.amenities === "string" ? JSON.parse(row.amenities || "[]") : (row.amenities || []),
        contactMethod: row.contact_method,
        phone: row.contact_phone,
        images: row.image_url ? [row.image_url] : [],
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
    title, suburb, price, landlord_id, verification_status, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities,
    category, business_name, businessName, is_premium, isPremium, listing_tier, listingTier, expiry_date, expiryDate
  } = req.body;

  const resolvedCategory = category || (["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(property_type) ? "hospitality" : "residential");
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
      image_url || null, landmark || null, city || null, Number(deposit || 0), 
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
  const { id } = req.params;
  const { reason, details, reporterName, reporterPhone, name, phone } = req.body;
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return res.status(400).json({ error: "A valid reason is required to submit a report." });
  }

  const finalReason = reason.trim().slice(0, 200);
  const finalDetails = details && typeof details === "string" ? details.trim().slice(0, 1000) : null;
  const finalReporterName = (reporterName || name || "").toString().trim().slice(0, 100) || null;
  const finalReporterPhone = (reporterPhone || phone || "").toString().trim().slice(0, 50) || null;

  try {
    const listing = db.prepare("SELECT id FROM listings WHERE id = ?").get(id);
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    // Abuse prevention: reject duplicate reports from same reporter phone within 2 minutes
    if (finalReporterPhone) {
      const recent = db.prepare(`
        SELECT id FROM listing_reports 
        WHERE listing_id = ? AND reporter_phone = ? AND created_at > datetime('now', '-2 minutes')
      `).get(id, finalReporterPhone);
      if (recent) {
        return res.status(429).json({ error: "A report for this listing was already received recently. Our moderation team is investigating." });
      }
    }

    db.prepare(`
      INSERT INTO listing_reports (listing_id, reason, details, reporter_name, reporter_phone)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, finalReason, finalDetails, finalReporterName, finalReporterPhone);

    try {
      db.prepare("UPDATE listings SET reports_count = reports_count + 1 WHERE id = ?").run(id);
    } catch (_) {}

    res.json({ success: true, message: "Thank you for reporting. Our moderation team will investigate this listing." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin", (req, res) => {
  try {
    const landlords = db.prepare("SELECT id, full_name, national_id_url, rates_bill_url, verification_status FROM landlords").all();
    const listings = db.prepare("SELECT * FROM listings").all();
    const reports = db.prepare("SELECT * FROM listing_reports ORDER BY created_at DESC LIMIT 50").all();
    res.json({ landlords, listings, reports });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin", (req, res) => {
  const requester = getAuthenticatedLandlord(req);
  if (!requester || !requester.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Administrator privileges required to perform administrative mutations." });
  }

  const { action, id, targetId, phone, status } = req.body;
  const targetLandlordId = id || (phone ? Number(String(phone).replace(/\D/g, "")) : null);
  const targetListingId = id || targetId;

  try {
    if (action === "verify") {
      const nextStatus = status || "verified";
      db.prepare("UPDATE landlords SET verification_status = ? WHERE id = ?").run(nextStatus, targetLandlordId);
      db.prepare("UPDATE listings SET verification_status = ? WHERE landlord_id = ?").run(nextStatus === "verified" ? "Active" : "Delisted", targetLandlordId);
      return res.json({ success: true, updated: targetLandlordId, status: nextStatus });
    } else if (action === "deleteLandlord") {
      db.prepare("DELETE FROM landlords WHERE id = ?").run(targetLandlordId);
      db.prepare("DELETE FROM listings WHERE landlord_id = ?").run(targetLandlordId);
      return res.json({ success: true });
    } else if (action === "deleteListing") {
      db.prepare("DELETE FROM listings WHERE id = ?").run(targetListingId);
      return res.json({ success: true });
    }
    res.status(400).json({ error: "Unknown action" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    const resolvedStatus = verification_status || status || 'Active';

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
app.get("/api/listings/:id/photo", (req, res) => {
  try {
    const listing = db.prepare("SELECT image_url, title FROM listings WHERE id = ?").get(req.params.id) as any;
    if (!listing || !listing.image_url) {
      return res.status(404).send("Photograph not found");
    }

    const raw = listing.image_url;

    // If it's a data URI (base64 image from web camera / upload)
    if (raw.startsWith("data:")) {
      const matches = raw.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], "base64");
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(buffer);
      }
    }

    // If it's an HTTP/HTTPS URL
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
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
    const textPreview = msg?.text?.body || msg?.interactive?.button_reply?.title || msg?.type || "";

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

// Configure Vite or Serve SPA static files
async function startServer() {
  // Standalone server route for the raw private administration board
  app.get(["/admin.html", "/admin"], (req, res) => {
    res.sendFile(path.join(process.cwd(), "admin.html"));
  });

  // Serve public static assets
  app.use(express.static(path.join(process.cwd(), "public")));

  if (process.env.NODE_ENV !== "production") {
    // Dev Mode - integrate Vite
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev middleware loaded onto Express server.");
  } else {
    // Production Mode - serve built client assets
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BunkBy server running on http://localhost:${PORT}`);
  });
}

startServer();
