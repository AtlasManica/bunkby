/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect } from "react";
import { ArrowLeft, Mail, ShieldCheck, CheckCircle2 } from "lucide-react";

interface PrivacyPolicyProps {
  onBackToHome: () => void;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBackToHome }) => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.title = "Privacy Policy | BunkBy – Zimbabwe Accommodation Marketplace";
    // Set meta description for privacy policy page
    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc ? metaDesc.getAttribute("content") : "";
    if (metaDesc) {
      metaDesc.setAttribute("content", "Read the official BunkBy Privacy Policy. Learn how we handle accommodation listings, host information, user enquiries, and WhatsApp communications across Zimbabwe.");
    }
    return () => {
      document.title = "BunkBy – Zimbabwe Accommodation Marketplace | Agent-Free Rooms, Cottages & Lodges";
      if (metaDesc && prevDesc) {
        metaDesc.setAttribute("content", prevDesc);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col font-sans selection:bg-[#FF7A00] selection:text-white">
      {/* Top Header - White themed, clean */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 py-3.5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors border border-slate-200 cursor-pointer group"
            aria-label="Return to BunkBy"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#FF7A00] transition-transform group-hover:-translate-x-0.5" />
            <span>Back to BunkBy</span>
          </button>
        </div>
      </header>

      {/* Main Title Section - Clean white theme, responsive padding */}
      <div className="bg-white border-b border-slate-100 py-6 sm:py-10 px-3 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-2 sm:space-y-3">
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Privacy Policy
          </h1>
          <p className="text-xs sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            How BunkBy collects, uses, protects, and handles accommodation listings, user enquiries, and WhatsApp communications across Zimbabwe.
          </p>
          <div className="pt-1 inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-0.5 sm:py-1 bg-slate-50 border border-slate-200 rounded-full text-[11px] sm:text-xs text-slate-600">
            <span className="font-semibold text-slate-900">Effective Date:</span>
            <span>11 October 2026</span>
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-4 sm:space-y-6">
        {/* Intro Overview */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 leading-relaxed text-sm text-slate-600 shadow-xs space-y-3">
          <p>
            This Privacy Policy explains how <strong className="text-slate-900">BunkBy</strong>, operated by <strong className="text-slate-900">Atlas Manica Group</strong>, collects, uses, stores, and shares personal information when people use our accommodation marketplace and WhatsApp communication service. We aim to handle personal information responsibly and to meet applicable legal obligations.
          </p>
          <p>
            BunkBy operates in Zimbabwe and takes account of applicable Zimbabwean data protection requirements, including the <strong className="text-slate-900">Cyber and Data Protection Act [Chapter 12:07]</strong>.
          </p>
        </section>

        {/* SECTION 1: Who We Are */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">1.</span>
            Who We Are
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed space-y-3">
            <p>
              <strong className="text-slate-900">BunkBy</strong> is an agent-free accommodation marketplace connecting property seekers with landlords, cottage owners, student housing providers, and hospitality hosts across Zimbabwe (including Harare, Bulawayo, Mutare, Gweru, and other localities).
            </p>
            <p>
              BunkBy is operated by <strong className="text-slate-900">Atlas Manica Group</strong>. All platform governance, hosting infrastructure, technical operations, and WhatsApp messaging integrations are administered under Atlas Manica Group.
            </p>
          </div>
        </section>

        {/* SECTION 2: Information We Collect */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">2.</span>
            Information We Collect
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed space-y-3">
            <p>
              We collect information necessary to publish listings, verify property advertisers, connect seekers with hosts, and operate our automated WhatsApp communication assistant:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-600">
              <li>
                <strong className="text-slate-900">Landlord & Host Information:</strong> Name, Zimbabwean mobile or WhatsApp phone number, security PIN for account authorization, and verification status.
              </li>
              <li>
                <strong className="text-slate-900">Property Listing Details:</strong> Accommodation title, description, monthly rental or daily rate, currency (USD), locality, suburb, city, property type, amenities, availability date, and uploaded photographs.
              </li>
              <li>
                <strong className="text-slate-900">Property Seeker Enquiries:</strong> Name and contact phone number entered when initiating an inquiry on a listing, used locally on your device to prefill your direct WhatsApp message to the host and recorded in aggregate listing lead statistics.
              </li>
              <li>
                <strong className="text-slate-900">Technical Information:</strong> Standard request logs including IP addresses, browser user agent details, timestamps, and search query parameters as processed by our hosting infrastructure.
              </li>
            </ul>
          </div>
        </section>

        {/* SECTION 3: How We Use Information */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">3.</span>
            How We Use Information
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed space-y-3">
            <p>Information gathered through BunkBy is processed for the following purposes:</p>
            <ul className="list-disc pl-5 space-y-2 text-slate-600">
              <li>
                <strong className="text-slate-900">Facilitating Direct Connections:</strong> Allowing property seekers to discover rooms, flats, cottages, or lodges and contact verified landlords directly.
              </li>
              <li>
                <strong className="text-slate-900">Listing Administration:</strong> Enabling property owners to post, update, activate, and manage accommodation adverts.
              </li>
              <li>
                <strong className="text-slate-900">Automated Messaging & Search:</strong> Processing inquiries and keyword searches sent via WhatsApp to return matching accommodation listings.
              </li>
              <li>
                <strong className="text-slate-900">Platform Integrity:</strong> Enforcing listing quality, verifying advertisers, and combating fraud or duplicate adverts.
              </li>
              <li>
                <strong className="text-slate-900">Technical Operations:</strong> Monitoring uptime, resolving technical issues, and ensuring responsive service performance.
              </li>
            </ul>
          </div>
        </section>

        {/* SECTION 4: WhatsApp Communications & Meta Integration */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">4.</span>
            WhatsApp Communications & Meta Integration
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Details for Meta Developer Dashboard compliance
          </p>
          <div className="text-sm text-slate-600 leading-relaxed space-y-3 pt-1">
            <p>
              Users may interact with BunkBy via our official WhatsApp Business messaging channel. When you message BunkBy on WhatsApp:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-600">
              <li>
                <strong className="text-slate-900">Inbound Messages:</strong> Messages sent to BunkBy are delivered to our webhook endpoint hosted on our secure server and Cloudflare Pages Functions infrastructure.
              </li>
              <li>
                <strong className="text-slate-900">Data Processed:</strong> We receive your sender phone number , your public WhatsApp profile display name (if available), the text content of your search query or command, and any button responses you select. Messages and sender information are processed by BunkBy and its infrastructure providers solely to respond to your queries, search requests, or listing actions.
              </li>
              <li>
                <strong className="text-slate-900">Conversational State:</strong> For landlords adding a listing via WhatsApp, session state (e.g. current question step, collected title, price, location) is temporarily stored in our database to allow completion of the multi-step listing prompt.
              </li>
              <li>
                <strong className="text-slate-900">Meta's Independent Processing:</strong> WhatsApp and Meta Platforms, Inc. process message transmission and metadata under their own applicable terms and privacy notices. You can review the official WhatsApp Privacy Policy at whatsapp.com/legal/privacy-policy. Business messaging on WhatsApp involves processing by BunkBy, its hosting providers, and Meta.
              </li>
            </ul>
          </div>
        </section>

        {/* SECTION 5: Information Sharing & Disclosure */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">5.</span>
            Information Sharing & Disclosure
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed space-y-3">
            <p>
              BunkBy operates as an agent-free accommodation marketplace. We do not sell your personal data. We disclose information only under the following circumstances:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-600">
              <li>
                <strong className="text-slate-900">Between Seekers and Hosts:</strong> When a user initiates contact on a listing or requests host details, contact information is exchanged so both parties can communicate regarding tenancy.
              </li>
              <li>
                <strong className="text-slate-900">Service & Infrastructure Providers:</strong> Technical service providers supporting application hosting, DNS and network routing, and WhatsApp Business API message delivery as necessary to operate the service.
              </li>
              <li>
                <strong className="text-slate-900">Legal Requirements:</strong> Where disclosure is required by applicable law, lawful warrant, court order, or regulatory authority.
              </li>
            </ul>
          </div>
        </section>

        {/* SECTION 6: Client-Side Storage */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">6.</span>
            Client-Side Storage
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed space-y-3">
            <p>
              BunkBy does not deploy third-party tracking or advertising cookies. The web application utilizes standard client-side browser storage (such as browser local storage) strictly for functional purposes, including retaining active session state for logged-in landlords and temporarily preserving contact input on your device.
            </p>
            <p>
              You can clear client-side browser storage at any time through your device or browser settings, or by signing out from your account. Please note that clearing local browser storage removes data stored on your device only; it does not delete your server-side account or active property listings. To request deletion of server-side data, please submit a deletion request as described in Section 8.
            </p>
          </div>
        </section>

        {/* SECTION 7: Property Listing Lifespan, Retention & Management */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">7.</span>
            Property Listing Lifespan & Data Retention
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed space-y-3">
            <p>
              To maintain an active, high-integrity marketplace and prevent stale or occupied accommodations from frustrating prospective tenants, BunkBy enforces clear listing lifespans and transparent retention schedules:
            </p>
            <ul className="list-disc pl-5 space-y-2.5 text-slate-600">
              <li>
                <strong className="text-slate-900">30-Day Listing Lifespan:</strong> Standard published properties (residential rentals, commercial spaces, student rooms, and hospitality stays) remain active and discoverable on the marketplace for a standard cycle of thirty (30) days from publication or renewal.
              </li>
              <li>
                <strong className="text-slate-900">Landlord Self-Service Renewal & Delisting:</strong> Landlords and property hosts retain 24/7 full self-service control. When a room or space is occupied, hosts can mark the property as <em>Rented / Delisted</em> or permanently delete it at any time directly from their landlord dashboard or via the automated WhatsApp bot (by sending <em>"my listings"</em> or <em>"delete"</em>). Delisted properties are immediately removed from public searches.
              </li>
              <li>
                <strong className="text-slate-900">Tenant Real-Time Availability Check:</strong> Prospective renters and guests can tap <em>"Ask Host: Is this still available?"</em> on any property card to initiate direct communication with the host via WhatsApp, verifying occupancy status in real time with zero agent fees.
              </li>
              <li>
                <strong className="text-slate-900">Expired & Archived Listings:</strong> Listings that reach the conclusion of their 30-day active period without host renewal are automatically transitioned out of the public browse directory into an inactive archive state. Property data is permanently removed upon an explicit deletion request from the host.
              </li>
              <li>
                <strong className="text-slate-900">Landlord Accounts & Contact Data:</strong> Registered landlord names, contact phone numbers, and authentication tokens are securely retained solely to allow hosts to manage their properties until the host requests account closure or record erasure.
              </li>
              <li>
                <strong className="text-slate-900">WhatsApp Inquiries & Temporary Sessions:</strong> Chatbot interaction session states, temporary upload queues, and diagnostic timestamps are retained only for the duration required to complete property listing or search operations, after which temporary sessions are cleared.
              </li>
            </ul>
            <p>
              When a user submits a deletion request under Section 8, we promptly erase eligible records from our active databases, subject only to mandatory legal obligations (such as fraud prevention or dispute records).
            </p>
          </div>
        </section>

        {/* SECTION 8: User Rights & Manual Deletion-Request Process */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">8.</span>
            User Rights & Request Process
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed space-y-4">
            <p>
              Taking account of the Cyber and Data Protection Act [Chapter 12:07] and recognized privacy principles, we provide routes for users to manage their personal information:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-600">
              <li>
                <strong className="text-slate-900">Access & Inquiries:</strong> You may contact us to inquire whether we hold personal information relating to you and request details of what is stored.
              </li>
              <li>
                <strong className="text-slate-900">Correction:</strong> Landlords can update or correct their listing details, pricing, and contact numbers directly via the portal. For other corrections, you may contact our privacy email.
              </li>
              <li>
                <strong className="text-slate-900">Objection & Ceasing Communication:</strong> You can discontinue using the marketplace or stop messaging our WhatsApp bot at any time.
              </li>
              <li>
                <strong className="text-slate-900">Deletion Requests:</strong> While automated self-service account deletion is not currently implemented in the database, our team actively monitors incoming requests. Deletion requests will be reviewed and handled subject to applicable legal obligations, necessary operational retention, and technical feasibility (for example, server records we directly control, as distinct from third-party logs or copies retained independently by communication service providers).
              </li>
            </ul>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#FF7A00]" />
                <span>How to Submit a Request</span>
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                To request manual review, record correction, or database deletion of your account or listings, send an email to our team:
              </p>
              <div className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded px-3 py-2 inline-block font-mono">
                atlasmanica@gmail.com
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Please include your registered phone number, the relevant listing title or locality (if applicable), and your specific request. Our administration team monitors this email and reviews each request individually, taking appropriate steps to remove eligible records from active databases subject to legal and operational retention requirements.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 9: Security Safeguards */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">9.</span>
            Security Safeguards
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed space-y-3">
            <p>
              We implement reasonable and appropriate technical and operational safeguards designed to protect personal information against unauthorized access, loss, misuse, or alteration. These include encrypted transmission (HTTPS / TLS) for web traffic, access control measures on operational credentials and application hosting environments, and restricted access to administrative systems.
            </p>
            <p>
              While we take diligent precautions to safeguard data, no method of transmission over the Internet or electronic storage can be guaranteed 100% secure.
            </p>
          </div>
        </section>

        {/* SECTION 10: Children's Privacy */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">10.</span>
            Children's Privacy
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed">
            <p>
              BunkBy is intended for adults, tertiary students, and individuals of legal age capable of entering rental accommodation agreements. We do not knowingly collect personal information from individuals under 18 years of age. If we learn that personal information of a child has been collected, we will take steps to promptly remove it.
            </p>
          </div>
        </section>

        {/* SECTION 11: Third-Party Service Providers & Processing Locations */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">11.</span>
            Third-Party Providers & Data Processing
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed space-y-3">
            <p>
              BunkBy relies on reputable third-party technology providers to host our application, protect our network, and route WhatsApp communications. These service providers may process information in countries where they operate:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-600">
              <li>
                <strong className="text-slate-900">Meta WhatsApp Cloud API:</strong> For bidirectional WhatsApp message delivery and automated customer query fulfillment.
              </li>
              <li>
                <strong className="text-slate-900">Cloud & Network Providers:</strong> For edge routing, security mitigation, DNS resolution, and application server hosting.
              </li>
            </ul>
            <p>
              By using BunkBy or communicating with our WhatsApp assistant, you acknowledge that your information may be processed by these service providers in accordance with their respective privacy and security standards.
            </p>
          </div>
        </section>

        {/* SECTION 12: Policy Updates */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">12.</span>
            Policy Updates
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed space-y-2">
            <p>
              We may revise this Privacy Policy from time to time to reflect operational, legal, technical, or regulatory updates. Any changes will be posted directly on this page with a revised effective date at the top of the policy.
            </p>
          </div>
        </section>

        {/* SECTION 13: Contact Us About Privacy */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-7 space-y-4 shadow-xs">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <span className="text-[#FF7A00] font-mono font-bold mr-2">13.</span>
            Contact Us About Privacy
          </h2>
          <div className="text-sm text-slate-600 leading-relaxed space-y-3">
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy, your personal data, or wish to exercise your rights of access, correction, objection, or deletion, please contact Atlas Manica Group:
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-2.5">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-[#FF7A00] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs text-slate-500 font-medium">Dedicated Privacy Email</div>
                  <div className="text-sm font-bold text-slate-900 font-mono select-all">
                    atlasmanica@gmail.com
                  </div>
                </div>
              </div>
              <div className="h-px bg-slate-200 my-1" />
              <div className="text-xs text-slate-600 space-y-1">
                <div><strong className="text-slate-800">Platform Operator:</strong> Atlas Manica Group</div>
                <div><strong className="text-slate-800">Service:</strong> BunkBy Accommodation Marketplace</div>
                <div><strong className="text-slate-800">Applicable Framework:</strong> Zimbabwe (Cyber and Data Protection Act [Chapter 12:07])</div>
              </div>
            </div>
          </div>
        </section>

        {/* Back to Home Action Button */}
        <div className="text-center pt-4 pb-6">
          <button
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-colors cursor-pointer shadow-sm group"
          >
            <ArrowLeft className="w-4 h-4 text-[#FF7A00] transition-transform group-hover:-translate-x-1" />
            <span>Return to BunkBy</span>
          </button>
        </div>
      </main>

      {/* Clean White Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto space-y-1">
          <p>© 2026 BunkBy. BunkBy is an accommodation marketplace operated by Atlas Manica Group.</p>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPolicy;
