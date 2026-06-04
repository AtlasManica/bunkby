/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RoomListing, PropertyType } from "./types";

export const DEFAULT_ROOM_IMAGES = [
  "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80", // master bedroom cozy
  "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=600&q=80", // modern colorful room
  "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=600&q=80", // cozy reading space
  "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=600&q=80", // bedroom with nice window
  "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=600&q=80", // elegant white room
];

export const INITIAL_ROOMS: RoomListing[] = [
  {
    id: "room-default-1",
    title: "Modern Cozy Cottage",
    city: "Harare",
    suburb: "Avonlea",
    landmark: "Close to Avonlea Shopping Centre",
    price: 150,
    deposit: 150,
    frequency: "Month",
    propertyType: "Cottage",
    tenantType: "General",
    amenities: ["Borehole", "Solar Power Backup", "Walled & Gated", "Wifi / Internet", "Tiled Floors"],
    contactMethod: "Call / Whatsapp",
    phone: "0773043376",
    landlordName: "Tatenda E. Chikura",
    isVerifiedLandlord: true,
    status: "Active",
    images: [
      "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=600&q=80"
    ],
    image_url: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=600&q=80",
    createdAt: new Date().toISOString(),
    leadsCount: 14,
    verificationStatus: "approved"
  },
  {
    id: "room-default-2",
    title: "Charming Student Hostel Room",
    city: "Gweru",
    suburb: "Senga",
    landmark: "3 minutes walk from MSU Main Gate",
    price: 45,
    deposit: 45,
    frequency: "Month",
    propertyType: "Student Hostel",
    tenantType: "Student",
    amenities: ["Borehole", "Solar Power Backup", "Reliable water", "Tiled Floors", "Ceiling"],
    contactMethod: "Whatsapp",
    phone: "0784221190",
    landlordName: "Regis J. Banda",
    isVerifiedLandlord: true,
    status: "Active",
    images: [
      "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=600&q=80"
    ],
    image_url: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=600&q=80",
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    leadsCount: 8,
    verificationStatus: "approved"
  },
  {
    id: "room-default-3",
    title: "Spacious Student Shared Space",
    city: "Harare",
    suburb: "Mount Pleasant",
    landmark: "Opposite UZ Main Campus",
    price: 60,
    deposit: 30,
    frequency: "Month",
    propertyType: "Shared Space",
    tenantType: "Student",
    amenities: ["Borehole", "Wifi / Internet", "Walled & Gated", "Fitted wardrobe"],
    contactMethod: "Call",
    phone: "0712345678",
    landlordName: "Mrs. Sarah Moyo",
    isVerifiedLandlord: false,
    status: "Active",
    images: [
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=600&q=80"
    ],
    image_url: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=600&q=80",
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    leadsCount: 3,
    verificationStatus: "pending"
  },
  {
    id: "room-default-4",
    title: "Elegant Townhouse Unit",
    city: "Bulawayo",
    suburb: "Hillside",
    landmark: "Near Hillside Dams Conservancy",
    price: 450,
    deposit: 450,
    frequency: "Month",
    propertyType: "Townhouse / Cluster",
    tenantType: "General",
    amenities: ["Solar Power Backup", "Walled & Gated", "Gated Community", "Paved Yard", "Ensuite"],
    contactMethod: "Call / Whatsapp",
    phone: "0772111222",
    landlordName: "Farai Chitepo",
    isVerifiedLandlord: false,
    status: "Active",
    images: [
      "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=600&q=80"
    ],
    image_url: "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=600&q=80",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    leadsCount: 5,
    verificationStatus: "pending"
  }
];

export const ALL_ZIM_CITIES = ["Harare", "Bulawayo", "Chitungwiza", "Mutare", "Gweru", "Epworth", "Kwekwe", "Kadoma", "Masvingo", "Chinhoyi", "Norton", "Marondera"];

export const ALL_AMENITIES = [
  "Borehole",
  "Solar Power Backup",
  "Tiled Floors",
  "Ensuite",
  "Ceiling",
  "Fitted wardrobe",
  "Walled & Gated",
  "Gated Community",
  "Reliable water",
  "Paved Yard",
  "Wifi / Internet",
  "Care taker / Security guard"
];

export const ALL_PROPERTY_TYPES: PropertyType[] = [
  "Single Room",
  "Cottage",
  "2 rooms",
  "3 rooms",
  "Lodge / Guesthouse",
  "Full house",
  "Boarding House",
  "Shared Space",
  "Student Hostel",
  "Warehouse",
  "Shop",
  "Table",
  "Townhouse / Cluster",
  "House Sale"
];
