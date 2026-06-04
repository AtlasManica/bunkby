/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";

const app = express();
const PORT = 3000;

// Body parsing middleware
app.use(express.json());

// Initialize SQLite database matching the requested D1 schema
const db = new Database("bunkby.db");

// Run schema initialization
db.exec(`
  CREATE TABLE IF NOT EXISTS landlords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    verification_status TEXT DEFAULT 'pending',
    image_url TEXT,
    landmark TEXT,
    city TEXT,
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
`);

// REST API Endpoints
app.post("/api/landlords", (req, res) => {
  const { action, name, phone } = req.body; 
  if (!action || !name || !phone) return res.status(400).json({ error: "Missing action, name, or phone parameter." });
  const cleanName = name.trim();
  const phoneId = Number(phone.replace(/\D/g, ""));

  try {
    if (action === "login") {
      const landlord = db.prepare("SELECT * FROM landlords WHERE id = ?").get(phoneId) as any;
      if (landlord) {
        return res.json({
          success: true,
          landlord: {
            id: landlord.id,
            name: landlord.full_name,
            isVerified: landlord.verification_status === "approved" || landlord.verification_status === "verified",
            status: landlord.verification_status
          }
        });
      }
      return res.status(404).json({ success: false, error: "No account detected with this name. Please Create an Account first.", code: "ACCOUNT_NOT_FOUND" });
    } else if (action === "signup") {
      const existing = db.prepare("SELECT * FROM landlords WHERE id = ?").get(phoneId) as any;
      if (existing) {
        return res.status(400).json({ success: false, error: "An account already exists with this name. Please Log In.", code: "ALREADY_EXISTS" });
      }

      const stmt = db.prepare("INSERT INTO landlords (id, full_name) VALUES (?, ?)");
      const result = stmt.run(phoneId, cleanName);
      
      return res.status(201).json({
        success: true,
        landlord: {
          id: phoneId,
          name: cleanName,
          isVerified: false,
          status: "pending"
        }
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
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
        frequency: row.rent_cycle,
        propertyType: row.property_type,
        tenantType: row.tenant_type,
        amenities: typeof row.amenities === "string" ? JSON.parse(row.amenities || "[]") : (row.amenities || []),
        contactMethod: row.contact_method,
        phone: row.contact_phone,
        images: row.image_url ? [row.image_url] : [],
        status: row.verification_status,
        createdAt: row.created_at,
        leadsCount: row.leads_count
    }));
    res.json({ listings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/listings", (req, res) => {
  const {
    title, suburb, price, landlord_id, verification_status, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities
  } = req.body;

  try {
    const stmt = db.prepare(`
      INSERT INTO listings 
      (title, suburb, price, landlord_id, verification_status, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      title, suburb, Number(price), landlord_id || null, verification_status || 'Active', 
      image_url || null, landmark || null, city || null, Number(deposit || 0), 
      property_type || null, tenant_type || null, rent_cycle || 'Month', 
      contact_method || null, contact_phone || null, typeof amenities === "string" ? amenities : JSON.stringify(amenities || [])
    );

    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin", (req, res) => {
  try {
    const landlords = db.prepare("SELECT * FROM landlords").all();
    const listings = db.prepare("SELECT * FROM listings").all();
    res.json({ landlords, listings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin", (req, res) => {
  const { action, id, targetId } = req.body;
  try {
    if (action === "verify") {
      db.prepare("UPDATE landlords SET verification_status = 'verified' WHERE id = ?").run(id);
      db.prepare("UPDATE listings SET verification_status = 'verified' WHERE landlord_id = ?").run(id);
      return res.json({ success: true, updated: id });
    } else if (action === "deleteLandlord") {
      db.prepare("DELETE FROM landlords WHERE id = ?").run(id);
      db.prepare("DELETE FROM listings WHERE landlord_id = ?").run(id);
      return res.json({ success: true });
    } else if (action === "deleteListing") {
      db.prepare("DELETE FROM listings WHERE id = ?").run(id || targetId);
      return res.json({ success: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/rooms/:id", (req, res) => {
  const { id } = req.params;
  const {
    title, suburb, price, image_url, landmark, city, deposit, property_type, tenant_type, rent_cycle, contact_method, contact_phone, amenities
  } = req.body;

  try {
    const stmt = db.prepare(`
      UPDATE listings SET
        title = ?, suburb = ?, price = ?, image_url = ?, landmark = ?, city = ?, deposit = ?, property_type = ?, tenant_type = ?, rent_cycle = ?, contact_method = ?, contact_phone = ?, amenities = ?
      WHERE id = ?
    `);

    stmt.run(
      title, suburb, Number(price), image_url || null, landmark || null, city || null, Number(deposit || 0), 
      property_type || null, tenant_type || null, rent_cycle || 'Month', 
      contact_method || null, contact_phone || null, typeof amenities === "string" ? amenities : JSON.stringify(amenities || []),
      id
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/rooms/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM listings WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/rooms/:id/toggle-status", (req, res) => {
  try {
    const listing = db.prepare("SELECT verification_status FROM listings WHERE id = ?").get(req.params.id) as any;
    if (listing) {
      const nextStatus = listing.verification_status === "Active" ? "Delisted" : "Active";
      db.prepare("UPDATE listings SET verification_status = ? WHERE id = ?").run(nextStatus, req.params.id);
      res.json({ success: true, status: nextStatus });
    } else {
      res.status(404).json({ error: "Listing not found" });
    }
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

// Configure Vite or Serve SPA static files
async function startServer() {
  // Standalone server route for the raw private administration board
  app.get(["/admin.html", "/admin"], (req, res) => {
    res.sendFile(path.join(process.cwd(), "admin.html"));
  });

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
