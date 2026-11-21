import {
  getAuthenticatedLandlord,
  jsonError,
  jsonOk,
} from "../../../_lib/security";

export async function onRequestPost({
  request,
  env,
  params,
}: {
  request: Request;
  env: any;
  params: { id: string };
}) {
  try {
    const id = params.id;
    const listing: any = await env.DB.prepare(
      "SELECT id, landlord_id, verification_status FROM listings WHERE id = ?"
    )
      .bind(id)
      .first();

    if (!listing) {
      return jsonError("Listing not found", 404);
    }

    const requester = await getAuthenticatedLandlord(request, env);
    if (!requester) {
      return jsonError(
        "Unauthorized: Valid landlord authentication token is required.",
        401
      );
    }
    if (
      listing.landlord_id &&
      requester.id !== Number(listing.landlord_id) &&
      !requester.isAdmin
    ) {
      return jsonError(
        "Forbidden: You do not have permission to modify this listing.",
        403
      );
    }

    if (
      !requester.isAdmin &&
      (listing.verification_status === "Hidden" ||
        listing.verification_status === "Removed")
    ) {
      return jsonError(
        `This listing is currently ${listing.verification_status.toLowerCase()} by BunkBy moderation and cannot be reactivated without administrator review.`,
        403
      );
    }

    const nextStatus =
      listing.verification_status === "Active" ? "Delisted" : "Active";
    await env.DB.prepare(
      "UPDATE listings SET verification_status = ? WHERE id = ?"
    )
      .bind(nextStatus, id)
      .run();

    return jsonOk({ success: true, status: nextStatus });
  } catch (error: any) {
    return jsonError(error?.message || "Failed to toggle listing status.", 500);
  }
}
