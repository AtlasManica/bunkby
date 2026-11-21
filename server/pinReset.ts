import crypto from "crypto";
import type { Database } from "better-sqlite3";

export const PIN_RESET_EXPIRY_MINUTES = 10;
export const PIN_RESET_MAX_ATTEMPTS = 5;
export const PIN_RESET_MAX_REQUESTS_PER_HOUR = 5;

/**
 * Generates candidate numeric landlord IDs for Zimbabwean and international phone formats
 * so accounts registered as `0773043376` (stored as 773043376) and WhatsApp E.164
 * `263773043376` resolve consistently.
 */
export function getLandlordPhoneIdCandidates(rawPhone: string): number[] {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return [];

  const candidates: number[] = [];
  const pushUnique = (val: number) => {
    if (Number.isSafeInteger(val) && val >= 1000000 && !candidates.includes(val)) {
      candidates.push(val);
    }
  };

  pushUnique(Number(digits));

  // Zimbabwe E.164 (263 + 9 digits) <-> local 9-digit numeric ID (leading 0 stripped)
  if (digits.startsWith("263") && digits.length === 12) {
    pushUnique(Number(digits.slice(3)));
  } else if (digits.startsWith("0") && digits.length === 10 && digits[1] === "7") {
    pushUnique(Number(digits.slice(1)));
    pushUnique(Number(`263${digits.slice(1)}`));
  } else if (digits.length === 9 && digits.startsWith("7")) {
    pushUnique(Number(`263${digits}`));
  }

  return candidates;
}

export function findLandlordByPhoneSync(db: Database, rawPhone: string): any | null {
  const candidates = getLandlordPhoneIdCandidates(rawPhone);
  for (const id of candidates) {
    const row = db.prepare("SELECT * FROM landlords WHERE id = ?").get(id);
    if (row) return row;
  }
  return null;
}

export function ensureLandlordPinResetTableSync(db: Database): void {
  db.exec(`
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
  `);
}

function hashResetCodeNode(code: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(String(code).trim(), salt, 100000, 32, "sha256").toString("hex");
  return `pbkdf2:${salt.toString("hex")}:${derived}`;
}

function verifyResetCodeNode(candidate: string, storedHash: string): boolean {
  const clean = String(candidate || "").trim();
  const stored = String(storedHash || "").trim();
  if (!clean || !stored.startsWith("pbkdf2:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  try {
    const derived = crypto
      .pbkdf2Sync(clean, Buffer.from(parts[1], "hex"), 100000, 32, "sha256")
      .toString("hex");
    return crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(parts[2]));
  } catch {
    return false;
  }
}

export interface IssueResetResult {
  ok: boolean;
  code?: string;
  landlordId?: number;
  landlordName?: string;
  expiresMinutes?: number;
  reason?: "NOT_FOUND" | "RATE_LIMITED";
  retryMinutes?: number;
}

export function issueLandlordPinResetCodeSync(
  db: Database,
  rawPhone: string
): IssueResetResult {
  ensureLandlordPinResetTableSync(db);
  const landlord = findLandlordByPhoneSync(db, rawPhone);
  if (!landlord) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const nowMs = Date.now();
  const existing = db
    .prepare("SELECT * FROM landlord_pin_resets WHERE landlord_id = ?")
    .get(landlord.id) as any;

  let nextCount = 1;
  let windowStartedIso = new Date(nowMs).toISOString();

  if (existing && existing.window_started_at) {
    const windowStartMs = Date.parse(
      existing.window_started_at.includes("T")
        ? existing.window_started_at
        : `${existing.window_started_at.replace(" ", "T")}Z`
    );
    if (!Number.isNaN(windowStartMs) && nowMs - windowStartMs < 60 * 60 * 1000) {
      if (Number(existing.request_count || 0) >= PIN_RESET_MAX_REQUESTS_PER_HOUR) {
        const retryMinutes = Math.max(1, Math.ceil((windowStartMs + 60 * 60 * 1000 - nowMs) / 60000));
        return { ok: false, reason: "RATE_LIMITED", retryMinutes };
      }
      nextCount = Number(existing.request_count || 0) + 1;
      windowStartedIso = existing.window_started_at;
    }
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashResetCodeNode(code);
  const expiresAtIso = new Date(nowMs + PIN_RESET_EXPIRY_MINUTES * 60 * 1000).toISOString();
  const requestedAtIso = new Date(nowMs).toISOString();

  db.prepare(
    `INSERT INTO landlord_pin_resets
       (landlord_id, code_hash, expires_at, attempts, max_attempts, requested_at, request_count, window_started_at, used_at)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, NULL)
     ON CONFLICT(landlord_id) DO UPDATE SET
       code_hash = excluded.code_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       max_attempts = excluded.max_attempts,
       requested_at = excluded.requested_at,
       request_count = excluded.request_count,
       window_started_at = excluded.window_started_at,
       used_at = NULL`
  ).run(
    landlord.id,
    codeHash,
    expiresAtIso,
    PIN_RESET_MAX_ATTEMPTS,
    requestedAtIso,
    nextCount,
    windowStartedIso
  );

  return {
    ok: true,
    code,
    landlordId: Number(landlord.id),
    landlordName: String(landlord.full_name || "Landlord"),
    expiresMinutes: PIN_RESET_EXPIRY_MINUTES,
  };
}

export interface VerifyResetResult {
  ok: boolean;
  code?: string;
  error?: string;
  status?: number;
}

export function verifyAndConsumeLandlordPinResetCodeSync(
  db: Database,
  landlordId: number,
  candidateCode: string
): VerifyResetResult {
  ensureLandlordPinResetTableSync(db);
  const cleanCode = String(candidateCode || "").replace(/\D/g, "");
  if (cleanCode.length !== 6) {
    return {
      ok: false,
      code: "INVALID_CODE_FORMAT",
      error: "Please enter the 6-digit verification code sent to your WhatsApp.",
      status: 400,
    };
  }

  const row = db
    .prepare("SELECT * FROM landlord_pin_resets WHERE landlord_id = ?")
    .get(landlordId) as any;

  if (!row || row.used_at) {
    return {
      ok: false,
      code: "RESET_CODE_MISSING",
      error: "No active reset code found for this account. Tap 'Get Reset Code on WhatsApp' first.",
      status: 400,
    };
  }

  const expiresMs = Date.parse(
    String(row.expires_at).includes("T")
      ? String(row.expires_at)
      : `${String(row.expires_at).replace(" ", "T")}Z`
  );
  if (Number.isNaN(expiresMs) || Date.now() > expiresMs) {
    return {
      ok: false,
      code: "RESET_CODE_EXPIRED",
      error: "This reset code has expired. Please request a fresh code on WhatsApp.",
      status: 401,
    };
  }

  const attempts = Number(row.attempts || 0);
  const maxAttempts = Number(row.max_attempts || PIN_RESET_MAX_ATTEMPTS);
  if (attempts >= maxAttempts) {
    return {
      ok: false,
      code: "RESET_CODE_LOCKED",
      error: "Too many incorrect attempts. Please request a new reset code on WhatsApp.",
      status: 429,
    };
  }

  const isValid = verifyResetCodeNode(cleanCode, row.code_hash);
  if (!isValid) {
    const nextAttempts = attempts + 1;
    db.prepare("UPDATE landlord_pin_resets SET attempts = ? WHERE landlord_id = ?").run(
      nextAttempts,
      landlordId
    );
    const remaining = Math.max(0, maxAttempts - nextAttempts);
    return {
      ok: false,
      code: remaining === 0 ? "RESET_CODE_LOCKED" : "INVALID_RESET_CODE",
      error:
        remaining === 0
          ? "Too many incorrect attempts. Please request a new reset code on WhatsApp."
          : `Incorrect reset code. ${remaining} ${remaining === 1 ? "attempt" : "attempts"} remaining.`,
      status: remaining === 0 ? 429 : 401,
    };
  }

  // Atomic single-use invalidation immediately upon verification
  const consumeInfo = db
    .prepare(
      "UPDATE landlord_pin_resets SET used_at = ?, code_hash = '' WHERE landlord_id = ? AND used_at IS NULL AND code_hash != ''"
    )
    .run(new Date().toISOString(), landlordId);

  if (consumeInfo.changes === 0) {
    return {
      ok: false,
      code: "RESET_CODE_ALREADY_USED",
      error: "This reset code has already been used. Please request a fresh code on WhatsApp.",
      status: 401,
    };
  }

  return { ok: true };
}
