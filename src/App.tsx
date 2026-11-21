import { compressImageFile } from "./utils/imageCompressor";

// Helper to extract the 1st (primary) photo for any room listing
// Safely handles JSON array strings, array objects, single URLs, or fallback placeholders
export function getPrimaryListingPhoto(room: any): string {
  if (!room) return DEFAULT_ROOM_IMAGES[0];
  if (Array.isArray(room.images) && room.images.length > 0 && room.images[0]) {
    const first = String(room.images[0]).trim();
    if (!first.startsWith("[")) return first;
  }
  const raw = String(room.image_url || "").trim();
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0 && arr[0]) {
        return String(arr[0]).trim();
      }
    } catch (_) {}
  }
  if (raw) return raw;
  if (Array.isArray(room.images) && room.images.length > 0 && room.images[0]) {
    return String(room.images[0]).trim();
  }
  return DEFAULT_ROOM_IMAGES[0];
}

export function getAllListingPhotos(room: any): string[] {
  if (!room) return [];
  if (Array.isArray(room.images) && room.images.length > 0) {
    const cleaned = room.images.map((p: any) => String(p || "").trim()).filter(Boolean);
    if (cleaned.length > 0) return cleaned;
  }
  const raw = String(room.image_url || "").trim();
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const cleaned = arr.map((p: any) => String(p || "").trim()).filter(Boolean);
        if (cleaned.length > 0) return cleaned;
      }
    } catch (_) {}
  }
  return raw ? [raw] : [];
}
import PrivacyPolicy from "./PrivacyPolicy";
import { WhatsAppLandingPage } from "./components/WhatsAppLandingPage";
import { ListingDetailPage } from "./components/ListingDetailPage";
import { AdminReportsPanel } from "./components/AdminReportsPanel";
import { applyClientSeo } from "./utils/seoClient";
import {
  CatalogLocationEntry,
  buildHomeSeo,
  buildWhatsAppSeo,
  findCityBySlugOrName,
  findProvinceBySlugOrName,
  findSuburbInCity,
  formatLocationTypeLabel,
  getSuburbNamesForCity,
  isListingAvailable,
  matchesSuburbName,
  resolveListingLocation,
  searchLocationsCatalogue,
  toSlug,
} from "../shared/seoData";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  GraduationCap, 
  Building, 
  MapPin, 
  CheckCircle, 
  User, 
  Settings, 
  HelpCircle, 
  Search, 
  MessageSquare, 
  Plus, 
  Trash2, 
  Sparkles, 
  Send, 
  Phone, 
  Share2, 
  ShieldCheck, 
  Award, 
  TrendingUp, 
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  Clock,
  ExternalLink,
  ChevronLeft,
  Camera,
  Upload,
  Trash,
  Building2,
  Hotel,
  Home,
  Bed,
  Coffee,
  Briefcase,
  Star,
  AlertTriangle,
  Lock,
  Key,
  Copy,
  Check,
  Eye,
  Flag,
  Filter
} from "lucide-react";
import { RoomListing, PropertyType, TenantType, ContactMethod, RentFrequency, ListingCategory } from "./types";
import { 
  INITIAL_ROOMS, 
  ALL_ZIM_CITIES, 
  ALL_AMENITIES, 
  ALL_PROPERTY_TYPES, 
  DEFAULT_ROOM_IMAGES,
  RESIDENTIAL_PROPERTY_TYPES,
  HOSPITALITY_PROPERTY_TYPES,
  COMMERCIAL_PROPERTY_TYPES,
  STUDENT_PROPERTY_TYPES,
  RESIDENTIAL_AMENITIES,
  HOSPITALITY_AMENITIES
} from "./initialData";
import { motion, AnimatePresence } from "motion/react";

// Official WhatsApp Brand Icon Component (handset centered inside chat bubble)
const WhatsAppIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    width="24" 
    height="24" 
    className={className} 
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.04 14.69 2 12.04 2M12.04 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.04 3.67Z" />
    <g transform="translate(12.04, 11.91) scale(0.88) translate(-13.855, -13.065)">
      <path d="M9.53 7.35C9.33 7.35 9 7.42 8.72 7.73C8.44 8.04 7.65 8.78 7.65 10.27C7.65 11.76 8.74 13.19 8.89 13.4C9.05 13.61 11.04 16.67 14.09 17.98C14.81 18.29 15.38 18.48 15.82 18.62C16.55 18.85 17.21 18.82 17.74 18.74C18.33 18.65 19.55 18 19.81 17.28C20.06 16.56 20.06 15.94 19.98 15.82C19.91 15.69 19.71 15.61 19.4 15.46C19.1 15.31 17.61 14.58 17.33 14.48C17.06 14.38 16.86 14.33 16.66 14.63C16.46 14.94 15.88 15.61 15.7 15.82C15.53 16.02 15.35 16.05 15.05 15.9C14.74 15.75 13.77 15.43 12.61 14.4C11.71 13.6 11.1 12.61 10.92 12.3C10.75 12 10.9 11.84 11.06 11.69C11.2 11.55 11.37 11.33 11.53 11.15C11.68 10.97 11.73 10.84 11.83 10.64C11.93 10.43 11.88 10.26 11.81 10.11C11.73 9.95 11.13 8.48 10.88 7.87C10.63 7.28 10.38 7.36 10.2 7.35H9.53Z" />
    </g>
  </svg>
);

const BUNKBY_WHATSAPP_DISPLAY = "+263 78 978 3200";
const BUNKBY_WHATSAPP_E164 = "263789783200";
const getBunkByWhatsAppUrl = (message: string) =>
  `https://wa.me/${BUNKBY_WHATSAPP_E164}?text=${encodeURIComponent(message)}`;

// BunkBy Orange Stacked Squares Logo Component (optimized WebP asset with PNG/SVG fallback)
const BunkByLogo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <div className={`${className} bg-white rounded-xl overflow-hidden p-0.5 border border-white/20 shadow-xs flex items-center justify-center shrink-0 select-none`}>
    <img 
      src="/bunkbylogo-nav.webp" 
      alt="BunkBy Logo" 
      decoding="sync"
      fetchPriority="high"
      className="w-full h-full object-contain"
      onError={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        if (!img.dataset.fallbackStage) {
          img.dataset.fallbackStage = "png";
          img.src = "/bunkbylogo.png";
        } else {
          img.src = "/bunkby-logo.svg";
        }
      }}
    />
  </div>
);

const normalizeRoutePath = (rawPath: string) => {
  if (rawPath === "/whatsapp" || rawPath === "/privacy-policy") return rawPath;
  if (/^\/listing\/[^/]+\/?$/.test(rawPath)) return rawPath;
  return "/";
};

async function parseJsonResponse<T = any>(
  res: Response
): Promise<{ ok: boolean; status: number; data: T | null; isHtml: boolean }> {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      status: res.status,
      data: null,
      isHtml: contentType.includes("text/html"),
    };
  }
  try {
    const data = (await res.json()) as T;
    return { ok: res.ok, status: res.status, data, isHtml: false };
  } catch {
    return { ok: false, status: res.status, data: null, isHtml: false };
  }
}

export default function App() {
  // Current active tab of the app
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== "undefined" ? normalizeRoutePath(window.location.pathname) : "/"
  );
  const [activeTab, setActiveTab] = useState<"browse" | "landlord" | "account" | "help">("browse");

  // Room Listings State (hydrated instantaneously from sessionStorage cache when available)
  const [listings, setListings] = useState<any[]>(() => {
    try {
      const cached = sessionStorage.getItem("bunkby_listings_v1");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    try {
      const cached = sessionStorage.getItem("bunkby_listings_v1");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return false;
      }
    } catch {}
    return true;
  });

  // Card photo swipe tracking: listingId -> active photo index
  const [cardPhotoIndices, setCardPhotoIndices] = useState<Record<string | number, number>>({});

  // Simulated landlords registry for offline verification mapping
  const [allLandlords, setAllLandlords] = useState<any[]>([]);

  useEffect(() => {
    // Fetch directly from server DB (reusing early <head> prefetch when available)
    const loadListings = async () => {
      try {
        const preloaded = (window as any).__bunkbyListingsReq;
        if (preloaded) {
          (window as any).__bunkbyListingsReq = null;
          const prefetchedData = await preloaded;
          if (prefetchedData && Array.isArray(prefetchedData.listings)) {
            setListings(prefetchedData.listings);
            try {
              sessionStorage.setItem("bunkby_listings_v1", JSON.stringify(prefetchedData.listings));
            } catch {}
            return;
          }
        }
        const res = await fetch("/api/listings", {
          headers: { Accept: "application/json" },
        });
        const parsed = await parseJsonResponse<{ listings?: any[]; error?: string }>(res);
        if (parsed.ok && parsed.data && Array.isArray(parsed.data.listings)) {
          const fresh = parsed.data.listings;
          setListings(fresh);
          try {
            sessionStorage.setItem("bunkby_listings_v1", JSON.stringify(fresh));
          } catch {}
        } else if (!parsed.isHtml && parsed.data?.error) {
          console.error("Failed to load listings:", parsed.data.error);
        }
      } catch (e) {
        console.error("Failed to load listings", e);
      } finally {
        setIsLoading(false);
      }
    };
    const loadLandlords = async () => {
      try {
        const res = await fetch("/api/landlords", {
          headers: { Accept: "application/json" },
        });
        const parsed = await parseJsonResponse<{ landlords?: any[]; error?: string }>(res);
        if (parsed.ok && parsed.data?.landlords) {
          setAllLandlords(parsed.data.landlords);
          return;
        }
        if (res.status === 404) {
          const fallbackRes = await fetch("/api/admin", {
            headers: { Accept: "application/json" },
          });
          const fallbackParsed = await parseJsonResponse<{ landlords?: any[]; error?: string }>(fallbackRes);
          if (fallbackParsed.ok && fallbackParsed.data?.landlords) {
            setAllLandlords(fallbackParsed.data.landlords);
          }
        } else if (!parsed.isHtml && parsed.data?.error) {
          console.error("Failed to load landlords:", parsed.data.error);
        }
      } catch (e) {
        console.error("Failed to load landlords", e);
      }
    };
    loadListings();
    loadLandlords();
  }, []);

  const [verifications, setVerifications] = useState<any[]>([]);

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedSuburb, setSelectedSuburb] = useState("");
  const [selectedProvinceSlug, setSelectedProvinceSlug] = useState("");
  const [customLocationQuery, setCustomLocationQuery] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const locationBoxRef = useRef<HTMLDivElement | null>(null);
  const [selectedAmenity, setSelectedAmenity] = useState("");
  const [selectedTenantType, setSelectedTenantType] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"all" | "residential" | "hospitality" | "commercial" | "student">("all");
  const [selectedPropertyType, setSelectedPropertyType] = useState("");
  const [minPrice, setMinPrice] = useState<number | "">("");
  const [maxPrice, setMaxPrice] = useState<number | "">("");
  const [sortBy, setSortBy] = useState<"newest" | "price_asc" | "price_desc" | "leads">("newest");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [pendingDirectListingId, setPendingDirectListingId] = useState<string | null>(null);

  const locationSuggestions = useMemo(() => {
    const q = locationInput.trim();
    if (!q) return [];
    return searchLocationsCatalogue(q, 8);
  }, [locationInput]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (locationBoxRef.current && !locationBoxRef.current.contains(event.target as Node)) {
        setIsLocationDropdownOpen(false);
        setActiveSuggestionIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selectCatalogLocation = (entry: CatalogLocationEntry) => {
    if (entry.locationType === "province") {
      setSelectedProvinceSlug(entry.slug);
      setSelectedCity("");
      setSelectedSuburb("");
      setCustomLocationQuery("");
      setLocationInput(`${entry.name} Province`);
    } else if (entry.locationType === "suburb") {
      const parentName = entry.parentName || "";
      setSelectedProvinceSlug("");
      setSelectedCity(parentName);
      setSelectedSuburb(entry.name);
      setCustomLocationQuery("");
      setLocationInput(parentName ? `${entry.name}, ${parentName}` : entry.name);
    } else {
      setSelectedProvinceSlug("");
      setSelectedCity(entry.name);
      setSelectedSuburb("");
      setCustomLocationQuery("");
      setLocationInput(entry.name);
    }
    setIsLocationDropdownOpen(false);
    setActiveSuggestionIndex(-1);
  };

  const committedLocationLabel = useMemo(() => {
    if (selectedSuburb && selectedCity) return `${selectedSuburb}, ${selectedCity}`;
    if (selectedSuburb) return selectedSuburb;
    if (selectedCity) return selectedCity;
    if (selectedProvinceSlug) {
      const prov = findProvinceBySlugOrName(selectedProvinceSlug);
      return prov ? `${prov.name} Province` : selectedProvinceSlug;
    }
    return customLocationQuery;
  }, [selectedSuburb, selectedCity, selectedProvinceSlug, customLocationQuery]);

  const commitLocationSearchInput = () => {
    const trimmed = locationInput.trim();
    if (!trimmed) {
      setSelectedCity("");
      setSelectedSuburb("");
      setSelectedProvinceSlug("");
      setCustomLocationQuery("");
      setIsLocationDropdownOpen(false);
      return;
    }
    if (
      committedLocationLabel &&
      trimmed.toLowerCase() === committedLocationLabel.toLowerCase()
    ) {
      setIsLocationDropdownOpen(false);
      return;
    }
    const matches = searchLocationsCatalogue(trimmed, 5);
    if (matches.length > 0) {
      selectCatalogLocation(matches[0]);
      return;
    }
    setSelectedProvinceSlug("");
    setSelectedCity("");
    setSelectedSuburb("");
    setCustomLocationQuery(trimmed);
    setIsLocationDropdownOpen(false);
  };

  // Accommodation Detail Modal State
  const [selectedListingDetail, setSelectedListingDetail] = useState<RoomListing | null>(null);
  const [detailActivePhotoIdx, setDetailActivePhotoIdx] = useState(0);

  // Inline Home Card Expansion State
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [cardActivePhotoIdx, setCardActivePhotoIdx] = useState<Record<string, number>>({});
  const [copiedListingId, setCopiedListingId] = useState<string | null>(null);

  const toggleCardExpanded = (listingId: string) => {
    setExpandedCardIds((prev) => ({
      ...prev,
      [listingId]: !prev[listingId],
    }));
  };

  // Report Suspicious Listing Modal State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportingListing, setReportingListing] = useState<RoomListing | null>(null);
  const [reportReason, setReportReason] = useState("Suspected scam / fake advertiser");
  const [reportDetails, setReportDetails] = useState("");
  const [reportReporterName, setReportReporterName] = useState("");
  const [reportReporterPhone, setReportReporterPhone] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Admin Console sub-page & full listing inventory (includes Hidden/Removed/Delisted)
  const [adminSubTab, setAdminSubTab] = useState<"reports" | "landlords" | "listings">("reports");
  const [adminListings, setAdminListings] = useState<any[]>([]);
  const [adminOpenReportsCount, setAdminOpenReportsCount] = useState<number>(0);



  // Simulated Account State (Supports phone number accounts for landlords, starts null for flow)
  const [userProfile, setUserProfile] = useState<{
    id?: number;
    name: string;
    phone: string;
    isVerified: boolean;
    token?: string;
    hasPin?: boolean;
    whatsappLinked?: boolean;
    role?: string;
  } | null>(() => {
    const saved = localStorage.getItem("bunkby_landlord_profile");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    if (userProfile?.role !== "Admin" || !userProfile?.token) {
      setAdminListings([]);
      setAdminOpenReportsCount(0);
      return;
    }
    let cancelled = false;
    const loadAdminOverview = async () => {
      try {
        const res = await fetch("/api/admin", {
          headers: {
            Accept: "application/json",
            "x-landlord-token": userProfile.token || "",
          },
        });
        const parsed = await parseJsonResponse<{
          landlords?: any[];
          listings?: any[];
          reports?: any[];
        }>(res);
        if (cancelled || !parsed.ok || !parsed.data) return;
        if (Array.isArray(parsed.data.listings)) {
          setAdminListings(parsed.data.listings);
        }
        if (Array.isArray(parsed.data.landlords)) {
          setAllLandlords(parsed.data.landlords);
        }
        if (Array.isArray(parsed.data.reports)) {
          setAdminOpenReportsCount(
            parsed.data.reports.filter(
              (r: any) => r.status === "pending" || r.status === "under_review"
            ).length
          );
        }
      } catch (e) {
        console.error("Failed to load admin overview", e);
      }
    };
    loadAdminOverview();
    return () => {
      cancelled = true;
    };
  }, [userProfile?.role, userProfile?.token]);

  // Soft Gate State for Lead Tracking (saves name/phone to local storage)
  const [isSoftGateOpen, setIsSoftGateOpen] = useState(false);
  const [softGateName, setSoftGateName] = useState(() => localStorage.getItem("bunkby_gate_name") || "");
  const [softGatePhone, setSoftGatePhone] = useState(() => localStorage.getItem("bunkby_gate_phone") || "");
  const [pendingContactRoom, setPendingContactRoom] = useState<RoomListing | null>(null);

  // Paid/Premium Listing Billing State
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [billingListingForm, setBillingListingForm] = useState<any>(null);
  const [billingPhone, setBillingPhone] = useState("");
  const [billingProvider, setBillingProvider] = useState<"EcoCash" | "InnBucks">("EcoCash");
  const [isPaying, setIsPaying] = useState(false);

  // Login form state for account setup with Security PIN
  const [loginPhone, setLoginPhone] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [showPinHelp, setShowPinHelp] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Floating WhatsApp CTA visibility: appears once on scroll past 180px, then disappears at once 2s after initial appearance
  const [showFloatingWhatsapp, setShowFloatingWhatsapp] = useState(false);
  const floatingWhatsappTimerRef = useRef<number | null>(null);
  const isFloatingWhatsappHoveredRef = useRef(false);
  const hasTriggeredFloatingWhatsappRef = useRef(false);
  const floatingWhatsappAppearedAtRef = useRef(0);

  useEffect(() => {
    const clearTimer = () => {
      if (floatingWhatsappTimerRef.current !== null) {
        window.clearTimeout(floatingWhatsappTimerRef.current);
        floatingWhatsappTimerRef.current = null;
      }
    };

    const handleScroll = () => {
      if (window.scrollY > 180) {
        if (!hasTriggeredFloatingWhatsappRef.current) {
          hasTriggeredFloatingWhatsappRef.current = true;
          floatingWhatsappAppearedAtRef.current = Date.now();
          setShowFloatingWhatsapp(true);
          clearTimer();
          floatingWhatsappTimerRef.current = window.setTimeout(() => {
            if (!isFloatingWhatsappHoveredRef.current) {
              setShowFloatingWhatsapp(false);
            }
            floatingWhatsappTimerRef.current = null;
          }, 2000);
        }
      } else {
        hasTriggeredFloatingWhatsappRef.current = false;
        isFloatingWhatsappHoveredRef.current = false;
        clearTimer();
        setShowFloatingWhatsapp(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimer();
    };
  }, []);

  // Listen to browser forward/backward navigation across SPA & SEO routes
  useEffect(() => {
    const handlePopState = () => {
      const normalized = normalizeRoutePath(window.location.pathname);
      setCurrentPath(normalized);
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab && ["browse", "landlord", "account", "help"].includes(tab)) {
        setActiveTab(tab as any);
      } else if (normalized === "/") {
        setActiveTab("browse");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTo = (path: string, tab?: "browse" | "landlord" | "account" | "help") => {
    try {
      if (path === "/" || path.startsWith("/?")) {
        let targetTab = tab || "browse";
        if (path.startsWith("/?")) {
          const params = new URLSearchParams(path.slice(1));
          const qTab = params.get("tab");
          if (qTab && ["browse", "landlord", "account", "help"].includes(qTab)) {
            targetTab = qTab as "browse" | "landlord" | "account" | "help";
          }
        }
        setActiveTab(targetTab);
        setCurrentPath("/");
        const search = targetTab !== "browse" ? `?tab=${targetTab}` : "";
        window.history.pushState(null, "", `/${search}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        window.history.pushState(null, "", path);
        setCurrentPath(path);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (_) {}
  };

  // Initialize filters & tab from URL on first mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q");
      const city = params.get("city");
      const suburb = params.get("suburb");
      const province = params.get("province");
      const cat = params.get("cat");
      const propType = params.get("type");
      const amenity = params.get("amenity");
      const tenant = params.get("tenant");
      const min = params.get("min");
      const max = params.get("max");
      const sort = params.get("sort");
      const tab = params.get("tab");
      const listingId = params.get("listing");

      if (q) setSearchTerm(q);
      if (province) {
        const provDef = findProvinceBySlugOrName(province);
        if (provDef) {
          setSelectedProvinceSlug(provDef.slug);
          setLocationInput(`${provDef.name} Province`);
        }
      } else {
        if (city) setSelectedCity(city);
        if (suburb) setSelectedSuburb(suburb);
        if (suburb && city) setLocationInput(`${suburb}, ${city}`);
        else if (city) setLocationInput(city);
        else if (suburb) setLocationInput(suburb);
      }
      if (cat && ["all", "residential", "hospitality", "commercial", "student"].includes(cat)) setSelectedCategory(cat as any);
      if (propType) setSelectedPropertyType(propType);
      if (amenity) setSelectedAmenity(amenity);
      if (tenant) setSelectedTenantType(tenant);
      if (min) setMinPrice(Number(min));
      if (max) setMaxPrice(Number(max));
      if (sort && ["newest", "price_asc", "price_desc", "leads"].includes(sort)) setSortBy(sort as any);
      if (tab && ["browse", "landlord", "account", "help"].includes(tab)) setActiveTab(tab as any);
      if (listingId) setPendingDirectListingId(listingId);
    } catch (e) {
      console.warn("Could not parse URL params", e);
    }
  }, []);

  // When listings load and pendingDirectListingId is present, auto-open that listing detail modal
  useEffect(() => {
    if (pendingDirectListingId && listings.length > 0) {
      const found = listings.find(l => String(l.id) === String(pendingDirectListingId));
      if (found) {
        setSelectedListingDetail(found);
        setPendingDirectListingId(null);
      }
    }
  }, [pendingDirectListingId, listings]);

  // Keep URL search query updated ONLY when on the homepage "/"
  useEffect(() => {
    if (currentPath !== "/") return;
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("q", searchTerm);
      if (selectedProvinceSlug) params.set("province", selectedProvinceSlug);
      if (selectedCity) params.set("city", selectedCity);
      if (selectedSuburb) params.set("suburb", selectedSuburb);
      if (selectedCategory !== "all") params.set("cat", selectedCategory);
      if (selectedPropertyType) params.set("type", selectedPropertyType);
      if (selectedAmenity) params.set("amenity", selectedAmenity);
      if (selectedTenantType) params.set("tenant", selectedTenantType);
      if (minPrice !== "") params.set("min", String(minPrice));
      if (maxPrice !== "") params.set("max", String(maxPrice));
      if (sortBy !== "newest") params.set("sort", sortBy);
      if (activeTab !== "browse") params.set("tab", activeTab);
      if (selectedListingDetail) params.set("listing", String(selectedListingDetail.id));

      const newSearch = params.toString();
      const newUrl = newSearch ? `/?${newSearch}` : "/";
      window.history.replaceState(null, "", newUrl);
    } catch (_) {}
  }, [
    currentPath, searchTerm, selectedProvinceSlug, selectedCity, selectedSuburb, selectedCategory,
    selectedPropertyType, selectedAmenity, selectedTenantType,
    minPrice, maxPrice, sortBy, activeTab, selectedListingDetail
  ]);

  // Synchronize document title, meta tags, canonical URL, and Schema.org JSON-LD across routes
  useEffect(() => {
    if (currentPath === "/privacy-policy") return;
    if (currentPath.startsWith("/listing/")) return; // Handled directly by ListingDetailPage

    const active = listings.filter((r) => isListingAvailable(r));

    if (currentPath === "/whatsapp") {
      applyClientSeo(buildWhatsAppSeo());
      return;
    }

    if (currentPath === "/") {
      const homeSeo = buildHomeSeo(active);
      if (activeTab !== "browse") {
        homeSeo.robots = "noindex, follow";
      }
      applyClientSeo(homeSeo);
    }
  }, [currentPath, listings, activeTab]);



  // Landlord verification States
  const [verificationStatus, setVerificationStatus] = useState<string>("unverified");
  const [address, setAddress] = useState("");
  const [nationalIdName, setNationalIdName] = useState("");
  const [ratesBillName, setRatesBillName] = useState("");
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false);

  // Create Listing Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [newRoomForm, setNewRoomForm] = useState({
    title: "",
    category: "residential" as ListingCategory,
    business_name: "",
    city: "Harare",
    suburb: "",
    landmark: "",
    price: 30,
    deposit: 30,
    frequency: "Month" as RentFrequency,
    propertyType: "Cottage" as PropertyType,
    tenantType: "Single" as TenantType,
    amenities: [] as string[],
    contactMethod: "Call / Whatsapp" as ContactMethod,
    phone: "",
    landlordName: "",
    imageUrl: DEFAULT_ROOM_IMAGES[0]
  });
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);



  // Notifications State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync verification status dynamically from local storage verifications
  useEffect(() => {
    if (userProfile?.phone) {
      const myVerif = verifications.find((v: any) => v.phone === userProfile.phone);
      if (myVerif) {
        setVerificationStatus(myVerif.status);
        const isApproved = myVerif.status === "approved" || myVerif.status === "verified";
        if (isApproved !== userProfile.isVerified) {
          const updated = { ...userProfile, isVerified: isApproved };
          setUserProfile(updated);
          localStorage.setItem("bunkby_landlord_profile", JSON.stringify(updated));
        }
      } else {
        setVerificationStatus("unverified");
        if (userProfile.isVerified) {
          const updated = { ...userProfile, isVerified: false };
          setUserProfile(updated);
          localStorage.setItem("bunkby_landlord_profile", JSON.stringify(updated));
        }
      }
    } else {
      setVerificationStatus("unverified");
    }
  }, [userProfile?.phone, verifications]);



  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Create or Update Listing handler
  const handleSaveListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomForm.title || !newRoomForm.city || !newRoomForm.suburb) {
      showToast("⚠️ Please fill in all required fields!");
      return;
    }

    const allImgs = uploadedImages.length > 0 ? uploadedImages : [newRoomForm.imageUrl || DEFAULT_ROOM_IMAGES[0]];
    const resolvedImageUrl = allImgs.length > 1 ? JSON.stringify(allImgs) : allImgs[0];
    const isHospitality = newRoomForm.category === "hospitality" || 
      HOSPITALITY_PROPERTY_TYPES.includes(newRoomForm.propertyType) ||
      ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(newRoomForm.propertyType);
    const isCommercial = newRoomForm.category === "commercial" ||
      COMMERCIAL_PROPERTY_TYPES.includes(newRoomForm.propertyType);
    const isStudent = newRoomForm.category === "student" ||
      STUDENT_PROPERTY_TYPES.includes(newRoomForm.propertyType);

    const determinedCat: ListingCategory = isHospitality ? "hospitality" : isCommercial ? "commercial" : isStudent ? "student" : "residential";

    const payload = {
      ...newRoomForm,
      category: determinedCat,
      business_name: newRoomForm.business_name || (isHospitality ? newRoomForm.title : ""),
      businessName: newRoomForm.business_name || (isHospitality ? newRoomForm.title : ""),
      image_url: resolvedImageUrl,
      images: allImgs,
      isVerifiedLandlord: userProfile?.isVerified || false
    };

    // Allow all listers (including hospitality, lodges, guesthouses) to list normally for free without charging window
    await executeSaveListing(payload, false);
  };

  const executeSaveListing = async (payload: any, makePremium = false) => {
    const isHospitality = payload.category === "hospitality" || 
      HOSPITALITY_PROPERTY_TYPES.includes(payload.propertyType);

    const allImgs = uploadedImages.length > 0 ? uploadedImages : (payload.images && payload.images.length > 0 ? payload.images : [payload.image_url || DEFAULT_ROOM_IMAGES[0]]);
    const resolvedImageUrl = allImgs.length > 1 ? JSON.stringify(allImgs) : (allImgs[0] || payload.image_url || null);

    const finalPayload = {
      ...payload,
      category: payload.category || (isHospitality ? "hospitality" : "residential"),
      business_name: payload.business_name || payload.businessName || "",
      businessName: payload.business_name || payload.businessName || "",
      isPremium: makePremium,
      expiryDate: makePremium ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : undefined,
      verification_status: "Active",
      landlord_id: userProfile?.id || (userProfile?.phone ? Number(userProfile.phone.replace(/\D/g, "")) : null),
      token: userProfile?.token,
      image_url: resolvedImageUrl,
      images: allImgs,
      contact_phone: payload.phone,
      property_type: payload.propertyType,
      tenant_type: payload.tenantType,
      rent_cycle: payload.frequency,
      contact_method: payload.contactMethod
    };

    setIsPublishing(true);

    try {
      if (isEditing) {
        const res = await fetch(`/api/rooms/${isEditing}`, {
           method: "PUT",
           headers: { 
             "Content-Type": "application/json",
             "x-landlord-token": userProfile?.token || ""
           },
           body: JSON.stringify(finalPayload)
        });
        if (res.ok) {
           setListings(prev => prev.map(item => String(item.id) === String(isEditing) ? { ...item, ...finalPayload, price: Number(finalPayload.price), deposit: Number(finalPayload.deposit) } : item));
           showToast("✨ Accommodation specifications updated successfully!");
        } else {
           const errData = await res.json().catch(() => ({}));
           showToast(errData.error || "⚠️ Failed to update room data");
        }
      } else {
        const res = await fetch("/api/listings", {
           method: "POST",
           headers: { 
             "Content-Type": "application/json",
             "x-landlord-token": userProfile?.token || ""
           },
           body: JSON.stringify(finalPayload)
        });
        const parsed = await parseJsonResponse<{ id?: number | string; error?: string }>(res);
        if (parsed.ok && parsed.data) {
           const data = parsed.data;
           const newListing = {
              id: data.id,
              ...finalPayload,
              status: "Active",
              leadsCount: 0,
              isSample: false,
              created_at: new Date().toISOString()
           };
           setListings(prev => [newListing, ...prev]);
           showToast(makePremium ? "✨ Premium Listing activated for 30 Days successfully!" : "🎉 Listing published live on BunkBy!");
        } else {
          showToast(parsed.data?.error || "⚠️ Network issue, unable to list room right now");
        }
      }
    } catch (e) {
      showToast("⚠️ Error listing room");
    }

    setIsPublishing(false);

    setIsCreateModalOpen(false);
    setIsEditing(null);
    setBillingListingForm(null);
    setIsBillingModalOpen(false);
    setUploadedImages([]);
    // Reset form
    setNewRoomForm({
      title: "",
      category: "residential",
      business_name: "",
      city: "Harare",
      suburb: "",
      landmark: "",
      price: 30,
      deposit: 30,
      frequency: "Month",
      propertyType: "Cottage",
      tenantType: "Single",
      amenities: [],
      contactMethod: "Call / Whatsapp",
      phone: userProfile?.phone || "",
      landlordName: userProfile?.name || "",
      imageUrl: DEFAULT_ROOM_IMAGES[0]
    });
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim()) {
      showToast("⚠️ Full Name is required for authentication!");
      return;
    }
    if (!loginPhone.trim()) {
      showToast("⚠️ WhatsApp Phone Number is required for listing contacts!");
      return;
    }
    if (authMode === "signup" && (!loginPin.trim() || loginPin.trim().length < 4)) {
      showToast("⚠️ Security PIN (at least 4 digits) is required to protect your landlord account.");
      return;
    }
    if (authMode === "login" && (!loginPin.trim() || loginPin.trim().length < 4)) {
      showToast("⚠️ Please enter your 4-digit Security PIN to log in (Demo PIN: 1234).");
      return;
    }

    setIsAuthLoading(true);
    try {
      const res = await fetch("/api/landlords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: authMode,
          phone: loginPhone.trim(),
          name: loginName.trim(),
          pin: loginPin.trim()
        })
      });
      const parsed = await parseJsonResponse<any>(res);
      const data = parsed.data || {};
      
      if (parsed.ok && data.success) {
        const profileName = data.landlord?.name || data.landlord?.full_name || loginName.trim();
        const profile = {
          id: data.landlord.id,
          name: profileName,
          phone: loginPhone.trim(),
          token: data.token,
          hasPin: true,
          isVerified: data.landlord.isVerified || data.landlord.verification_status === 'verified' || false,
          whatsappLinked: true,
          role: data.landlord.role || (profileName === "Tatenda E. Chikura" ? "Admin" : "Landlord")
        };
        setUserProfile(profile);
        localStorage.setItem("bunkby_landlord_profile", JSON.stringify(profile));
        showToast(authMode === "login" 
          ? `🎉 Welcome back, ${profile.name}! Account authenticated.` 
          : `🎉 Welcome ${profile.name}! Your account was created successfully.`
        );
        setLoginPin("");
        if (profile.role === "Admin") {
          navigateTo("/", "account");
          setTimeout(() => {
            document.getElementById("admin-access-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 150);
        }
      } else {
        if (data.code === "PIN_REQUIRED" || data.code === "INVALID_PIN") {
          showToast(`🔒 ${data.error || "Incorrect Security PIN."}`);
        } else if (data.code === "ALREADY_EXISTS") {
          showToast(`⚠️ An account already exists with this phone number. Directing to Log In.`);
          setAuthMode("login");
        } else if (data.code === "ACCOUNT_NOT_FOUND") {
          showToast(`⚠️ No account detected with this phone number. Please Create an Account first.`);
          setAuthMode("signup");
        } else {
          showToast(`⚠️ Auth Failed: ${data.error || "Please try again."}`);
        }
      }
    } catch (err) {
      showToast("⚠️ Network issue connecting to authentication server.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Account Recovery State & Handler (WhatsApp 6-digit One-Time Reset Code)
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryNewPin, setRecoveryNewPin] = useState("");
  const [recoveryConfirmPin, setRecoveryConfirmPin] = useState("");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [whatsappResetOpened, setWhatsappResetOpened] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  const openRecoveryModal = (prefillPhone = "") => {
    setRecoveryPhone(prefillPhone || "");
    setRecoveryCode("");
    setRecoveryNewPin("");
    setRecoveryConfirmPin("");
    setRecoveryError(null);
    setWhatsappResetOpened(false);
    setIsRecoveryModalOpen(true);
  };

  const handleAccountRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);

    const cleanPhone = recoveryPhone.trim();
    const cleanCode = recoveryCode.replace(/\D/g, "");
    const cleanPin = recoveryNewPin.replace(/\D/g, "");
    const cleanConfirm = recoveryConfirmPin.replace(/\D/g, "");

    if (!cleanPhone) {
      setRecoveryError("Please enter your registered WhatsApp phone number.");
      return;
    }
    if (cleanCode.length !== 6) {
      setRecoveryError("Please enter the 6-digit reset code sent to you on WhatsApp.");
      return;
    }
    if (cleanPin.length < 4 || cleanPin.length > 8) {
      setRecoveryError("New Security PIN must be 4 to 8 digits.");
      return;
    }
    if (cleanPin !== cleanConfirm) {
      setRecoveryError("New PIN and Confirm PIN do not match.");
      return;
    }

    setIsRecovering(true);
    try {
      const res = await fetch("/api/landlords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recover",
          phone: cleanPhone,
          resetCode: cleanCode,
          newPin: cleanPin
        })
      });
      const parsed = await parseJsonResponse<any>(res);
      const data = parsed.data || {};
      if (parsed.ok && data.success) {
        const profile = {
          id: data.landlord.id,
          name: data.landlord.name,
          phone: String(data.landlord.phone || cleanPhone),
          token: data.token,
          hasPin: true,
          isVerified: data.landlord.isVerified || false,
          whatsappLinked: true,
          role: data.landlord.role || "Landlord"
        };
        setUserProfile(profile);
        localStorage.setItem("bunkby_landlord_profile", JSON.stringify(profile));
        showToast("🎉 Security PIN updated! You are now logged in.");
        setIsRecoveryModalOpen(false);
        setRecoveryCode("");
        setRecoveryNewPin("");
        setRecoveryConfirmPin("");
        setRecoveryError(null);
      } else {
        const msg = data.error || "Verification failed. Please check your 6-digit WhatsApp code or request a new one.";
        setRecoveryError(msg);
        showToast(`🔒 ${msg}`);
      }
    } catch (_) {
      const msg = "Network issue during PIN reset. Please try again.";
      setRecoveryError(msg);
      showToast(`⚠️ ${msg}`);
    } finally {
      setIsRecovering(false);
    }
  };

  const handleLogout = () => {
    if (userProfile?.token) {
      fetch("/api/landlords/logout", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-landlord-token": userProfile.token,
          "Authorization": `Bearer ${userProfile.token}`
        }
      }).catch(() => {});
    }
    setUserProfile(null);
    localStorage.removeItem("bunkby_landlord_profile");
    showToast("🔑 Successfully logged out.");
  };

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraActive(true);
      // Wait a tick for video element to mount
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 150);
    } catch (err) {
      showToast("❌ Unable to access device camera. Please make sure permissions are granted.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        if (uploadedImages.length >= 3) {
          showToast("⚠️ Maximum of 3 pictures allowed! Remove one to snap a new one.");
          return;
        }
        setUploadedImages(prev => [...prev, dataUrl]);
        showToast("📸 Captured photo saved!");
        stopCamera();
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files: File[] = Array.from(e.target.files);
      const remainingSlots = 3 - uploadedImages.length;
      if (remainingSlots <= 0) {
        showToast("⚠️ Already uploaded maximum of 3 pictures!");
        return;
      }
      
      const filesToProcess = files.slice(0, remainingSlots);
      showToast(`⏳ Optimizing ${filesToProcess.length} image(s)...`);
      try {
        const compressedList: string[] = [];
        for (const file of filesToProcess) {
          const compressed = await compressImageFile(file, 1280, 1280, 0.82);
          compressedList.push(compressed);
        }
        setUploadedImages(prev => [...prev, ...compressedList]);
        showToast(`✅ Added ${compressedList.length} optimized photo(s)!`);
      } catch (err) {
        console.error("Compression error:", err);
        showToast("⚠️ Failed to process some images");
      }
      // Reset input value so re-selecting same file works
      e.target.value = "";
    }
  };

  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
    showToast("🗑️ Image removed.");
  };

  // Toggle Room Inactive/Delisted ("as soon as they get a tenant")
  const handleToggleDelist = async (id: string | number) => {
    try {
      const res = await fetch(`/api/rooms/${id}/toggle-status`, { 
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-landlord-token": userProfile?.token || ""
        },
        body: JSON.stringify({
          landlord_id: userProfile?.id,
          token: userProfile?.token
        })
      });
      const parsed = await parseJsonResponse<{ status?: string; error?: string }>(res);
      if (parsed.ok && parsed.data) {
        const data = parsed.data;
        setListings(prev => prev.map(item => {
          if (String(item.id) === String(id)) {
            const nextStatus = data.status;
            showToast(nextStatus === "Delisted" ? "📴 Room successfully delisted/rented out!" : "🔛 Room reactivated and active!");
            return { ...item, status: nextStatus };
          }
          return item;
        }));
      } else {
        showToast(parsed.data?.error || "⚠️ Could not change room status.");
      }
    } catch (e) {
      console.error(e);
      showToast("⚠️ Could not toggle status");
    }
  };

  // Permanent Delete listing
  const handleDeleteListing = async (id: string | number) => {
    if (!confirm("Are you sure you want to permanently delete this listing from BunkBy?")) return;
    try {
      const res = await fetch(`/api/rooms/${id}`, { 
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-landlord-token": userProfile?.token || "",
          "Authorization": userProfile?.token ? `Bearer ${userProfile.token}` : ""
        }
      });
      if (res.ok) {
        setListings(prev => prev.filter(item => String(item.id) !== String(id)));
        showToast("🗑️ Listing deleted permanently.");
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "⚠️ Could not delete listing");
      }
    } catch (e) {
      console.error(e);
      showToast("⚠️ Could not delete listing");
    }
  };

  // Handle tenant sending inquiry ("Building traffic & direct WhatsApp connection")
  const handleContactLandlord = (room: RoomListing) => {
    // Show soft gate popup modal instead of opening link immediately
    setPendingContactRoom(room);
    setIsSoftGateOpen(true);
  };

  const handleProceedToWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!softGateName.trim() || !softGatePhone.trim()) {
      showToast("⚠️ Please enter your Name and Phone Number!");
      return;
    }

    // Save to local variable / localStorage for lead tracking
    localStorage.setItem("bunkby_gate_name", softGateName);
    localStorage.setItem("bunkby_gate_phone", softGatePhone);

    const room = pendingContactRoom;
    if (!room) {
      setIsSoftGateOpen(false);
      return;
    }

    // Record view lead statistic
    setListings(prev => prev.map(item => String(item.id) === String(room.id) ? { ...item, leadsCount: (item.leadsCount || 0) + 1 } : item));
    fetch(`/api/rooms/${room.id}/lead`, { method: "POST" }).catch(e => console.error("Failed to update lead count", e));

    // Direct prefilled whatsapp text with renter / guest details!
    const isHospitality = room.category === "hospitality" || 
      HOSPITALITY_PROPERTY_TYPES.includes(room.propertyType);
    const hostDisplayName = room.business_name || room.businessName || room.landlordName;
    const waText = encodeURIComponent(
      isHospitality
        ? `Hello ${hostDisplayName}, I saw your property "${room.title}" listed on BunkBy ($${room.price}/${room.frequency}). I would like to inquire about room availability and direct booking. My name is ${softGateName} (Phone: ${softGatePhone}).`
        : `Hi ${room.landlordName}, I saw your listing for "${room.title}" listed on BunkBy for $${room.price}/${room.frequency}. Is it still available for rent? My name is ${softGateName} (Phone: ${softGatePhone}).`
    );
    const waLink = `https://wa.me/${room.phone}?text=${waText}`;

    // Open direct WhatsApp connection
    showToast(`📱 Connecting directly to ${hostDisplayName} on WhatsApp. Lead recorded!`);
    
    // Reset state & close modal
    setIsSoftGateOpen(false);
    setPendingContactRoom(null);

    // Simulate real window open safely
    window.open(waLink, "_blank", "noopener,noreferrer");
  };

  // Filter listings based on selected search components
    // Category Resolution & Badge Visual Helper
  const getListingCategoryInfo = (room: RoomListing) => {
    const rawCat = (room.category || "").toLowerCase();
    const propType = room.propertyType || "";
    const isCommercial = 
      rawCat === "commercial" || 
      ["Commercial", "Shop", "Warehouse", "Table", "Office"].includes(propType);
    const isStudent = 
      rawCat === "student" || 
      ["Student Hostel", "Boarding House", "Single Student Room", "Shared Student Room"].includes(propType) ||
      room.tenantType === "Student";
    const isHospitality = 
      rawCat === "hospitality" || 
      ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast", "Boutique Hotel", "Short-Stay Apartment"].includes(propType);

    if (isCommercial) {
      return {
        key: "commercial",
        label: "Commercial",
        icon: Building2,
        bgClass: "bg-blue-900 text-white",
        badgeBorder: "border-blue-700/40"
      };
    }
    if (isStudent) {
      return {
        key: "student",
        label: "Student",
        icon: GraduationCap,
        bgClass: "bg-emerald-800 text-white",
        badgeBorder: "border-emerald-600/40"
      };
    }
    if (isHospitality) {
      return {
        key: "hospitality",
        label: "Hospitality",
        icon: Hotel,
        bgClass: "bg-[#052659] text-white",
        badgeBorder: "border-sky-600/40"
      };
    }
    return {
      key: "residential",
      label: "Residential",
      icon: Home,
      bgClass: "bg-[#021024] text-white",
      badgeBorder: "border-slate-700/40"
    };
  };

  const filteredListings = listings.filter((room) => {
    // Only search renters see Active/verified listings (exclude Delisted, Hidden, Removed)
    if (activeTab === "browse" && room.status !== "Active" && room.status !== "verified") return false;

    // Disappear expired premium listings from Browse tab after 30 days
    if (activeTab === "browse" && room.isPremium && room.expiryDate) {
      if (new Date(room.expiryDate) < new Date()) {
        return false;
      }
    }

    // Search Term match
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesText = 
        room.title.toLowerCase().includes(term) ||
        (room.business_name && room.business_name.toLowerCase().includes(term)) ||
        (room.businessName && room.businessName.toLowerCase().includes(term)) ||
        room.city.toLowerCase().includes(term) ||
        room.suburb.toLowerCase().includes(term) ||
        room.landmark.toLowerCase().includes(term) ||
        room.landlordName.toLowerCase().includes(term);
      if (!matchesText) return false;
    }

    // Category filter
    if (selectedCategory !== "all") {
      const roomCat = getListingCategoryInfo(room).key;
      if (roomCat !== selectedCategory) return false;
    }

    // Property Type filter
    if (selectedPropertyType && room.propertyType !== selectedPropertyType) {
      return false;
    }

    // Location Filters (Province, City/Town/Destination, Suburb, or Custom Free-Text Place)
    const needsLocationResolution = Boolean(selectedProvinceSlug || selectedCity || selectedSuburb);
    const resolvedRoomLocation = needsLocationResolution ? resolveListingLocation(room) : null;

    if (selectedProvinceSlug && resolvedRoomLocation) {
      if (resolvedRoomLocation.provinceSlug !== selectedProvinceSlug) {
        return false;
      }
    }

    const targetCity = selectedCity ? findCityBySlugOrName(selectedCity) : null;
    if (selectedCity && resolvedRoomLocation) {
      if (targetCity) {
        if (resolvedRoomLocation.city) {
          if (resolvedRoomLocation.city.slug !== targetCity.slug) return false;
        } else if (toSlug(room.city) !== targetCity.slug) {
          return false;
        }
      } else if (room.city.toLowerCase() !== selectedCity.toLowerCase()) {
        return false;
      }
    }

    if (selectedSuburb && resolvedRoomLocation) {
      const suburbDef = targetCity ? findSuburbInCity(targetCity, selectedSuburb) : null;
      if (suburbDef) {
        const matchedSub =
          resolvedRoomLocation.suburb?.slug === suburbDef.slug ||
          matchesSuburbName(room.suburb, suburbDef);
        if (!matchedSub) return false;
      } else if (room.suburb.toLowerCase() !== selectedSuburb.toLowerCase()) {
        return false;
      }
    }

    if (customLocationQuery) {
      const locQ = customLocationQuery.toLowerCase();
      const matchesCustomLoc =
        room.city.toLowerCase().includes(locQ) ||
        room.suburb.toLowerCase().includes(locQ) ||
        room.landmark.toLowerCase().includes(locQ);
      if (!matchesCustomLoc) return false;
    }

    // Amenity filter (at least contains selected)
    if (selectedAmenity && !room.amenities.some(a => a.toLowerCase().includes(selectedAmenity.toLowerCase()))) {
      return false;
    }

    // Tenant seeking match
    if (selectedTenantType && room.tenantType !== selectedTenantType) {
      return false;
    }

    // Min price
    if (minPrice !== "" && room.price < Number(minPrice)) {
      return false;
    }

    // Max price
    if (maxPrice !== "" && room.price > Number(maxPrice)) {
      return false;
    }

    return true;
  });

  // Apply active sorting criterion
  const displayedListings = [...filteredListings].sort((a, b) => {
    if (sortBy === "price_asc") return a.price - b.price;
    if (sortBy === "price_desc") return b.price - a.price;
    if (sortBy === "leads") return (b.leadsCount || 0) - (a.leadsCount || 0);
    // default: newest
    const timeA = new Date(a.createdAt || a.created_at || 0).getTime();
    const timeB = new Date(b.createdAt || b.created_at || 0).getTime();
    return timeB - timeA;
  });

  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedCity("");
    setSelectedSuburb("");
    setSelectedProvinceSlug("");
    setCustomLocationQuery("");
    setLocationInput("");
    setIsLocationDropdownOpen(false);
    setActiveSuggestionIndex(-1);
    setSelectedAmenity("");
    setSelectedTenantType("");
    setSelectedCategory("all");
    setSelectedPropertyType("");
    setMinPrice("");
    setMaxPrice("");
    setSortBy("newest");
    showToast("🧹 All filters cleared!");
  };

  // Get suburbs of the selected city from centralised Zimbabwe location catalog
  const getSuburbsForCity = () => getSuburbNamesForCity(selectedCity);

  if (currentPath === "/privacy-policy") {
    return <PrivacyPolicy onBackToHome={() => navigateTo("/", "browse")} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col antialiased">
      
      {/* Toast Alert Banner - Clean white background, no colorful borders, zero AI star icons */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 16 }}
            exit={{ opacity: 0, y: -10 }}
            id="app-toast"
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white text-slate-800 py-3 px-5 rounded-xl shadow-lg border border-slate-200/80 max-w-md w-[92%] sm:w-auto flex items-center justify-center text-center"
          >
            <p className="text-xs sm:text-sm font-medium leading-snug">{toastMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Top Header: Navigation (compact, mobile-first, responsive height) */}
      <header id="main-header" className="bg-[#052659] text-white border-b border-[#052659] sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          
          {/* Logo Brand with custom icon */}
          <div 
            onClick={() => navigateTo("/", "browse")} 
            className="flex items-center gap-2 sm:gap-3 cursor-pointer shrink-0"
            id="brand-logo"
          >
            <BunkByLogo className="w-8 h-8 sm:w-10 sm:h-10 shrink-0" />
            <div>
              <span className="text-lg sm:text-2xl font-display font-black uppercase tracking-tight text-white">
                Bunk<span className="text-[#FF7A00]">By</span>
              </span>
              <p className="text-[9px] sm:text-[10px] text-[#E2E8F0] tracking-wider font-mono font-bold leading-none hidden xs:block">PROPERTIES • STAYS • ZERO FEES</p>
            </div>
          </div>

          {/* Nav items with small compact selected highlights (desktop) */}
          <nav className="hidden md:flex items-center gap-1 text-xs">
            <button 
              onClick={() => navigateTo("/", "browse")}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${currentPath === "/" && activeTab === "browse" ? "bg-[#021024] text-white font-extrabold shadow-xs border border-white/10" : "hover:text-white text-slate-200 hover:bg-[#021024]/40 font-semibold"}`}
              id="nav-browse"
            >
              Browse Listings
            </button>
            <button 
              onClick={() => navigateTo("/", "landlord")}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${currentPath === "/" && activeTab === "landlord" ? "bg-[#021024] text-white font-extrabold shadow-xs border border-white/10" : "hover:text-white text-slate-200 hover:bg-[#021024]/40 font-semibold"}`}
              id="nav-landlord"
            >
              Landlords Portal
            </button>

            <button 
              onClick={() => navigateTo("/", "account")}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${currentPath === "/" && activeTab === "account" ? "bg-[#021024] text-white font-extrabold shadow-xs border border-white/10" : "hover:text-white text-slate-200 hover:bg-[#021024]/40 font-semibold"}`}
              id="nav-account"
            >
              Account
            </button>
            <button 
              onClick={() => navigateTo("/", "help")}
              className={`px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${currentPath === "/" && activeTab === "help" ? "bg-[#021024] text-white font-extrabold shadow-xs border border-white/10" : "hover:text-white text-slate-200 hover:bg-[#021024]/40 font-semibold"}`}
              id="nav-help"
            >
              Help & FAQ
            </button>
            {userProfile?.role === "Admin" && (
              <button
                type="button"
                onClick={() => {
                  navigateTo("/", "account");
                  setTimeout(() => {
                    document.getElementById("admin-access-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 120);
                }}
                className="px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 bg-[#FF7A00] hover:bg-[#e66e00] text-white font-extrabold shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                id="nav-admin"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Admin</span>
                {adminOpenReportsCount > 0 && (
                  <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 rounded-full">
                    {adminOpenReportsCount}
                  </span>
                )}
              </button>
            )}
          </nav>

          {/* Right Controls / User details */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {userProfile ? (
              <>
                <div className="bg-[#052659]/80 rounded-lg px-2 sm:px-2.5 py-1 border border-white/10 hidden sm:flex items-center gap-1.5 text-xs text-[#E2E8F0] font-semibold">
                  <User className="w-3 h-3 text-orange-500" />
                  <span className="font-mono truncate max-w-[90px] sm:max-w-[120px]">{userProfile.name}</span>
                </div>
                
                <button 
                  onClick={() => {
                    setIsEditing(null);
                    setNewRoomForm(prev => ({ 
                      ...prev, 
                      landlordName: userProfile.name, 
                      phone: userProfile.phone 
                    }));
                    setIsCreateModalOpen(true);
                  }}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-[11px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition-all outline-none cursor-pointer min-h-[36px]"
                  id="btn-create-header"
                >
                  <Plus className="w-3.5 h-3.5 text-white shrink-0 stroke-[2.5]" />
                  <span className="hidden xs:inline">Create Listing</span>
                  <span className="xs:hidden">List</span>
                </button>
              </>
            ) : (
              <button 
                onClick={() => {
                  navigateTo("/", "landlord");
                  showToast("🔑 Register or access BunkBy Landlord workspace using your phone number!");
                }}
                className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold text-[11px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition-all outline-none cursor-pointer min-h-[36px]"
                id="btn-login-header"
              >
                <User className="w-3 h-3 text-white shrink-0" />
                <span className="hidden xs:inline">Landlord Access</span>
                <span className="xs:hidden">Sign In</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Mobile navigation bar top sub-header - slim, 44px touch targets, sticky below h-14 */}
      <nav aria-label="Mobile Navigation" className="md:hidden bg-[#052659] border-b border-[#052659]/80 flex items-center justify-around text-[11px] font-medium py-1 sticky top-14 z-35 shadow-sm">
        <button 
          onClick={() => navigateTo("/", "browse")}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-md min-h-[44px] min-w-[56px] transition-colors ${currentPath === "/" && activeTab === "browse" ? "text-white font-extrabold bg-[#021024]/50" : "text-[#E2E8F0] hover:text-white"}`}
        >
          <Building className="w-4 h-4 shrink-0" />
          <span className="leading-tight mt-0.5">Browse</span>
        </button>
        <button 
          onClick={() => navigateTo("/", "landlord")}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-md min-h-[44px] min-w-[56px] transition-colors relative ${currentPath === "/" && activeTab === "landlord" ? "text-white font-extrabold bg-[#021024]/50" : "text-[#E2E8F0] hover:text-white"}`}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          <span className="leading-tight mt-0.5">Portal</span>
        </button>

        <button 
          onClick={() => navigateTo("/", "account")}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-md min-h-[44px] min-w-[56px] transition-colors ${currentPath === "/" && activeTab === "account" ? "text-white font-extrabold bg-[#021024]/50" : "text-[#E2E8F0] hover:text-white"}`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span className="leading-tight mt-0.5">Account</span>
        </button>
        <button 
          onClick={() => navigateTo("/", "help")}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-md min-h-[44px] min-w-[52px] transition-colors ${currentPath === "/" && activeTab === "help" ? "text-white font-extrabold bg-[#021024]/50" : "text-[#E2E8F0] hover:text-white"}`}
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span className="leading-tight mt-0.5">Help</span>
        </button>
        {userProfile?.role === "Admin" && (
          <button
            type="button"
            onClick={() => {
              navigateTo("/", "account");
              setTimeout(() => {
                document.getElementById("admin-access-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 120);
            }}
            className="flex flex-col items-center justify-center py-1 px-2 rounded-md min-h-[44px] min-w-[52px] transition-colors text-[#FF7A00] hover:text-white font-bold relative"
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span className="leading-tight mt-0.5">Admin</span>
            {adminOpenReportsCount > 0 && (
              <span className="absolute top-1 right-1 bg-red-600 text-white text-[9px] font-bold px-1 rounded-full leading-tight">
                {adminOpenReportsCount}
              </span>
            )}
          </button>
        )}
      </nav>

      {/* Application Body Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-3 sm:px-5 lg:px-8 py-3.5 sm:py-6">

        {/* DEDICATED ROUTES: /whatsapp and /listing/:id */}
        {(() => {
          if (currentPath === "/whatsapp") {
            return <WhatsAppLandingPage onNavigate={(p) => navigateTo(p)} />;
          }

          const listingMatch = currentPath.match(/^\/listing\/([^/]+)\/?$/);
          if (listingMatch) {
            return (
              <ListingDetailPage
                listingId={decodeURIComponent(listingMatch[1])}
                cachedListings={listings}
                onNavigate={(p) => navigateTo(p)}
                onContactLandlord={handleContactLandlord}
                onReportListing={(room) => {
                  setReportingListing(room);
                  setIsReportModalOpen(true);
                }}
                showToast={showToast}
              />
            );
          }

          return null;
        })()}

        {/* TAB 1: BROWSER / ROOM DIRECTORY */}
        {currentPath === "/" && activeTab === "browse" && (
          <div className="space-y-6">
            
            {/* Hero Card with optimized preloaded hero-bg.webp */}
            <section 
              id="hero-banner" 
              className="bg-[#080f18] rounded-2xl sm:rounded-3xl text-white p-4 sm:p-7 md:p-10 text-center relative shadow-xl sm:shadow-2xl border border-slate-800/80"
              style={{
                background:
                  "radial-gradient(circle at 14% 18%, rgba(255,122,0,0.18), transparent 36%), radial-gradient(circle at 86% 84%, rgba(255,122,0,0.16), transparent 38%), #080f18",
              }}
            >
              {/* Preloaded Hero Background Image (60KB WebP for instant paint) */}
              <div className="absolute inset-0 rounded-2xl sm:rounded-3xl overflow-hidden pointer-events-none select-none">
                <img
                  src="/hero-bg.webp"
                  alt="BunkBy Hero Background"
                  loading="eager"
                  decoding="sync"
                  fetchPriority="high"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    if (!img.dataset.fallbackTried) {
                      img.dataset.fallbackTried = "1";
                      img.src = "/hero-background.png";
                    }
                  }}
                />
              </div>

              <div className="relative z-10 max-w-3xl mx-auto space-y-3 sm:space-y-4">
                <h1 className="text-xl sm:text-3xl md:text-5xl font-display font-black tracking-tight text-white leading-tight drop-shadow-md">
                  Find Stays, Commercial Spaces & Rentals in <span className="text-[#FF7A00] drop-shadow-sm">Zimbabwe</span>
                </h1>

                <p className="text-[10.5px] sm:text-sm md:text-base text-slate-200 font-medium max-w-2xl mx-auto leading-snug sm:leading-relaxed drop-shadow-sm">
                  Explore residential rentals, student accommodation, lodges, guesthouses, and commercial spaces across Zimbabwe, with listed pricing and direct WhatsApp connection to property owners and hosts.
                </p>

                <div className="pt-1 grid grid-cols-2 gap-2 sm:gap-3 max-w-md mx-auto w-full">
                  <button 
                    onClick={() => {
                      if (!userProfile) {
                        showToast("⚠️ Please create an account or log in first to create a listing.");
                        setActiveTab("landlord");
                      } else {
                        setNewRoomForm(prev => ({ ...prev, landlordName: userProfile.name, phone: userProfile.phone }));
                        setIsCreateModalOpen(true);
                      }
                    }}
                    className="w-full justify-center bg-[#FF7A00] hover:bg-[#e66e00] text-white font-black px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl shadow-lg shadow-orange-500/30 transition-all text-[11px] sm:text-sm flex items-center gap-1.5 cursor-pointer min-h-[38px] sm:min-h-[42px] whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0 stroke-[3]" />
                    <span>Create Listings</span>
                  </button>

                  <a
                    id="hero-whatsapp-cta"
                    href={getBunkByWhatsAppUrl("Hi BunkBy! I would like to find accommodation.")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full justify-center group bg-white hover:bg-[#FF7900] text-[#052659] hover:text-white border border-slate-200 hover:border-[#FF7900] font-bold px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl shadow-md transition-all text-[11px] sm:text-sm inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-[42px] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7900]"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#25D366] group-hover:text-white transition-colors shrink-0" />
                    <span>Find on WhatsApp</span>
                  </a>
                </div>

                {/* Category Switcher Tabs: All, Residential, Hospitality */}
                <div className="pt-3 border-t border-white/15 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("all");
                      setSelectedPropertyType("");
                    }}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${
                      selectedCategory === "all"
                        ? "bg-[#FF7A00] text-white shadow-md shadow-orange-500/30"
                        : "bg-white/15 text-white hover:bg-white/25 border border-white/20 backdrop-blur-md"
                    }`}
                  >
                    <Building className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>All Stays</span>
                    <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded-full font-mono font-black text-white">
                      {listings.filter(r => r.status === "Active").length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("residential");
                      setSelectedPropertyType("");
                    }}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${
                      selectedCategory === "residential"
                        ? "bg-[#FF7A00] text-white shadow-md shadow-orange-500/30"
                        : "bg-white/15 text-white hover:bg-white/25 border border-white/20 backdrop-blur-md"
                    }`}
                  >
                    <Home className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Residential</span>
                    <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded-full font-mono font-black text-white">
                      {listings.filter(r => r.status === "Active" && getListingCategoryInfo(r).key === "residential").length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("hospitality");
                      setSelectedPropertyType("");
                    }}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${
                      selectedCategory === "hospitality"
                        ? "bg-[#FF7A00] text-white shadow-md shadow-orange-500/30"
                        : "bg-white/15 text-white hover:bg-white/25 border border-white/20 backdrop-blur-md"
                    }`}
                  >
                    <Hotel className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Hospitality</span>
                    <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded-full font-mono font-black text-white">
                      {listings.filter(r => r.status === "Active" && getListingCategoryInfo(r).key === "hospitality").length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("commercial");
                      setSelectedPropertyType("");
                    }}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${
                      selectedCategory === "commercial"
                        ? "bg-[#FF7A00] text-white shadow-md shadow-orange-500/30"
                        : "bg-white/15 text-white hover:bg-white/25 border border-white/20 backdrop-blur-md"
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Commercial</span>
                    <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded-full font-mono font-black text-white">
                      {listings.filter(r => r.status === "Active" && getListingCategoryInfo(r).key === "commercial").length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("student");
                      setSelectedPropertyType("");
                    }}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${
                      selectedCategory === "student"
                        ? "bg-[#FF7A00] text-white shadow-md shadow-orange-500/30"
                        : "bg-white/15 text-white hover:bg-white/25 border border-white/20 backdrop-blur-md"
                    }`}
                  >
                    <GraduationCap className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Student Accom.</span>
                    <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded-full font-mono font-black text-white">
                      {listings.filter(r => r.status === "Active" && getListingCategoryInfo(r).key === "student").length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Dynamic Filter Search Form Container - Compact on mobile */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isLocationDropdownOpen && activeSuggestionIndex >= 0 && locationSuggestions[activeSuggestionIndex]) {
                    selectCatalogLocation(locationSuggestions[activeSuggestionIndex]);
                  } else {
                    commitLocationSearchInput();
                  }
                  const resultsEl = document.getElementById("results-anchor");
                  if (resultsEl) {
                    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
                className="mt-4 sm:mt-5 bg-white text-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl border border-slate-200 max-w-3xl mx-auto text-left relative z-30 flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-end"
              >
                {/* Search Text field */}
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 font-mono flex items-center gap-1 uppercase">
                    <Search className="w-3 h-3 text-slate-400" />
                    <span>Keyword Search</span>
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder={selectedCategory === "hospitality" ? "e.g. Bronte Gardens, safari lodge..." : "e.g. Avonlea cottage, student bedsit..."}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#052659]/10 focus:border-[#052659] bg-slate-50 text-xs sm:text-sm font-medium transition-all"
                    />
                    {searchTerm && (
                      <button 
                        type="button"
                        onClick={() => setSearchTerm("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        aria-label="Clear search"
                      >
                        <X className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Zimbabwe Location Autocomplete Input (Provinces, Cities, Towns, Destinations, Suburbs) */}
                <div ref={locationBoxRef} className="sm:w-64 space-y-1 relative">
                  <label htmlFor="location-search-input" className="text-[11px] font-semibold text-slate-500 font-mono flex items-center gap-1 uppercase">
                    <MapPin className="w-3 h-3 text-[#FF7A00]" />
                    <span>Location (Zimbabwe)</span>
                  </label>
                  <div className="relative">
                    <input
                      id="location-search-input"
                      type="text"
                      autoComplete="off"
                      placeholder="City, town, suburb or destination..."
                      value={locationInput}
                      onFocus={() => {
                        if (locationInput.trim()) setIsLocationDropdownOpen(true);
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLocationInput(val);
                        setIsLocationDropdownOpen(Boolean(val.trim()));
                        setActiveSuggestionIndex(-1);
                        if (!val.trim()) {
                          setSelectedCity("");
                          setSelectedSuburb("");
                          setSelectedProvinceSlug("");
                          setCustomLocationQuery("");
                        }
                      }}
                      onKeyDown={(e) => {
                        if (!isLocationDropdownOpen || locationSuggestions.length === 0) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setActiveSuggestionIndex((prev) =>
                            prev < locationSuggestions.length - 1 ? prev + 1 : 0
                          );
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setActiveSuggestionIndex((prev) =>
                            prev > 0 ? prev - 1 : locationSuggestions.length - 1
                          );
                        } else if (e.key === "Escape") {
                          setIsLocationDropdownOpen(false);
                          setActiveSuggestionIndex(-1);
                        } else if (e.key === "Enter" && activeSuggestionIndex >= 0) {
                          e.preventDefault();
                          selectCatalogLocation(locationSuggestions[activeSuggestionIndex]);
                        }
                      }}
                      role="combobox"
                      aria-expanded={isLocationDropdownOpen && locationSuggestions.length > 0}
                      aria-autocomplete="list"
                      aria-controls="location-autocomplete-list"
                      className="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#052659]/10 focus:border-[#052659] bg-slate-50 text-xs sm:text-sm font-medium transition-all"
                    />
                    {locationInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setLocationInput("");
                          setSelectedCity("");
                          setSelectedSuburb("");
                          setSelectedProvinceSlug("");
                          setCustomLocationQuery("");
                          setIsLocationDropdownOpen(false);
                          setActiveSuggestionIndex(-1);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        aria-label="Clear location"
                      >
                        <X className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    )}
                  </div>

                  {isLocationDropdownOpen && locationInput.trim() !== "" && (
                    <div
                      id="location-autocomplete-list"
                      role="listbox"
                      className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-100 max-h-64 overflow-y-auto z-50"
                    >
                      {locationSuggestions.length === 0 ? (
                        <div className="px-3 py-2.5 text-xs text-slate-500">
                          No matching location found. Press Search to filter by &ldquo;{locationInput.trim()}&rdquo;.
                        </div>
                      ) : (
                        locationSuggestions.map((entry, idx) => {
                          const isHighlighted = idx === activeSuggestionIndex;
                          const typeLabel = formatLocationTypeLabel(entry.locationType);
                          const subtitle =
                            entry.locationType === "province"
                              ? "Zimbabwe Province"
                              : entry.locationType === "suburb" && entry.parentName
                              ? `${typeLabel} · ${entry.parentName}, ${entry.province}`
                              : `${typeLabel} · ${entry.province}`;

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              role="option"
                              aria-selected={isHighlighted}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectCatalogLocation(entry);
                              }}
                              className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                                isHighlighted ? "bg-slate-100" : "hover:bg-slate-50"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-[#052659] truncate">
                                  {entry.name}
                                  {entry.locationType === "suburb" && entry.parentName
                                    ? `, ${entry.parentName}`
                                    : ""}
                                </div>
                                <div className="text-[10.5px] text-slate-500 truncate">{subtitle}</div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Filter toggle button on mobile & search button on desktop */}
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                    className={`sm:hidden flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${
                      showMobileFilters || (selectedSuburb || selectedPropertyType || selectedAmenity || selectedTenantType || minPrice !== "" || maxPrice !== "")
                        ? "bg-orange-50 text-orange-600 border-orange-200"
                        : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    <Filter className="w-3.5 h-3.5 shrink-0" />
                    <span>Filters {(selectedSuburb || selectedPropertyType || selectedAmenity || selectedTenantType || minPrice !== "" || maxPrice !== "") ? "• Active" : ""}</span>
                  </button>

                  <button
                    type="submit"
                    className="flex-1 sm:flex-none sm:w-28 bg-[#052659] hover:bg-[#021024] text-white py-2 px-3.5 rounded-xl font-bold transition-all text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md cursor-pointer min-h-[38px]"
                  >
                    <Search className="w-3.5 h-3.5 shrink-0" />
                    <span>Search</span>
                  </button>
                </div>
              </form>
            </section>



            {/* Secondary Filters row (Expandable on mobile, always visible on tablet/desktop) */}
            <div className={`bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs ${showMobileFilters ? "block" : "hidden sm:block"}`}>
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4">
                
                {/* Check Filters panel */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 w-full lg:w-auto">
                  {/* Suburb Select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Suburb</label>
                    <select
                      value={selectedSuburb}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedSuburb(val);
                        setSelectedProvinceSlug("");
                        setCustomLocationQuery("");
                        if (val) {
                          setLocationInput(selectedCity ? `${val}, ${selectedCity}` : val);
                        } else {
                          setLocationInput(selectedCity || "");
                        }
                      }}
                      className="w-full text-xs font-semibold py-1.5 px-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:outline-none"
                    >
                      <option value="">Any Suburb</option>
                      {getSuburbsForCity().map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Dynamic Property Type Select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Property Type</label>
                    <select
                      value={selectedPropertyType}
                      onChange={(e) => setSelectedPropertyType(e.target.value)}
                      className="w-full text-xs font-semibold py-1.5 px-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:outline-none text-slate-700"
                    >
                      <option value="">All Types</option>
                      {(selectedCategory === "hospitality" 
                        ? HOSPITALITY_PROPERTY_TYPES 
                        : selectedCategory === "residential"
                          ? RESIDENTIAL_PROPERTY_TYPES
                          : ALL_PROPERTY_TYPES
                      ).map(pt => (
                        <option key={pt} value={pt}>{pt}</option>
                      ))}
                    </select>
                  </div>

                  {/* Amenity Select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Amenity</label>
                    <select
                      value={selectedAmenity}
                      onChange={(e) => setSelectedAmenity(e.target.value)}
                      className="w-full text-xs font-semibold py-1.5 px-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:outline-none"
                    >
                      <option value="">Any Amenity</option>
                      {(selectedCategory === "hospitality" ? HOSPITALITY_AMENITIES : ALL_AMENITIES).map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>

                  {/* Tenant seeks criteria selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Tenant / Guest</label>
                    <select
                      value={selectedTenantType}
                      onChange={(e) => setSelectedTenantType(e.target.value)}
                      className="w-full text-xs font-semibold py-1.5 px-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:outline-none text-slate-700"
                    >
                      <option value="">Any seeking type</option>
                      <option value="Student">Student sought</option>
                      <option value="General">General sought</option>
                      <option value="Single">Single sought</option>
                      <option value="Guest">Guest sought</option>
                    </select>
                  </div>

                  {/* Min / Max Price fields */}
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Price (USD)</label>
                    <div className="flex items-center gap-1.5">
                      <input 
                        type="number" 
                        placeholder="Min" 
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full text-xs py-1 px-1.5 border border-slate-200 rounded-md bg-slate-50 text-center"
                      />
                      <span className="text-slate-400 text-[10px]">-</span>
                      <input 
                        type="number" 
                        placeholder="Max" 
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full text-xs py-1 px-1.5 border border-slate-200 rounded-md bg-slate-50 text-center"
                      />
                    </div>
                  </div>
                </div>

                {/* Clearance Actions & Sort Controls */}
                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 w-full lg:w-auto shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                  {(searchTerm || selectedCity || selectedSuburb || selectedProvinceSlug || customLocationQuery || selectedAmenity || selectedPropertyType || selectedTenantType || selectedCategory !== "all" || minPrice !== "" || maxPrice !== "" || sortBy !== "newest") && (
                    <button 
                      onClick={clearAllFilters}
                      className="text-xs text-orange-500 font-bold hover:underline flex items-center gap-1 bg-orange-50 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                    >
                      <span>Clear Filters</span>
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                    <label htmlFor="sort-by-select" className="text-xs text-slate-500 font-medium">Sort:</label>
                    <select
                      id="sort-by-select"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:border-orange-500 cursor-pointer shadow-2xs"
                    >
                      <option value="newest">Newest First</option>
                      <option value="price_asc">Price: Low to High</option>
                      <option value="price_desc">Price: High to Low</option>
                      <option value="leads">Most Inquiries</option>
                    </select>
                  </div>
                  <div className="text-xs text-slate-500 font-mono hidden xs:block">
                    <span className="font-bold text-slate-800">{displayedListings.length}</span> stays
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Single-Strip WhatsApp Discovery Card */}
            <section
              id="whatsapp-promo-section"
              aria-label="BunkBy on WhatsApp"
              className="bg-white rounded-xl sm:rounded-2xl px-2.5 py-2 sm:p-4 border border-slate-200 shadow-xs"
            >
              <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
                <div className="min-w-0 flex-1 space-y-0.5 sm:space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 sm:gap-x-2 gap-y-0">
                    <h2 className="text-[10px] sm:text-base font-display font-bold text-[#021024] leading-tight sm:leading-snug">
                      Find Your Next Place on WhatsApp
                    </h2>
                    <a
                      href={getBunkByWhatsAppUrl("Hi BunkBy! I would like to find accommodation.")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] sm:text-xs font-sans font-semibold text-emerald-700 hover:text-emerald-800 no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15803d] rounded-xs whitespace-nowrap"
                      title={`Chat with BunkBy on WhatsApp (${BUNKBY_WHATSAPP_DISPLAY})`}
                    >
                      {BUNKBY_WHATSAPP_DISPLAY}
                    </a>
                  </div>
                  <p className="text-[9px] sm:text-xs text-slate-600 leading-tight sm:leading-snug">
                    Search rooms, cottages, stays or commercial spaces, or post a listing directly on WhatsApp. See our{" "}
                    <a
                      id="promo-whatsapp-guide-link"
                      href="/whatsapp"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                        e.preventDefault();
                        navigateTo("/whatsapp");
                      }}
                      className="text-[#15803d] hover:text-[#166534] font-semibold no-underline transition-colors"
                    >
                      WhatsApp guide
                    </a>
                    .
                  </p>
                </div>

                <a
                  id="promo-whatsapp-cta"
                  href={getBunkByWhatsAppUrl("Hi BunkBy! I would like to find accommodation.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#15803d] hover:bg-[#166534] text-white font-bold text-[9.5px] sm:text-xs px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl shadow-xs transition-colors inline-flex items-center justify-center gap-1 sm:gap-1.5 min-h-[28px] sm:min-h-[38px] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#052659]"
                >
                  <WhatsAppIcon className="w-3 h-3 sm:w-4 sm:h-4 text-white shrink-0" />
                  <span>Chat<span className="hidden sm:inline"> on WhatsApp</span></span>
                </a>
              </div>
            </section>

            {/* Mobile result count header when filter panel is collapsed */}
            <div className="sm:hidden flex items-center justify-between px-1 text-xs text-slate-600 font-medium">
              <span>Showing <strong className="text-slate-900">{displayedListings.length}</strong> active accommodations</span>
              <button
                type="button"
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="text-xs text-orange-600 font-bold flex items-center gap-1 hover:underline"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{showMobileFilters ? "Hide Filters" : "Filter Stays"}</span>
              </button>
            </div>

            {/* Rooms Cards Directory list - Compact, Responsive Grid */}
            <div id="results-anchor" className="scroll-mt-20">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5 lg:gap-6" aria-busy="true">
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <div key={idx} className="bg-white rounded-2xl overflow-hidden border border-slate-200/90 shadow-xs flex flex-col animate-pulse">
                    <div className="aspect-16/10 sm:aspect-16/9 w-full bg-slate-200" />
                    <div className="p-4 space-y-2.5">
                      <div className="h-4 bg-slate-200 rounded w-3/4" />
                      <div className="h-3 bg-slate-100 rounded w-1/2" />
                      <div className="h-6 bg-slate-200 rounded w-1/3 mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedListings.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 sm:p-12 text-center border border-slate-200 space-y-3 max-w-lg mx-auto shadow-xs">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                  <SlidersHorizontal className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800 font-display">
                  {committedLocationLabel
                    ? `No Active Properties in ${committedLocationLabel}`
                    : "No Listings Found"}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500">
                  {committedLocationLabel
                    ? `No active properties are currently listed in ${committedLocationLabel} matching your search criteria. Try searching another location, clearing filters, or checking availability on WhatsApp.`
                    : "No listings matched your criteria. Try widening your search or clearing filters. Landlords can list rooms instantly for free!"}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    onClick={clearAllFilters}
                    className="bg-orange-50 text-orange-600 hover:bg-orange-100 text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                  >
                    Clear Filters
                  </button>
                  {committedLocationLabel && (
                    <a
                      href={getBunkByWhatsAppUrl(`Hi BunkBy! I am looking for accommodation in ${committedLocationLabel}.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#15803d] hover:bg-[#166534] text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                    >
                      Search on WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5 lg:gap-6 items-start" id="rooms-grid">
                {displayedListings.map((room) => {
                  const isHospitality = room.category === "hospitality" || ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(room.propertyType);
                  const businessName = room.business_name || room.businessName;
                  const cardKey = String(room.id);
                  const isExpanded = Boolean(expandedCardIds[cardKey]);
                  const allPhotos = getAllListingPhotos(room);
                  const activePhotoIdx = cardActivePhotoIdx[cardKey] || 0;
                  const activeCardPhoto = allPhotos[activePhotoIdx] || getPrimaryListingPhoto(room);

                  return (
                    <div
                      key={room.id}
                      id={`room-card-${room.id}`}
                      className={`bg-white rounded-2xl overflow-hidden border transition-all flex flex-col group relative ${
                        isExpanded
                          ? "border-[#052659]/30 shadow-lg ring-1 ring-[#052659]/10"
                          : "border-slate-200/90 shadow-xs hover:shadow-md hover:border-slate-300"
                      }`}
                    >
                      {/* Room Image with overlay tags - Compact aspect-ratio */}
                      <div
                        onClick={() => toggleCardExpanded(cardKey)}
                        className="relative aspect-16/10 sm:aspect-16/9 w-full overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center cursor-pointer"
                      >
                        {activeCardPhoto ? (
                          <img 
                            src={activeCardPhoto} 
                            alt={`${room.title} - ${room.propertyType} in ${room.suburb}, ${room.city}`}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-slate-400 font-mono text-xs font-bold uppercase tracking-widest">No Image</span>
                        )}
                        
                        {/* Top ribbon tags - compact */}
                        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1 z-10 max-w-[70%]">
                          {(() => {
                            const catInfo = getListingCategoryInfo(room);
                            const IconComponent = catInfo.icon;
                            return (
                              <span className={`${catInfo.bgClass} font-bold text-[9px] tracking-wide uppercase px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs border ${catInfo.badgeBorder}`}>
                                <IconComponent className="w-2.5 h-2.5 text-[#FF7A00] shrink-0" />
                                <span>{catInfo.label}</span>
                              </span>
                            );
                          })()}

                          <span className="bg-white/95 backdrop-blur-xs text-[#052659] border border-slate-200/90 font-mono font-extrabold text-[9px] px-2 py-0.5 rounded-full uppercase shadow-xs truncate">
                            {room.propertyType}
                          </span>

                          {room.isSample && (
                            <span className="bg-amber-500/90 text-white font-mono font-bold text-[8.5px] px-1.5 py-0.5 rounded-full uppercase shadow-2xs">
                              Sample
                            </span>
                          )}

                          {room.isVerifiedLandlord && (
                            <span className="bg-emerald-600 text-white font-semibold text-[8.5px] tracking-wide uppercase px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-2xs">
                              <CheckCircle className="w-2.5 h-2.5 text-white shrink-0" />
                              <span>Verified</span>
                            </span>
                          )}
                        </div>

                        {/* Cost badge overlaid on image - clean & readable */}
                        <div className="absolute bottom-2.5 right-2.5 bg-white/95 backdrop-blur-xs shadow-md rounded-xl px-2.5 py-1 text-right border border-slate-200">
                          <span className="text-[9px] text-slate-500 block leading-none font-mono font-bold uppercase">
                            {isHospitality ? "Rate" : "Rent"}
                          </span>
                          <div className="text-base sm:text-lg font-display font-extrabold text-slate-900 leading-tight">
                            ${room.price}<span className="text-[10px] font-semibold text-slate-500">/{room.frequency}</span>
                          </div>
                          {isHospitality ? (
                            <span className="text-[8.5px] text-emerald-600 block font-mono font-bold leading-none">Direct Booking</span>
                          ) : room.deposit > 0 ? (
                            <span className="text-[8.5px] text-slate-400 block font-mono leading-none">Dep: ${room.deposit}</span>
                          ) : (
                            <span className="text-[8.5px] text-emerald-600 block font-mono font-bold leading-none">No Deposit</span>
                          )}
                        </div>
                      </div>

                      {/* Room Metadata - Tightly structured, readable, expands inline when Details is clicked */}
                      <div className="p-3.5 sm:p-4 flex-grow flex flex-col space-y-2.5">
                        
                        {/* Heading & Subtitle */}
                        <div className="space-y-0.5">
                          {isHospitality && businessName && (
                            <div className="flex items-center gap-1 text-[11px] font-extrabold text-[#052659] uppercase tracking-wide truncate">
                              <Building2 className="w-3 h-3 text-[#052659] shrink-0" />
                              <span className="truncate">{businessName}</span>
                            </div>
                          )}

                          <h3 className={`text-sm sm:text-base font-bold text-slate-800 leading-snug ${isExpanded ? "" : "line-clamp-1"}`}>
                            <button
                              type="button"
                              onClick={() => toggleCardExpanded(cardKey)}
                              className="text-left hover:text-[#052659] cursor-pointer transition-colors w-full"
                              title={room.title}
                            >
                              {room.title}
                            </button>
                          </h3>
                          
                          {/* Location lines */}
                          <div className={`flex items-start gap-1 text-xs text-slate-600 font-medium ${isExpanded ? "flex-wrap" : "items-center"}`}>
                            <MapPin className="w-3 h-3 text-[#FF7A00] shrink-0 mt-0.5" />
                            <span className={isExpanded ? "" : "truncate"}>{room.city}, {room.suburb}</span>
                            {room.landmark && (
                              <span className={`text-slate-400 italic text-[11px] ${isExpanded ? "" : "truncate hidden xs:inline"}`}>
                                • "{room.landmark}"
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Criteria pills in single compact row */}
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-600 pt-0.5">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium">
                            {isHospitality ? "Direct Stay" : `${room.tenantType} sought`}
                          </span>
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono">
                            {room.contactMethod}
                          </span>
                          {room.leadsCount ? (
                            <span className="text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-md font-mono font-bold text-[9px] ml-auto">
                              {room.leadsCount} inquiries
                            </span>
                          ) : null}
                        </div>

                        {/* List of amenities - concise in collapsed state, full in expanded state */}
                        {room.amenities.length > 0 && (
                          <div className="flex flex-wrap gap-1 shrink-0 pt-0.5">
                            {(isExpanded ? room.amenities : room.amenities.slice(0, 3)).map((amenity, idx) => (
                              <span 
                                key={idx}
                                className={`text-[9.5px] font-medium py-0.5 px-2 rounded-md border ${
                                  isHospitality 
                                    ? "bg-amber-50 text-amber-800 border-amber-200" 
                                    : "bg-sky-50 text-sky-700 border-sky-100"
                                }`}
                              >
                                {amenity}
                              </span>
                            ))}
                            {!isExpanded && room.amenities.length > 3 && (
                              <span className="text-[9px] text-slate-400 py-0.5 px-1 font-mono">
                                +{room.amenities.length - 3} more
                              </span>
                            )}
                          </div>
                        )}

                        {/* Expanded inline details section */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              key={`expanded-${room.id}`}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.22, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="pt-2.5 mt-1 border-t border-slate-100 space-y-3 text-left">
                                {/* Gallery thumbnails if multiple photos exist */}
                                {allPhotos.length > 1 && (
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
                                      Photos ({allPhotos.length})
                                    </span>
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                      {allPhotos.map((photoSrc, idx) => (
                                        <button
                                          key={idx}
                                          type="button"
                                          onClick={() =>
                                            setCardActivePhotoIdx((prev) => ({
                                              ...prev,
                                              [cardKey]: idx,
                                            }))
                                          }
                                          className={`relative w-16 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                                            activePhotoIdx === idx
                                              ? "border-[#FF7A00] ring-2 ring-[#FF7A00]/20"
                                              : "border-slate-200 hover:opacity-85"
                                          }`}
                                        >
                                          <img
                                            src={photoSrc}
                                            alt={`${room.title} photo ${idx + 1}`}
                                            className="w-full h-full object-cover"
                                            referrerPolicy="no-referrer"
                                          />
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Pricing & Status breakdown */}
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
                                      {isHospitality ? "Rate" : "Rent & Deposit"}
                                    </span>
                                    <span className="font-bold text-slate-800">
                                      ${room.price}/{room.frequency}
                                    </span>
                                    {!isHospitality && (
                                      <span className="block text-[11px] text-slate-500">
                                        {room.deposit > 0 ? `Deposit: $${room.deposit}` : "No deposit required"}
                                      </span>
                                    )}
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
                                      Availability
                                    </span>
                                    <span className="font-bold text-emerald-700">
                                      {room.status || "Active"}
                                    </span>
                                    <span className="block text-[11px] text-slate-500">
                                      {isHospitality ? "Hospitality Stay" : `${room.tenantType} sought`}
                                    </span>
                                  </div>
                                </div>

                                {/* Description if present */}
                                {room.description && (
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
                                      Description
                                    </span>
                                    <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                                      {room.description}
                                    </p>
                                  </div>
                                )}

                                {/* Advertiser details */}
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between gap-2 flex-wrap">
                                  <div className="min-w-0">
                                    <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
                                      Advertiser
                                    </span>
                                    <p className="text-xs font-bold text-slate-800 truncate">
                                      {businessName || room.landlordName || "Property Advertiser"}
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      Contact via {room.contactMethod || "Call / WhatsApp"}
                                    </p>
                                  </div>
                                  {room.isVerifiedLandlord ? (
                                    <span className="bg-emerald-100 text-emerald-800 font-bold uppercase text-[9.5px] px-2 py-1 rounded-full flex items-center gap-1 font-mono shrink-0">
                                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                                      <span>Verified</span>
                                    </span>
                                  ) : (
                                    <span className="bg-slate-200/80 text-slate-600 font-medium text-[9.5px] px-2 py-1 rounded-full font-mono shrink-0">
                                      Direct Listing
                                    </span>
                                  )}
                                </div>

                                {/* Trust notice + Share / Report utilities */}
                                <div className="p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-xl space-y-2">
                                  <p className="text-[11px] text-amber-900 leading-snug">
                                    <span className="font-bold">Safety tip:</span> Inspect the property in person before paying any deposit or booking fee.
                                  </p>
                                  <div className="flex items-center justify-between gap-2 pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const shareUrl = `${window.location.origin}/listing/${encodeURIComponent(cardKey)}`;
                                        if (navigator.clipboard?.writeText) {
                                          navigator.clipboard.writeText(shareUrl).catch(() => {});
                                        }
                                        setCopiedListingId(cardKey);
                                        window.setTimeout(() => {
                                          setCopiedListingId((curr) => (curr === cardKey ? null : curr));
                                        }, 2000);
                                      }}
                                      className="text-[11px] font-bold text-[#052659] hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      {copiedListingId === cardKey ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          <span className="text-emerald-700">Link Copied</span>
                                        </>
                                      ) : (
                                        <>
                                          <Share2 className="w-3 h-3" />
                                          <span>Copy Share Link</span>
                                        </>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReportingListing(room);
                                        setIsReportModalOpen(true);
                                      }}
                                      className="text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                      <span>Report Listing</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Bottom action panel with inline Expand/Collapse Details & direct contact */}
                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleCardExpanded(cardKey)}
                            aria-expanded={isExpanded}
                            className={`text-xs font-bold py-2 px-2.5 sm:px-3 rounded-xl transition-all cursor-pointer flex items-center gap-1 min-h-[38px] ${
                              isExpanded
                                ? "bg-[#052659] text-white hover:bg-[#052659]/90"
                                : "text-slate-700 hover:text-[#052659] bg-slate-100 hover:bg-slate-200"
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                            <span>{isExpanded ? "Hide Details" : "Details"}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                            )}
                          </button>

                          <button 
                            type="button"
                            onClick={() => handleContactLandlord(room)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 sm:px-3.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer outline-none min-h-[38px]"
                            title="Inquire directly with host or landlord via WhatsApp"
                          >
                            <Phone className="w-3.5 h-3.5 text-white fill-white/15" />
                            <span>{isHospitality ? "Inquire" : "Contact Host"}</span>
                          </button>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>

            {/* Highlighted BunkBy Promo Section - Responsive & Compact */}
            <section className="bg-orange-500/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-orange-500/10">
              <div className="max-w-2xl space-y-1.5">
                <span className="text-[10px] sm:text-xs font-mono font-bold text-orange-600 tracking-wider uppercase block">For Landlords &amp; Property Owners</span>
                <h2 className="text-lg sm:text-2xl font-display font-bold text-slate-900">
                  Landlord: Why List With BunkBy?
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  List your vacant rooms, cottages, student housing, lodges, or commercial spaces directly on BunkBy and WhatsApp. Connect with property seekers without agent commissions, and mark your listing as occupied anytime once filled.
                </p>
              </div>
            </section>
          </div>
        )}
        {/* TAB 2: LANDLORDS PORTAL (MY LISTINGS & ACTIVE CONSOLE) */}
        {currentPath === "/" && activeTab === "landlord" && (
          !userProfile ? (
            <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-xl space-y-4 sm:space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2 text-2xl">
                  🏡
                </div>
                <span className="inline-block bg-orange-500 text-white font-mono text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Landlord Security Core
                </span>
                <h2 className="text-2.5xl font-display font-black text-slate-800">Landlord Access</h2>
                <p className="text-xs text-slate-500">
                  Access your BunkBy account to immediately list rooms, track tenant inquiries, and manage vacancy for free. No passwords required!
                </p>
              </div>

              {/* Toggle Selector Option for Login vs. Create Account */}
              <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className={`w-1/2 rounded-xl text-xs py-2.5 font-bold transition-all ${authMode === "login" ? "bg-white text-[#052659] shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className={`w-1/2 rounded-xl text-xs py-2.5 font-bold transition-all ${authMode === "signup" ? "bg-white text-[#052659] shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-4 font-sans">
                <div className="animate-fade-in">
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Your Full Name</label>
                  <input 
                    type="text" 
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value)}
                    placeholder="Full name" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-all font-medium text-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">WhatsApp Phone Number</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-400 text-sm font-medium pr-2 border-r border-slate-200 font-mono">
                      +263
                    </span>
                    <input 
                      type="tel" 
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      placeholder="774*******" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-20 pr-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-mono transition-all font-medium text-slate-800"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1.5">
                      <span>Account Security PIN</span>
                      <span className="text-[10px] text-slate-400 font-normal lowercase font-sans">
                        {authMode === "signup" ? "(recommended, 4+ digits)" : "(if previously set)"}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPinHelp(!showPinHelp)}
                      className="text-[11px] text-orange-500 hover:underline font-semibold"
                    >
                      {showPinHelp ? "Hide help" : "Why a PIN?"}
                    </button>
                  </div>
                  <input
                    type="password"
                    maxLength={8}
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ""))}
                    placeholder={authMode === "signup" ? "Set a 4 to 8-digit PIN to lock your account" : "Enter your PIN"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-mono transition-all font-medium text-slate-800"
                  />
                  {showPinHelp && (
                    <div className="mt-2 bg-blue-50/70 border border-blue-200/50 rounded-xl p-3 text-[11px] text-slate-600 leading-relaxed">
                      💡 <strong>Account Protection:</strong> Adding a PIN prevents unauthorized users from claiming or editing your listings using just your publicly visible phone number.
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1 pl-1">
                    {authMode === "signup" 
                      ? "A 4-digit PIN is required to protect your listings against unauthorized edits." 
                      : "Enter your 4-digit PIN."}
                  </p>
                </div>

                {authMode === "login" && (
                  <div className="flex justify-end items-center text-[11px] px-1">
                    <button
                      type="button"
                      onClick={() => openRecoveryModal(loginPhone)}
                      className="text-orange-600 hover:underline font-bold cursor-pointer"
                    >
                      Forgot PIN? / Reset via WhatsApp
                    </button>
                  </div>
                )}

                <div className="flex justify-center pt-2">
                  <button 
                    type="submit" 
                    disabled={isAuthLoading}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-slate-300 disabled:to-slate-300 text-white font-bold rounded-2xl transition-all text-xs shadow hover:shadow-md flex items-center justify-center gap-2 outline-none cursor-pointer"
                  >
                    {isAuthLoading ? (
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    ) : (
                      authMode === "login" ? "🔑 Log In to BunkBy" : "🏡 Create Landlord Account"
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Header and status banner */}
              <div className="bg-[#052659] text-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 border border-[#052659]">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 bg-[#FF7A00] text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Admin Control & Management
                  </div>
                  <h2 className="text-2.5xl font-display font-black text-white">My Landlord Listings</h2>
                  <p className="text-sm text-[#E2E8F0] font-medium max-w-xl">
                    Update your property details, view inquiry activity, or mark listings as occupied anytime once rented. Connect directly with prospective tenants and guests without agency commissions.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={() => {
                      setIsEditing(null);
                      setNewRoomForm(prev => ({ ...prev, landlordName: userProfile.name, phone: userProfile.phone }));
                      setIsCreateModalOpen(true);
                    }}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-2xl transition-all text-sm shadow-md flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>Create Your First Listing</span>
                  </button>
                </div>
              </div>

              {/* Availability pulse reminder banner */}
                            {/* Listing Freshness & Marketplace Integrity Banner */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Listings remain active for 30 days. You can easily mark a property as rented, reactivate, or delete it anytime right here or via WhatsApp.
                </p>
              </div>

              {/* Landlord portfolio list */}
              <div>
                <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2 font-display">
                  <span>Active Listings Portfolio</span>
                  <span className="font-mono text-xs text-slate-400 bg-slate-100 py-0.5 px-2 rounded-full font-normal">
                    {listings.filter(r => r.phone === userProfile.phone || r.landlordName === userProfile.name).length} Rooms Listed
                  </span>
                </h3>

                {listings.filter(r => r.phone === userProfile.phone || r.landlordName === userProfile.name).length === 0 ? (
                  <div className="bg-white border rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4 shadow-sm">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                      <Building className="w-8 h-8 text-slate-400" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-800">You haven't created any BunkBy listings yet</h4>
                    <p className="text-sm text-slate-500">
                      Tap &apos;Create a Listing&apos; to publish your property so prospective tenants and guests can reach you directly via WhatsApp or phone call.
                    </p>
                    <button 
                      onClick={() => {
                        setNewRoomForm(prev => ({ ...prev, landlordName: userProfile.name, phone: userProfile.phone }));
                        setIsCreateModalOpen(true);
                      }}
                      className="bg-[#052659] hover:bg-[#021024] text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-md"
                    >
                      Create Your First Listing
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5 lg:gap-6">
                    {listings
                      .filter(r => r.phone === userProfile.phone || r.landlordName === userProfile.name)
                      .map((room) => {
                        // Expiration analysis for premium listing
                        const isExpired = room.isPremium && room.expiryDate && new Date(room.expiryDate) < new Date();
                        const daysLeft = room.isPremium && room.expiryDate 
                          ? Math.ceil((new Date(room.expiryDate).getTime() - Date.now()) / (24 * 3600 * 1000))
                          : null;

                        return (
                          <div 
                            key={room.id}
                            className={`bg-white rounded-2xl overflow-hidden border transition-all flex flex-col relative ${room.status === "Delisted" || isExpired ? "border-slate-200 opacity-70" : "border-slate-200/80 shadow-md hover:shadow-lg"}`}
                          >
                            {/* Status ribbon overlaid */}
                            <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2">
                              {room.status === "Hidden" ? (
                                <span className="bg-amber-600 text-white font-semibold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                                  Hidden by Moderation
                                </span>
                              ) : room.status === "Removed" ? (
                                <span className="bg-red-600 text-white font-semibold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                                  Removed by Moderation
                                </span>
                              ) : room.status === "Delisted" ? (
                                <span className="bg-slate-700 text-white font-semibold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                                  Delisted (Rented)
                                </span>
                              ) : isExpired ? (
                                <span className="bg-red-500 text-white font-semibold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                                  Expired Listing
                                </span>
                              ) : (
                                <span className="bg-emerald-500 text-white font-semibold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                                  Active Listing
                                </span>
                              )}

                              {room.isPremium && (
                                <span className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                                  ⭐ Paid Premium
                                </span>
                              )}

                              {(() => {
                                const catInfo = getListingCategoryInfo(room);
                                const IconComponent = catInfo.icon;
                                return (
                                  <span className={`${catInfo.bgClass} font-bold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 border ${catInfo.badgeBorder}`}>
                                    <IconComponent className="w-2.5 h-2.5 text-[#FF7A00] shrink-0" />
                                    <span>{catInfo.label}</span>
                                  </span>
                                );
                              })()}
                            </div>

                            {/* Card Image */}
                            <div className="relative aspect-16/10 sm:aspect-16/9 w-full overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                              {(room.image_url || (room.images && room.images[0])) ? (
                                <img 
                                  src={getPrimaryListingPhoto(room)} 
                                  alt={room.title}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-slate-400 font-mono text-[10px] font-bold uppercase tracking-widest">No Image</span>
                              )}
                              <div className="absolute top-3 right-3 bg-white/95 shadow-md rounded-xl px-2.5 py-1 text-right">
                                <span className="text-xs font-bold text-sky-700">${room.price}/{room.frequency}</span>
                              </div>
                            </div>

                            {/* Content */}
                            <div className="p-3.5 sm:p-4 flex-grow flex flex-col justify-between space-y-3">
                              <div className="space-y-1">
                                {(room.business_name || room.businessName) && (
                                  <div className="flex items-center gap-1 text-[11px] font-bold text-[#052659] uppercase tracking-wide">
                                    <Building2 className="w-3 h-3 text-[#052659] shrink-0" />
                                    <span className="truncate">{room.business_name || room.businessName}</span>
                                  </div>
                                )}
                                <h4 className="text-sm font-bold text-slate-800 truncate">{room.title}</h4>
                                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                  <MapPin className="w-3 h-3 text-orange-500" />
                                  <span>{room.city}, {room.suburb}</span>
                                </p>
                                {room.isPremium && room.expiryDate && (
                                  <p className={`text-[11px] font-medium font-mono ${isExpired ? "text-red-500" : "text-amber-600 animate-pulse"}`}>
                                    ⏳ {isExpired ? "Expired. Disappeared from tenant feed." : `30-Day Listing: ${daysLeft} days left.`}
                                  </p>
                                )}
                              </div>

                              {/* Leads View metric */}
                              <div className="bg-slate-50 rounded-xl p-2.5 flex items-center justify-between text-xs font-semibold">
                                <span className="text-slate-500 flex items-center gap-1">
                                  <TrendingUp className="w-3.5 h-3.5 text-orange-500" />
                                  <span>Direct Inquiries</span>
                                </span>
                                <span className="text-orange-500 font-bold bg-orange-50 rounded px-2 py-0.5">{room.leadsCount || 0} Leads</span>
                              </div>

                              {/* Quick controls including DELIST toggle and delete */}
                              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5 flex-wrap">
                                
                                {isExpired ? (
                                  <button
                                    onClick={() => {
                                      // Trigger billing modal to renew for $5
                                      const renewPayload = {
                                        ...room,
                                        title: room.title,
                                        city: room.city,
                                        suburb: room.suburb,
                                        price: room.price,
                                        deposit: room.deposit,
                                        frequency: room.frequency,
                                        propertyType: room.propertyType,
                                        tenantType: room.tenantType,
                                        amenities: room.amenities,
                                        contactMethod: room.contactMethod,
                                        phone: room.phone,
                                        landlordName: room.landlordName,
                                        imageUrl: room.images[0]
                                      };
                                      setBillingListingForm(renewPayload);
                                      setBillingPhone(userProfile.phone);
                                      setIsBillingModalOpen(true);
                                      showToast("💰 Renew Paid Listing: Complete $5 mobile money payment.");
                                    }}
                                    className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition-all shadow-sm"
                                  >
                                    Renew ($5 USD)
                                  </button>
                                ) : (
                                  <button 
                                    onClick={() => {
                                      setNewRoomForm({
                                        title: room.title,
                                        category: room.category || (["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(room.propertyType) ? "hospitality" : "residential"),
                                        business_name: room.business_name || room.businessName || "",
                                        city: room.city,
                                        suburb: room.suburb,
                                        landmark: room.landmark,
                                        price: room.price,
                                        deposit: room.deposit,
                                        frequency: room.frequency,
                                        propertyType: room.propertyType,
                                        tenantType: room.tenantType,
                                        amenities: room.amenities,
                                        contactMethod: room.contactMethod,
                                        phone: room.phone,
                                        landlordName: room.landlordName,
                                        imageUrl: (room.images && room.images[0]) || room.image_url || ""
                                      });
                                      const existingRoomPhotos = (() => {
                                        if (room.images && room.images.length > 0) return room.images;
                                        const raw = String(room.image_url || "").trim();
                                        if (raw.startsWith("[")) {
                                          try {
                                            const arr = JSON.parse(raw);
                                            if (Array.isArray(arr) && arr.length > 0) return arr;
                                          } catch (_) {}
                                        }
                                        return raw ? [raw] : [];
                                      })();
                                      setUploadedImages(existingRoomPhotos);
                                      setIsEditing(room.id);
                                      setIsCreateModalOpen(true);
                                    }}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                                  >
                                    Edit details
                                  </button>
                                )}

                                {!isExpired && room.status !== "Hidden" && room.status !== "Removed" && (
                                  <button 
                                    onClick={() => handleToggleDelist(room.id)}
                                    className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-all ${room.status === "Active" || room.status === "verified" ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}
                                    title={room.status === "Active" || room.status === "verified" ? "Mark this room as occupied to instantly remove from tenant directory" : "Activate room for listings"}
                                  >
                                    {room.status === "Active" || room.status === "verified" ? "Delist Room" : "Activate Room"}
                                  </button>
                                )}

                                <button 
                                  onClick={() => handleDeleteListing(room.id)}
                                  className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-all shrink-0"
                                  title="Permanently remove listings"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>

                              </div>
                            </div>

                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Instructions box */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200">
                <h3 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-1.5 font-display">
                  <CheckCircle className="w-5 h-5 text-orange-500" />
                  <span>Listing Lifecycle &amp; Availability Updates</span>
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">
                  To keep active listings current, published properties remain active for <strong>30 days</strong>. Landlords and hosts can renew, mark as occupied, or remove a listing anytime from this dashboard or directly in WhatsApp.
                </p>
                <div className="bg-amber-50/60 rounded-xl p-3.5 border border-amber-200 font-mono text-xs">
                  <p className="font-bold text-slate-800 mb-1">⚡ Direct Availability Check:</p>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-sans leading-relaxed">
                    Property seekers can tap <strong>&quot;Ask Host: Is this still available?&quot;</strong> on WhatsApp to confirm availability directly with the property owner or host.
                  </div>
                </div>
              </div>

            </div>
          )
        )}

        {/* TAB 3: ACCOUNT SETTINGS */}
        {currentPath === "/" && activeTab === "account" && (
          !userProfile ? (
            <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xl space-y-6 animate-fade-in font-sans">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2 text-2xl">
                  👤
                </div>
                <span className="inline-block bg-orange-500 text-white font-mono text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  BunkBy Account Center
                </span>
                <h2 className="text-2.5xl font-display font-black text-slate-850">Access Account</h2>
                <p className="text-xs text-slate-500">
                  Provide your name and phone number to sign up or log in to access your BunkBy history, notifications, and landlord options.
                </p>
              </div>

              {/* Toggle Selector Option for Login vs. Create Account */}
              <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className={`w-1/2 rounded-xl text-xs py-2.5 font-bold transition-all ${authMode === "login" ? "bg-white text-[#052659] shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className={`w-1/2 rounded-xl text-xs py-2.5 font-bold transition-all ${authMode === "signup" ? "bg-white text-[#052659] shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-4 font-sans">
                <div className="animate-fade-in">
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Your Full Name</label>
                  <input 
                    type="text" 
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value)}
                    placeholder="Full name" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-all font-medium text-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">WhatsApp Phone Number</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-400 text-sm font-medium pr-2 border-r border-slate-200 font-mono">
                      +263
                    </span>
                    <input 
                      type="tel" 
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      placeholder="774*******" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-20 pr-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-mono transition-all font-medium text-slate-800"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1.5">
                      <span>Account Security PIN</span>
                      <span className="text-[10px] text-slate-400 font-normal lowercase font-sans">
                        {authMode === "signup" ? "(recommended, 4+ digits)" : "(if previously set)"}
                      </span>
                    </label>
                  </div>
                  <input
                    type="password"
                    maxLength={8}
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ""))}
                    placeholder={authMode === "signup" ? "Set a 4 to 8-digit PIN to secure your account" : "Enter your PIN"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-mono transition-all font-medium text-slate-800"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 pl-1">
                    {authMode === "signup" 
                      ? "A 4-digit PIN is required to secure your account." 
                      : "Enter your 4-digit PIN."}
                  </p>
                </div>

                {authMode === "login" && (
                  <div className="flex justify-end items-center text-[11px] px-1">
                    <button
                      type="button"
                      onClick={() => openRecoveryModal(loginPhone)}
                      className="text-orange-600 hover:underline font-bold cursor-pointer"
                    >
                      Forgot PIN? / Reset via WhatsApp
                    </button>
                  </div>
                )}

                <div className="flex justify-center pt-2">
                  <button 
                    type="submit" 
                    disabled={isAuthLoading}
                    className="w-full py-3.5 px-4 bg-[#052659] hover:bg-[#021024] disabled:bg-slate-300 text-white font-bold rounded-2xl transition-all text-sm shadow hover:shadow-md flex items-center justify-center gap-2 outline-none cursor-pointer"
                  >
                    {isAuthLoading ? (
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    ) : (
                      authMode === "login" ? "🔑 Log In to BunkBy" : "🏡 Create Account & Enter"
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-6 max-w-3xl mx-auto">
              
              {/* Account Settings Header */}
              <div className="border-b border-slate-200 pb-4">
                <h2 className="text-2.5xl font-display font-black text-slate-950">Account Settings</h2>
                <p className="text-sm text-slate-500">Manage your BunkBy landlord details, linked WhatsApp accounts, and platform administration.</p>
              </div>

              {/* Profile Overview Card */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Profile Details</h3>
                
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-orange-500 shrink-0 border border-orange-200 select-none font-display text-2xl font-bold">
                      {userProfile.name ? userProfile.name.split(" ").map(w => w[0]).join("") : "U"}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-lg font-bold text-slate-800">{userProfile.name}</h4>
                        {userProfile.isVerified && (
                          <span className="bg-emerald-100 text-emerald-800 font-bold uppercase text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                            <CheckCircle className="w-3 h-3 text-emerald-600 fill-white shrink-0" />
                            <span>Verified Account</span>
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 text-xs font-mono space-y-0.5">
                        <p>📞 Phone: {userProfile.phone}</p>
                        <p>👑 Status: Host Platform Administrator</p>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleLogout}
                    className="bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 transition-all font-bold text-xs py-2 px-4 rounded-xl border border-red-200 shadow-xs self-start sm:self-center cursor-pointer"
                  >
                    Log Out
                  </button>
                </div>
              </div>

              {/* Landlord Verification Centre */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">My Landlord Badge status</h3>
                  {verificationStatus === "approved" ? (
                    <span className="font-mono text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-emerald-105 text-emerald-800 flex items-center gap-1">
                      🛡️ VERIFIED LANDLORD
                    </span>
                  ) : verificationStatus === "pending" ? (
                    <span className="font-mono text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                      ⏳ SUBMITTED & PENDING AUDIT
                    </span>
                  ) : verificationStatus === "rejected" ? (
                    <span className="font-mono text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 flex items-center gap-1">
                      ✕ AUDIT REJECTED
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 flex items-center gap-1">
                      ⚠️ UNVERIFIED HOST
                    </span>
                  )}
                </div>

                {verificationStatus === "approved" ? (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-2">
                    <p className="text-xs text-emerald-800 font-medium leading-relaxed">
                      Your verified landlord status has been approved. Your published listings display a <strong>Verified Host Badge</strong> to help property seekers identify confirmed advertisers.
                    </p>
                  </div>
                ) : verificationStatus === "pending" ? (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                    <p className="text-xs text-amber-800 font-medium leading-relaxed">
                      We are safely housing your verification documents (National ID Card & Rates Statement). Our administrative moderators will inspect the matches shortly. No action is required.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!address.trim()) {
                      showToast("⚠️ Property Address is required to petition verification.");
                      return;
                    }
                    setIsSubmittingVerification(true);
                    
                    const payload = {
                      landlordName: userProfile.name,
                      phone: userProfile.phone,
                      address: address,
                      nationalId: nationalIdName ? `National ID: ${nationalIdName}` : "National ID Card - Submited PDF/Scan file",
                      ratesBill: ratesBillName ? `Municipal Bill: ${ratesBillName}` : "Rates Bill / Rates paper with matching names",
                      status: "pending"
                    };

                    // Simulate a pleasant compliance check duration
                    setTimeout(() => {
                      setVerifications(prev => [...prev.filter(v => v.phone !== userProfile.phone), payload]);
                      setVerificationStatus("pending");
                      showToast("🚀 Verification files uploaded! Our admins will approve your portal shortly.");
                      setIsSubmittingVerification(false);
                    }, 1000);
                  }} className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Secure BunkBy's <strong>Verified Landlord</strong> badge to enhance listing credibility. Provide your proof of address and identity below.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1 font-mono">Property Address</label>
                        <input
                          type="text"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="e.g. 77 Hillside Rd, Bulawayo"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-orange-500 font-medium text-slate-800"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1 font-mono">National ID Card</label>
                          <div className="flex flex-col gap-1.5">
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              id="id-file-upload"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setNationalIdName(e.target.files[0].name);
                                  showToast(`📂 Loaded ID document: ${e.target.files[0].name}`);
                                }
                              }}
                            />
                            <label
                              htmlFor="id-file-upload"
                              className="bg-slate-50 border border-dashed border-slate-200 rounded-xl py-3 px-4 text-center cursor-pointer hover:bg-slate-100 hover:border-slate-350 transition-all flex flex-col items-center justify-center gap-1"
                            >
                              <span className="text-base select-none">🪪</span>
                              <span className="text-[10px] font-bold text-slate-600 max-w-[120px] truncate">
                                {nationalIdName || "Upload ID Document"}
                              </span>
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1 font-mono">Rates bill paper</label>
                          <div className="flex flex-col gap-1.5">
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              id="bill-file-upload"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setRatesBillName(e.target.files[0].name);
                                  showToast(`📂 Loaded Rates Bill statement: ${e.target.files[0].name}`);
                                }
                              }}
                            />
                            <label
                              htmlFor="bill-file-upload"
                              className="bg-slate-50 border border-dashed border-slate-200 rounded-xl py-3 px-4 text-center cursor-pointer hover:bg-slate-100 hover:border-slate-350 transition-all flex flex-col items-center justify-center gap-1"
                            >
                              <span className="text-base select-none">🧾</span>
                              <span className="text-[10px] font-bold text-slate-600 max-w-[120px] truncate">
                                {ratesBillName || "Upload Rates Sheet"}
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingVerification}
                      className="w-full bg-[#052659] hover:bg-[#021024] text-white py-2.5 rounded-xl font-bold transition-all text-xs shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <span>{isSubmittingVerification ? "Uploading Files..." : "Submit Verification Papers"}</span>
                    </button>
                  </form>
                )}
              </div>

              {/* WhatsApp Integration status block */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">WhatsApp Integration</h3>
                  <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    LINKED LIVE
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Receive prompt notifications of rental interest matches and tenant inquiries directly on your WhatsApp line. You can manage or delist your active properties anytime with a quick message!
                </p>
                
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-700 font-mono uppercase">Change Linked WhatsApp Number</p>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={userProfile.phone}
                      onChange={(e) => setUserProfile({ ...userProfile, phone: e.target.value })}
                      className="bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-orange-500 text-slate-800" 
                    />
                    <button 
                      onClick={() => {
                        showToast("✨ Linked WhatsApp credentials saved.");
                      }}
                      className="bg-[#052659] hover:bg-[#021024] text-white font-bold text-xs py-2 px-4 rounded-lg transition-all shadow-sm"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>

              {/* Administrative Access Console */}
              {userProfile.role === "Admin" && (
                <div id="admin-access-panel" className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-5 shadow-sm space-y-5 scroll-mt-24">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-orange-500" />
                        <h3 className="text-sm font-bold text-[#052659] font-mono uppercase tracking-wide">Administrator Access Panel</h3>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Moderate reported listings, manage visibility across website &amp; WhatsApp searches, verify landlords, and inspect database entries.
                      </p>
                    </div>

                    {/* Admin Section Navigation */}
                    <div className="flex flex-wrap gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setAdminSubTab("reports")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                          adminSubTab === "reports"
                            ? "bg-[#052659] text-white shadow-xs"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-[#FF7A00]" />
                        <span>Listing Reports</span>
                        {adminOpenReportsCount > 0 && (
                          <span className="bg-red-600 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                            {adminOpenReportsCount}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminSubTab("landlords")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          adminSubTab === "landlords"
                            ? "bg-[#052659] text-white shadow-xs"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        Landlords ({allLandlords.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminSubTab("listings")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          adminSubTab === "listings"
                            ? "bg-[#052659] text-white shadow-xs"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        All Listings ({adminListings.length > 0 ? adminListings.length : listings.length})
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-white p-3 rounded-xl border border-orange-100 text-center">
                      <span className="text-[9px] font-mono text-slate-400 uppercase block">Active Feed Listings</span>
                      <span className="text-lg font-black text-slate-950">{listings.length} Listings</span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-orange-100 text-center">
                      <span className="text-[9px] font-mono text-slate-400 uppercase block">Registered Landlords</span>
                      <span className="text-lg font-black text-slate-950">{allLandlords.length} Landlords</span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-orange-100 text-center col-span-2 md:col-span-1">
                      <span className="text-[9px] font-mono text-slate-400 uppercase block">Open Reports Queue</span>
                      <span className="text-lg font-black text-orange-600">{adminOpenReportsCount} Open</span>
                    </div>
                  </div>

                  {adminSubTab === "reports" && (
                    <AdminReportsPanel
                      authToken={userProfile?.token || ""}
                      showToast={showToast}
                      onModerationComplete={async () => {
                        try {
                          const [pubRes, admRes] = await Promise.all([
                            fetch("/api/listings", { headers: { Accept: "application/json" } }),
                            userProfile?.token
                              ? fetch("/api/admin", {
                                  headers: {
                                    Accept: "application/json",
                                    "x-landlord-token": userProfile.token,
                                  },
                                })
                              : Promise.resolve(null),
                          ]);
                          if (pubRes.ok) {
                            const pubData = await pubRes.json();
                            if (Array.isArray(pubData.listings)) {
                              setListings(pubData.listings);
                              try {
                                sessionStorage.setItem("bunkby_listings_v1", JSON.stringify(pubData.listings));
                              } catch {}
                            }
                          }
                          if (admRes && admRes.ok) {
                            const admData = await admRes.json();
                            if (Array.isArray(admData.listings)) setAdminListings(admData.listings);
                            if (Array.isArray(admData.landlords)) setAllLandlords(admData.landlords);
                            if (Array.isArray(admData.reports)) {
                              setAdminOpenReportsCount(
                                admData.reports.filter((r: any) => r.status === "pending" || r.status === "under_review").length
                              );
                            }
                          }
                        } catch (_) {}
                      }}
                    />
                  )}

                  {/* Landlords Management Table */}
                  {adminSubTab === "landlords" && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-slate-800">Manage Landlords</h4>
                    <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl -mx-1 sm:mx-0 shadow-2xs">
                      <table className="w-full min-w-[500px] text-left text-xs align-middle">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-mono text-[9px]">
                          <tr>
                            <th className="px-4 py-3">ID / Name</th>
                            <th className="px-4 py-3">Phone</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {allLandlords.map((landlord: any) => (
                            <tr key={landlord.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-800">{landlord.full_name || landlord.name}</td>
                              <td className="px-4 py-3 font-mono text-slate-600">{landlord.id}</td>
                              <td className="px-4 py-3">
                                {landlord.verification_status === "verified" || landlord.isVerified ? (
                                  <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase tracking-wider">Verified</span>
                                ) : (
                                  <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-[9px] font-bold uppercase tracking-wider">{landlord.verification_status || "Pending"}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 space-x-2">
                                {(landlord.verification_status !== "verified" && landlord.verification_status !== "admin" && !landlord.isVerified) && (
                                  <button onClick={async () => {
                                    try {
                                      const res = await fetch("/api/admin", { 
                                        method: 'POST', 
                                        headers: { 
                                          'Content-Type': 'application/json',
                                          'x-landlord-token': userProfile?.token || ''
                                        }, 
                                        body: JSON.stringify({ action: 'verify', id: landlord.id }) 
                                      });
                                      if (res.ok) {
                                        showToast("✅ Landlord verified successfully.");
                                        setAllLandlords(prev => prev.map(l => l.id === landlord.id ? { ...l, verification_status: 'verified', isVerified: true } : l));
                                      }
                                    } catch(e) { console.error(e); }
                                  }} className="bg-emerald-50 text-emerald-600 font-medium px-2 py-1 rounded border border-emerald-200">Verify</button>
                                )}
                                <button onClick={async () => {
                                    try {
                                      const res = await fetch("/api/admin", { 
                                        method: 'POST', 
                                        headers: { 
                                          'Content-Type': 'application/json',
                                          'x-landlord-token': userProfile?.token || ''
                                        }, 
                                        body: JSON.stringify({ action: 'deleteLandlord', id: landlord.id }) 
                                      });
                                      if (res.ok) {
                                        showToast("✅ Landlord deleted.");
                                        setAllLandlords(prev => prev.filter(l => l.id !== landlord.id));
                                      }
                                    } catch(e) { console.error(e); }
                                }} className="bg-red-50 text-red-600 font-medium px-2 py-1 rounded border border-red-200">Delete</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}

                  {/* Listings Management Table */}
                  {adminSubTab === "listings" && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-slate-800">Manage All Listings (Including Hidden &amp; Removed)</h4>
                    <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl -mx-1 sm:mx-0 shadow-2xs">
                      <table className="w-full min-w-[600px] text-left text-xs align-middle">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-mono text-[9px]">
                          <tr>
                            <th className="px-4 py-3">ID / Title</th>
                            <th className="px-4 py-3">City / Suburb</th>
                            <th className="px-4 py-3">Price</th>
                            <th className="px-4 py-3">Visibility</th>
                            <th className="px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(adminListings.length > 0 ? adminListings : listings).map((list: any) => {
                            const curStatus = list.verification_status || list.status || "Active";
                            return (
                            <tr key={list.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-800">
                                <span className="font-mono text-[10px] text-slate-400 mr-1.5">#{list.id}</span>
                                {list.title}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{list.city}, {list.suburb}</td>
                              <td className="px-4 py-3 font-mono text-sky-700 font-bold">${list.price}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  curStatus === "Hidden" ? "bg-amber-100 text-amber-800" :
                                  curStatus === "Removed" ? "bg-red-100 text-red-800" :
                                  curStatus === "Delisted" ? "bg-slate-200 text-slate-700" :
                                  "bg-emerald-100 text-emerald-800"
                                }`}>{curStatus}</span>
                              </td>
                              <td className="px-4 py-3 space-x-1.5 whitespace-nowrap">
                                {(curStatus === "Hidden" || curStatus === "Removed") ? (
                                  <button onClick={async () => {
                                    const res = await fetch(`/api/admin/listings/${list.id}/moderate`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json", "x-landlord-token": userProfile?.token || "" },
                                      body: JSON.stringify({ action: "restore_listing", notes: "Restored from All Listings view" }),
                                    });
                                    if (res.ok) {
                                      showToast("🔄 Listing restored.");
                                      const data = await res.json();
                                      setAdminListings(prev => prev.map(l => l.id === list.id ? { ...l, verification_status: data.newListingStatus } : l));
                                      try {
                                        const pubRes = await fetch("/api/listings", { headers: { Accept: "application/json" } });
                                        if (pubRes.ok) {
                                          const pubData = await pubRes.json();
                                          if (Array.isArray(pubData.listings)) setListings(pubData.listings);
                                        }
                                      } catch (_) {}
                                    }
                                  }} className="bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded border border-emerald-200 cursor-pointer">Restore</button>
                                ) : (
                                  <button onClick={async () => {
                                    const res = await fetch(`/api/admin/listings/${list.id}/moderate`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json", "x-landlord-token": userProfile?.token || "" },
                                      body: JSON.stringify({ action: "hide_listing", notes: "Temporarily hidden from All Listings view" }),
                                    });
                                    if (res.ok) {
                                      showToast("🙈 Listing hidden.");
                                      setListings(prev => prev.filter(l => String(l.id) !== String(list.id)));
                                      setAdminListings(prev => prev.map(l => l.id === list.id ? { ...l, verification_status: "Hidden" } : l));
                                    }
                                  }} className="bg-amber-50 text-amber-800 font-bold px-2 py-1 rounded border border-amber-200 cursor-pointer">Hide</button>
                                )}
                                {curStatus !== "Removed" && (
                                  <button onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/admin/listings/${list.id}/moderate`, {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                            "x-landlord-token": userProfile?.token || "",
                                          },
                                          body: JSON.stringify({
                                            action: "remove_listing",
                                            notes: "Removed from All Listings admin view (report history preserved)",
                                          }),
                                        });
                                        if (res.ok) {
                                          showToast("🚫 Listing removed from website & WhatsApp search.");
                                          setListings(prev => prev.filter(l => String(l.id) !== String(list.id)));
                                          setAdminListings(prev => prev.map(l => String(l.id) === String(list.id) ? { ...l, verification_status: "Removed" } : l));
                                        }
                                      } catch(e) { console.error(e); }
                                  }} className="bg-red-50 text-red-600 font-medium px-2 py-1 rounded border border-red-200 cursor-pointer">Remove</button>
                                )}
                              </td>
                            </tr>
                          );})}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}

                </div>
              )}

            </div>
          )
        )}

        {/* TAB 5: HELP & GUIDES */}
        {currentPath === "/" && activeTab === "help" && (
          <div className="space-y-6 max-w-3xl mx-auto">
            
            {/* Help Header */}
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-2.5xl font-display font-black text-slate-950">Help & FAQ Center</h2>
              <p className="text-sm text-slate-500">Everything you need to know about browsing properties, listing spaces across Zimbabwe, and using the BunkBy WhatsApp assistant.</p>
            </div>

            {/* FAQ Item List */}
            <div className="space-y-4">
              
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold text-sky-700 text-sm">🏡 What is BunkBy?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  BunkBy is a Zimbabwean property and accommodation marketplace connecting seekers directly with landlords, hosts, and commercial property owners across residential rentals, hospitality stays, student accommodation, and commercial spaces without estate agent commissions.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold text-sky-700 text-sm">💬 How does the BunkBy WhatsApp assistant work?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Property seekers can search matching properties by city, suburb, category, or budget directly inside WhatsApp without leaving their chat app. Property owners and hosts can also submit and manage listings step by step on WhatsApp via +263 78 978 3200.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold text-sky-700 text-sm">⚠️ How do I shut down or flag my room as rented/occupied?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Head over to the **Landlords Portal** tab. Every room you place has an active checkout button to "Delist Room" which immediately hides it from the browse page listings. You can reactivate it anytime for free if the tenant leaves.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold text-sky-700 text-sm">🔒 How is my data and privacy protected on BunkBy?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  BunkBy adheres to strict data minimization. Landlord accounts are protected with secure 4-digit PINs, and accommodation seekers contact landlords directly via WhatsApp without middleman fees. We do not sell user data. You can view our comprehensive <a href="/privacy-policy" onClick={(e) => { e.preventDefault(); navigateTo("/privacy-policy"); }} className="text-[#FF7A00] font-bold underline">Official Privacy Policy</a> at any time.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold text-sky-700 text-sm">💸 How does BunkBy sustain itself?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  BunkBy offers free standard property listings for residential, student, hospitality, and commercial advertisers, alongside optional paid 30-day featured placements for businesses and property providers seeking extra visibility.
                </p>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-[#021024] text-white pt-3.5 sm:pt-6 border-t border-[#052659] mt-auto select-none shrink-0 text-left">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pb-3.5 sm:pb-6">
          {/* Brand Info */}
          <div className="max-w-2xl">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <BunkByLogo className="w-5 h-5 sm:w-7 sm:h-7 shrink-0" />
              <span className="text-[15px] sm:text-xl font-display font-black uppercase tracking-tight text-white leading-none">
                Bunk<span className="text-[#FF7A00]">By</span>
              </span>
            </div>
            <p className="text-[9.5px] sm:text-[11px] text-[#E2E8F0]/90 font-normal leading-snug sm:leading-relaxed mt-1.5 sm:mt-2">
              A Zimbabwean property and accommodation marketplace connecting seekers directly with landlords, hosts, and commercial property owners across residential rentals, hospitality stays, student accommodation, and commercial spaces.
            </p>
          </div>
        </div>

        {/* Bottom Copyright & Privacy Policy Strip */}
        <div className="bg-[#052659] py-2.5 sm:py-3.5 border-t border-[#052659]/50 text-left">
          <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 flex flex-row items-center justify-between gap-3 sm:gap-6">
            <p className="text-[8.5px] sm:text-[11px] text-slate-300 font-normal leading-tight min-w-0">
              © 2026 BunkBy. BunkBy is an accommodation marketplace operated by ATLAS MANICA GROUP LTD.
            </p>
            <a
              href="/privacy-policy"
              onClick={(e) => { e.preventDefault(); navigateTo("/privacy-policy"); }}
              className="text-[9.5px] sm:text-xs text-slate-200 hover:text-white underline underline-offset-2 transition-colors cursor-pointer whitespace-nowrap font-semibold shrink-0"
              id="footer-privacy-policy-link"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </footer>

      {/* MODAL DIALOG: CREATE OR EDIT ROOM LISTINGS */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-slate-950/65 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl sm:rounded-3xl pb-4 sm:pb-6 max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[94vh] flex flex-col"
            >
              
              {/* Modal header details */}
              <div className="bg-[#052659] text-white p-5 flex items-center justify-between shrink-0 select-none border-b border-[#052659]">
                <div className="flex items-center gap-2">
                  <BunkByLogo className="w-8 h-8" />
                  <h3 className="font-display font-black text-lg text-white">
                    {isEditing ? "Edit Room Specification" : "List Your Room For Free"}
                  </h3>
                </div>
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-[#021024] text-[#E2E8F0] hover:text-white"
                >
                  <X className="w-5 h-5 shrink-0" />
                </button>
              </div>

              {/* Form field listing details scrollable container */}
              <form onSubmit={handleSaveListing} className="p-6 overflow-y-auto space-y-5 text-left flex-grow">
                
                {/* Category Switcher */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Marketplace Category*</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setNewRoomForm(prev => ({ 
                        ...prev, 
                        category: "residential", 
                        propertyType: "Single Room", 
                        frequency: "Month", 
                        tenantType: "General" 
                      }))}
                      className={`p-2.5 sm:p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                        newRoomForm.category === "residential"
                          ? "border-[#021024] bg-[#021024] text-white shadow-sm"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Home className={`w-4 h-4 ${newRoomForm.category === "residential" ? "text-[#FF7A00]" : "text-slate-400"}`} />
                      <div>
                        <div className="text-xs font-bold leading-none">Residential</div>
                        <div className={`text-[9.5px] mt-1 ${newRoomForm.category === "residential" ? "text-slate-300" : "text-slate-400"}`}>Rooms & flats</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewRoomForm(prev => ({ 
                        ...prev, 
                        category: "hospitality", 
                        propertyType: "Lodge / Guesthouse", 
                        frequency: "Night", 
                        tenantType: "Guest",
                        deposit: 0
                      }))}
                      className={`p-2.5 sm:p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                        newRoomForm.category === "hospitality"
                          ? "border-[#052659] bg-[#052659] text-white shadow-sm"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Hotel className={`w-4 h-4 ${newRoomForm.category === "hospitality" ? "text-[#FF7A00]" : "text-slate-400"}`} />
                      <div>
                        <div className="text-xs font-bold leading-none">Hospitality</div>
                        <div className={`text-[9.5px] mt-1 ${newRoomForm.category === "hospitality" ? "text-[#E2E8F0]" : "text-slate-400"}`}>Lodges & stays</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewRoomForm(prev => ({ 
                        ...prev, 
                        category: "commercial", 
                        propertyType: "Commercial", 
                        frequency: "Month", 
                        tenantType: "Professional" 
                      }))}
                      className={`p-2.5 sm:p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                        newRoomForm.category === "commercial"
                          ? "border-[#052659] bg-[#052659] text-white shadow-sm"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Building2 className={`w-4 h-4 ${newRoomForm.category === "commercial" ? "text-[#FF7A00]" : "text-slate-400"}`} />
                      <div>
                        <div className="text-xs font-bold leading-none">Commercial</div>
                        <div className={`text-[9.5px] mt-1 ${newRoomForm.category === "commercial" ? "text-[#E2E8F0]" : "text-slate-400"}`}>Shops & spaces</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewRoomForm(prev => ({ 
                        ...prev, 
                        category: "student", 
                        propertyType: "Student Hostel", 
                        frequency: "Semester", 
                        tenantType: "Student" 
                      }))}
                      className={`p-2.5 sm:p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                        newRoomForm.category === "student"
                          ? "border-[#052659] bg-[#052659] text-white shadow-sm"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <GraduationCap className={`w-4 h-4 ${newRoomForm.category === "student" ? "text-[#FF7A00]" : "text-slate-400"}`} />
                      <div>
                        <div className="text-xs font-bold leading-none">Student Accom.</div>
                        <div className={`text-[9.5px] mt-1 ${newRoomForm.category === "student" ? "text-[#E2E8F0]" : "text-slate-400"}`}>Hostels & boarding</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Business Name for Hospitality */}
                {newRoomForm.category === "hospitality" && (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-xs font-bold text-[#052659] uppercase tracking-wide flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Business / Establishment Name*</span>
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. Cresta Lodge Harare or Highlands Villa Suites"
                      required
                      value={newRoomForm.business_name || ""}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, business_name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#052659]/30 bg-blue-50/30 text-xs font-medium focus:ring-1 focus:ring-[#052659] focus:outline-none"
                    />
                  </div>
                )}

                {/* Heading details */}
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Property / Listing Title*</label>
                  <input 
                    type="text" 
                    placeholder={
                      newRoomForm.category === "hospitality"
                        ? "e.g. Deluxe Double Room with En-Suite & Breakfast"
                        : newRoomForm.category === "commercial"
                        ? "e.g. Prime Corner Retail Shop on First Street"
                        : newRoomForm.category === "student"
                        ? "e.g. Fully Furnished 2-Sleeper Student Room near UZ Gate"
                        : "e.g. Elegant Single Room with Tiled Floors"
                    }
                    required
                    value={newRoomForm.title}
                    onChange={(e) => setNewRoomForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-[#052659] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* City selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Town / City*</label>
                    <select
                      value={newRoomForm.city}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, city: e.target.value }))}
                      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50 focus:outline-none focus:ring-1 cursor-pointer"
                    >
                      {ALL_ZIM_CITIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Suburb name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Suburb Name*</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Avonlea / Khumalo"
                      required
                      value={newRoomForm.suburb}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, suburb: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-[#052659] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Suburb detailed landmark description text info */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Landmark Description / Street address*</label>
                  <input 
                    type="text" 
                    placeholder="e.g. just behind the park along Schleifen street"
                    required
                    value={newRoomForm.landmark}
                    onChange={(e) => setNewRoomForm(prev => ({ ...prev, landmark: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-[#052659] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Price USD */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      {newRoomForm.category === "hospitality" 
                        ? "Nightly Rate (USD)*" 
                        : newRoomForm.category === "student" 
                        ? (newRoomForm.frequency === "Semester" ? "Semester Rate (USD)*" : "Monthly Rent (USD)*")
                        : "Monthly Rent (USD)*"}
                    </label>
                    <input 
                      type="number" 
                      required
                      min={0}
                      value={newRoomForm.price}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, price: Number(e.target.value) }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-[#052659] focus:outline-none"
                    />
                  </div>

                  {/* Deposit Price */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      {newRoomForm.category === "hospitality" ? "Damage Deposit (USD - Optional)" : "Deposit (USD)"}
                    </label>
                    <input 
                      type="number" 
                      min={0}
                      value={newRoomForm.deposit}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, deposit: Number(e.target.value) }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-[#052659] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Property types list selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Property Type</label>
                    <select
                      value={newRoomForm.propertyType}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, propertyType: e.target.value as PropertyType }))}
                      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50 focus:outline-none cursor-pointer"
                    >
                      {newRoomForm.category === "hospitality" 
                        ? HOSPITALITY_PROPERTY_TYPES.map(pt => (
                            <option key={pt} value={pt}>{pt}</option>
                          ))
                        : newRoomForm.category === "commercial"
                        ? COMMERCIAL_PROPERTY_TYPES.map(pt => (
                            <option key={pt} value={pt}>{pt}</option>
                          ))
                        : newRoomForm.category === "student"
                        ? STUDENT_PROPERTY_TYPES.map(pt => (
                            <option key={pt} value={pt}>{pt}</option>
                          ))
                        : RESIDENTIAL_PROPERTY_TYPES.map(pt => (
                            <option key={pt} value={pt}>{pt}</option>
                          ))
                      }
                    </select>
                  </div>

                  {/* Tenant seeks selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      {newRoomForm.category === "hospitality" 
                        ? "Guest Audience" 
                        : newRoomForm.category === "student"
                        ? "Student Occupancy"
                        : newRoomForm.category === "commercial"
                        ? "Target Tenant"
                        : "Preferred Tenant Type"}
                    </label>
                    <select
                      value={newRoomForm.tenantType}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, tenantType: e.target.value as TenantType }))}
                      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50 focus:outline-none cursor-pointer"
                    >
                      {newRoomForm.category === "hospitality" ? (
                        <>
                          <option value="Guest">Guests / Travelers</option>
                          <option value="General">General Travelers</option>
                        </>
                      ) : newRoomForm.category === "student" ? (
                        <>
                          <option value="Student">Students Only (Hostel / Boarding)</option>
                        </>
                      ) : newRoomForm.category === "commercial" ? (
                        <>
                          <option value="Professional">Business / Enterprise / Merchant</option>
                          <option value="General">General Commercial</option>
                        </>
                      ) : (
                        <>
                          <option value="General">General Sought</option>
                          <option value="Single">Single Professional</option>
                          <option value="Family">Family Sought</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Rent Frequency */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Rent / Rate Cycle</label>
                    <select
                      value={newRoomForm.frequency}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, frequency: e.target.value as RentFrequency }))}
                      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50 focus:outline-none cursor-pointer"
                    >
                      {newRoomForm.category === "student" ? (
                        <>
                          <option value="Semester">Per Semester (Standard Term)</option>
                          <option value="Month">Per Month</option>
                        </>
                      ) : newRoomForm.category === "hospitality" ? (
                        <>
                          <option value="Night">Per Night</option>
                          <option value="Month">Per Month (Extended Stay)</option>
                          <option value="Hour">Per Hour</option>
                        </>
                      ) : newRoomForm.category === "commercial" ? (
                        <>
                          <option value="Month">Per Month</option>
                        </>
                      ) : (
                        <>
                          <option value="Month">Per Month</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Contact Method */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Contact Method</label>
                    <select
                      value={newRoomForm.contactMethod}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, contactMethod: e.target.value as ContactMethod }))}
                      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50 focus:outline-none cursor-pointer"
                    >
                      <option value="Call / Whatsapp">Call / Whatsapp</option>
                      <option value="Whatsapp">Whatsapp Only</option>
                      <option value="Call">Call Only</option>
                    </select>
                  </div>
                </div>

                {/* Real Landlord Pictures and Live Camera Snapping Module */}
                <div className="space-y-3 bg-slate-50 border border-slate-200/80 p-4 rounded-2xl">
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">Room Photos (Select Up To 3)</label>
                    <p className="text-[10px] text-slate-400 font-medium">Add real property photos to attract renters, or use fallback draft images below.</p>
                  </div>

                  {/* Pictures Preview Grid */}
                  <div className="grid grid-cols-2 gap-3 mt-1.5">
                    {uploadedImages.map((img, index) => (
                      <div key={index} className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shadow-sm group">
                        <img src={img} className="w-full h-full object-cover" />
                        <div className="absolute top-1.5 right-1.5">
                          <button 
                            type="button" 
                            onClick={() => removeUploadedImage(index)}
                            className="bg-red-600 hover:bg-red-700 text-white rounded-lg p-1.5 transition-all shadow cursor-pointer focus:outline-none"
                            title="Remove picture"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="absolute bottom-1.5 left-1.5 bg-sky-950/70 border border-sky-800/40 text-white text-[8px] font-bold font-mono px-2 py-0.5 rounded-md uppercase shrink-0">
                          Photo #{index + 1}
                        </div>
                      </div>
                    ))}

                    {/* Upload Slot Placeholder */}
                    {uploadedImages.length < 3 && !cameraActive && (
                      <div className="border-2 border-dashed border-slate-300 rounded-xl aspect-video flex flex-col items-center justify-center p-3 text-center bg-white hover:bg-slate-50 transition-all cursor-pointer relative">
                        <Upload className="w-5 h-5 text-slate-400 mb-1" />
                        <span className="text-[10px] font-bold text-slate-500">Device Upload</span>
                        <span className="text-[8px] text-slate-400 font-medium font-mono mt-0.5">JPG / PNG files</span>
                        <input 
                          type="file" 
                          multiple 
                          accept="image/*" 
                          onChange={handleFileUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>

                  {/* Camera snapping view */}
                  {cameraActive ? (
                    <div className="border border-slate-300 rounded-xl overflow-hidden bg-[#052659] aspect-video relative flex flex-col items-center justify-center">
                      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-3 px-4">
                        <button 
                          type="button" 
                          onClick={capturePhoto}
                          className="bg-orange-500 hover:bg-orange-600 border border-orange-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow flex items-center gap-1 cursor-pointer focus:outline-none"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Snap Photo</span>
                        </button>
                        <button 
                          type="button" 
                          onClick={stopCamera}
                          className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow cursor-pointer focus:outline-none"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    uploadedImages.length < 3 && (
                      <div className="flex gap-2">
                        <button 
                          type="button" 
                          onClick={startCamera}
                          className="flex-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold py-2 px-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer outline-none"
                        >
                          <Camera className="w-4 h-4 text-orange-500" />
                          <span>Take Picture with Camera</span>
                        </button>
                      </div>
                    )
                  )}

                  {/* Fallback presets if no photos uploaded */}
                  {uploadedImages.length === 0 && (
                    <div className="space-y-1 pt-1.5 border-t border-slate-200/60 mt-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Or select fallback draft image</label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {DEFAULT_ROOM_IMAGES.map((img, index) => (
                          <div 
                            key={index}
                            onClick={() => setNewRoomForm(prev => ({ ...prev, imageUrl: img }))}
                            className={`border rounded-xl h-10 w-full cursor-pointer overflow-hidden transition-all relative ${newRoomForm.imageUrl === img ? "border-orange-500 ring-2 ring-orange-500/10 scale-95" : "border-slate-200 hover:opacity-85"}`}
                          >
                            <img src={img} alt="Bedroom Draft" className="h-full w-full object-cover" />
                            {newRoomForm.imageUrl === img && (
                              <div className="absolute inset-0 bg-sky-950/45 flex items-center justify-center">
                                <span className="text-[8px] font-mono font-bold text-white uppercase bg-orange-500 px-1 py-0.5 rounded leading-none">Active</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Amenities checklist checkboxes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Room Amenities checklist</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {ALL_AMENITIES.map((amenity) => (
                      <label key={amenity} className="flex items-center gap-2 cursor-pointer text-slate-700 bg-slate-50 hover:bg-slate-100 p-2 rounded-xl border border-slate-200/60 font-semibold select-none">
                        <input 
                          type="checkbox" 
                          checked={newRoomForm.amenities.includes(amenity)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewRoomForm(prev => ({ ...prev, amenities: [...prev.amenities, amenity] }));
                            } else {
                              setNewRoomForm(prev => ({ ...prev, amenities: prev.amenities.filter(a => a !== amenity) }));
                            }
                          }}
                          className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500/10 cursor-pointer"
                        />
                        <span>{amenity}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Contact Landlord Details */}
                <div className="grid grid-cols-2 gap-4 bg-sky-500/5 rounded-2xl p-4 border border-blue-200/40">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-sky-850 uppercase tracking-wide">Landlord Name</label>
                    <input 
                      type="text" 
                      required
                      value={newRoomForm.landlordName}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, landlordName: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-sky-850 uppercase tracking-wide">WhatsApp / Call Line</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. 0773043376"
                      value={newRoomForm.phone}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Submittal visual */}
                <div className="pt-4 flex gap-3 shrink-0">
                  <button 
                    type="button" 
                    onClick={() => setIsCreateModalOpen(false)}
                    className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl text-sm transition-all text-center select-none cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isPublishing}
                    className="w-1/2 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-2xl text-sm shadow-md transition-all text-center select-none cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isPublishing ? (
                      <div className="flex items-center gap-1.5 justify-center py-1">
                        <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      isEditing ? "Save Specifications" : "Publish Free Listing"
                    )}
                  </button>
                </div>

              </form>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SOFT GATE MODAL: CAPTURE RENTER DETAILS BEFORE CONNECTING WHATSAPP */}
      <AnimatePresence>
        {isSoftGateOpen && pendingContactRoom && (
          <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center z-50 p-4 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-sm w-full border border-slate-100 shadow-2xl space-y-3.5 sm:space-y-4 text-left"
            >
              <div className="text-center space-y-1 relative pb-2 border-b border-slate-100">
                <span className="inline-block bg-orange-100 text-orange-600 font-mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  ⚠️ Direct Landlord Connection
                </span>
                <h3 className="font-display font-black text-lg text-slate-800">
                  Connect with Landlord
                </h3>
                <p className="text-xs text-slate-500 leading-snug">
                  You are connecting directly with <strong>{pendingContactRoom.landlordName}</strong>. Enter your details to open direct WhatsApp chat.
                </p>
                <button
                  onClick={() => {
                    setIsSoftGateOpen(false);
                    setPendingContactRoom(null);
                  }}
                  className="absolute top-0 right-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Recipient listing preview */}
              <div className="bg-slate-50 rounded-2xl p-2.5 flex gap-3 border border-slate-100 shrink-0 select-none">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-200 shrink-0 flex items-center justify-center">
                  {(pendingContactRoom.image_url || (pendingContactRoom.images && pendingContactRoom.images[0])) ? (
                    <img
                      src={getPrimaryListingPhoto(pendingContactRoom)}
                      alt={pendingContactRoom.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                     <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">No Img</span>
                  )}
                </div>
                <div className="my-auto">
                  <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{pendingContactRoom.title}</h4>
                  <p className="text-[10px] text-slate-500 font-medium">{pendingContactRoom.city}, {pendingContactRoom.suburb}</p>
                  <p className="text-xs font-bold text-sky-700 mt-0.5">${pendingContactRoom.price}/{pendingContactRoom.frequency}</p>
                </div>
              </div>

              <form onSubmit={handleProceedToWhatsApp} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    value={softGateName}
                    onChange={(e) => setSoftGateName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-orange-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">WhatsApp / Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={softGatePhone}
                    onChange={(e) => setSoftGatePhone(e.target.value)}
                    placeholder="e.g. 0782334466"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs font-mono font-medium focus:ring-1 focus:ring-orange-500 focus:outline-none"
                  />
                </div>

                <div className="pt-1 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSoftGateOpen(false);
                      setPendingContactRoom(null);
                    }}
                    className="w-1/3 bg-slate-50 hover:bg-slate-100 text-slate-500 font-bold py-3 rounded-2xl text-xs transition-all text-center border border-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-2/3 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-2xl text-xs shadow-md transition-all text-center flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Proceed to WhatsApp</span>
                    <span>→</span>
                  </button>
                </div>
              </form>

              <p className="text-[10px] text-center text-slate-400">
                🔒 BunkBy matches you direct. Your info verifies listing metrics.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PREMIUM LISTING BILLING MODAL: SIMULATE THE ECO-CASH / INN-BUCKS $5 USD MONTHLY PAYMENT */}
      <AnimatePresence>
        {isBillingModalOpen && billingListingForm && (
          <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center z-50 p-4 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-sm w-full border border-slate-100 shadow-2xl space-y-3.5 sm:space-y-4 text-left"
            >
              <div className="text-center space-y-1 relative pb-2 border-b border-slate-100">
                <span className="inline-block bg-amber-100 text-amber-700 font-mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                  💰 Premium Listing Payment Required
                </span>
                <h3 className="font-display font-black text-lg text-slate-800">
                  BunkBy Billing Hub
                </h3>
                <p className="text-xs text-slate-500 leading-snug">
                  Commercial formats (lodges, guesthouses, boarding houses, house sales) incur a small <strong>$5 USD standard listing fee</strong> for 30 days. No agents, directly to renters!
                </p>
                <button
                  onClick={() => {
                    setIsBillingModalOpen(false);
                    setBillingListingForm(null);
                  }}
                  className="absolute top-0 right-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Order recap */}
              <div className="bg-sky-500/5 rounded-2xl p-3 border border-blue-200/40 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-700">30-Day Premium Publication</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Type: {billingListingForm.propertyType}</p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-sky-700 font-mono">$5.00</span>
                  <span className="text-[10px] text-slate-400 block font-mono">USD</span>
                </div>
              </div>

              {/* Provider Selection */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Select Payment Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBillingProvider("EcoCash")}
                    className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      billingProvider === "EcoCash"
                        ? "border-orange-500 bg-orange-50/50 text-orange-600 font-bold"
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    <span className="text-sm">📲 EcoCash</span>
                    <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono">Mobile Money</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBillingProvider("InnBucks")}
                    className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      billingProvider === "InnBucks"
                        ? "border-sky-500 bg-sky-50 text-sky-700 font-bold"
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    <span className="text-sm">💸 InnBucks</span>
                    <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono">In-store / App</span>
                  </button>
                </div>
              </div>

              {/* payment inputs */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    {billingProvider} Mobile Number
                  </label>
                  <input
                    type="text"
                    required
                    value={billingPhone}
                    onChange={(e) => setBillingPhone(e.target.value)}
                    placeholder="e.g. 0773043376"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs font-mono font-medium focus:ring-1 focus:ring-orange-500 focus:outline-none"
                  />
                  <p className="text-[9px] text-slate-400 mt-1 pl-1">
                    A secure checkout PIN prompt will be dispatched to this mobile phone check line.
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-1">
                {isPaying ? (
                  <button
                    type="button"
                    disabled
                    className="w-full bg-slate-100 border text-slate-500 font-semibold py-3 px-3 rounded-2xl text-xs flex items-center justify-center gap-2.5"
                  >
                    <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    <span>Confirming mobile monetary transfer ($5)...</span>
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsBillingModalOpen(false);
                        setBillingListingForm(null);
                      }}
                      className="w-1/3 bg-slate-50 hover:bg-slate-100 text-slate-500 font-bold py-3 px-2 rounded-2xl text-xs transition-all text-center border border-slate-200 cursor-pointer"
                    >
                      Cancel Listing
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!billingPhone) {
                          showToast("⚠️ Enter your payment phone lines!");
                          return;
                        }
                        setIsPaying(true);
                        setTimeout(() => {
                          setIsPaying(false);
                          // Complete listing!
                          executeSaveListing(billingListingForm, true);
                        }, 2000);
                      }}
                      className="w-2/3 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-2xl text-xs shadow-lg shadow-orange-500/15 transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Authorize Payment</span>
                      <span className="font-mono text-[9px] font-bold bg-white/20 px-1.5 py-0.5 rounded">$5.00</span>
                    </button>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-center text-slate-400">
                ⭐ Upon approval, your featured listing remains active and searchable in the BunkBy directory for 30 calendar days.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ACCOMMODATION DETAIL VIEW MODAL */}
      <AnimatePresence>
        {selectedListingDetail && (
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[94vh] flex flex-col my-auto"
            >
              {/* Modal Header */}
              <div className="bg-[#021024] text-white p-4 sm:p-5 flex items-center justify-between shrink-0 border-b border-[#052659]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                    <Building className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <h3 className="font-display font-black text-base sm:text-lg text-white leading-tight">
                      {selectedListingDetail.title}
                    </h3>
                    <p className="text-xs text-slate-300 font-mono">
                      {selectedListingDetail.city}, {selectedListingDetail.suburb}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedListingDetail(null)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-5 h-5 shrink-0" />
                </button>
              </div>

              {/* Scrollable Modal Content */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 text-left flex-grow">
                {/* Photo Gallery with Thumbnail Switcher */}
                {(() => {
                  const photos = (() => {
                    if (selectedListingDetail.images && selectedListingDetail.images.length > 0) {
                      return selectedListingDetail.images;
                    }
                    const raw = String(selectedListingDetail.image_url || "").trim();
                    if (raw.startsWith("[")) {
                      try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                      } catch (_) {}
                    }
                    return raw ? [raw] : [];
                  })();
                  const activePhoto = photos[detailActivePhotoIdx] || photos[0];

                  return (
                    <div className="space-y-2">
                      <div className="relative aspect-16/10 sm:aspect-video rounded-xl sm:rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shadow-xs flex items-center justify-center">
                        {activePhoto ? (
                          <img
                            src={activePhoto}
                            alt={selectedListingDetail.title}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="text-slate-400 font-mono text-xs font-bold uppercase tracking-widest">
                            No photograph provided
                          </div>
                        )}
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                          {(() => {
                            const catInfo = getListingCategoryInfo(selectedListingDetail);
                            const IconComponent = catInfo.icon;
                            return (
                              <span className={`${catInfo.bgClass} font-bold text-[9px] tracking-wide uppercase px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm border ${catInfo.badgeBorder}`}>
                                <IconComponent className="w-2.5 h-2.5 text-[#FF7A00] shrink-0" />
                                <span>{catInfo.label}</span>
                              </span>
                            );
                          })()}
                          {selectedListingDetail.isSample && (
                            <span className="bg-amber-500 text-white font-mono font-bold text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                              Sample Listing
                            </span>
                          )}
                          <span className="bg-white/95 text-[#052659] border border-slate-200/90 font-mono font-extrabold text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                            {selectedListingDetail.propertyType}
                          </span>
                        </div>
                      </div>

                      {photos.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto py-1">
                          {photos.map((p, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setDetailActivePhotoIdx(idx)}
                              className={`relative w-20 h-14 rounded-xl overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                                detailActivePhotoIdx === idx ? "border-orange-500 ring-2 ring-orange-500/20" : "border-slate-200 hover:opacity-80"
                              }`}
                            >
                              <img src={p} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Key Pricing & Category Highlights */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono font-bold tracking-wider block">
                      {(selectedListingDetail.category === "hospitality" || ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(selectedListingDetail.propertyType))
                        ? "Accommodation Rate"
                        : "Rental Price"}
                    </span>
                    <div className="text-2xl sm:text-3xl font-display font-black text-slate-900">
                      ${selectedListingDetail.price}{" "}
                      <span className="text-xs font-bold text-slate-500 font-mono">
                        /{selectedListingDetail.frequency}
                      </span>
                    </div>
                    {selectedListingDetail.deposit > 0 ? (
                      <span className="text-xs text-slate-500 font-mono">Deposit: ${selectedListingDetail.deposit}</span>
                    ) : (
                      <span className="text-xs text-emerald-600 font-mono font-bold">No Deposit Required</span>
                    )}
                  </div>

                  <div className="text-right space-y-1">
                    <span className="inline-block bg-[#052659] text-white font-bold text-xs px-3 py-1 rounded-full">
                      {(selectedListingDetail.category === "hospitality" || ["Lodge / Guesthouse", "Hotel", "Lodge", "Guesthouse", "Bed & Breakfast"].includes(selectedListingDetail.propertyType))
                        ? "🏨 Hospitality / Lodge Stay"
                        : "🏡 Residential Housing"}
                    </span>
                    <div className="text-xs text-slate-500 font-mono">
                      Status: <strong className="text-emerald-600">{selectedListingDetail.status || "Active"}</strong>
                    </div>
                  </div>
                </div>

                {/* Location & Landmark */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Location & Landmark</h4>
                  <div className="flex items-start gap-2 text-slate-700 text-sm font-semibold">
                    <MapPin className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                    <div>
                      <span>{selectedListingDetail.city}, {selectedListingDetail.suburb}</span>
                      {selectedListingDetail.landmark && (
                        <p className="text-xs text-slate-500 font-normal italic mt-0.5">
                          Landmark: "{selectedListingDetail.landmark}"
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description, if provided */}
                {selectedListingDetail.description && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Description</h4>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      {selectedListingDetail.description}
                    </p>
                  </div>
                )}

                {/* Amenities */}
                {selectedListingDetail.amenities && selectedListingDetail.amenities.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Included Amenities</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedListingDetail.amenities.map((amenity: string, idx: number) => (
                        <span
                          key={idx}
                          className="text-xs font-semibold py-1 px-3 rounded-xl bg-sky-50 text-sky-800 border border-sky-100 flex items-center gap-1.5"
                        >
                          <CheckCircle className="w-3.5 h-3.5 text-sky-600" />
                          <span>{amenity}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Advertiser & Verification Details */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase font-mono tracking-wide">
                    Advertiser Information
                  </h4>
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div>
                      <p className="font-bold text-slate-800">
                        {selectedListingDetail.business_name || selectedListingDetail.businessName || selectedListingDetail.landlordName}
                      </p>
                      <p className="text-slate-500 font-mono text-[11px]">
                        Preferred contact: {selectedListingDetail.contactMethod || "Call / WhatsApp"}
                      </p>
                    </div>
                    {selectedListingDetail.isVerifiedLandlord ? (
                      <span className="bg-emerald-100 text-emerald-800 font-bold uppercase text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 font-mono">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Verified Advertiser</span>
                      </span>
                    ) : (
                      <span className="bg-slate-200 text-slate-600 font-medium text-[10px] px-2.5 py-1 rounded-full font-mono">
                        Advertiser info provided · Not audited
                      </span>
                    )}
                  </div>
                </div>

                {/* Trust Notice & Reporting */}
                <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="text-amber-800 leading-snug">
                    <span className="font-bold">Trust & Safety:</span> BunkBy is an open marketplace. Never send money or deposits without inspecting the property in person.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReportingListing(selectedListingDetail);
                      setIsReportModalOpen(true);
                    }}
                    className="shrink-0 text-red-600 hover:text-red-700 hover:underline font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Report Listing</span>
                  </button>
                </div>

                {/* Primary Action Button */}
                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedListingDetail(null)}
                    className="sm:w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-2xl text-xs transition-all text-center cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const room = selectedListingDetail;
                      setSelectedListingDetail(null);
                      handleContactLandlord(room);
                    }}
                    className="sm:w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-6 rounded-2xl text-sm shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Phone className="w-4 h-4 fill-white/20" />
                    <span>Inquire with Advertiser via WhatsApp</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* REPORT SUSPICIOUS LISTING MODAL */}
      <AnimatePresence>
        {isReportModalOpen && reportingListing && (
          <div className="fixed inset-0 bg-slate-950/75 flex items-center justify-center z-55 p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 text-left font-sans my-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <h3 className="font-display font-black text-base text-slate-900">Report Listing</h3>
                </div>
                <button
                  onClick={() => {
                    setIsReportModalOpen(false);
                    setReportingListing(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-0.5">
                <p className="font-bold text-slate-800">{reportingListing.title}</p>
                <p className="text-slate-500">{reportingListing.city}, {reportingListing.suburb} • ${reportingListing.price}/{reportingListing.frequency}</p>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setIsSubmittingReport(true);
                  try {
                    let reporterToken = "";
                    try {
                      const cookieMatch = document.cookie.match(/(?:^|;\s*)bunkby_reporter_token=([^;]+)/);
                      const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : "";
                      const storedToken = localStorage.getItem("bunkby_reporter_token") || "";
                      reporterToken = storedToken || cookieToken;
                      if (!reporterToken) {
                        reporterToken =
                          typeof crypto !== "undefined" && crypto.randomUUID
                            ? crypto.randomUUID()
                            : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
                      }
                      if (!storedToken) localStorage.setItem("bunkby_reporter_token", reporterToken);
                      if (!cookieToken) {
                        document.cookie = `bunkby_reporter_token=${encodeURIComponent(reporterToken)}; path=/; max-age=31536000; SameSite=Lax`;
                      }
                    } catch {}

                    const res = await fetch(`/api/rooms/${reportingListing.id}/report`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(reporterToken ? { "x-reporter-token": reporterToken } : {}),
                      },
                      body: JSON.stringify({
                        reason: reportReason,
                        details: reportDetails,
                        reporterName: reportReporterName,
                        reporterPhone: reportReporterPhone,
                        reporterToken,
                      })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok) {
                      showToast("🛡️ Thank you. Report submitted to moderation for review.");
                      setIsReportModalOpen(false);
                      setReportingListing(null);
                      setReportDetails("");
                    } else {
                      showToast(`⚠️ ${data?.error || "Could not submit report. Please try again."}`);
                    }
                  } catch (err) {
                    showToast("⚠️ Network issue submitting report.");
                  } finally {
                    setIsSubmittingReport(false);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Reason for report *
                  </label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs bg-slate-50 font-medium focus:outline-none"
                  >
                    <option value="Suspected scam / fake advertiser">Suspected scam / fake advertiser</option>
                    <option value="Already occupied / unavailable">Already occupied / unavailable</option>
                    <option value="Incorrect pricing or deposit details">Incorrect pricing or deposit details</option>
                    <option value="Misleading location or pictures">Misleading location or pictures</option>
                    <option value="Offensive or inappropriate content">Offensive or inappropriate content</option>
                    <option value="Other concern">Other concern</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Additional Details
                  </label>
                  <textarea
                    rows={3}
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="Provide any relevant context to help our moderators review..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                      Your Name (optional)
                    </label>
                    <input
                      type="text"
                      value={reportReporterName}
                      onChange={(e) => setReportReporterName(e.target.value)}
                      placeholder="e.g. Tendai"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                      Your Phone (optional)
                    </label>
                    <input
                      type="text"
                      value={reportReporterPhone}
                      onChange={(e) => setReportReporterPhone(e.target.value)}
                      placeholder="e.g. 0773043376"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsReportModalOpen(false);
                      setReportingListing(null);
                    }}
                    className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReport}
                    className="w-2/3 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-all"
                  >
                    {isSubmittingReport ? "Submitting..." : "Submit Report"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ACCOUNT RECOVERY & PIN RESET MODAL */}
      <AnimatePresence>
        {isRecoveryModalOpen && (
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 text-left font-sans my-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-[#052659]">
                  <ShieldCheck className="w-5 h-5 shrink-0 text-orange-500" />
                  <h3 className="font-display font-black text-base text-slate-900">Reset Security PIN</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRecoveryModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Close reset PIN modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Step 1: Request One-Time Code via WhatsApp */}
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2.5">
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#15803d] text-white text-[11px] font-bold shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-emerald-950">Get your 6-digit code on WhatsApp</p>
                    <p className="text-[11px] text-emerald-900/85 leading-snug">
                      Tap the button below and send <strong className="font-bold">RESET PIN</strong> from your registered WhatsApp number. BunkBy will reply immediately with a one-time code valid for 10 minutes.
                    </p>
                  </div>
                </div>
                <a
                  id="whatsapp-pin-reset-cta"
                  href={getBunkByWhatsAppUrl("RESET PIN")}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setWhatsappResetOpened(true);
                    setRecoveryError(null);
                  }}
                  className="w-full bg-[#15803d] hover:bg-[#166534] text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <WhatsAppIcon className="w-4 h-4 text-white shrink-0" />
                  <span>{whatsappResetOpened ? "Resend Reset Code on WhatsApp" : "Get Reset Code on WhatsApp"}</span>
                </a>
                {whatsappResetOpened && (
                  <p className="text-[11px] text-emerald-800 font-medium text-center">
                    WhatsApp opened. Send the pre-filled message, then enter the 6-digit code below.
                  </p>
                )}
              </div>

              {/* Step 2: Enter Code & Set New PIN */}
              <form onSubmit={handleAccountRecovery} className="space-y-3 font-sans">
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#052659] text-white text-[11px] font-bold shrink-0">
                    2
                  </span>
                  <p className="text-xs font-bold text-slate-800">Enter your WhatsApp code and new PIN</p>
                </div>

                {recoveryError && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 font-medium leading-snug">
                    {recoveryError}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1">
                    Registered WhatsApp Number *
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    required
                    value={recoveryPhone}
                    onChange={(e) => {
                      setRecoveryPhone(e.target.value);
                      if (recoveryError) setRecoveryError(null);
                    }}
                    placeholder="e.g. 0773043376 or 263773043376"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1">
                    6-Digit WhatsApp Verification Code *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={recoveryCode}
                    onChange={(e) => {
                      setRecoveryCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      if (recoveryError) setRecoveryError(null);
                    }}
                    placeholder="Enter 6-digit code"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold tracking-[0.25em] text-center text-slate-900 placeholder:tracking-normal placeholder:font-normal focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1">
                      New Security PIN *
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      required
                      value={recoveryNewPin}
                      onChange={(e) => {
                        setRecoveryNewPin(e.target.value.replace(/\D/g, "").slice(0, 8));
                        if (recoveryError) setRecoveryError(null);
                      }}
                      placeholder="4 to 8 digits"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1">
                      Confirm New PIN *
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      required
                      value={recoveryConfirmPin}
                      onChange={(e) => {
                        setRecoveryConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 8));
                        if (recoveryError) setRecoveryError(null);
                      }}
                      placeholder="Re-enter PIN"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div className="pt-1 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsRecoveryModalOpen(false)}
                    className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRecovering}
                    className="w-2/3 bg-[#052659] hover:bg-[#021024] disabled:bg-slate-300 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-all cursor-pointer"
                  >
                    {isRecovering ? "Verifying Code..." : "Verify Code & Update PIN"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating WhatsApp Assistant Button (disappears at once 2 seconds after initial appearance) */}
      {showFloatingWhatsapp && (
        <a
          id="floating-whatsapp-cta"
          href={getBunkByWhatsAppUrl("Hi BunkBy! I would like assistance.")}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with BunkBy on WhatsApp (+263 78 978 3200)"
          title={`Chat with BunkBy on WhatsApp (${BUNKBY_WHATSAPP_DISPLAY})`}
          onMouseEnter={() => {
            isFloatingWhatsappHoveredRef.current = true;
          }}
          onMouseLeave={() => {
            isFloatingWhatsappHoveredRef.current = false;
            const elapsed = Date.now() - floatingWhatsappAppearedAtRef.current;
            if (elapsed >= 2000) {
              if (floatingWhatsappTimerRef.current !== null) {
                window.clearTimeout(floatingWhatsappTimerRef.current);
                floatingWhatsappTimerRef.current = null;
              }
              setShowFloatingWhatsapp(false);
            }
          }}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 inline-flex items-center justify-center gap-2 w-12 h-12 sm:w-auto sm:h-11 sm:pl-2 sm:pr-4 rounded-full bg-[#25D366] sm:bg-[#15803d] hover:bg-[#166534] text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-950/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#021024]"
        >
          <span className="sm:w-7 sm:h-7 sm:rounded-full sm:bg-[#25D366] flex items-center justify-center shrink-0">
            <WhatsAppIcon className="w-6 h-6 sm:w-4.5 sm:h-4.5 text-white shrink-0" />
          </span>
          <span className="hidden sm:inline whitespace-nowrap">Chat with BunkBy</span>
        </a>
      )}

    </div>
  );
}
