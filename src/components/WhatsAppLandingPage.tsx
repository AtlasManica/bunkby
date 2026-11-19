import React from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Home,
  Hotel,
  GraduationCap,
  MapPin,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  CATEGORY_DEFINITIONS,
  FEATURED_CITY_SLUGS,
  WHATSAPP_FAQ_ITEMS,
  WHATSAPP_NUMBER_DISPLAY,
  findCityBySlugOrName,
  getWhatsAppLink,
} from "../../shared/seoData";

interface WhatsAppLandingPageProps {
  onNavigate: (path: string) => void;
}

export const WhatsAppLandingPage: React.FC<WhatsAppLandingPageProps> = ({ onNavigate }) => {
  const featuredCities = FEATURED_CITY_SLUGS.map((slug) => findCityBySlugOrName(slug)).filter(
    (c): c is NonNullable<typeof c> => Boolean(c)
  );

  const handleLinkClick = (e: React.MouseEvent, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        <a
          href="/"
          onClick={(e) => handleLinkClick(e, "/")}
          className="hover:text-[#052659] transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#FF7A00]" />
          <span>BunkBy Home</span>
        </a>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[#052659] font-bold">WhatsApp Assistant</span>
      </nav>

      {/* Hero / Primary CTA */}
      <section className="bg-[#052659] text-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-10 shadow-lg border border-[#052659]">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 px-3 py-1 rounded-full text-xs font-mono font-bold text-[#FF7A00]">
            <span>OFFICIAL BUNKBY WHATSAPP ASSISTANT</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-display font-black tracking-tight leading-tight">
            Find and List Accommodation on WhatsApp in Zimbabwe
          </h1>

          <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
            Use BunkBy&apos;s official WhatsApp Business service to search available rooms, cottages, flats, houses, student accommodation, guesthouses, lodges, and commercial properties—or publish your own property listing directly via chat with zero agent commissions.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href={getWhatsAppLink("Hi BunkBy! I would like to find accommodation.")}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#15803d] hover:bg-[#166534] text-white font-bold px-5 py-3 rounded-xl shadow-md transition-colors inline-flex items-center gap-2 text-sm"
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span>Chat with BunkBy on WhatsApp</span>
            </a>

            <a
              href={getWhatsAppLink("Hi BunkBy! I would like to list my property.")}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#FF7A00] hover:bg-[#e66e00] text-white font-bold px-5 py-3 rounded-xl shadow-md transition-colors inline-flex items-center gap-2 text-sm"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>List a Property on WhatsApp</span>
            </a>

            <a
              href={getWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white/10 hover:bg-white/20 text-white font-mono font-bold px-4 py-3 rounded-xl border border-white/20 text-xs sm:text-sm"
            >
              {WHATSAPP_NUMBER_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      {/* Two Core Channels: Property Seekers & Landlords/Advertisers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* For Property Seekers */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-[#052659]">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-[#052659]">For Property Seekers</h2>
              <p className="text-xs text-slate-500">Search by natural text or interactive menus</p>
            </div>
          </div>

          <ul className="space-y-2.5 text-sm text-slate-600 leading-relaxed">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Natural-language search:</strong> Message phrases like <em>&quot;cottage in Avondale under $250&quot;</em>, <em>&quot;shops in Harare CBD&quot;</em>, or <em>&quot;student hostel in Senga&quot;</em>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Guided category &amp; subtype filters:</strong> Narrow down Residential rentals, Hospitality stays, Student accommodation, or Commercial spaces (Shop, Commercial/Office, Warehouse, Table).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Clean paginated results:</strong> Browse up to 5 active matching properties per page and tap <em>&quot;Next 5 Results&quot;</em> to load the next batch.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Photos &amp; direct host details:</strong> Reply with <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">photos [ID]</code> to view photos and reach the landlord or host directly without agent fees.
              </span>
            </li>
          </ul>
        </section>

        {/* For Landlords and Property Advertisers */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF7A00]">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-[#052659]">For Landlords &amp; Property Advertisers</h2>
              <p className="text-xs text-slate-500">Publish and manage listings in minutes</p>
            </div>
          </div>

          <ul className="space-y-2.5 text-sm text-slate-600 leading-relaxed">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#FF7A00] shrink-0 mt-0.5" />
              <span>
                <strong>Guided WhatsApp publishing:</strong> Send <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">list</code> or tap <em>Post Property</em> to submit category, suburb, city, price, deposit, amenities, and photos step by step.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#FF7A00] shrink-0 mt-0.5" />
              <span>
                <strong>Commercial &amp; hospitality support:</strong> Advertise shops, offices, warehouses, flea market tables, lodges, guesthouses, student hostels, rooms, cottages, and full houses.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#FF7A00] shrink-0 mt-0.5" />
              <span>
                <strong>Manage listings via chat:</strong> Text <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">my listings</code> to review your properties or <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">delete [ID]</code> to remove a listing when occupied.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#FF7A00] shrink-0 mt-0.5" />
              <span>
                <strong>Full control anytime:</strong> Reply <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">CANCEL</code> at any step to stop an active listing or search session cleanly.
              </span>
            </li>
          </ul>
        </section>
      </div>

      {/* Supported Categories */}
      <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-lg font-display font-bold text-[#052659]">
          Property Categories Supported on BunkBy Web &amp; WhatsApp
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { def: CATEGORY_DEFINITIONS.residential, Icon: Home },
            { def: CATEGORY_DEFINITIONS.hospitality, Icon: Hotel },
            { def: CATEGORY_DEFINITIONS.commercial, Icon: Building2 },
            { def: CATEGORY_DEFINITIONS.student, Icon: GraduationCap },
          ].map(({ def, Icon }) => (
            <a
              key={def.slug}
              href={`/categories/${def.slug}`}
              onClick={(e) => handleLinkClick(e, `/categories/${def.slug}`)}
              className="p-4 rounded-xl border border-slate-200 hover:border-[#052659] bg-slate-50/70 hover:bg-slate-50 transition-all space-y-1.5 group"
            >
              <div className="flex items-center gap-2 text-[#052659] font-bold text-sm">
                <Icon className="w-4 h-4 text-[#FF7A00] shrink-0" />
                <span className="group-hover:underline">{def.name}</span>
              </div>
              <p className="text-xs text-slate-600 line-clamp-2">{def.intro}</p>
            </a>
          ))}
        </div>
      </section>

      {/* FAQ Section matching FAQPage Schema */}
      <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#FF7A00]" />
          <h2 className="text-lg font-display font-bold text-[#052659]">
            Frequently Asked Questions About BunkBy on WhatsApp
          </h2>
        </div>

        <div className="space-y-3">
          {WHATSAPP_FAQ_ITEMS.map((faq, idx) => (
            <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-1">
              <h3 className="text-sm font-bold text-[#052659]">{faq.question}</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Explore Zimbabwe Cities */}
      <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#FF7A00]" />
          <h2 className="text-base font-display font-bold text-[#052659]">
            Browse Available Properties by Zimbabwe City
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {featuredCities.map((city) => (
            <a
              key={city.slug}
              href={`/locations/${city.slug}`}
              onClick={(e) => handleLinkClick(e, `/locations/${city.slug}`)}
              className="text-xs font-semibold text-[#052659] bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              {city.name}
            </a>
          ))}
        </div>
        <div className="pt-2 flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Operated in Zimbabwe by Atlas Manica Group. Always inspect properties in person before paying deposits.</span>
        </div>
      </section>
    </div>
  );
};
