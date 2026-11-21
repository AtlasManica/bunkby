/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Landlord {
  id?: number;
  name: string;
  phone: string;
  isVerified: boolean;
  joinedDate?: string;
  token?: string;
  hasPin?: boolean;
  role?: string;
}

export type ListingCategory = "residential" | "hospitality" | "commercial" | "student";

export type ListingStatus =
  | "Active"
  | "verified"
  | "Rented"
  | "Unavailable"
  | "Expired"
  | "Delisted"
  | "Hidden"
  | "Removed";

export type PropertyType = 
  | "Commercial"
  | "Single Student Room"
  | "Shared Student Room"
  | "Single Room"
  | "Cottage"
  | "2 rooms"
  | "3 rooms"
  | "Full house"
  | "Apartment / Flat"
  | "Townhouse / Cluster"
  | "Boarding House"
  | "Shared Space"
  | "Student Hostel"
  | "Lodge / Guesthouse"
  | "Guesthouse"
  | "Lodge"
  | "Hotel"
  | "Bed & Breakfast"
  | "Warehouse"
  | "Shop"
  | "Table"
  | "House Sale";

export type TenantType = "Student" | "General" | "Single" | "Guest" | "Family" | "Professional";

export type ContactMethod = "Call" | "Whatsapp" | "Call / Whatsapp";

export type RentFrequency = "Month" | "Semester" | "Night" | "Hour";

export interface Booking {
  id: string;
  roomId: string;
  tenantName: string;
  tenantPhone: string;
  date: string;
  status: "Pending" | "Confirmed" | "Declined";
}

export interface RoomListing {
  id: string;
  title: string;
  category?: ListingCategory;
  businessName?: string;
  business_name?: string;
  city: string;
  suburb: string;
  landmark: string;
  price: number;
  deposit: number;
  frequency: RentFrequency;
  propertyType: PropertyType;
  tenantType: TenantType;
  amenities: string[];
  contactMethod: ContactMethod;
  phone: string;
  landlordName: string;
  landlord_id?: number | string;
  isVerifiedLandlord: boolean;
  status: ListingStatus | string; // Active | verified | Rented | Unavailable | Expired | Delisted | Hidden | Removed
  images: string[]; // paths or base64
  image_url?: string;
  createdAt: string;
  created_at?: string;
  leadsCount: number; // Traffic count
  isPremium?: boolean;
  listingTier?: "free" | "paid";
  expiryDate?: string;
  verificationStatus?: "verified" | "pending" | "unverified" | string;
  checkInTime?: string;
  rating?: number;
  isSample?: boolean;
  reportsCount?: number;
  description?: string;
}

export type ReportStatus =
  | "pending"
  | "under_review"
  | "action_taken"
  | "dismissed"
  | "resolved";

export interface ListingReport {
  id: number;
  listing_id: number | string;
  reason: string;
  details?: string | null;
  reporter_id?: string | null;
  reporter_name?: string | null;
  reporter_phone?: string | null;
  status: ReportStatus | string;
  created_at?: string;
  reviewed_at?: string | null;
  reviewed_by?: number | null;
  reviewed_by_name?: string | null;
  moderation_notes?: string | null;
  listing_title?: string | null;
  listing_city?: string | null;
  listing_suburb?: string | null;
  listing_landmark?: string | null;
  listing_price?: number | null;
  listing_deposit?: number | null;
  listing_frequency?: string | null;
  listing_property_type?: string | null;
  listing_category?: string | null;
  listing_status?: string | null;
  listing_landlord_id?: number | string | null;
  listing_landlord_name?: string | null;
  listing_contact_phone?: string | null;
  listing_reports_count?: number | null;
  same_ip_reports_count?: number | null;
}

export interface ListingModerationAction {
  id: number;
  listing_id: number;
  report_id?: number | null;
  admin_id?: number | null;
  admin_name: string;
  action_type: string;
  previous_listing_status?: string | null;
  new_listing_status?: string | null;
  reason?: string | null;
  notes?: string | null;
  listing_title?: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
}
