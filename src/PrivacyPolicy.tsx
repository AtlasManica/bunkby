/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect } from "react";
import { 
  ShieldCheck, 
  ArrowLeft, 
  Lock, 
  FileText, 
  MessageSquare, 
  Eye, 
  Server, 
  Clock, 
  Users, 
  UserCheck, 
  AlertCircle, 
  Globe, 
  CheckCircle2,
  PhoneCall
} from "lucide-react";

interface PrivacyPolicyProps {
  onBackToHome: () => void;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBackToHome }) => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.title = "Privacy Policy | BunkBy Zimbabwe Accommodation Marketplace";
    return () => {
      document.title = "BunkBy | Zimbabwe's Agent-Free Accommodation Marketplace";
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#021024] text-slate-100 flex flex-col font-sans selection:bg-[#FF7A00] selection:text-white">
      {/* Top Banner & Navigation */}
      <header className="sticky top-0 z-40 bg-[#021024]/95 backdrop-blur-md border-b border-[#052659] py-3.5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToHome}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#052659] hover:bg-[#07357c] text-white text-xs font-bold transition-all border border-white/10 shadow-sm group"
              aria-label="Return to BunkBy Accommodation Marketplace"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#FF7A00] transition-transform group-hover:-translate-x-0.5" />
              <span>Back to BunkBy</span>
            </button>
            <div className="hidden sm:block h-4 w-px bg-slate-700/60" />
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm font-display font-black tracking-tight text-white">
                Bunk<span className="text-[#FF7A00]">By</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono font-medium">LEGAL DOCUMENTATION</span>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#052659]/70 border border-white/10 text-[11px] text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-[#FF7A00]" />
            <span>Public Compliance Notice</span>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <div className="relative border-b border-[#052659] bg-gradient-to-b from-[#052659]/40 via-[#021024] to-[#021024] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#052659] border border-[#FF7A00]/30 text-[#FF7A00] text-xs font-mono font-bold tracking-wider shadow-sm">
            <span>OFFICIAL PRIVACY POLICY</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-tight text-white leading-tight">
            BunkBy Privacy Policy
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
            How BunkBy collects, uses, protects, and handles accommodation listings, user enquiries, and WhatsApp communications across Zimbabwe.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs text-slate-400 font-mono">
            <span>Effective Date: 11 October 2026</span>
            <span>•</span>
            <span>Platform: Web & WhatsApp Cloud API</span>
            <span>•</span>
            <span>Operator: Atlas Manica Group</span>
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8">

        {/* Quick Context / Meta Developer Callout */}
        <section className="bg-[#052659]/50 border border-[#052659] rounded-2xl p-5 text-xs text-slate-300 leading-relaxed space-y-2">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Lock className="w-4 h-4 text-[#FF7A00]" />
            <span>About this Document</span>
          </div>
          <p>
            This Privacy Policy applies to the <strong className="text-white">BunkBy</strong> accommodation marketplace accessible at <code className="bg-[#021024] px-1.5 py-0.5 rounded text-[#FF7A00] font-mono">https://bunkby.com</code> and through our official WhatsApp Business conversational bot. It is publicly published to provide complete transparency for property seekers, accommodation providers (landlords and lodging hosts), and technology partners including Meta Platforms, Inc.
          </p>
        </section>

        {/* SECTION 1: Who We Are */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              01
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">1. Who We Are</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Operator & Legal Identity</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-3 pl-0 sm:pl-11">
            <p>
              <strong className="text-white">BunkBy</strong> is an agent-free accommodation marketplace connecting accommodation seekers with landlords, cottage owners, student housing providers, and hospitality hosts across Zimbabwe (including Harare, Bulawayo, Mutare, Gweru, and other localities).
            </p>
            <p>
              BunkBy is developed and operated by <strong className="text-white">Atlas Manica Group</strong>. All platform governance, database infrastructure, technical operations, and WhatsApp messaging integrations are administered under Atlas Manica Group.
            </p>
          </div>
        </section>

        {/* SECTION 2: Information We Collect */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              02
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">2. Information We Collect</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Data minimization based on actual platform features</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-3 pl-0 sm:pl-11">
            <p>
              We collect only the information strictly necessary to publish listings, verify property advertisers, connect seekers with hosts, and run our automated WhatsApp communication assistant:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="bg-[#021024] p-3.5 rounded-xl border border-white/5 space-y-1.5">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-[#FF7A00]" /> Landlord & Host Account Data
                </span>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Full name, Zimbabwean mobile / WhatsApp telephone number (e.g., +263 format), secure landlord account PIN for authorization, and verification status.
                </p>
              </div>
              <div className="bg-[#021024] p-3.5 rounded-xl border border-white/5 space-y-1.5">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#FF7A00]" /> Property Listing Details
                </span>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Accommodation title, suburb/neighborhood, town/city, rental price, security deposit, property type (room, cottage, bedsit, lodge), tenant preferences, rent cycle, amenities checklist, and uploaded property photographs.
                </p>
              </div>
              <div className="bg-[#021024] p-3.5 rounded-xl border border-white/5 space-y-1.5">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-[#FF7A00]" /> Direct Contact & Enquiries
                </span>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Seeker name and phone number voluntarily provided when initiating a direct landlord enquiry via WhatsApp, plus listing view / contact lead counters.
                </p>
              </div>
              <div className="bg-[#021024] p-3.5 rounded-xl border border-white/5 space-y-1.5">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-[#FF7A00]" /> Technical Logs & Diagnostics
                </span>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Standard web request IP addresses, browser user-agent headers, and sanitized webhook diagnostic logs (message timestamp, sender phone ID, message type, and error traces) for service reliability.
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 italic pt-1">
              Note: BunkBy does not collect unnecessary sensitive biometric data, national ID copies, passport scans, credit card numbers, or bank account credentials.
            </p>
          </div>
        </section>

        {/* SECTION 3: How We Use Information */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              03
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">3. How We Use Information</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Purposes of processing</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-2.5 pl-0 sm:pl-11">
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#FF7A00] shrink-0 mt-0.5" />
                <span><strong>Publishing Public Listings:</strong> To display available accommodation rooms, cottages, and hospitality spaces on the BunkBy web platform and WhatsApp catalog.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#FF7A00] shrink-0 mt-0.5" />
                <span><strong>Direct Communication:</strong> Enabling seekers to contact landlords and hosts directly without middleman agents or agency fees.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#FF7A00] shrink-0 mt-0.5" />
                <span><strong>Automated Chatbot Assistance:</strong> Interpreting inbound WhatsApp search queries, managing conversational listing creation sessions, and returning matching accommodation options.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#FF7A00] shrink-0 mt-0.5" />
                <span><strong>Security & Fraud Prevention:</strong> Preventing duplicate listings, detecting fraudulent advertisers or scam reports through community moderation, and verifying account ownership via PINs.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#FF7A00] shrink-0 mt-0.5" />
                <span><strong>Platform Optimization:</strong> Monitoring system uptime, error rates, and query responsiveness across our web server and Cloudflare network.</span>
              </li>
            </ul>
          </div>
        </section>

        {/* SECTION 4: WhatsApp Communications & Meta Cloud API */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              04
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">4. WhatsApp Communications & Meta Integration</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Details for Meta Developer Dashboard compliance</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-3 pl-0 sm:pl-11">
            <p>
              Users may interact with BunkBy via our official WhatsApp Business messaging channel. When you message BunkBy on WhatsApp:
            </p>
            <div className="bg-[#021024] p-4 rounded-xl border border-white/5 space-y-2 text-xs">
              <p>
                <strong>Inbound Messages:</strong> Messages sent to BunkBy are delivered to our webhook endpoint (<code className="text-[#FF7A00]">/api/whatsapp</code>) hosted on our secure server and Cloudflare Pages Functions infrastructure.
              </p>
              <p>
                <strong>Data Processed:</strong> We receive your sender phone number (WhatsApp ID / wa_id), your public WhatsApp profile display name (if available), the text content of your search query or command, and any button responses you select.
              </p>
              <p>
                <strong>Conversational State:</strong> For landlords adding a listing via WhatsApp, session state (e.g. current question step, collected title, price, location) is temporarily stored in our database (<code className="text-slate-400">chatbot_sessions</code>) to allow completion of the multi-step listing prompt.
              </p>
              <p>
                <strong>Meta's Independent Processing:</strong> WhatsApp and Meta Platforms, Inc. process message transmission and metadata under their own terms and privacy notices. You can review the Meta Privacy Policy at <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[#FF7A00] underline hover:text-white">whatsapp.com/legal/privacy-policy</a>.
              </p>
            </div>
            <p className="text-xs text-slate-400">
              We do not use your WhatsApp contact number for unsolicited third-party marketing, nor do we sell your telephone number to external marketing networks.
            </p>
          </div>
        </section>

        {/* SECTION 5: Sharing Information */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              05
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">5. Information Sharing & Disclosure</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">When and with whom data is shared</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-3 pl-0 sm:pl-11">
            <p>
              As an open accommodation directory, specific data is shared by design:
            </p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <Users className="w-3.5 h-3.5 text-[#FF7A00] shrink-0 mt-0.5" />
                <span><strong>Public Listing Visibility:</strong> When a landlord publishes a room, the property images, description, suburb, city, rental price, and provided contact phone number are publicly viewable by seekers to facilitate direct dealmaking.</span>
              </li>
              <li className="flex items-start gap-2">
                <Users className="w-3.5 h-3.5 text-[#FF7A00] shrink-0 mt-0.5" />
                <span><strong>Connecting Seekers & Landlords:</strong> When a seeker clicks “Contact on WhatsApp”, they are redirected directly to a WhatsApp chat with the listing host.</span>
              </li>
              <li className="flex items-start gap-2">
                <Server className="w-3.5 h-3.5 text-[#FF7A00] shrink-0 mt-0.5" />
                <span><strong>Technical Infrastructure Providers:</strong> Data is hosted with reputable cloud infrastructure partners (Cloudflare Pages, Cloudflare D1, Google Cloud Run) solely for running the application and database.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-[#FF7A00] shrink-0 mt-0.5" />
                <span><strong>Legal Compliance:</strong> We may disclose information if required to do so by applicable law, court order, or governmental authority in Zimbabwe.</span>
              </li>
            </ul>
          </div>
        </section>

        {/* SECTION 6: Cookies, Storage & Technical Data */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              06
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">6. Cookies & Client-Side Storage</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Local browser storage mechanisms</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-2.5 pl-0 sm:pl-11">
            <p>
              BunkBy does not deploy tracking cookies or third-party behavioral advertising cookies. We utilize standard browser <code className="bg-[#021024] px-1.5 py-0.5 rounded text-[#FF7A00] font-mono">localStorage</code> strictly for application functionality:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><strong className="text-white">bunkby_landlord_profile:</strong> Stores logged-in landlord session tokens and profile information so you do not have to re-enter your PIN on every visit.</li>
              <li><strong className="text-white">bunkby_gate_name & bunkby_gate_phone:</strong> Temporarily retains your contact name and phone number on your device when enquiring on listings.</li>
            </ul>
            <p className="text-xs text-slate-400">
              You can clear these stored values at any time through your browser settings or by signing out from the Account tab.
            </p>
          </div>
        </section>

        {/* SECTION 7: Data Retention */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              07
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">7. Data Retention</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">How long your records are kept</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-2.5 pl-0 sm:pl-11">
            <p>
              We retain data only as long as reasonably necessary for platform operations:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li><strong>Active Listings:</strong> Retained until the landlord marks the property as occupied, delists it, or requests deletion.</li>
              <li><strong>Landlord Profiles:</strong> Retained while the landlord manages listings or until an account removal request is processed.</li>
              <li><strong>Temporary Chatbot Sessions:</strong> Expire automatically upon completion of the conversational workflow or after inactivity.</li>
              <li><strong>Diagnostic Event Logs:</strong> Diagnostic event logs are rotated periodically to ensure system stability.</li>
            </ul>
          </div>
        </section>

        {/* SECTION 8: Security Safeguards */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              08
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">8. Security Safeguards</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Protection of listings and accounts</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-2.5 pl-0 sm:pl-11">
            <p>
              We implement reasonable administrative, technical, and operational measures to protect your information, including encrypted HTTPS/TLS in transit, PIN-protected landlord authentication, webhook verification tokens, and restricted database access.
            </p>
            <p className="text-slate-400 text-xs">
              Please note that no method of transmission over the Internet or electronic storage is 100% secure. Landlords are advised to safeguard their private 4-digit PINs and refrain from sharing credentials.
            </p>
          </div>
        </section>

        {/* SECTION 9: User Rights and Choices */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              09
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">9. User Rights & Choices</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Control over your accommodation data</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-2.5 pl-0 sm:pl-11">
            <p>
              Users in Zimbabwe and visiting international users have rights regarding their information:
            </p>
            <ul className="space-y-1.5 text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-[#FF7A00] font-bold">•</span>
                <span><strong>Editing / Updating Listings:</strong> Landlords can update property descriptions, pricing, contact numbers, and amenities at any time directly through the Landlords Portal.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FF7A00] font-bold">•</span>
                <span><strong>Delisting or Deletion:</strong> You may instantly delist or permanently remove your property from public browsing using the delist button in the landlord management dashboard.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FF7A00] font-bold">•</span>
                <span><strong>Access & Account Removal Requests:</strong> To request a copy of your stored records or request complete deletion of your landlord account, contact our administration team via the verified channels listed below.</span>
              </li>
            </ul>
          </div>
        </section>

        {/* SECTION 10: Children's Privacy */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              10
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">10. Children's Privacy</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Intended audience</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-0 sm:pl-11">
            <p>
              BunkBy is intended for adult property seekers, university students of legal contractual age, and adult property owners capable of entering rental accommodation agreements. We do not knowingly collect personal information from individuals under 18 years of age. If we learn that personal information of a child has been collected, we will take steps to promptly remove it.
            </p>
          </div>
        </section>

        {/* SECTION 11: Third-Party Services */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              11
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">11. Third-Party Integrations</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">External platforms connected to BunkBy</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-2.5 pl-0 sm:pl-11">
            <p>
              The platform interfaces with select third-party services:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li><strong>Meta WhatsApp Cloud API:</strong> For bidirectional WhatsApp message delivery and automated query fulfillment.</li>
              <li><strong>Cloudflare:</strong> For edge routing, DDoS mitigation, DNS resolution, and Cloudflare Pages Functions.</li>
              <li><strong>Google Cloud:</strong> For hosting server application instances on Cloud Run.</li>
            </ul>
          </div>
        </section>

        {/* SECTION 12: International Transfers */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              12
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">12. International Data Transfers</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Geographical hosting details</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-0 sm:pl-11">
            <p>
              While BunkBy serves the Zimbabwean accommodation market, cloud hosting servers and Meta WhatsApp infrastructure are located in international data center regions (including the United Kingdom, Europe, and South Africa). By using BunkBy or messaging our WhatsApp assistant, you acknowledge that your data may be processed in these jurisdictions in compliance with industry-standard security safeguards.
            </p>
          </div>
        </section>

        {/* SECTION 13: Policy Changes */}
        <section className="bg-[#03152f]/70 border border-[#052659] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#052659] border border-white/10 flex items-center justify-center shrink-0 text-[#FF7A00] font-bold font-mono text-xs">
              13
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">13. Policy Updates</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Revision announcements</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-0 sm:pl-11">
            <p>
              We may revise this Privacy Policy from time to time to reflect operational, legal, or regulatory updates. Any changes will be posted directly on this page with an updated Effective Date. Continued use of BunkBy following the posting of updates constitutes your agreement to the modified terms.
            </p>
          </div>
        </section>

        {/* SECTION 14: Contact Details */}
        <section className="bg-[#052659]/60 border border-[#FF7A00]/40 rounded-2xl p-6 sm:p-7 space-y-4 shadow-md">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#FF7A00] text-slate-950 flex items-center justify-center shrink-0 font-bold font-mono text-xs">
              14
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">14. Contact Details & Inquiries</h2>
              <p className="text-xs text-[#FF7A00] font-mono mt-0.5 font-bold">Atlas Manica Group Administration</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-slate-200 leading-relaxed space-y-3 pl-0 sm:pl-11">
            <p>
              If you have any questions about this Privacy Policy, wish to exercise your data rights, or need assistance regarding your BunkBy account, please contact the operator:
            </p>
            <div className="bg-[#021024] p-4 rounded-xl border border-white/10 space-y-2 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-white/10 pb-2">
                <span className="text-slate-400 font-mono">Platform Operator:</span>
                <span className="text-white font-bold">Atlas Manica Group</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-white/10 pb-2">
                <span className="text-slate-400 font-mono">Official Website:</span>
                <a href="https://bunkby.com" className="text-[#FF7A00] font-bold underline">https://bunkby.com</a>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-white/10 pb-2">
                <span className="text-slate-400 font-mono">WhatsApp Support & Inquiries:</span>
                <a 
                  href="https://wa.me/263771122334" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-emerald-400 font-bold underline flex items-center gap-1"
                >
                  <MessageSquare className="w-3 h-3" /> +263 77 112 2334
                </a>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-slate-400 font-mono">Dedicated Privacy URL:</span>
                <code className="text-[#FF7A00] font-mono">https://bunkby.com/privacy-policy</code>
              </div>
            </div>
          </div>
        </section>

        {/* Back to Home CTA */}
        <div className="text-center pt-4">
          <button
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#052659] hover:bg-[#07357c] text-white text-sm font-bold transition-all border border-[#FF7A00]/40 shadow-lg group"
          >
            <ArrowLeft className="w-4 h-4 text-[#FF7A00] transition-transform group-hover:-translate-x-1" />
            <span>Return to BunkBy Accommodation Directory</span>
          </button>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-[#052659] bg-[#021024] py-8 px-4 text-center text-xs text-slate-400 font-normal">
        <div className="max-w-4xl mx-auto space-y-2">
          <p>© 2026 BunkBy. BunkBy is an accommodation marketplace operated by Atlas Manica Group.</p>
          <div className="flex items-center justify-center gap-3 text-[11px] text-slate-500 font-mono">
            <button onClick={onBackToHome} className="hover:text-white transition-colors">Home</button>
            <span>•</span>
            <span className="text-[#FF7A00]">Privacy Policy</span>
            <span>•</span>
            <a href="https://wa.me/263771122334" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">WhatsApp Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPolicy;
