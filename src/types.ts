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

export type ListingCategory = "residential" | "hospitality" | "commercial";

export type ListingStatus = "Active" | "Rented" | "Unavailable" | "Expired" | "Delisted";

export type PropertyType = 
  | "Commercial"
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
  status: ListingStatus | string; // Active | Rented | Unavailable | Expired | Delisted
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

export interface ListingReport {
  id?: number;
  listing_id: number | string;
  reason: string;
  details?: string;
  reporter_name?: string;
  reporter_phone?: string;
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
}
