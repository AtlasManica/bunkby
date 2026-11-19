import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Eye,
  GraduationCap,
  Home,
  Hotel,
  MapPin,
  MessageSquare,
  Phone,
  SlidersHorizontal,
} from "lucide-react";
import {
  CityDefinition,
  LOCATION_CITIES,
  SuburbDefinition,
  WHATSAPP_NUMBER_DISPLAY,
  getListingCategoryKey,
  getWhatsAppLink,
  isListingAvailable,
  matchesSuburbName,
  toSlug,
} from "../../shared/seoData";
import { RoomListing } from "../types";

interface LocationPageProps {
  city: CityDefinition | null;
  suburb: SuburbDefinition | null;
  isUnknownSuburb: boolean;
  allListings: RoomListing[];
  isLoading: boolean;
  onNavigate: (path: string) => void;
  onContactLandlord: (room: RoomListing) => void;
  getPrimaryPhoto: (room: any) => string;
}

export const LocationPage: React.FC<LocationPageProps> = ({
  city,
  suburb,
  isUnknownSuburb,
  allListings,
  isLoading,
  onNavigate,
  onContactLandlord,
  getPrimaryPhoto,
}) => {
  const [selectedPropertyType, setSelectedPropertyType] = useState("");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");

  const handleLinkClick = (e: React.MouseEvent, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(path);
  };

  const activeLocationListings = useMemo(() => {
    if (!city || isUnknownSuburb) return [];
    return allListings.filter((room) => {
      if (!isListingAvailable(room)) return false;
      if (toSlug(room.city) !== city.slug) return false;
      if (suburb && !matchesSuburbName(room.suburb, suburb)) return false;
      return true;
    });
  }, [allListings, city, suburb, isUnknownSuburb]);

  const availablePropertyTypes = useMemo(() => {
    const set = new Set<string>();
    activeLocationListings.forEach((l) => {
      if (l.propertyType) set.add(l.propertyType);
    });
    return Array.from(set).sort();
  }, [activeLocationListings]);

  const filteredListings = useMemo(() => {
    return activeLocationListings.filter((room) => {
      if (selectedPropertyType && room.propertyType !== selectedPropertyType) return false;
      if (minPrice !== "" && room.price < Number(minPrice)) return false;
      if (maxPrice !== "" && room.price > Number(maxPrice)) return false;
      return true;
    });
  }, [activeLocationListings, selectedPropertyType, minPrice, maxPrice]);

  if (!city || isUnknownSuburb) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-display font-black text-[#052659]">Location Not Found</h1>
        <p className="text-sm text-slate-600">
          The requested location page was not found. Select a Zimbabwe city below or browse all active listings on BunkBy.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {LOCATION_CITIES.slice(0, 7).map((c) => (
            <a
              key={c.slug}
              href={`/locations/${c.slug}`}
              onClick={(e) => handleLinkClick(e, `/locations/${c.slug}`)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#052659]"
            >
              {c.name}
            </a>
          ))}
        </div>
      </div>
    );
  }

  const placeName = suburb ? `${suburb.name}, ${city.name}` : city.name;
  const siblingCities = LOCATION_CITIES.filter((c) => c.slug !== city.slug).slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-medium">
        <a
          href="/"
          onClick={(e) => handleLinkClick(e, "/")}
          className="hover:text-[#052659] transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#FF7A00]" />
          <span>Home</span>
        </a>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        {suburb ? (
          <>
            <a
              href={`/locations/${city.slug}`}
              onClick={(e) => handleLinkClick(e, `/locations/${city.slug}`)}
              className="hover:text-[#052659] transition-colors font-semibold"
            >
              {city.name}
            </a>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[#052659] font-bold">{suburb.name}</span>
          </>
        ) : (
          <span className="text-[#052659] font-bold">{city.name}</span>
        )}
      </nav>

      {/* Location Header */}
      <section className="bg-[#052659] text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-md space-y-3">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[#FF7A00] font-bold">
          <MapPin className="w-3.5 h-3.5" />
          <span>{city.provinceOrRegion}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-black leading-tight">
          Accommodation &amp; Properties in {placeName}
        </h1>

        <p className="text-xs sm:text-sm text-slate-200 max-w-3xl leading-relaxed">
          {suburb?.description ? `${suburb.description} ` : `${city.intro} `}
          {city.highlights}
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <a
            href={getWhatsAppLink(`Hi BunkBy! I am looking for accommodation in ${placeName}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#15803d] hover:bg-[#166534] text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl inline-flex items-center gap-2 transition-colors"
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>Search {placeName} on WhatsApp ({WHATSAPP_NUMBER_DISPLAY})</span>
          </a>

          <a
            href="/whatsapp"
            onClick={(e) => handleLinkClick(e, "/whatsapp")}
            className="bg-white/10 hover:bg-white/20 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl border border-white/15 transition-colors"
          >
            How WhatsApp Search Works
          </a>
        </div>
      </section>

      {/* Filters Bar */}
      <section className="bg-white rounded-xl sm:rounded-2xl p-4 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-semibold text-slate-500 uppercase">
                Property Type
              </label>
              <select
                value={selectedPropertyType}
                onChange={(e) => setSelectedPropertyType(e.target.value)}
                className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700"
              >
                <option value="">All Property Types</option>
                {availablePropertyTypes.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono font-semibold text-slate-500 uppercase">
                Min Price (USD)
              </label>
              <input
                type="number"
                placeholder="Min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-full text-xs py-2 px-2.5 rounded-lg border border-slate-200 bg-slate-50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono font-semibold text-slate-500 uppercase">
                Max Price (USD)
              </label>
              <input
                type="number"
                placeholder="Max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full text-xs py-2 px-2.5 rounded-lg border border-slate-200 bg-slate-50"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 font-mono shrink-0">
            {(selectedPropertyType || minPrice || maxPrice) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPropertyType("");
                  setMinPrice("");
                  setMaxPrice("");
                }}
                className="text-orange-600 font-bold hover:underline cursor-pointer"
              >
                Reset
              </button>
            )}
            <span>
              <strong className="text-slate-900">{filteredListings.length}</strong> active listings
            </span>
          </div>
        </div>
      </section>

      {/* Active Listings Grid */}
      {isLoading ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-sm text-slate-500">
          Loading active listings in {placeName}...
        </div>
      ) : filteredListings.length === 0 ? (
        <section className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <SlidersHorizontal className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            No Active Listings Currently Shown in {placeName}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
            There are currently no active listings matching this selection in {placeName}. You can explore nearby areas in {city.name} or message BunkBy on WhatsApp to check newly added properties.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {suburb && (
              <a
                href={`/locations/${city.slug}`}
                onClick={(e) => handleLinkClick(e, `/locations/${city.slug}`)}
                className="px-4 py-2 rounded-xl bg-[#052659] text-white text-xs font-bold"
              >
                View All {city.name} Listings
              </a>
            )}
            <a
              href="/"
              onClick={(e) => handleLinkClick(e, "/")}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
            >
              Browse All Zimbabwe Listings
            </a>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredListings.map((room) => {
            const catKey = getListingCategoryKey(room);
            const isHospitality = catKey === "hospitality";
            const IconComp =
              catKey === "commercial"
                ? Building2
                : catKey === "student"
                ? GraduationCap
                : catKey === "hospitality"
                ? Hotel
                : Home;
            const listingPath = `/listing/${encodeURIComponent(String(room.id))}`;
            const primaryPhoto = getPrimaryPhoto(room);

            return (
              <article
                key={room.id}
                className="bg-white rounded-2xl overflow-hidden border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col group"
              >
                <a
                  href={listingPath}
                  onClick={(e) => handleLinkClick(e, listingPath)}
                  className="relative aspect-16/10 sm:aspect-16/9 w-full overflow-hidden bg-slate-100 block"
                >
                  <img
                    src={primaryPhoto}
                    alt={`${room.title} - ${room.propertyType} in ${room.suburb}, ${room.city}`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
                    <span className="bg-[#052659] text-white font-bold text-[9px] uppercase px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <IconComp className="w-2.5 h-2.5 text-[#FF7A00]" />
                      <span>{catKey}</span>
                    </span>
                    <span className="bg-slate-900/85 text-[#FF7A00] font-mono font-bold text-[9px] px-1.5 py-0.5 rounded-full uppercase">
                      {room.propertyType}
                    </span>
                  </div>
                  <div className="absolute bottom-2.5 right-2.5 bg-white/95 rounded-xl px-2.5 py-1 text-right border border-slate-200 shadow-sm">
                    <div className="text-base font-display font-extrabold text-slate-900">
                      ${room.price}
                      <span className="text-[10px] font-semibold text-slate-500">/{room.frequency}</span>
                    </div>
                  </div>
                </a>

                <div className="p-4 flex-1 flex flex-col space-y-2.5">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-800 line-clamp-1">
                      <a
                        href={listingPath}
                        onClick={(e) => handleLinkClick(e, listingPath)}
                        className="hover:text-[#052659] transition-colors"
                      >
                        {room.title}
                      </a>
                    </h2>
                    <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-[#FF7A00] shrink-0" />
                      <span className="truncate">
                        {room.city}, {room.suburb}
                      </span>
                    </p>
                  </div>

                  {room.amenities?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {room.amenities.slice(0, 3).map((a, idx) => (
                        <span
                          key={idx}
                          className="text-[9.5px] font-medium py-0.5 px-2 rounded-md bg-sky-50 text-sky-700 border border-sky-100"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                    <a
                      href={listingPath}
                      onClick={(e) => handleLinkClick(e, listingPath)}
                      className="text-xs font-bold text-slate-700 hover:text-[#052659] bg-slate-100 hover:bg-slate-200 py-2 px-3 rounded-xl inline-flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Details</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => onContactLandlord(room)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{isHospitality ? "Inquire" : "Contact Host"}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Suburbs within this City + Nearby Cities */}
      <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
        {city.suburbs.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm sm:text-base font-display font-bold text-[#052659]">
              Suburbs &amp; Neighborhoods in {city.name}
            </h2>
            <div className="flex flex-wrap gap-2">
              {city.suburbs.map((s) => {
                const isCurrent = suburb?.slug === s.slug;
                return (
                  <a
                    key={s.slug}
                    href={`/locations/${city.slug}/${s.slug}`}
                    onClick={(e) => handleLinkClick(e, `/locations/${city.slug}/${s.slug}`)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      isCurrent
                        ? "bg-[#052659] text-white"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    {s.name}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <h2 className="text-sm sm:text-base font-display font-bold text-[#052659]">
            Other Zimbabwe Cities on BunkBy
          </h2>
          <div className="flex flex-wrap gap-2">
            {siblingCities.map((c) => (
              <a
                key={c.slug}
                href={`/locations/${c.slug}`}
                onClick={(e) => handleLinkClick(e, `/locations/${c.slug}`)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#052659]"
              >
                {c.name}
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
