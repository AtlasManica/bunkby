import {
  ensureLandlordAuthColumns,
  findLandlordByPhone,
  getAuthenticatedLandlord,
  hashPinPbkdf2,
  jsonError,
  jsonOk,
  verifyAndConsumeLandlordPinResetCode,
  verifyPinWebCrypto,
} from "../_lib/security";

function resolveLandlordRole(landlord: any): "Admin" | "Landlord" {
  return landlord?.full_name === "Tatenda E. Chikura" ||
    landlord?.verification_status === "admin"
    ? "Admin"
    : "Landlord";
}

export async function onRequestGet({ env }: { env: any }) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, full_name, verification_status FROM landlords"
    ).all();
    return jsonOk({ landlords: results || [] });
  } catch (error: any) {
    return jsonError(error?.message || "Failed to load landlords", 500);
  }
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: any;
}) {
  try {
    await ensureLandlordAuthColumns(env.DB);
    const body: any = await request.json();
    const { action, name, phone, pin, newPin, resetCode } = body || {};

    if (!action || !phone) {
      return jsonError("Missing action or phone parameter.", 400);
    }

    const cleanName = String(name || "").trim();
    const phoneId = Number(String(phone).replace(/\D/g, ""));
    if (!phoneId || phoneId < 1000000) {
      return jsonError("Please enter a valid phone number with digits.", 400);
    }

    if (action === "login") {
      const landlord: any = await findLandlordByPhone(env.DB, String(phone));

      if (!landlord) {
        return jsonError(
          "No account found with this phone number. Please Create an Account first.",
          404,
          { success: false, code: "ACCOUNT_NOT_FOUND" }
        );
      }

      if (!pin || String(pin).trim().length < 4) {
        return jsonError(
          "A 4-digit Security PIN is required to access your landlord account.",
          401,
          { success: false, code: "PIN_REQUIRED" }
        );
      }

      if (landlord.account_pin) {
        const storedPin = String(landlord.account_pin);
        const valid = await verifyPinWebCrypto(String(pin), storedPin);
        if (!valid) {
          return jsonError(
            "Incorrect Security PIN. Please verify your PIN or use Account Recovery.",
            401,
            { success: false, code: "INVALID_PIN" }
          );
        }
        if (!storedPin.startsWith("pbkdf2:")) {
          const upgradedHash = await hashPinPbkdf2(String(pin));
          await env.DB.prepare("UPDATE landlords SET account_pin = ? WHERE id = ?")
            .bind(upgradedHash, landlord.id)
            .run();
        }
      } else {
        if (
          cleanName &&
          String(landlord.full_name || "").toLowerCase().trim() !==
            cleanName.toLowerCase()
        ) {
          return jsonError(
            "Name provided does not match the registered account details.",
            401,
            { success: false, code: "NAME_MISMATCH" }
          );
        }
        const hashed = await hashPinPbkdf2(String(pin));
        await env.DB.prepare("UPDATE landlords SET account_pin = ? WHERE id = ?")
          .bind(hashed, landlord.id)
          .run();
      }

      const token = crypto.randomUUID();
      await env.DB.prepare("UPDATE landlords SET auth_token = ? WHERE id = ?")
        .bind(token, landlord.id)
        .run();

      return jsonOk({
        success: true,
        token,
        hasPin: true,
        landlord: {
          id: landlord.id,
          name: landlord.full_name,
          full_name: landlord.full_name,
          phone: String(landlord.id),
          isVerified:
            landlord.verification_status === "approved" ||
            landlord.verification_status === "verified",
          status: landlord.verification_status,
          verification_status: landlord.verification_status,
          role: resolveLandlordRole(landlord),
        },
      });
    }

    if (action === "signup") {
      if (!cleanName || cleanName.length < 2) {
        return jsonError("Your full name is required to create an account.", 400);
      }

      const existing = await findLandlordByPhone(env.DB, String(phone));
      if (existing) {
        return jsonError(
          "An account already exists with this phone number. Please Log In.",
          400,
          { success: false, code: "ALREADY_EXISTS" }
        );
      }

      if (!pin || String(pin).trim().length < 4) {
        return jsonError(
          "A Security PIN of at least 4 digits is required to protect your account.",
          400,
          { success: false, code: "PIN_REQUIRED" }
        );
      }

      const hashedPin = await hashPinPbkdf2(String(pin));
      const token = crypto.randomUUID();

      await env.DB.prepare(
        "INSERT INTO landlords (id, full_name, account_pin, auth_token, verification_status) VALUES (?, ?, ?, ?, 'pending')"
      )
        .bind(phoneId, cleanName, hashedPin, token)
        .run();

      return jsonOk(
        {
          success: true,
          token,
          hasPin: true,
          landlord: {
            id: phoneId,
            name: cleanName,
            full_name: cleanName,
            phone: String(phoneId),
            isVerified: false,
            status: "pending",
            verification_status: "pending",
            role: cleanName === "Tatenda E. Chikura" ? "Admin" : "Landlord",
          },
        },
        201
      );
    }

    if (action === "recover" || action === "reset_pin") {
      const landlord: any = await findLandlordByPhone(env.DB, String(phone));
      if (!landlord) {
        return jsonError("No landlord account found with this phone number.", 404, {
          success: false,
          code: "ACCOUNT_NOT_FOUND",
        });
      }

      const cleanNewPin = String(newPin || pin || "").trim();
      if (!/^\d{4,8}$/.test(cleanNewPin)) {
        return jsonError("New Security PIN must be 4 to 8 digits.", 400, {
          success: false,
          code: "INVALID_NEW_PIN",
        });
      }

      const verification = await verifyAndConsumeLandlordPinResetCode(
        env.DB,
        Number(landlord.id),
        String(resetCode || "")
      );
      if (!verification.ok) {
        return jsonError(
          verification.error || "Invalid or expired reset code.",
          verification.status || 400,
          {
            success: false,
            code: verification.code || "INVALID_RESET_CODE",
          }
        );
      }

      const hashedNewPin = await hashPinPbkdf2(cleanNewPin);
      const token = crypto.randomUUID();
      await env.DB.prepare(
        "UPDATE landlords SET account_pin = ?, auth_token = ? WHERE id = ?"
      )
        .bind(hashedNewPin, token, landlord.id)
        .run();

      return jsonOk({
        success: true,
        message: "Security PIN updated successfully. Your account is now logged in.",
        token,
        hasPin: true,
        landlord: {
          id: landlord.id,
          name: landlord.full_name,
          full_name: landlord.full_name,
          phone: String(landlord.id),
          isVerified:
            landlord.verification_status === "approved" ||
            landlord.verification_status === "verified",
          status: landlord.verification_status,
          verification_status: landlord.verification_status,
          role: resolveLandlordRole(landlord),
        },
      });
    }

    if (action === "set_pin") {
      const requester = await getAuthenticatedLandlord(request, env, body?.token);
      if (!requester || requester.id !== phoneId) {
        return jsonError("Authentication required to update PIN.", 401);
      }
      if (!pin || String(pin).trim().length < 4) {
        return jsonError("PIN must be at least 4 digits.", 400);
      }
      const hashed = await hashPinPbkdf2(String(pin));
      await env.DB.prepare("UPDATE landlords SET account_pin = ? WHERE id = ?")
        .bind(hashed, phoneId)
        .run();
      return jsonOk({ success: true, message: "Security PIN saved successfully." });
    }

    return jsonError("Invalid action", 400);
  } catch (error: any) {
    return jsonError(error?.message || "Authentication server error", 500);
  }
}
