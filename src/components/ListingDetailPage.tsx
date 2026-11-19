import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle,
  ChevronRight,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Share2,
} from "lucide-react";
import {
  CATEGORY_DEFINITIONS,
  SITE_URL,
  WHATSAPP_NUMBER_DISPLAY,
  buildListingSeo,
  findCityBySlugOrName,
  findSuburbInCity,
  getListingCategoryKey,
  getWhatsAppLink,
  isListingAvailable,
} from "../../shared/seoData";
import { RoomListing } from "../types";
import { applyClientSeo } from "../utils/seoClient";

interface ListingDetailPageProps {
  listingId: string;
  cachedListings: RoomListing[];
  onNavigate: (path: string) => void;
  onContactLandlord: (room: RoomListing) => void;
  onReportListing: (room: RoomListing) => void;
  showToast: (msg: string) => void;
}

export const ListingDetailPage: React.FC<ListingDetailPageProps> = ({
  listingId,
  cachedListings,
  onNavigate,
  onContactLandlord,
  onReportListing,
  showToast,
}) => {
  const [listing, setListing] = useState<RoomListing | null>(() => {
    return cachedListings.find((r) => String(r.id) === String(listingId)) || null;
  });
  const [availabilityState, setAvailabilityState] = useState<"loading" | "active" | "unavailable" | "not_found">(() => {
    const cached = cachedListings.find((r) => String(r.id) === String(listingId));
    if (cached) {
      return isListingAvailable(cached) ? "active" : "unavailable";
    }
    return "loading";
  });
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleLinkClick = (e: React.MouseEvent, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(path);
  };

  useEffect(() => {
    let cancelled = false;
    setActivePhotoIdx(0);

    const cached = cachedListings.find((r) => String(r.id) === String(listingId));
    if (cached) {
      setListing(cached);
      const ok = isListingAvailable(cached);
      setAvailabilityState(ok ? "active" : "unavailable");
      applyClientSeo(buildListingSeo(cached, listingId));
      return;
    }

    setAvailabilityState("loading");
    fetch(`/api/rooms/${encodeURIComponent(listingId)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setListing(null);
          setAvailabilityState("not_found");
          applyClientSeo(buildListingSeo(null, listingId));
          return;
        }
        const data = await res.json().catch(() => null);
        if (res.status === 410 || data?.available === false) {
          setListing(data?.listing || null);
          setAvailabilityState("unavailable");
          applyClientSeo(buildListingSeo(data?.listing || null, listingId));
          return;
        }
        if (data?.listing) {
          setListing(data.listing);
          const ok = isListingAvailable(data.listing);
          setAvailabilityState(ok ? "active" : "unavailable");
          applyClientSeo(buildListingSeo(data.listing, listingId));
        } else {
          setListing(null);
          setAvailabilityState("not_found");
          applyClientSeo(buildListingSeo(null, listingId));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAvailabilityState("not_found");
      });

    return () => {
      cancelled = true;
    };
  }, [listingId, cachedListings]);

  if (availabilityState === "loading") {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-2xl mx-auto space-y-3">
        <RefreshCw className="w-7 h-7 text-orange-500 animate-spin mx-auto" />
        <p className="text-sm text-slate-600 font-medium">Loading property details...</p>
      </div>
    );
  }

  if (availabilityState === "not_found" || !listing) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-display font-black text-[#052659]">
          Property Listing Not Found
        </h1>
        <p className="text-sm text-slate-600">
          This listing has been deleted or does not exist. Browse active properties across Zimbabwe on BunkBy.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <a
            href="/"
            onClick={(e) => handleLinkClick(e, "/")}
            className="px-5 py-2.5 rounded-xl bg-[#052659] text-white text-xs font-bold"
          >
            Browse Active Listings
          </a>
          <a
            href="/whatsapp"
            onClick={(e) => handleLinkClick(e, "/whatsapp")}
            className="px-5 py-2.5 rounded-xl bg-[#15803d] text-white text-xs font-bold"
          >
            Find Properties on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  const cityDef = findCityBySlugOrName(listing.city);
  const suburbDef = cityDef ? findSuburbInCity(cityDef, listing.suburb) : null;
  const catKey = getListingCategoryKey(listing);
  const catDef = CATEGORY_DEFINITIONS[catKey];

  if (availabilityState === "unavailable") {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center max-w-2xl mx-auto space-y-4">
        <span className="inline-block bg-amber-100 text-amber-800 font-mono font-bold text-xs px-3 py-1 rounded-full uppercase">
          Status: {listing.status || "Unavailable"}
        </span>
        <h1 className="text-2xl font-display font-black text-[#052659]">
          This Listing Is No Longer Available
        </h1>
        <p className="text-sm text-slate-600">
          <strong>{listing.title}</strong> ({listing.city}, {listing.suburb}) is no longer accepting enquiries on BunkBy.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {cityDef && (
            <a
              href={`/locations/${cityDef.slug}`}
              onClick={(e) => handleLinkClick(e, `/locations/${cityDef.slug}`)}
              className="px-5 py-2.5 rounded-xl bg-[#052659] text-white text-xs font-bold"
            >
              Browse Active Listings in {cityDef.name}
            </a>
          )}
          <a
            href="/"
            onClick={(e) => handleLinkClick(e, "/")}
            className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
          >
            Back to BunkBy Home
          </a>
        </div>
      </div>
    );
  }

  const photos =
    listing.images && listing.images.length > 0
      ? listing.images
      : listing.image_url
      ? [listing.image_url]
      : [];
  const activePhoto = photos[activePhotoIdx] || photos[0] || "";
  const isHospitality = catKey === "hospitality";
  const shareUrl = `${SITE_URL}/listing/${encodeURIComponent(String(listing.id))}`;

  const handleCopyShare = () => {
    try {
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      showToast("Listing link copied!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      showToast(shareUrl);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-medium">
        <a
          href="/"
          onClick={(e) => handleLinkClick(e, "/")}
          className="hover:text-[#052659] flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#FF7A00]" />
          <span>Home</span>
        </a>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <a
          href={`/categories/${catDef.slug}`}
          onClick={(e) => handleLinkClick(e, `/categories/${catDef.slug}`)}
          className="hover:text-[#052659]"
        >
          {catDef.name}
        </a>
        {cityDef && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <a
              href={`/locations/${cityDef.slug}`}
              onClick={(e) => handleLinkClick(e, `/locations/${cityDef.slug}`)}
              className="hover:text-[#052659]"
            >
              {cityDef.name}
            </a>
          </>
        )}
        {cityDef && suburbDef && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <a
              href={`/locations/${cityDef.slug}/${suburbDef.slug}`}
              onClick={(e) => handleLinkClick(e, `/locations/${cityDef.slug}/${suburbDef.slug}`)}
              className="hover:text-[#052659]"
            >
              {suburbDef.name}
            </a>
          </>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[#052659] font-bold truncate max-w-[200px] sm:max-w-xs">{listing.title}</span>
      </nav>

      <article className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Top Navy Header */}
        <div className="bg-[#021024] text-white p-5 sm:p-6 flex flex-wrap items-start justify-between gap-4 border-b border-[#052659]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <span className="bg-[#FF7A00] text-white font-bold px-2.5 py-0.5 rounded-full uppercase">
                {catDef.name}
              </span>
              <span className="bg-white/10 text-slate-200 px-2.5 py-0.5 rounded-full uppercase">
                {listing.propertyType}
              </span>
              {listing.isSample && (
                <span className="bg-amber-500 text-white font-bold px-2.5 py-0.5 rounded-full uppercase">
                  Sample
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-3xl font-display font-black leading-tight pt-1">
              {listing.title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#FF7A00] shrink-0" />
              <span>
                {listing.city}, {listing.suburb}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyShare}
            className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 border border-white/15 cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copiedLink ? "Copied" : "Share Link"}</span>
          </button>
        </div>

        <div className="p-5 sm:p-7 space-y-6">
          {/* Gallery */}
          <div className="space-y-2.5">
            <div className="relative aspect-16/10 sm:aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
              {activePhoto ? (
                <img
                  src={activePhoto}
                  alt={`${listing.title} - ${listing.propertyType} in ${listing.suburb}, ${listing.city}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-slate-400 font-mono text-xs font-bold uppercase tracking-widest">
                  No photograph provided
                </span>
              )}
            </div>
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto py-1">
                {photos.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActivePhotoIdx(idx)}
                    className={`relative w-24 h-16 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer ${
                      activePhotoIdx === idx ? "border-[#FF7A00]" : "border-slate-200 hover:opacity-80"
                    }`}
                  >
                    <img
                      src={p}
                      alt={`${listing.title} photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pricing & Key Details */}
          <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-mono font-bold tracking-wider block">
                {isHospitality ? "Accommodation Rate" : "Rental / Lease Price"}
              </span>
              <div className="text-2xl sm:text-3xl font-display font-black text-slate-900">
                ${listing.price}{" "}
                <span className="text-xs font-bold text-slate-500 font-mono">
                  /{listing.frequency}
                </span>
              </div>
              {listing.deposit > 0 ? (
                <span className="text-xs text-slate-600 font-mono">Deposit: ${listing.deposit} USD</span>
              ) : (
                <span className="text-xs text-emerald-700 font-mono font-bold">No Deposit Required</span>
              )}
            </div>

            <div className="text-right space-y-1">
              <div className="text-xs font-mono text-slate-600">
                Status: <strong className="text-emerald-700">{listing.status || "Active"}</strong>
              </div>
              {listing.tenantType && (
                <div className="text-xs text-slate-500">
                  Suitability: <strong>{listing.tenantType}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Location & Landmark */}
          <div className="space-y-1.5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">
              Location &amp; Landmark
            </h2>
            <p className="text-sm font-semibold text-slate-800">
              {listing.suburb}, {listing.city}, Zimbabwe
            </p>
            {listing.landmark && (
              <p className="text-xs sm:text-sm text-slate-600 italic">
                Landmark / Area: {listing.landmark}
              </p>
            )}
          </div>

          {/* Description */}
          {listing.description && (
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">
                Property Description
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
                {listing.description}
              </p>
            </div>
          )}

          {/* Amenities */}
          {listing.amenities && listing.amenities.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">
                Included Amenities
              </h2>
              <div className="flex flex-wrap gap-2">
                {listing.amenities.map((amenity, idx) => (
                  <span
                    key={idx}
                    className="text-xs font-semibold py-1 px-3 rounded-xl bg-sky-50 text-sky-800 border border-sky-100 inline-flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-sky-600" />
                    <span>{amenity}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Advertiser Block */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-xs font-bold text-slate-500 uppercase font-mono">Advertiser Information</h2>
              <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[#052659]" />
                <span>{listing.businessName || listing.business_name || listing.landlordName}</span>
              </p>
              <p className="text-xs text-slate-500 font-mono">
                Preferred contact: {listing.contactMethod || "Call / WhatsApp"}
              </p>
            </div>

            {listing.isVerifiedLandlord ? (
              <span className="bg-emerald-100 text-emerald-800 font-bold uppercase text-[10px] px-3 py-1 rounded-full inline-flex items-center gap-1 font-mono">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verified Advertiser</span>
              </span>
            ) : (
              <span className="bg-slate-200 text-slate-600 font-medium text-[10px] px-3 py-1 rounded-full font-mono">
                Direct Advertiser · Zero Agent Fees
              </span>
            )}
          </div>

          {/* Trust Notice & Report */}
          <div className="p-3.5 bg-amber-50/70 border border-amber-200/60 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="text-amber-900 leading-snug">
              <strong>Trust &amp; Safety:</strong> Never send money or deposits without inspecting the property in person.
            </div>
            <button
              type="button"
              onClick={() => onReportListing(listing)}
              className="shrink-0 text-red-600 hover:text-red-700 hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Report</span>
            </button>
          </div>

          {/* Primary CTAs */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => onContactLandlord(listing)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-6 rounded-2xl text-sm shadow-md transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Phone className="w-4 h-4" />
              <span>Inquire with Advertiser via WhatsApp</span>
            </button>
            <a
              href={getWhatsAppLink(`Hi BunkBy! I would like to find similar properties to "${listing.title}" in ${listing.suburb}, ${listing.city}.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#052659] hover:bg-[#021024] text-white font-bold py-3.5 px-5 rounded-2xl text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all"
            >
              <MessageSquare className="w-4 h-4" />
              <span>BunkBy WhatsApp Bot ({WHATSAPP_NUMBER_DISPLAY})</span>
            </a>
          </div>
        </div>
      </article>
    </div>
  );
};
