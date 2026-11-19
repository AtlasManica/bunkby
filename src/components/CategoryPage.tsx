import React, { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Eye, MapPin, MessageSquare, Phone } from "lucide-react";
import {
  CategoryDefinition,
  FEATURED_CITY_SLUGS,
  WHATSAPP_NUMBER_DISPLAY,
  findCityBySlugOrName,
  getListingCategoryKey,
  getWhatsAppLink,
  isListingAvailable,
  toSlug,
} from "../../shared/seoData";
import { RoomListing } from "../types";

interface CategoryPageProps {
  category: CategoryDefinition | null;
  allListings: RoomListing[];
  isLoading: boolean;
  onNavigate: (path: string) => void;
  onContactLandlord: (room: RoomListing) => void;
  getPrimaryPhoto: (room: any) => string;
}

export const CategoryPage: React.FC<CategoryPageProps> = ({
  category,
  allListings,
  isLoading,
  onNavigate,
  onContactLandlord,
  getPrimaryPhoto,
}) => {
  const [selectedCitySlug, setSelectedCitySlug] = useState("");

  const handleLinkClick = (e: React.MouseEvent, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(path);
  };

  const categoryListings = useMemo(() => {
    if (!category) return [];
    return allListings.filter((room) => {
      if (!isListingAvailable(room)) return false;
      if (getListingCategoryKey(room) !== category.key) return false;
      if (selectedCitySlug && toSlug(room.city) !== selectedCitySlug) return false;
      return true;
    });
  }, [allListings, category, selectedCitySlug]);

  if (!category) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-xl mx-auto space-y-3">
        <h1 className="text-2xl font-display font-black text-[#052659]">Category Not Found</h1>
        <p className="text-sm text-slate-600">Return to BunkBy to browse all property categories.</p>
        <a
          href="/"
          onClick={(e) => handleLinkClick(e, "/")}
          className="inline-block px-4 py-2 rounded-xl bg-[#052659] text-white text-xs font-bold"
        >
          Back to Home
        </a>
      </div>
    );
  }

  const featuredCities = FEATURED_CITY_SLUGS.map((s) => findCityBySlugOrName(s)).filter(
    (c): c is NonNullable<typeof c> => Boolean(c)
  );

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        <a
          href="/"
          onClick={(e) => handleLinkClick(e, "/")}
          className="hover:text-[#052659] flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#FF7A00]" />
          <span>Home</span>
        </a>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[#052659] font-bold">{category.name}</span>
      </nav>

      <section className="bg-[#052659] text-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-md space-y-3">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-black leading-tight">
          {category.headline}
        </h1>
        <p className="text-xs sm:text-sm text-slate-200 max-w-3xl leading-relaxed">{category.intro}</p>
        <div className="pt-2 flex flex-wrap gap-3 items-center">
          <a
            href={getWhatsAppLink(`Hi BunkBy! I am searching for ${category.name}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#15803d] hover:bg-[#166534] text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl inline-flex items-center gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Search {category.name} on WhatsApp ({WHATSAPP_NUMBER_DISPLAY})</span>
          </a>
        </div>
      </section>

      <div className="bg-white rounded-xl p-4 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCitySlug("")}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer ${
              selectedCitySlug === "" ? "bg-[#052659] text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            All Cities
          </button>
          {featuredCities.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setSelectedCitySlug(c.slug)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer ${
                selectedCitySlug === c.slug ? "bg-[#052659] text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <span className="text-xs font-mono text-slate-500">
          <strong className="text-slate-900">{categoryListings.length}</strong> listings
        </span>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-sm text-slate-500">
          Loading active {category.name.toLowerCase()} listings...
        </div>
      ) : categoryListings.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-2">
          <h2 className="text-base font-bold text-slate-900">No Active {category.name} Listings Found</h2>
          <p className="text-xs text-slate-600">Try selecting All Cities or browse the main BunkBy feed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {categoryListings.map((room) => {
            const listingPath = `/listing/${encodeURIComponent(String(room.id))}`;
            return (
              <article
                key={room.id}
                className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col group"
              >
                <a
                  href={listingPath}
                  onClick={(e) => handleLinkClick(e, listingPath)}
                  className="relative aspect-16/10 w-full overflow-hidden bg-slate-100 block"
                >
                  <img
                    src={getPrimaryPhoto(room)}
                    alt={`${room.title} - ${room.propertyType} in ${room.suburb}, ${room.city}`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-2.5 right-2.5 bg-white/95 rounded-xl px-2.5 py-1 border border-slate-200 shadow-sm">
                    <div className="text-base font-display font-extrabold text-slate-900">
                      ${room.price}
                      <span className="text-[10px] font-semibold text-slate-500">/{room.frequency}</span>
                    </div>
                  </div>
                </a>
                <div className="p-4 flex-1 flex flex-col space-y-2">
                  <h2 className="text-sm font-bold text-slate-800 line-clamp-1">
                    <a
                      href={listingPath}
                      onClick={(e) => handleLinkClick(e, listingPath)}
                      className="hover:text-[#052659]"
                    >
                      {room.title}
                    </a>
                  </h2>
                  <p className="text-xs text-slate-600 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#FF7A00] shrink-0" />
                    <span className="truncate">
                      {room.city}, {room.suburb}
                    </span>
                  </p>
                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                    <a
                      href={listingPath}
                      onClick={(e) => handleLinkClick(e, listingPath)}
                      className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 py-2 px-3 rounded-xl inline-flex items-center gap-1"
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
                      <span>Contact Host</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
