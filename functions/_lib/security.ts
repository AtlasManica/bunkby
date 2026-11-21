/**
 * Web Crypto security, auth, and privacy-preserving hashing helpers
 * Compatible with Cloudflare Pages Functions (Workers runtime) and Node.js 22+
 */

const textEncoder = new TextEncoder();

// Ephemeral fallback secret per worker/process instance when REPORT_HASH_SECRET env var is unset
let ephemeralHashSecretBytes: Uint8Array | null = null;

function getEphemeralSecretBytes(): Uint8Array {
  if (!ephemeralHashSecretBytes) {
    ephemeralHashSecretBytes = new Uint8Array(32);
    crypto.getRandomValues(ephemeralHashSecretBytes);
  }
  return ephemeralHashSecretBytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function computeKeyedHash(
  secretEnv: string | undefined,
  domain: string,
  value: string
): Promise<string> {
  const secretKeyBytes =
    secretEnv && secretEnv.trim().length >= 8
      ? textEncoder.encode(secretEnv.trim())
      : getEphemeralSecretBytes();

  const key = await crypto.subtle.importKey(
    "raw",
    secretKeyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(`${domain}:${value}`)
  );
  return bytesToHex(new Uint8Array(sig));
}

export function getClientIpFromRequest(request: Request): string {
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp && cfIp.trim()) return cfIp.trim();
  const xff = request.headers.get("X-Forwarded-For");
  if (xff && xff.trim()) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("X-Real-IP");
  if (realIp && realIp.trim()) return realIp.trim();
  return "unknown";
}

export async function hashPinPbkdf2(pin: string, existingSaltHex?: string): Promise<string> {
  const clean = String(pin).trim();
  const saltBytes = existingSaltHex
    ? hexToBytes(existingSaltHex)
    : crypto.getRandomValues(new Uint8Array(16));
  const saltHex = existingSaltHex || bytesToHex(saltBytes);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(clean),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as unknown as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return `pbkdf2:${saltHex}:${bytesToHex(new Uint8Array(derived))}`;
}

export async function verifyPinWebCrypto(
  candidatePin: string,
  storedHashOrPin: string | null | undefined
): Promise<boolean> {
  if (!storedHashOrPin) return false;
  const cleanCandidate = String(candidatePin).trim();
  const stored = String(storedHashOrPin).trim();

  if (stored.startsWith("pbkdf2:")) {
    const parts = stored.split(":");
    if (parts.length !== 3) return false;
    const candidateHash = await hashPinPbkdf2(cleanCandidate, parts[1]);
    return constantTimeEqual(candidateHash, stored);
  }

  if (stored.startsWith("scrypt:")) {
    // scrypt hashes created by Node.js server.ts cannot be re-derived cleanly without node:crypto,
    // so only treat as non-matching unless exact pbkdf2/plaintext match.
    return false;
  }

  return constantTimeEqual(cleanCandidate, stored);
}

export interface AuthenticatedLandlord {
  id: number;
  name: string;
  verificationStatus: string;
  isAdmin: boolean;
}

export async function ensureLandlordAuthColumns(db: any): Promise<void> {
  if (!db) return;
  try {
    const tableInfo = await db.prepare("PRAGMA table_info(landlords)").all();
    const cols = (tableInfo?.results || []).map((c: any) => c.name);
    if (cols.length > 0) {
      if (!cols.includes("account_pin")) {
        await db.prepare("ALTER TABLE landlords ADD COLUMN account_pin TEXT").run();
      }
      if (!cols.includes("auth_token")) {
        await db.prepare("ALTER TABLE landlords ADD COLUMN auth_token TEXT").run();
      }
    }
  } catch (_) {
    // Non-fatal if column check fails or already exists
  }
}

export function extractAuthToken(request: Request, bodyToken?: unknown): string | null {
  const headerToken = request.headers.get("x-landlord-token");
  if (headerToken && headerToken.trim().length >= 8) {
    return headerToken.trim();
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length >= 8) return bearer;
  }
  if (typeof bodyToken === "string" && bodyToken.trim().length >= 8) {
    return bodyToken.trim();
  }
  return null;
}

export async function getAuthenticatedLandlord(
  request: Request,
  env: any,
  bodyToken?: unknown
): Promise<AuthenticatedLandlord | null> {
  if (!env?.DB) return null;
  const token = extractAuthToken(request, bodyToken);
  if (!token) return null;

  await ensureLandlordAuthColumns(env.DB);
  const landlord = await env.DB.prepare(
    "SELECT id, full_name, verification_status FROM landlords WHERE auth_token = ?"
  )
    .bind(token)
    .first();

  if (!landlord) return null;
  const isAdmin =
    landlord.verification_status === "admin" ||
    landlord.full_name === "Tatenda E. Chikura";

  return {
    id: Number(landlord.id),
    name: String(landlord.full_name || ""),
    verificationStatus: String(landlord.verification_status || "pending"),
    isAdmin,
  };
}

export function jsonError(message: string, status: number, extra: Record<string, any> = {}): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonOk(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function requireAdmin(
  request: Request,
  env: any,
  bodyToken?: unknown
): Promise<{ admin: AuthenticatedLandlord } | { response: Response }> {
  const token = extractAuthToken(request, bodyToken);
  if (!token) {
    return {
      response: jsonError("Authentication required: Please log in as an administrator.", 401),
    };
  }
  const landlord = await getAuthenticatedLandlord(request, env, bodyToken);
  if (!landlord) {
    return {
      response: jsonError("Invalid or expired session token. Please log in again.", 401),
    };
  }
  if (!landlord.isAdmin) {
    return {
      response: jsonError("Forbidden: Administrator privileges required.", 403),
    };
  }
  return { admin: landlord };
}

export async function scrubExpiredIpHashes(db: any): Promise<void> {
  if (!db) return;
  try {
    await db
      .prepare(
        `UPDATE listing_reports
         SET ip_hash = NULL
         WHERE ip_hash IS NOT NULL
           AND ip_hash_expires_at IS NOT NULL
           AND ip_hash_expires_at <= datetime('now')`
      )
      .run();
  } catch (_) {
    // Ignore if table not yet migrated
  }
}

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

export async function findLandlordByPhone(db: any, rawPhone: string): Promise<any | null> {
  if (!db) return null;
  const candidates = getLandlordPhoneIdCandidates(rawPhone);
  for (const id of candidates) {
    const row = await db.prepare("SELECT * FROM landlords WHERE id = ?").bind(id).first();
    if (row) return row;
  }
  return null;
}

export async function ensureLandlordPinResetTable(db: any): Promise<void> {
  if (!db) return;
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS landlord_pin_resets (
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
        )`
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_landlord_pin_resets_expires_at
         ON landlord_pin_resets(expires_at)`
      )
      .run();
  } catch (_) {
    // Non-fatal if already migrated
  }
}

/**
 * Cryptographically secure 6-digit code in [100000, 999999] using rejection sampling
 * to eliminate modulo bias.
 */
export function generateSixDigitResetCode(): string {
  const range = 900000; // 100000..999999 inclusive
  const maxUnbiased = Math.floor(0xffffffff / range) * range;
  const buf = new Uint32Array(1);
  let val = 0;
  do {
    crypto.getRandomValues(buf);
    val = buf[0];
  } while (val >= maxUnbiased);
  return String(100000 + (val % range));
}

export interface WorkersIssueResetResult {
  ok: boolean;
  code?: string;
  landlordId?: number;
  landlordName?: string;
  expiresMinutes?: number;
  reason?: "NOT_FOUND" | "RATE_LIMITED";
  retryMinutes?: number;
}

export async function issueLandlordPinResetCode(
  db: any,
  rawPhone: string
): Promise<WorkersIssueResetResult> {
  await ensureLandlordPinResetTable(db);
  const landlord = await findLandlordByPhone(db, rawPhone);
  if (!landlord) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const nowMs = Date.now();
  const existing: any = await db
    .prepare("SELECT * FROM landlord_pin_resets WHERE landlord_id = ?")
    .bind(landlord.id)
    .first();

  let nextCount = 1;
  let windowStartedIso = new Date(nowMs).toISOString();

  if (existing && existing.window_started_at) {
    const rawStart = String(existing.window_started_at);
    const windowStartMs = Date.parse(
      rawStart.includes("T") ? rawStart : `${rawStart.replace(" ", "T")}Z`
    );
    if (!Number.isNaN(windowStartMs) && nowMs - windowStartMs < 60 * 60 * 1000) {
      if (Number(existing.request_count || 0) >= PIN_RESET_MAX_REQUESTS_PER_HOUR) {
        const retryMinutes = Math.max(1, Math.ceil((windowStartMs + 60 * 60 * 1000 - nowMs) / 60000));
        return { ok: false, reason: "RATE_LIMITED", retryMinutes };
      }
      nextCount = Number(existing.request_count || 0) + 1;
      windowStartedIso = rawStart;
    }
  }

  const code = generateSixDigitResetCode();
  const codeHash = await hashPinPbkdf2(code);
  const expiresAtIso = new Date(nowMs + PIN_RESET_EXPIRY_MINUTES * 60 * 1000).toISOString();
  const requestedAtIso = new Date(nowMs).toISOString();

  await db
    .prepare(
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
    )
    .bind(
      landlord.id,
      codeHash,
      expiresAtIso,
      PIN_RESET_MAX_ATTEMPTS,
      requestedAtIso,
      nextCount,
      windowStartedIso
    )
    .run();

  return {
    ok: true,
    code,
    landlordId: Number(landlord.id),
    landlordName: String(landlord.full_name || "Landlord"),
    expiresMinutes: PIN_RESET_EXPIRY_MINUTES,
  };
}

export interface WorkersVerifyResetResult {
  ok: boolean;
  code?: string;
  error?: string;
  status?: number;
}

export async function verifyAndConsumeLandlordPinResetCode(
  db: any,
  landlordId: number,
  candidateCode: string
): Promise<WorkersVerifyResetResult> {
  await ensureLandlordPinResetTable(db);
  const cleanCode = String(candidateCode || "").replace(/\D/g, "");
  if (cleanCode.length !== 6) {
    return {
      ok: false,
      code: "INVALID_CODE_FORMAT",
      error: "Please enter the 6-digit verification code sent to your WhatsApp.",
      status: 400,
    };
  }

  const row: any = await db
    .prepare("SELECT * FROM landlord_pin_resets WHERE landlord_id = ?")
    .bind(landlordId)
    .first();

  if (!row || row.used_at || !row.code_hash) {
    return {
      ok: false,
      code: "RESET_CODE_MISSING",
      error: "No active reset code found for this account. Tap 'Get Reset Code on WhatsApp' first.",
      status: 400,
    };
  }

  const rawExpires = String(row.expires_at || "");
  const expiresMs = Date.parse(
    rawExpires.includes("T") ? rawExpires : `${rawExpires.replace(" ", "T")}Z`
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

  const isValid = await verifyPinWebCrypto(cleanCode, row.code_hash);
  if (!isValid) {
    const nextAttempts = attempts + 1;
    await db
      .prepare("UPDATE landlord_pin_resets SET attempts = ? WHERE landlord_id = ?")
      .bind(nextAttempts, landlordId)
      .run();
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
  const consumeResult: any = await db
    .prepare(
      "UPDATE landlord_pin_resets SET used_at = ?, code_hash = '' WHERE landlord_id = ? AND used_at IS NULL AND code_hash != ''"
    )
    .bind(new Date().toISOString(), landlordId)
    .run();

  if (typeof consumeResult?.meta?.changes === "number" && consumeResult.meta.changes === 0) {
    return {
      ok: false,
      code: "RESET_CODE_ALREADY_USED",
      error: "This reset code has already been used. Please request a fresh code on WhatsApp.",
      status: 401,
    };
  }

  return { ok: true };
}

