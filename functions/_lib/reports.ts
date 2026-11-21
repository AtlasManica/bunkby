import {
  computeKeyedHash,
  getClientIpFromRequest,
  jsonError,
  jsonOk,
  scrubExpiredIpHashes,
  AuthenticatedLandlord,
} from "./security";

export const VALID_REPORT_STATUSES = [
  "pending",
  "under_review",
  "action_taken",
  "dismissed",
  "resolved",
] as const;

export const VALID_MODERATION_ACTIONS = [
  "mark_under_review",
  "dismiss",
  "dismiss_report",
  "hide_listing",
  "restore_listing",
  "remove_listing",
  "resolve",
  "resolve_report",
  "add_note",
] as const;

const RATE_LIMIT_MAX_PER_15M = 5;

export async function handleSubmitListingReport({
  request,
  env,
  listingId,
}: {
  request: Request;
  env: any;
  listingId: string;
}): Promise<Response> {
  if (!env?.DB) {
    return jsonError("Database binding not configured.", 500);
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }

  const cleanListingId = Number(listingId);
  if (!Number.isInteger(cleanListingId) || cleanListingId <= 0) {
    return jsonError("Invalid listing ID.", 400);
  }

  const rawReason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!rawReason) {
    return jsonError("A valid reason is required to submit a report.", 400);
  }

  const finalReason = rawReason.slice(0, 200);
  const finalDetails =
    typeof body?.details === "string" && body.details.trim()
      ? body.details.trim().slice(0, 1000)
      : null;
  const finalReporterName =
    (body?.reporterName || body?.name || "").toString().trim().slice(0, 100) || null;
  const finalReporterPhone =
    (body?.reporterPhone || body?.phone || "").toString().trim().slice(0, 50) || null;

  const clientReporterToken = (
    request.headers.get("x-reporter-token") ||
    body?.reporterToken ||
    ""
  )
    .toString()
    .trim()
    .slice(0, 128);

  const clientIp = getClientIpFromRequest(request);
  const userAgent = (request.headers.get("user-agent") || "unknown").slice(0, 200);
  const hashSecret = env.REPORT_HASH_SECRET as string | undefined;

  const ipHash = await computeKeyedHash(hashSecret, "ip", clientIp);

  // Primary duplicate identifier: pseudonymous browser/device token (allows multiple
  // household, office, or Zimbabwe mobile CGNAT users on the same IP to report independently).
  const normalizedPhoneDigits = finalReporterPhone
    ? finalReporterPhone.replace(/\D/g, "")
    : "";
  const reporterRawSeed =
    clientReporterToken.length >= 8
      ? `tok:${clientReporterToken}`
      : normalizedPhoneDigits.length >= 7
      ? `ph:${normalizedPhoneDigits}`
      : `anon:${clientIp}|${userAgent}`;

  const reporterTokenHash = await computeKeyedHash(
    hashSecret,
    "reporter",
    reporterRawSeed
  );

  try {
    await scrubExpiredIpHashes(env.DB);

    const listing = await env.DB.prepare(
      "SELECT id, verification_status FROM listings WHERE id = ?"
    )
      .bind(cleanListingId)
      .first();

    if (!listing) {
      return jsonError("Listing not found.", 404);
    }

    if (listing.verification_status === "Removed") {
      return jsonError("This listing has already been removed by moderation.", 410);
    }

    // 1. Server-side IP-hash rate limiting (max 5 reports per 15 minutes)
    const rateRow: any = await env.DB.prepare(
      `SELECT COUNT(*) as cnt
       FROM listing_reports
       WHERE ip_hash = ?
         AND created_at > datetime('now', '-15 minutes')`
    )
      .bind(ipHash)
      .first();

    if (Number(rateRow?.cnt || 0) >= RATE_LIMIT_MAX_PER_15M) {
      return jsonError(
        "Too many reports submitted recently from your connection. Please wait a few minutes before submitting another report.",
        429,
        { code: "RATE_LIMITED" }
      );
    }

    // 2. Duplicate prevention: primary check is the pseudonymous browser/device token
    //    (IP hashes are reserved for rate limiting & suspicious cluster detection, not rejecting shared IPs)
    const existingOpenByReporter = await env.DB.prepare(
      `SELECT id
       FROM listing_reports
       WHERE listing_id = ?
         AND reporter_token_hash = ?
         AND status IN ('pending', 'under_review')
       LIMIT 1`
    )
      .bind(cleanListingId, reporterTokenHash)
      .first();

    if (existingOpenByReporter) {
      return jsonError(
        "You have already reported this listing and it is currently awaiting or under moderation review.",
        409,
        { code: "DUPLICATE_REPORT" }
      );
    }

    // 3. Insert report with 30-day IP hash retention expiry
    const insertRes = await env.DB.prepare(
      `INSERT INTO listing_reports (
         listing_id, reason, details, reporter_name, reporter_phone,
         reporter_token_hash, ip_hash, ip_hash_expires_at, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+30 days'), 'pending')`
    )
      .bind(
        cleanListingId,
        finalReason,
        finalDetails,
        finalReporterName,
        finalReporterPhone,
        reporterTokenHash,
        ipHash
      )
      .run();

    // 4. Increment listing reports_count safely
    try {
      await env.DB.prepare(
        "UPDATE listings SET reports_count = COALESCE(reports_count, 0) + 1 WHERE id = ?"
      )
        .bind(cleanListingId)
        .run();
    } catch (_) {}

    return jsonOk(
      {
        success: true,
        reportId: insertRes?.meta?.last_row_id || null,
        message:
          "Thank you for reporting. Our moderation team will investigate this listing.",
      },
      201
    );
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("UNIQUE constraint failed")) {
      return jsonError(
        "You have already submitted an open report for this listing.",
        409,
        { code: "DUPLICATE_REPORT" }
      );
    }
    if (msg.includes("no such table") || msg.includes("no such column")) {
      return jsonError(
        "Reporting tables are not yet initialized on D1. Please apply migration 0004.",
        503
      );
    }
    return jsonError(msg || "Failed to submit report.", 500);
  }
}

export async function handleAdminListReports({
  request,
  env,
}: {
  request: Request;
  env: any;
}): Promise<Response> {
  try {
    await scrubExpiredIpHashes(env.DB);

    const url = new URL(request.url);
    const statusFilter = (url.searchParams.get("status") || "all").trim();
    const listingIdParam = (url.searchParams.get("listingId") || "").trim();
    const searchQuery = (url.searchParams.get("q") || "").trim();

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (
      statusFilter &&
      statusFilter !== "all" &&
      (VALID_REPORT_STATUSES as readonly string[]).includes(statusFilter)
    ) {
      whereClauses.push("r.status = ?");
      params.push(statusFilter);
    }

    if (listingIdParam && /^\d+$/.test(listingIdParam)) {
      whereClauses.push("r.listing_id = ?");
      params.push(Number(listingIdParam));
    }

    if (searchQuery) {
      whereClauses.push(
        "(r.reason LIKE ? OR r.details LIKE ? OR l.title LIKE ? OR l.suburb LIKE ? OR l.city LIKE ?)"
      );
      const qLike = `%${searchQuery}%`;
      params.push(qLike, qLike, qLike, qLike, qLike);
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const sql = `
      SELECT
        r.id,
        r.listing_id,
        r.reason,
        r.details,
        r.reporter_name,
        r.reporter_phone,
        r.status,
        r.created_at,
        r.reviewed_at,
        r.reviewed_by,
        r.reviewed_by_name,
        r.moderation_notes,
        l.title AS listing_title,
        l.city AS listing_city,
        l.suburb AS listing_suburb,
        l.price AS listing_price,
        l.rent_cycle AS listing_frequency,
        l.property_type AS listing_property_type,
        l.category AS listing_category,
        l.verification_status AS listing_status,
        l.landlord_id AS listing_landlord_id,
        l.reports_count AS listing_reports_count,
        ld.full_name AS listing_landlord_name,
        (
          SELECT COUNT(*)
          FROM listing_reports r2
          WHERE r2.listing_id = r.listing_id
            AND r2.ip_hash IS NOT NULL
            AND r2.ip_hash = r.ip_hash
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
    `;

    const stmt = env.DB.prepare(sql);
    const reportsRes =
      params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

    const countsRes = await env.DB.prepare(
      `SELECT status, COUNT(*) as cnt FROM listing_reports GROUP BY status`
    ).all();

    const listingVisRes = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN verification_status = 'Hidden' THEN 1 ELSE 0 END) as hidden_listings,
         SUM(CASE WHEN verification_status = 'Removed' THEN 1 ELSE 0 END) as removed_listings
       FROM listings`
    ).first();

    const actionsRes = await env.DB.prepare(
      `SELECT
         a.*,
         l.title AS listing_title
       FROM listing_moderation_actions a
       LEFT JOIN listings l ON l.id = a.listing_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 100`
    ).all();

    const statusCounts: Record<string, number> = {
      pending: 0,
      under_review: 0,
      action_taken: 0,
      dismissed: 0,
      resolved: 0,
      total: 0,
    };

    for (const row of countsRes?.results || []) {
      const s = String(row.status || "");
      const c = Number(row.cnt || 0);
      statusCounts[s] = c;
      statusCounts.total += c;
    }

    return jsonOk({
      reports: reportsRes?.results || [],
      moderationActions: actionsRes?.results || [],
      stats: {
        ...statusCounts,
        hiddenListings: Number(listingVisRes?.hidden_listings || 0),
        removedListings: Number(listingVisRes?.removed_listings || 0),
      },
    });
  } catch (err: any) {
    return jsonError(err?.message || "Failed to load reports.", 500);
  }
}

export async function handleAdminGetReportDetail({
  env,
  reportId,
}: {
  env: any;
  reportId: string;
}): Promise<Response> {
  const cleanId = Number(reportId);
  if (!Number.isInteger(cleanId) || cleanId <= 0) {
    return jsonError("Invalid report ID.", 400);
  }

  try {
    const report = await env.DB.prepare(
      `SELECT
         r.id,
         r.listing_id,
         r.reason,
         r.details,
         r.reporter_name,
         r.reporter_phone,
         r.status,
         r.created_at,
         r.reviewed_at,
         r.reviewed_by,
         r.reviewed_by_name,
         r.moderation_notes,
         l.title AS listing_title,
         l.city AS listing_city,
         l.suburb AS listing_suburb,
         l.landmark AS listing_landmark,
         l.price AS listing_price,
         l.deposit AS listing_deposit,
         l.rent_cycle AS listing_frequency,
         l.property_type AS listing_property_type,
         l.category AS listing_category,
         l.verification_status AS listing_status,
         l.landlord_id AS listing_landlord_id,
         l.contact_phone AS listing_contact_phone,
         l.image_url AS listing_image_url,
         l.reports_count AS listing_reports_count,
         ld.full_name AS listing_landlord_name,
         (
           SELECT COUNT(*)
           FROM listing_reports r2
           WHERE r2.listing_id = r.listing_id
             AND r2.ip_hash IS NOT NULL
             AND r2.ip_hash = r.ip_hash
         ) AS same_ip_reports_count
       FROM listing_reports r
       LEFT JOIN listings l ON l.id = r.listing_id
       LEFT JOIN landlords ld ON ld.id = l.landlord_id
       WHERE r.id = ?`
    )
      .bind(cleanId)
      .first();

    if (!report) {
      return jsonError("Report not found.", 404);
    }

    const siblingReports = await env.DB.prepare(
      `SELECT
         id, reason, details, reporter_name, status, created_at, reviewed_at, reviewed_by_name, moderation_notes
       FROM listing_reports
       WHERE listing_id = ?
       ORDER BY created_at DESC, id DESC`
    )
      .bind(report.listing_id)
      .all();

    const moderationActions = await env.DB.prepare(
      `SELECT *
       FROM listing_moderation_actions
       WHERE listing_id = ?
       ORDER BY created_at DESC, id DESC`
    )
      .bind(report.listing_id)
      .all();

    return jsonOk({
      report,
      siblingReports: siblingReports?.results || [],
      moderationActions: moderationActions?.results || [],
    });
  } catch (err: any) {
    return jsonError(err?.message || "Failed to load report details.", 500);
  }
}

export async function handleAdminModerate({
  env,
  admin,
  reportId,
  listingId,
  body,
}: {
  env: any;
  admin: AuthenticatedLandlord;
  reportId?: string | number | null;
  listingId?: string | number | null;
  body: any;
}): Promise<Response> {
  const rawAction = typeof body?.action === "string" ? body.action.trim() : "";
  if (!(VALID_MODERATION_ACTIONS as readonly string[]).includes(rawAction)) {
    return jsonError(`Unsupported moderation action: "${rawAction || ""}".`, 400);
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

  try {
    let targetReport: any = null;
    if (reportId !== undefined && reportId !== null && String(reportId).trim() !== "") {
      const cleanReportId = Number(reportId);
      if (!Number.isInteger(cleanReportId) || cleanReportId <= 0) {
        return jsonError("Invalid report ID.", 400);
      }
      targetReport = await env.DB.prepare(
        "SELECT * FROM listing_reports WHERE id = ?"
      )
        .bind(cleanReportId)
        .first();
      if (!targetReport) {
        return jsonError("Report not found.", 404);
      }
    }

    const resolvedListingId = Number(
      listingId ?? targetReport?.listing_id ?? body?.listingId ?? 0
    );
    if (!Number.isInteger(resolvedListingId) || resolvedListingId <= 0) {
      return jsonError("Valid listing ID is required.", 400);
    }

    const listing = await env.DB.prepare("SELECT * FROM listings WHERE id = ?")
      .bind(resolvedListingId)
      .first();
    if (!listing) {
      return jsonError("Associated listing not found.", 404);
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
      // Look up last active pre-moderation status (e.g., 'verified' or 'Active')
      const lastHideAction = await env.DB.prepare(
        `SELECT previous_listing_status
         FROM listing_moderation_actions
         WHERE listing_id = ?
           AND new_listing_status IN ('Hidden', 'Removed')
           AND previous_listing_status IN ('Active', 'verified')
         ORDER BY id DESC
         LIMIT 1`
      )
        .bind(resolvedListingId)
        .first();
      nextListingStatus = lastHideAction?.previous_listing_status || "Active";
      nextReportStatus = targetReport ? "resolved" : null;
    } else if (rawAction === "add_note") {
      normalizedActionType = "add_note";
      nextReportStatus = targetReport ? String(targetReport.status) : null;
    }

    // 1. Update listing visibility if changed
    if (nextListingStatus !== prevStatus) {
      await env.DB.prepare(
        "UPDATE listings SET verification_status = ? WHERE id = ?"
      )
        .bind(nextListingStatus, resolvedListingId)
        .run();
    }

    // 2. Update target report (and open sibling reports on hide/remove)
    if (targetReport && nextReportStatus) {
      await env.DB.prepare(
        `UPDATE listing_reports
         SET status = ?,
             reviewed_at = CURRENT_TIMESTAMP,
             reviewed_by = ?,
             reviewed_by_name = ?,
             moderation_notes = COALESCE(?, moderation_notes)
         WHERE id = ?`
      )
        .bind(
          nextReportStatus,
          admin.id,
          admin.name,
          notes,
          targetReport.id
        )
        .run();
    }

    if (
      normalizedActionType === "hide_listing" ||
      normalizedActionType === "remove_listing"
    ) {
      await env.DB.prepare(
        `UPDATE listing_reports
         SET status = 'action_taken',
             reviewed_at = CURRENT_TIMESTAMP,
             reviewed_by = ?,
             reviewed_by_name = ?,
             moderation_notes = COALESCE(?, moderation_notes)
         WHERE listing_id = ?
           AND status IN ('pending', 'under_review')`
      )
        .bind(admin.id, admin.name, notes, resolvedListingId)
        .run();
    }

    // 3. Record immutable moderation audit action
    const auditRes = await env.DB.prepare(
      `INSERT INTO listing_moderation_actions (
         listing_id, report_id, admin_id, admin_name, action_type,
         previous_listing_status, new_listing_status, reason, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        resolvedListingId,
        targetReport ? targetReport.id : null,
        admin.id,
        admin.name,
        normalizedActionType,
        prevStatus,
        nextListingStatus,
        reason,
        notes
      )
      .run();

    return jsonOk({
      success: true,
      actionId: auditRes?.meta?.last_row_id || null,
      actionType: normalizedActionType,
      listingId: resolvedListingId,
      previousListingStatus: prevStatus,
      newListingStatus: nextListingStatus,
      reportId: targetReport ? targetReport.id : null,
      reportStatus: nextReportStatus,
    });
  } catch (err: any) {
    return jsonError(err?.message || "Moderation action failed.", 500);
  }
}
