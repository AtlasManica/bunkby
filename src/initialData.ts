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

export const INITIAL_ROOMS: RoomListing[] = [];

export const ALL_ZIM_CITIES = ["Harare", "Bulawayo", "Chitungwiza", "Mutare", "Gweru", "Victoria Falls", "Kadoma", "Kwekwe", "Chinhoyi", "Masvingo", "Marondera", "Bindura", "Kariba", "Nyanga", "Chivhu", "Norton", "Epworth"];

export const RESIDENTIAL_AMENITIES = [
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

export const HOSPITALITY_AMENITIES = [
  "Breakfast Included",
  "Swimming Pool",
  "Solar Power Backup",
  "Generator Backup",
  "Ensuite",
  "Air Conditioning",
  "Wifi / Internet",
  "DSTV / Satellite",
  "Restaurant / Bar",
  "Room Service",
  "Secure Parking",
  "Conference Facilities",
  "Airport Shuttle"
];

export const ALL_AMENITIES = Array.from(new Set([...RESIDENTIAL_AMENITIES, ...HOSPITALITY_AMENITIES]));

export const COMMERCIAL_PROPERTY_TYPES: PropertyType[] = [
  "Commercial",
  "Shop",
  "Warehouse",
  "Table"
];

export const STUDENT_PROPERTY_TYPES: PropertyType[] = [
  "Student Hostel",
  "Boarding House",
  "Single Student Room",
  "Shared Student Room"
];

export const RESIDENTIAL_PROPERTY_TYPES: PropertyType[] = [
  "Single Room",
  "Cottage",
  "2 rooms",
  "3 rooms",
  "Full house",
  "Apartment / Flat",
  "Townhouse / Cluster",
  "Shared Space",
  "House Sale"
];

export const HOSPITALITY_PROPERTY_TYPES: PropertyType[] = [
  "Guesthouse",
  "Lodge / Guesthouse",
  "Lodge",
  "Hotel",
  "Bed & Breakfast"
];

export const ALL_PROPERTY_TYPES: PropertyType[] = [
  "Commercial",
  ...RESIDENTIAL_PROPERTY_TYPES,
  ...HOSPITALITY_PROPERTY_TYPES,
  ...STUDENT_PROPERTY_TYPES,
  "Warehouse",
  "Shop",
  "Table"
];
