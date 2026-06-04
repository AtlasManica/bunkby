/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
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
  RefreshCw,
  X,
  Clock,
  ExternalLink,
  ChevronLeft,
  Camera,
  Upload,
  Trash
} from "lucide-react";
import { RoomListing, PropertyType, TenantType, ContactMethod, RentFrequency, ChatMessage } from "./types";
import { INITIAL_ROOMS, ALL_ZIM_CITIES, ALL_AMENITIES, ALL_PROPERTY_TYPES, DEFAULT_ROOM_IMAGES } from "./initialData";
import { motion, AnimatePresence } from "motion/react";

// BunkBy Orange Stacked Squares Logo Component
const BunkByLogo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <div className={`${className} bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 shrink-0 select-none`}>
    <div className="flex flex-col gap-0.5 items-center justify-center">
      {/* Top Stacked Square */}
      <div className="relative w-3.5 h-3.5">
        {/* Shadow square */}
        <div className="absolute top-[1.5px] left-[1.5px] w-full h-full bg-[#CC5200] rounded-[2px]"></div>
        {/* Front active orange square */}
        <div className="absolute top-0 left-0 w-full h-full bg-[#FF7A00] rounded-[2px]"></div>
      </div>
      {/* Bottom Stacked Square */}
      <div className="relative w-3.5 h-3.5">
        {/* Shadow square */}
        <div className="absolute top-[1.5px] left-[1.5px] w-full h-full bg-[#CC5200] rounded-[2px]"></div>
        {/* Front active orange square */}
        <div className="absolute top-0 left-0 w-full h-full bg-[#FF7A00] rounded-[2px]"></div>
      </div>
    </div>
  </div>
);

export default function App() {
  // Current active tab of the app
  const [activeTab, setActiveTab] = useState<"browse" | "landlord" | "whatsapp" | "account" | "help">("browse");

  // Room Listings State
  const [listings, setListings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Simulated landlords registry for offline verification mapping
  const [allLandlords, setAllLandlords] = useState<any[]>([]);

  useEffect(() => {
    // Fetch directly from server DB
    const loadListings = async () => {
      try {
        const res = await fetch("/api/listings");
        if (res.ok) {
          const data = await res.json();
          setListings(data.listings || []);
        }
      } catch (e) {
        console.error("Failed to load listings", e);
      } finally {
        setIsLoading(false);
      }
    };
    const loadLandlords = async () => {
      try {
        const res = await fetch("/api/admin"); // Get listings and landlords from admin / or landlords API
        if (res.ok) {
          const data = await res.json();
          if (data.landlords) {
            setAllLandlords(data.landlords);
          }
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
  const [selectedAmenity, setSelectedAmenity] = useState("");
  const [selectedTenantType, setSelectedTenantType] = useState("");
  const [minPrice, setMinPrice] = useState<number | "">("");
  const [maxPrice, setMaxPrice] = useState<number | "">("");

  // Simulated Account State (Supports phone number accounts for landlords, starts null for flow)
  const [userProfile, setUserProfile] = useState<{
    name: string;
    phone: string;
    isVerified: boolean;
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

  // Login form state for quick account setup
  const [loginPhone, setLoginPhone] = useState("");
  const [loginName, setLoginName] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

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

  // WhatsApp Interactive Chatbot Simulator State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "msg-1",
      sender: "bot",
      text: "*Salibonani / Mhoro!* Welcome to *BunkBy Chatbot* 🏡📲\n\nI am BunkBy's official automated assistant. I connect landlords & renters immediately without any greedy agents! \n\n*What would you like to do?*\n👉 Say _\"show rooms in Harare under $40\"_ to browse.\n👉 Say _\"list a room\"_ or describe your cottage to start rent listings for free.\n👉 Ask _\"why is it free?\"_ to understand our traffic model.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

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

  // Scroll WhatsApp chatbot to bottom on message updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isBotTyping]);

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

    const firstImg = uploadedImages.length > 0 ? uploadedImages[0] : (newRoomForm.imageUrl || DEFAULT_ROOM_IMAGES[0]);
    const payload = {
      ...newRoomForm,
      image_url: firstImg,
      images: uploadedImages.length > 0 ? uploadedImages : [newRoomForm.imageUrl || DEFAULT_ROOM_IMAGES[0]],
      isVerifiedLandlord: userProfile?.isVerified || false
    };

    const isPremiumType = 
      newRoomForm.propertyType === "Lodge / Guesthouse" ||
      newRoomForm.propertyType === "Boarding House" ||
      newRoomForm.propertyType === "House Sale";

    if (isPremiumType && !isEditing) {
      // Open Premium billing authorization flow
      setBillingListingForm(payload);
      setBillingPhone(userProfile?.phone || "");
      setIsBillingModalOpen(true);
      setIsCreateModalOpen(false);
      showToast("💰 Commercial / Premium Listing detected. Complete payment to secure listing!");
    } else {
      // Ordinary free listing or editing
      await executeSaveListing(payload, false);
    }
  };

  const executeSaveListing = async (payload: any, makePremium = false) => {
    const finalPayload = {
      ...payload,
      isPremium: makePremium,
      expiryDate: makePremium ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : undefined,
      verification_status: userProfile?.isVerified ? "verified" : "pending",
      landlord_id: userProfile?.id || null, // Assuming landlord has id
      image_url: uploadedImages.length > 0 ? uploadedImages[0] : null,
      contact_phone: payload.phone,
      property_type: payload.propertyType,
      tenant_type: payload.tenantType,
      rent_cycle: payload.frequency,
      contact_method: payload.contactMethod
    };

    setIsPublishing(true);

    try {
      if (isEditing) {
        // Mock offline editing for now or skip
        setListings(prev => prev.map(item => item.id === isEditing ? { ...item, ...finalPayload, price: Number(finalPayload.price), deposit: Number(finalPayload.deposit) } : item));
        showToast("✨ Room specifications updated successfully!");
      } else {
        const res = await fetch("/api/listings", {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify(finalPayload)
        });
        if (res.ok) {
           const data = await res.json();
           const newListing = {
              id: data.id,
              ...finalPayload,
              leadsCount: 0,
              created_at: new Date().toISOString()
           };
           setListings(prev => [newListing, ...prev]);
           showToast(makePremium ? "✨ Premium Listing activated for 30 Days successfully!" : "🎉 Room listed live on BunkBy for FREE!");
        } else {
           showToast("⚠️ Network issue, unable to list room right now");
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
      image_url: ""
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

    setIsAuthLoading(true);
    try {
      const res = await fetch("/api/landlords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: authMode,
          name: loginName.trim()
        })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        const profileName = data.landlord.name || data.landlord.full_name;
        const profile = {
          id: data.landlord.id,
          name: profileName,
          phone: loginPhone.trim(), // Kept locally for listings
          isVerified: data.landlord.isVerified || data.landlord.verification_status === 'verified' || false,
          whatsappLinked: true,
          role: profileName === "Tatenda E. Chikura" ? "Admin" : "Landlord"
        };
        setUserProfile(profile);
        localStorage.setItem("bunkby_landlord_profile", JSON.stringify(profile));
        showToast(authMode === "login" 
          ? `🎉 Welcome back, ${profile.name}! Your account is now active.` 
          : `🎉 Welcome ${profile.name}! Your account was created successfully.`
        );
      } else {
        if (data.code === "ALREADY_EXISTS") {
          showToast(`⚠️ An account already exists with this name. Directing to Log In.`);
          setAuthMode("login");
        } else if (data.code === "ACCOUNT_NOT_FOUND") {
          showToast(`⚠️ No account detected with this name. Please Create an Account first.`);
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
        if (uploadedImages.length >= 2) {
          showToast("⚠️ Maximum of 2 pictures allowed! Remove one to snap a new one.");
          return;
        }
        setUploadedImages(prev => [...prev, dataUrl]);
        showToast("📸 Captured photo saved!");
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const remainingBytesAllowed = 2 - uploadedImages.length;
      if (remainingBytesAllowed <= 0) {
        showToast("⚠️ Already uploaded maximum of 2 pictures!");
        return;
      }
      
      const filesToProcess = files.slice(0, remainingBytesAllowed);
      filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) {
            setUploadedImages(prev => [...prev, reader.result as string]);
          }
        };
        reader.readAsDataURL(file as Blob);
      });
      showToast(`📁 Processed ${filesToProcess.length} uploaded image(s) successfully!`);
    }
  };

  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
    showToast("🗑️ Image removed.");
  };

  // Toggle Room Inactive/Delisted ("as soon as they get a tenant")
  const handleToggleDelist = async (id: string) => {
    try {
      const res = await fetch(`/api/rooms/${id}/toggle-status`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setListings(prev => prev.map(item => {
          if (item.id === id) {
            const nextStatus = data.status;
            showToast(nextStatus === "Delisted" ? "📴 Room successfully delisted/rented out!" : "🔛 Room reactivated and active!");
            return { ...item, status: nextStatus };
          }
          return item;
        }));
      } else {
        showToast("⚠️ Could not toggle status");
      }
    } catch (e) {
      console.error(e);
      showToast("⚠️ Could not toggle status");
    }
  };

  // Permanent Delete listing
  const handleDeleteListing = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this listing from BunkBy?")) return;
    try {
      const res = await fetch(`/api/rooms/${id}`, { method: "DELETE" });
      if (res.ok) {
        setListings(prev => prev.filter(item => item.id !== id));
        showToast("🗑️ Listing deleted permanently.");
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
    setListings(prev => prev.map(item => item.id === room.id ? { ...item, leadsCount: (item.leadsCount || 0) + 1 } : item));

    // Direct prefilled whatsapp text with renter details!
    const waText = encodeURIComponent(`Hi ${room.landlordName}, I saw your listing for "${room.title}" listed on BunkBy for $${room.price}/${room.frequency}. Is it still available for rent? My name is ${softGateName} (Phone: ${softGatePhone}).`);
    const waLink = `https://wa.me/${room.phone}?text=${waText}`;

    // Open direct WhatsApp connection
    showToast(`📱 Redirecting to WhatsApp line with ${room.landlordName}. Lead recorded!`);
    
    // Reset state & close modal
    setIsSoftGateOpen(false);
    setPendingContactRoom(null);

    // Simulate real window open safely
    window.open(waLink, "_blank", "noopener,noreferrer");
  };

  // Interactive WhatsApp Simulator chatbot handler
  const handleSendChat = async (typedText?: string) => {
    const textToSend = typedText || chatInput;
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, userMsg]);
    if (!typedText) setChatInput("");
    setIsBotTyping(true);

    try {
      const res = await fetch("/api/whatsapp/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          chatHistory: chatMessages
        })
      });

      if (res.ok) {
        const data = await res.json();
        setIsBotTyping(false);
        const botRawText = data.response || "No response received";

        // Parse any special CREATION command tags appended by Gemini inside the message to live create rooms!
        const creationMatch = botRawText.match(/::CREATE_LISTING:(.*?)::/);
        if (creationMatch && creationMatch[1]) {
          try {
            const parsedRoom = JSON.parse(creationMatch[1]);
            // Dynamically post to state/API!
            const newRoom: RoomListing = {
              id: `wa-room-${Date.now()}`,
              title: parsedRoom.title || "Room via WhatsApp Chat",
              city: parsedRoom.city || "Harare",
              suburb: parsedRoom.suburb || "Avonlea",
              landmark: parsedRoom.landmark || "provided via chat conversation",
              price: Number(parsedRoom.price || 35),
              deposit: Number(parsedRoom.deposit || 35),
              frequency: parsedRoom.frequency || "Month",
              propertyType: parsedRoom.propertyType || "Single Room",
              tenantType: parsedRoom.tenantType || "General",
              amenities: parsedRoom.amenities || ["Borehole", "Reliable water"],
              contactMethod: "Whatsapp",
              phone: parsedRoom.phone || "0771122334",
              landlordName: parsedRoom.landlordName || "WhatsApp User",
              isVerifiedLandlord: false,
              status: "Active",
              images: [DEFAULT_ROOM_IMAGES[Math.floor(Math.random() * DEFAULT_ROOM_IMAGES.length)]],
              createdAt: new Date().toISOString(),
              leadsCount: 1,
            };

            // Post to state
            setListings(prev => [newRoom, ...prev]);
            
            // Clean command tag out of visible bot text for a clean visual experience!
            const cleanText = botRawText.replace(/::CREATE_LISTING:.*?::/g, "").trim();
            
            setChatMessages(prev => [...prev, {
              id: `bot-${Date.now()}`,
              sender: "bot",
              text: cleanText + "\n\n🚀 *CONGRATS! Your room listed live successfully!* Our system scraped details from your text and updated the browse directory instantly.",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
            
            showToast("🏡 Room successfully parsed & listed live via WhatsApp!");
            return;
          } catch (jsonErr) {
            console.error("Failed to parse dynamic room listing from chatbot payload", jsonErr);
          }
        }

        // Standard Bot reply
        const cleanText = botRawText.replace(/::CREATE_LISTING:.*?::/g, "").trim();
        setChatMessages(prev => [...prev, {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: cleanText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);

      } else {
        throw new Error("Chatbot failed response");
      }
    } catch (err) {
      setIsBotTyping(false);
      // Fallback response
      setChatMessages(prev => [...prev, {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: "I picked up your request! BunkBy connects tenants and landlords directly. Type *'list'* to list a new room, or *'show'* to search active listings in Zimbabwe's suburbs.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    }
  };

  // Filter listings based on selected search components
  const filteredListings = listings.filter((room) => {
    // Only search renters see Active listings (Landlord sees all including delisted in their dashboard)
    if (activeTab === "browse" && room.status !== "Active") return false;

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
        room.city.toLowerCase().includes(term) ||
        room.suburb.toLowerCase().includes(term) ||
        room.landmark.toLowerCase().includes(term) ||
        room.landlordName.toLowerCase().includes(term);
      if (!matchesText) return false;
    }

    // City Filter
    if (selectedCity && room.city.toLowerCase() !== selectedCity.toLowerCase()) {
      return false;
    }

    // Suburb filter
    if (selectedSuburb && room.suburb.toLowerCase() !== selectedSuburb.toLowerCase()) {
      return false;
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

  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedCity("");
    setSelectedSuburb("");
    setSelectedAmenity("");
    setSelectedTenantType("");
    setMinPrice("");
    setMaxPrice("");
    showToast("🧹 All filters cleared!");
  };

  // Get suburbs of the selected city or general default list
  const getSuburbsForCity = () => {
    if (selectedCity === "Harare") {
      return ["Avonlea", "Mount Pleasant", "Avenues", "Belvedere", "Hatfield", "Mabelreign", "Borrowdale"];
    } else if (selectedCity === "Bulawayo") {
      return ["Hillside", "Suburbs", "Kumalo", "Sizinda", "Cowdray Park", "Bradfield"];
    } else if (selectedCity === "Gweru") {
      return ["Senga", "Riverside", "Mkoba", "Daylesford"];
    } else if (selectedCity === "Mutare") {
      return ["Murambi", "Chikanga", "Hobhouse", "Palmerstone"];
    }
    return ["Avonlea", "Senga", "Hillside", "Murambi", "Mount Pleasant"];
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col antialiased">
      
      {/* Toast Alert Banner */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 16 }}
            exit={{ opacity: 0, y: -20 }}
            id="app-toast"
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#0B2545] text-white py-3 px-6 rounded-xl shadow-xl flex items-center gap-3 border border-orange-500 max-w-md"
          >
            <Sparkles className="w-5 h-5 text-orange-400 shrink-0" />
            <p className="text-sm font-semibold">{toastMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Top Header: Navigation (Interiors styled in navy blue) */}
      <header id="main-header" className="bg-[#0B2545] text-white border-b border-sky-900 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          
          {/* Logo Brand with custom icon */}
          <div 
            onClick={() => setActiveTab("browse")} 
            className="flex items-center gap-3 cursor-pointer shrink-0"
            id="brand-logo"
          >
            <BunkByLogo className="w-10 h-10" />
            <div>
              <span className="text-2xl font-display font-black uppercase tracking-tight text-white md:text-2.5xl">
                Bunk<span className="text-[#FF7A00]">By</span>
              </span>
              <p className="text-[10px] text-sky-200 tracking-wider font-mono font-bold">100% FREE • AGENT-FREE</p>
            </div>
          </div>

          {/* Nav items */}
          <nav className="hidden md:flex items-center gap-1 text-sm">
            <button 
              onClick={() => setActiveTab("browse")}
              className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === "browse" ? "bg-white/15 text-white shadow-inner font-extrabold" : "hover:text-white text-sky-100 hover:bg-white/5 font-bold"}`}
              id="nav-browse"
            >
              Browse Rooms
            </button>
            <button 
              onClick={() => setActiveTab("landlord")}
              className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === "landlord" ? "bg-white/15 text-white shadow-inner font-extrabold" : "hover:text-white text-sky-100 hover:bg-white/5 font-bold"}`}
              id="nav-landlord"
            >
              Landlords Portal
            </button>
            <button 
              onClick={() => setActiveTab("whatsapp")}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${activeTab === "whatsapp" ? "bg-white/15 text-white shadow-inner font-extrabold" : "hover:text-white text-sky-100 hover:bg-white/5 font-bold"}`}
              id="nav-whatsapp"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              WhatsApp Chatbot
            </button>
            <button 
              onClick={() => setActiveTab("account")}
              className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === "account" ? "bg-white/15 text-white shadow-inner font-extrabold" : "hover:text-white text-sky-100 hover:bg-white/5 font-bold"}`}
              id="nav-account"
            >
              Account
            </button>
            <button 
              onClick={() => setActiveTab("help")}
              className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === "help" ? "bg-white/15 text-white shadow-inner font-extrabold" : "hover:text-white text-sky-100 hover:bg-white/5 font-bold"}`}
              id="nav-help"
            >
              Help & FAQ
            </button>
          </nav>

          {/* Mobile Right Controls / User details */}
          <div className="flex items-center gap-3">
            {userProfile ? (
              <>
                <div className="bg-white/10 rounded-xl px-3 py-1.5 border border-white/5 hidden sm:flex items-center gap-2 text-xs text-white font-semibold">
                  <User className="w-3.5 h-3.5 text-orange-400" />
                  <span className="font-mono truncate max-w-[120px]">{userProfile.name}</span>
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
                  className="bg-orange-500 hover:bg-orange-600 text-white font-medium text-[11px] px-3 py-2 rounded-lg shadow-md shadow-orange-500/15 flex items-center gap-1.5 transition-all outline-none"
                  id="btn-create-header"
                >
                  <Plus className="w-4 h-4 text-white shrink-0" />
                  <span>Create Listing</span>
                </button>
              </>
            ) : (
              <button 
                onClick={() => {
                  setActiveTab("landlord");
                  showToast("🔑 Register or access BunkBy Landlord workspace using your phone number!");
                }}
                className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-medium text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 transition-all outline-none"
                id="btn-login-header"
              >
                <User className="w-3.5 h-3.5 text-white animate-pulse" />
                <span>Create Account</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Mobile nav bar bottom */}
      <div className="md:hidden bg-white border-b border-slate-200 flex items-center justify-around text-xs font-medium py-2.5 sticky top-18 z-35 shadow-sm">
        <button 
          onClick={() => setActiveTab("browse")}
          className={`flex flex-col items-center gap-1 ${activeTab === "browse" ? "text-sky-600 font-bold" : "text-slate-500"}`}
        >
          <Building className="w-4 h-4 shrink-0" />
          <span>Browse</span>
        </button>
        <button 
          onClick={() => setActiveTab("landlord")}
          className={`flex flex-col items-center gap-1 relative ${activeTab === "landlord" ? "text-sky-600 font-bold" : "text-slate-500"}`}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          <span>My Portal</span>
        </button>
        <button 
          onClick={() => setActiveTab("whatsapp")}
          className={`flex flex-col items-center gap-1 ${activeTab === "whatsapp" ? "text-emerald-600 font-bold" : "text-slate-500"}`}
        >
          <MessageSquare className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>WhatsApp Bot</span>
        </button>
        <button 
          onClick={() => setActiveTab("account")}
          className={`flex flex-col items-center gap-1 ${activeTab === "account" ? "text-sky-600 font-bold" : "text-slate-500"}`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>Settings</span>
        </button>
      </div>

      {/* Application Body Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-4 sm:p-5 lg:p-8">
        
        {/* TAB 1: BROWSER / ROOM DIRECTORY */}
        {activeTab === "browse" && (
          <div className="space-y-6">
            
            {/* Dynamic Hero Banner matching Bubble dashboard layout */}
            <section 
              id="hero-banner" 
              className="blue-gradient rounded-3xl text-white p-6 sm:p-8 md:p-12 text-center relative overflow-hidden shadow-sm border border-blue-900/40"
            >
              {/* Abs decoration shapes for design craft */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
              <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/15 rounded-full blur-3xl -ml-20 -mb-20"></div>

              <div className="relative max-w-3xl mx-auto space-y-4">
                <div className="inline-flex items-center gap-2 bg-white/10 border border-white/5 text-white px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-sm">
                  <ShieldCheck className="w-4 h-4 text-orange-400" />
                  <span>Trusted Rooms In Your Desired Area</span>
                </div>

                <h1 className="text-3.5xl sm:text-4.5xl md:text-5.5xl font-display font-extrabold tracking-tight text-white leading-tight">
                  Find Your Room in <span className="text-[#FF7A00]">Zimbabwe</span>
                </h1>

                <p className="text-sm sm:text-base text-slate-200 max-w-2xl mx-auto leading-relaxed">
                  Browse verified rooms, guesthouses and property rentals in Harare, Bulawayo, Mutare, Gweru and beyond. We connect landlords and tenants directly. Free from greedy agent middleman cuts!
                </p>

                <div className="pt-3 flex flex-wrap gap-3 justify-center">
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
                    className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-2xl shadow-lg shadow-orange-500/25 transition-all text-sm flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>Create New Listing</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab("whatsapp")}
                    className="bg-white/15 hover:bg-white/25 border border-white/10 text-white font-bold px-6 py-3 rounded-2xl transition-all text-sm flex items-center gap-2 backdrop-blur-sm"
                  >
                    <MessageSquare className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>Try WhatsApp Bot</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Filter Search Form Container Overlay */}
              <div className="mt-8 md:mt-12 bg-white text-slate-800 rounded-2xl p-4 md:p-5 shadow-xl border border-slate-200 max-w-4xl mx-auto text-left relative z-10 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                
                {/* Search Text field */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 font-mono flex items-center gap-1.5 uppercase">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <span>Keyword Search</span>
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="e.g. Avonlea cozy cottage, student bedsit..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-900/10 focus:border-blue-900 bg-slate-50 text-sm font-medium transition-all"
                    />
                    {searchTerm && (
                      <button 
                        onClick={() => setSearchTerm("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4 shrink-0" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Town/City selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 font-mono uppercase">Filter By Town / City</label>
                  <select 
                    value={selectedCity}
                    onChange={(e) => {
                      setSelectedCity(e.target.value);
                      setSelectedSuburb(""); // Reset suburb
                    }}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 bg-slate-50 text-sm font-medium focus:border-blue-900 transition-all cursor-pointer"
                  >
                    <option value="">All Cities</option>
                    {ALL_ZIM_CITIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Search Trigger visual button */}
                <div>
                  <button className="w-full bg-[#0B2545] hover:bg-[#134074] text-white py-2.5 rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2 shadow-md">
                    <Search className="w-4 h-4 shrink-0" />
                    <span>Search</span>
                  </button>
                </div>

              </div>
            </section>

            {/* Simulated Banner for WhatsApp Access */}
            <div 
              onClick={() => setActiveTab("whatsapp")}
              className="bg-white border border-emerald-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:border-emerald-300 transition-all shadow-sm group"
              id="whatsapp-promo-banner"
            >
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-100 transition-all border border-emerald-100 shrink-0">
                  <MessageSquare className="w-6 h-6 text-emerald-500 fill-emerald-500/10" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    Find Rooms via WhatsApp
                    <span className="inline-block px-1.5 py-0.5 text-[9px] bg-emerald-500 text-white rounded font-mono uppercase tracking-widest font-bold">Free InfoBot</span>
                  </h3>
                  <p className="text-xs text-slate-500">Low data? No problem. Chat with BunkBy bot to get matched rooms sent directly to you on WhatsApp.</p>
                </div>
              </div>
              <span className="text-emerald-600 font-bold text-xs flex items-center gap-1 hover:underline self-end sm:self-auto shrink-0">
                <span>Start Chatting</span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </span>
            </div>

            {/* Secondary Filters row (Price sliders, Amenities, seek criteria) with clear links */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                
                {/* Check Filters panel */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
                  
                  {/* Suburb Select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Suburb</label>
                    <select
                      value={selectedSuburb}
                      onChange={(e) => setSelectedSuburb(e.target.value)}
                      className="w-full text-xs font-semibold py-1.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:outline-none"
                    >
                      <option value="">Any Suburb</option>
                      {getSuburbsForCity().map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Amenity Select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Amenity</label>
                    <select
                      value={selectedAmenity}
                      onChange={(e) => setSelectedAmenity(e.target.value)}
                      className="w-full text-xs font-semibold py-1.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:outline-none"
                    >
                      <option value="">Any Amenity</option>
                      {ALL_AMENITIES.map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>

                  {/* Tenant seeks criteria selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Tenant Type</label>
                    <select
                      value={selectedTenantType}
                      onChange={(e) => setSelectedTenantType(e.target.value)}
                      className="w-full text-xs font-semibold py-1.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:outline-none text-slate-700"
                    >
                      <option value="">Any seeking type</option>
                      <option value="Student">Student sought</option>
                      <option value="General">General sought</option>
                      <option value="Single">Single sought</option>
                      <option value="Guest">Guest sought</option>
                    </select>
                  </div>

                  {/* Min / Max Price fields */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Price Bracket (USD)</label>
                    <div className="flex items-center gap-1.5">
                      <input 
                        type="number" 
                        placeholder="Min" 
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full text-xs py-1 px-2 border border-slate-200 rounded-md bg-slate-50 text-center"
                      />
                      <span className="text-slate-400 text-[10px]">-</span>
                      <input 
                        type="number" 
                        placeholder="Max" 
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full text-xs py-1 px-2 border border-slate-200 rounded-md bg-slate-50 text-center"
                      />
                    </div>
                  </div>

                </div>

                {/* Clearance Actions */}
                <div className="flex items-center gap-3 shrink-0 self-end lg:self-auto">
                  {(searchTerm || selectedCity || selectedSuburb || selectedAmenity || selectedTenantType || minPrice !== "" || maxPrice !== "") && (
                    <button 
                      onClick={clearAllFilters}
                      className="text-xs text-orange-500 font-bold hover:underline flex items-center gap-1 bg-orange-50 px-3 py-1.5 rounded-lg transition-all"
                    >
                      <span>Clear All Filters</span>
                    </button>
                  )}
                  <div className="text-xs text-slate-500 font-mono">
                    Showing <span className="font-semibold text-slate-800">{filteredListings.length}</span> active rooms
                  </div>
                </div>

              </div>
            </div>

            {/* Rooms Cards Directory list */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
                <p className="text-slate-500 font-medium">Querying active agent-free listings...</p>
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 space-y-4 max-w-xl mx-auto shadow-sm">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                  <SlidersHorizontal className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 font-display">No Rooms Found</h3>
                <p className="text-sm text-slate-500">
                  No listings matched your criteria. Try widening your search filter. Landlords can list rooms instantly for free right now to capture traffic!
                </p>
                <div className="pt-2 flex justify-center gap-3">
                  <button onClick={clearAllFilters} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2 rounded-xl transition-all">
                    Reset Filters
                  </button>
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
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md shadow-orange-500/10"
                  >
                    List First Room
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 hover:cursor-pointer" id="rooms-grid">
                {filteredListings.map((room) => (
                  <motion.div 
                    key={room.id}
                    layoutId={room.id}
                    id={`room-card-${room.id}`}
                    className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-md hover:shadow-xl hover:border-slate-300 transition-all flex flex-col group relative"
                  >
                    {/* Room Image with overlay tags */}
                    <div className="relative h-56 w-full overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                      {(room.image_url || (room.images && room.images[0])) ? (
                        <img 
                          src={room.image_url || (room.images && room.images[0])} 
                          alt={room.title}
                          className="w-full h-full object-cover transition-transform duration-550 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-slate-400 font-mono text-xs font-bold uppercase tracking-widest">No Image</span>
                      )}
                      
                      {/* Top ribbon tags */}
                      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
                        {room.isVerifiedLandlord && (
                          <span className="bg-emerald-500 text-white font-semibold text-[10px] tracking-wide uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md shadow-emerald-500/15">
                            <CheckCircle className="w-3 h-3 text-white fill-white/10 shrink-0" />
                            <span>Verified Landlord</span>
                          </span>
                        )}
                        <span className="bg-slate-900/80 backdrop-blur-md text-[#FF7A00] font-mono font-bold text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {room.propertyType}
                        </span>
                      </div>

                      {/* Side cost badge matching ZimRooms design */}
                      <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm shadow-md rounded-2xl px-3 py-1.5 text-right border border-slate-200">
                        <span className="text-[10px] text-slate-500 block leading-3 font-mono font-bold uppercase">Rent</span>
                        <div className="text-xl font-display font-extrabold text-slate-900">
                          ${room.price} <span className="text-xs font-semibold text-slate-500">/{room.frequency}</span>
                        </div>
                        {room.deposit > 0 ? (
                          <span className="text-[10px] text-slate-400 block font-mono">Dep: ${room.deposit}</span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 block font-mono font-bold">No Deposit</span>
                        )}
                      </div>
                    </div>

                    {/* Room Metadata */}
                    <div className="p-5 flex-grow flex flex-col space-y-4">
                      
                      {/* Name/Heading */}
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-1.5">
                          <h3 className="text-lg font-bold text-slate-800 leading-snug line-clamp-2">
                            {room.title}
                          </h3>
                        </div>
                        
                        {/* Location lines */}
                        <div className="space-y-1 text-xs text-slate-500">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                            <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            <span>{room.city}, {room.suburb}</span>
                          </div>
                          <p className="italic pl-5 line-clamp-1 text-slate-400">"{room.landmark}"</p>
                        </div>
                      </div>

                      {/* Main criteria highlights */}
                      <div className="bg-slate-50 rounded-xl p-3 flex justify-around text-center items-center divide-x divide-slate-200 shrink-0">
                        <div className="w-1/2 p-1">
                          <span className="text-[9px] uppercase tracking-wider block text-slate-400 font-mono">Tough Criteria</span>
                          <span className="text-xs font-bold text-slate-700">{room.tenantType} sought</span>
                        </div>
                        <div className="w-1/2 p-1">
                          <span className="text-[9px] uppercase tracking-wider block text-slate-400 font-mono font-bold">Contact</span>
                          <span className="text-xs font-semibold text-slate-700">{room.contactMethod}</span>
                        </div>
                      </div>

                      {/* List of amenities matching Bubble schema */}
                      {room.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 shrink-0">
                          {room.amenities.map((amenity, idx) => (
                            <span 
                              key={idx}
                              className="text-[10px] font-medium bg-sky-50 text-sky-700 py-0.5 px-2.5 rounded-full border border-sky-100 hover:border-orange-200 transition-all"
                            >
                              {amenity}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Bottom action panel with traffic view incrementing */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto shrink-0">
                        <div className="text-slate-400 text-xs">
                          <div className="flex items-center gap-1 text-[11px] font-mono">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>{new Date(room.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                          </div>
                        </div>

                        <button 
                          onClick={() => handleContactLandlord(room)}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-md transition-all flex items-center gap-1.5 group-hover:scale-102 shrink-0 outline-none"
                        >
                          <Phone className="w-3.5 h-3.5 text-white fill-white/15" />
                          <span>Contact WhatsApp</span>
                        </button>
                      </div>

                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Highlighted BunkBy Promo Section */}
            <section className="bg-orange-500/5 rounded-3xl p-6 sm:p-8 border border-orange-500/10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-2 space-y-2">
                <span className="text-xs font-mono font-bold text-orange-600 tracking-wider uppercase block">Free Traffic Generation</span>
                <h2 className="text-xl sm:text-2xl font-display font-bold text-blue-950">
                  Landlord: Why List With BunkBy?
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Most platforms lock your property behind paywalls or enforce expensive agent cuts. BunkBy is <strong>100% free</strong> for normal landlords. We are building massive tenant traffic! Our system lets you state exactly the student or general tenant type you seek, and easily delist with a single tap as soon as your room gets occupied.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-orange-100 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="text-xs font-bold font-mono text-slate-500 uppercase">Interactive Bot Enabled</span>
                </div>
                <h4 className="text-sm font-bold text-blue-950">Ready to test listing via chat?</h4>
                <p className="text-xs text-slate-400">Our high-fidelity WhatsApp assistant can scrape your text instantly. Just tell BunkBy Bot to draft your room.</p>
                <button 
                  onClick={() => setActiveTab("whatsapp")}
                  className="w-full bg-[#0B2545] hover:bg-[#134074] text-white text-xs font-bold py-2 rounded-xl transition-all shadow-sm"
                >
                  Launch Bot Simulator
                </button>
              </div>
            </section>

          </div>
        )}

        {/* TAB 2: LANDLORDS PORTAL (MY LISTINGS & ACTIVE CONSOLE) */}
        {activeTab === "landlord" && (
          !userProfile ? (
            <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
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
                  className={`w-1/2 rounded-xl text-xs py-2.5 font-bold transition-all ${authMode === "login" ? "bg-white text-blue-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className={`w-1/2 rounded-xl text-xs py-2.5 font-bold transition-all ${authMode === "signup" ? "bg-white text-blue-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
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
                    placeholder="e.g. Tendai Musonza" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-all font-medium text-slate-800"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1 pl-1">
                    Used to retrieve your account (Login / Signup)
                  </p>
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
                      placeholder="e.g. 773043376" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-20 pr-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-mono transition-all font-medium text-slate-800"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 pl-1">
                    Enter numbers only starting with your local code (e.g., 773043376)
                  </p>
                </div>

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

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-100"></div>
                <span className="flex-shrink mx-3 text-xs text-slate-400 uppercase font-mono font-bold">OR DEMO ACCESS</span>
                <div className="flex-grow border-t border-slate-100"></div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => {
                    const profile = {
                      name: "Tatenda E. Chikura",
                      phone: "0773043376",
                      isVerified: true,
                      whatsappLinked: true,
                      role: "Admin"
                    };
                    setUserProfile(profile);
                    localStorage.setItem("bunkby_landlord_profile", JSON.stringify(profile));
                    showToast("⚡ Logged in with default Admin demo landlord account!");
                  }}
                  className="w-full bg-slate-50 hover:bg-slate-100 text-sky-700 hover:text-sky-800 font-bold py-3 rounded-2xl transition-all text-xs border border-slate-200 flex items-center justify-center gap-2 outline-none"
                >
                  🔑 Sign in with Default Admin Demo Account
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Header and status banner */}
              <div className="blue-gradient text-white rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-blue-900/40">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 bg-[#FF7A00] text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Admin Control & Management
                  </div>
                  <h2 className="text-2.5xl font-display font-black text-white">My Landlord Listings</h2>
                  <p className="text-sm text-slate-200 font-medium max-w-xl">
                    Inspect lead analytics, edit room specifications, or quickly delist/delete properties as soon as a tenant checks in. BunkBy protects landlords free of agency fees.
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
              <div className="bg-sky-50 border border-sky-150 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5 text-sky-600" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-sky-900 uppercase tracking-wide font-mono">Dynamic Availability Pulse active</h4>
                  <p className="text-xs text-sky-850 font-medium">To maintain accurate listings, BunkBy transmits a WhatsApp ping every 48 hours. Simply reply <strong>YES</strong> to keep active or the room deactivates automatically!</p>
                </div>
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
                      Tap key 'New Listing' to list your rooms. High tenant traffic yields contacts directly via your phone or WhatsApp line!
                    </p>
                    <button 
                      onClick={() => {
                        setNewRoomForm(prev => ({ ...prev, landlordName: userProfile.name, phone: userProfile.phone }));
                        setIsCreateModalOpen(true);
                      }}
                      className="bg-[#0B2545] hover:bg-[#134074] text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-md"
                    >
                      Create Your First Listing
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
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
                              {room.status === "Delisted" ? (
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
                            </div>

                            {/* Card Image */}
                            <div className="relative h-44 w-full overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                              {(room.image_url || (room.images && room.images[0])) ? (
                                <img 
                                  src={room.image_url || (room.images && room.images[0])} 
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
                            <div className="p-4 flex-grow flex flex-col justify-between space-y-4">
                              <div className="space-y-1">
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
                                  <span>Traffic Generated</span>
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
                                        imageUrl: room.images[0]
                                      });
                                      setUploadedImages(room.images || []);
                                      setIsEditing(room.id);
                                      setIsCreateModalOpen(true);
                                    }}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                                  >
                                    Edit details
                                  </button>
                                )}

                                {!isExpired && (
                                  <button 
                                    onClick={() => handleToggleDelist(room.id)}
                                    className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-all ${room.status === "Active" ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}
                                    title={room.status === "Active" ? "Mark this room as occupied to instantly remove from tenant directory" : "Activate room for listings"}
                                  >
                                    {room.status === "Active" ? "Delist Room" : "Activate Room"}
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
                  <span>How Availability Pulse Works</span>
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">
                  To guarantee BunkBy only retains high-integrity listings, our automatic WhatsApp/SMS service broadcasts an inquiry ping every 48 hours asking if your flat is occupied. Landlords reply with a single word "YES" or "NO" to update status instantly. This ensures high-converting traffic and robust tenant matches.
                </p>
                <div className="bg-blue-50/50 rounded-xl p-3.5 border border-blue-900/5 font-mono text-xs">
                  <p className="font-bold text-slate-700 mb-1">💬 Preview Pulse Ping Msg:</p>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-slate-600 italic">
                    "Hi {userProfile.name}, is your single room listed in {listings[0]?.suburb || "Harare"} still vacant? Reply 1 for VACANT or 2 for RETIRED/RENTED."
                  </div>
                </div>
              </div>

            </div>
          )
        )}

        {/* TAB 3: WHATSAPP CHATBOT (COMING SOON) */}
        {activeTab === "whatsapp" && (
          <div className="space-y-6 flex flex-col items-center justify-center py-20">
            <div className="max-w-2xl mx-auto text-center space-y-4">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-10 h-10 shrink-0 text-emerald-500" />
              </div>
              <span className="bg-emerald-100 text-emerald-800 font-mono text-xs font-bold tracking-wider uppercase px-3 py-1.5 rounded-full">
                WhatsApp Chatbot Simulator
              </span>
              <h2 className="text-3xl font-display font-black text-slate-950">
                Coming Soon!
              </h2>
              <p className="text-base text-slate-500 font-medium">
                The conversational WhatsApp chatbot is coming soon since we haven't connected it yet. Stay tuned for the magical experience of listing and matching rooms straight from WhatsApp!
              </p>
            </div>
          </div>
        )}

        {/* TAB 4: ACCOUNT SETTINGS */}
        {activeTab === "account" && (
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
                  className={`w-1/2 rounded-xl text-xs py-2.5 font-bold transition-all ${authMode === "login" ? "bg-white text-blue-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className={`w-1/2 rounded-xl text-xs py-2.5 font-bold transition-all ${authMode === "signup" ? "bg-white text-blue-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
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
                    placeholder="e.g. Tendai Musonza" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-all font-medium text-slate-800"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1 pl-1">
                    Used to retrieve your account (Login / Signup)
                  </p>
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
                      placeholder="e.g. 773043376" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-20 pr-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-mono transition-all font-medium text-slate-800"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-center pt-2">
                  <button 
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-950 to-blue-900 hover:from-blue-900 hover:to-blue-800 disabled:from-slate-300 disabled:to-slate-300 text-white font-bold rounded-2xl transition-all text-sm shadow hover:shadow-md flex items-center justify-center gap-2 outline-none cursor-pointer"
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
                    onClick={() => {
                      setUserProfile(null);
                      localStorage.removeItem("bunkby_landlord_profile");
                      showToast("🔑 Successfully logged out.");
                    }}
                    className="bg-red-50 hover:bg-red-105 hover:text-red-700 transition-all text-red-650 font-bold text-xs py-2 px-4 rounded-xl border border-red-150 shadow-sm self-start sm:self-center"
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
                      Congratulations! Your credentials have successfully cleared auditing. Your listed properties now bear our golden <strong>Verified Host Badge</strong>, ranking first in local tenant searches and driving maximized WhatsApp interest.
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
                      className="w-full bg-[#0B2545] hover:bg-[#134074] text-white py-2.5 rounded-xl font-bold transition-all text-xs shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
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
                  Receive prompt notifications of rental interest matches directly on your WhatsApp line. You will also get our automatic bi-weekly "Availability Pulse" check-ins to make sure your listings stay search-active!
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
                      className="bg-[#0B2545] hover:bg-[#134074] text-white font-bold text-xs py-2 px-4 rounded-lg transition-all shadow-sm"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>

              {/* Administrative Access Console */}
              {userProfile.role === "Admin" && (
                <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-orange-500" />
                    <h3 className="text-sm font-bold text-blue-950 font-mono uppercase tracking-wide">Administrator Access Panel</h3>
                  </div>
                  <p className="text-xs text-slate-600">
                    You have administrator access on BunkBy. This lets you moderate complaints, verify landlords, or review/delete database entries.
                  </p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                    <div className="bg-white p-3 rounded-xl border border-orange-100 text-center">
                      <span className="text-[9px] font-mono text-slate-400 uppercase block">Global Active listings</span>
                      <span className="text-lg font-black text-slate-950">{listings.length} Listings</span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-orange-100 text-center">
                      <span className="text-[9px] font-mono text-slate-400 uppercase block">Registered Landlords</span>
                      <span className="text-lg font-black text-slate-950">{allLandlords.length} Landlords</span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-orange-100 text-center col-span-2 md:col-span-1">
                      <span className="text-[9px] font-mono text-slate-400 uppercase block">Platform fee</span>
                      <span className="text-lg font-black text-emerald-600">FREE OF CHARGE</span>
                    </div>
                  </div>

                  {/* Landlords Management Table */}
                  <div className="mt-8 space-y-2">
                    <h4 className="text-sm font-bold text-slate-800">Manage Landlords</h4>
                    <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs align-middle">
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
                              <td className="px-4 py-3 font-mono text-slate-600">--</td>
                              <td className="px-4 py-3">
                                {landlord.verification_status === "verified" || landlord.isVerified ? (
                                  <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase tracking-wider">Verified</span>
                                ) : (
                                  <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-[9px] font-bold uppercase tracking-wider">Pending</span>
                                )}
                              </td>
                              <td className="px-4 py-3 space-x-2">
                                {(landlord.verification_status !== "verified" && !landlord.isVerified) && (
                                  <button onClick={async () => {
                                    try {
                                      const res = await fetch("/api/admin", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', id: landlord.id }) });
                                      if (res.ok) {
                                        showToast("✅ Landlord verified successfully.");
                                        setAllLandlords(prev => prev.map(l => l.id === landlord.id ? { ...l, verification_status: 'verified', isVerified: true } : l));
                                      }
                                    } catch(e) { console.error(e); }
                                  }} className="bg-emerald-50 text-emerald-600 font-medium px-2 py-1 rounded border border-emerald-200">Verify</button>
                                )}
                                <button onClick={async () => {
                                    try {
                                      const res = await fetch("/api/admin", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteLandlord', id: landlord.id }) });
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

                  {/* Listings Management Table */}
                  <div className="mt-8 space-y-2">
                    <h4 className="text-sm font-bold text-slate-800">Manage Listings</h4>
                    <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs align-middle">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-mono text-[9px]">
                          <tr>
                            <th className="px-4 py-3">ID / Title</th>
                            <th className="px-4 py-3">City / Suburb</th>
                            <th className="px-4 py-3">Price</th>
                            <th className="px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {listings.map((list: any) => (
                            <tr key={list.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-800">{list.title}</td>
                              <td className="px-4 py-3 text-slate-600">{list.city}, {list.suburb}</td>
                              <td className="px-4 py-3 font-mono text-sky-700 font-bold">${list.price}</td>
                              <td className="px-4 py-3">
                                <button onClick={async () => {
                                    try {
                                      const res = await fetch("/api/admin", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteListing', targetId: list.id }) });
                                      if (res.ok) {
                                        showToast("✅ Listing deleted.");
                                        setListings(prev => prev.filter(l => l.id !== list.id));
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

                </div>
              )}

            </div>
          )
        )}

        {/* TAB 5: HELP & GUIDES */}
        {activeTab === "help" && (
          <div className="space-y-6 max-w-3xl mx-auto">
            
            {/* Help Header */}
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-2.5xl font-display font-black text-slate-950">Help & FAQ Center</h2>
              <p className="text-sm text-slate-500">Everything you need to know about listing rooms, tenant targeting, and our direct WhatsApp chatbot.</p>
            </div>

            {/* FAQ Item List */}
            <div className="space-y-4">
              
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold text-sky-700 text-sm">🏡 What is BunkBy?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  BunkBy is a free platform for landlords to advertise vacant rooms, guesthouses, student hostel beds, or cottages directly to seekers in Zimbabwe. Local listings stay active without the high agency commissions that plague modern renting.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold text-sky-700 text-sm">💬 How does the WhatsApp chatbot integration help listings succeed?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  The success of BunkBy is built entirely on accessibility. Knowing that a large portion of local dwellers rely on WhatsApp data bundles, seekers can search, view listings, and get real-time matching rooms sent directly onto their WhatsApp screens with absolutely zero website log overheads! Landlords list properties in seconds by chatting with our agent bot.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold text-sky-700 text-sm">⚠️ How do I shut down or flag my room as rented/occupied?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Head over to the **Landlords Portal** tab. Every room you place has an active checkout button to "Delist Room" which immediately hides it from the browse page listings. You can reactivate it anytime for free if the tenant leaves.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold text-sky-700 text-sm">💸 If it is totally free, how does BunkBy sustain itself?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Our current goal is purely focused on building high local traffic! In the future, BunkBy intends to introduce paid 30-day premium advertisement programs for commercials listing large guest houses, commercial lounges, or massive boarding complexes while securing normal house owners and student cottage listings completely free forever.
                </p>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-[#0B1B33] text-white pt-8 border-t border-slate-900 mt-auto select-none shrink-0 text-center sm:text-left">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="space-y-3">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <BunkByLogo className="w-8 h-8" />
              <span className="text-xl font-display font-black uppercase tracking-tight text-white">
                Bunk<span className="text-[#FF7A00]">By</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-normal leading-relaxed">
              Agent-free, high-converting WhatsApp chatbot system for renting rooms, apartments, and cottages instantly.
            </p>
          </div>

          <div className="space-y-2.5 flex flex-col items-center sm:items-start text-[11px] text-slate-400 font-normal">
            <h4 className="text-white font-extrabold text-xs uppercase tracking-wider">Active Directories</h4>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start text-slate-400">
              <span>Harare</span> • <span>Bulawayo</span> • <span>Gweru</span> • <span>Mutare</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-normal space-y-2 flex flex-col items-center sm:items-start">
            <h4 className="text-white font-extrabold text-xs uppercase tracking-wider">WhatsApp Assistant</h4>
            <p className="text-slate-400">Save landlord contact numbers straight onto your smartphone bundle.</p>
            <span className="text-[9px] text-orange-400 font-mono font-bold tracking-wider">BUNKBY VERIFICATION BADGE PROGRAM</span>
          </div>

        </div>

        {/* ATLASMANICA BRANDING CREDIT AS USER EXPLICITLY REQUESTED */}
        <div className="bg-black py-5 border-t border-slate-900 text-center sm:text-left">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-[11px] text-slate-400 font-normal">
              <p>© 2026 BunkyBy. BunkBy is a trading name of Atlas Manica Ltd, a company registered in England and Wales</p>
            </div>
            <div className="text-[10px] text-slate-500 font-bold tracking-wider font-mono">
              ZIMBABWE'S PREMIUM INDEPENDENT RENTAL HOUSING NETWORK
            </div>
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
              className="bg-white rounded-3xl pb-6 max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              
              {/* Modal header details */}
              <div className="bg-[#0B2545] text-white p-5 flex items-center justify-between shrink-0 select-none border-b border-sky-900">
                <div className="flex items-center gap-2">
                  <BunkByLogo className="w-8 h-8" />
                  <h3 className="font-display font-black text-lg">
                    {isEditing ? "Edit Room Specification" : "List Your Room For Free"}
                  </h3>
                </div>
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white"
                >
                  <X className="w-5 h-5 shrink-0" />
                </button>
              </div>

              {/* Form field listing details scrollable container */}
              <form onSubmit={handleSaveListing} className="p-6 overflow-y-auto space-y-5 text-left flex-grow">
                
                {/* Heading details */}
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Property / Listing Title*</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Elegant Single Room with Tiled Floors"
                    required
                    value={newRoomForm.title}
                    onChange={(e) => setNewRoomForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-blue-900 focus:outline-none"
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
                      placeholder="e.g. Avonlea / Murambi"
                      required
                      value={newRoomForm.suburb}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, suburb: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-blue-900 focus:outline-none"
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Price USD */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Monthly Rent (USD)*</label>
                    <input 
                      type="number" 
                      required
                      min={0}
                      value={newRoomForm.price}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, price: Number(e.target.value) }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>

                  {/* Deposit Price */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Security Deposit (USD)</label>
                    <input 
                      type="number" 
                      min={0}
                      value={newRoomForm.deposit}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, deposit: Number(e.target.value) }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-blue-900 focus:outline-none"
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
                      {ALL_PROPERTY_TYPES.map(pt => (
                        <option key={pt} value={pt}>{pt}</option>
                      ))}
                    </select>
                  </div>

                  {/* Tenant seeks selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Preferred Tenant Type</label>
                    <select
                      value={newRoomForm.tenantType}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, tenantType: e.target.value as TenantType }))}
                      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50 focus:outline-none cursor-pointer"
                    >
                      <option value="General">General sought</option>
                      <option value="Student">Student sought</option>
                      <option value="Single">Single sought</option>
                      <option value="Guest">Guest sought</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Rent Frequency */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Rent Cycle Frequency</label>
                    <select
                      value={newRoomForm.frequency}
                      onChange={(e) => setNewRoomForm(prev => ({ ...prev, frequency: e.target.value as RentFrequency }))}
                      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50 focus:outline-none cursor-pointer"
                    >
                      <option value="Month">Per Month</option>
                      <option value="Semester">Per Semester</option>
                      <option value="Night">Per Night</option>
                      <option value="Hour">Per Hour</option>
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
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">Room Photos (Select Up To 2)</label>
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
                    {uploadedImages.length < 2 && !cameraActive && (
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
                    <div className="border border-slate-300 rounded-xl overflow-hidden bg-black aspect-video relative flex flex-col items-center justify-center">
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
                    uploadedImages.length < 2 && (
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
              className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 shadow-2xl space-y-4 text-left"
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
                      src={pendingContactRoom.image_url || pendingContactRoom.images[0]}
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
              className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 shadow-2xl space-y-4 text-left"
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
                ⭐ Upon approval, your premium ad remains 100% active and searchable in Zimbabwe's feed for 30 calendar days.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
