/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Landlord {
  name: string;
  phone: string;
  isVerified: boolean;
  joinedDate: string;
}

export type PropertyType = 
  | "Single Room"
  | "Cottage"
  | "2 rooms"
  | "3 rooms"
  | "Lodge / Guesthouse"
  | "Full house"
  | "Boarding House"
  | "Shared Space"
  | "Student Hostel"
  | "Warehouse"
  | "Shop"
  | "Table"
  | "Townhouse / Cluster"
  | "House Sale";

export type TenantType = "Student" | "General" | "Single" | "Guest";

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
  isVerifiedLandlord: boolean;
  status: "Active" | "Delisted"; // landord can "delist as soon as they get a tenant"
  images: string[]; // paths or base64
  image_url?: string;
  createdAt: string;
  leadsCount: number; // Traffic count
  isPremium?: boolean;
  expiryDate?: string;
  verificationStatus?: "verified" | "pending" | "unverified" | string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
}
