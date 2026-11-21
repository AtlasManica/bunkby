import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileText,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  X,
  XCircle,
} from "lucide-react";
import { ListingModerationAction, ListingReport } from "../types";

interface AdminReportsPanelProps {
  authToken: string;
  showToast: (msg: string) => void;
  onModerationComplete: () => Promise<void> | void;
}

interface ReportStats {
  pending: number;
  under_review: number;
  action_taken: number;
  dismissed: number;
  resolved: number;
  total: number;
  hiddenListings: number;
  removedListings: number;
}

const DEFAULT_STATS: ReportStats = {
  pending: 0,
  under_review: 0,
  action_taken: 0,
  dismissed: 0,
  resolved: 0,
  total: 0,
  hiddenListings: 0,
  removedListings: 0,
};

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getReportStatusBadge(status: string) {
  const s = (status || "pending").toLowerCase();
  if (s === "pending") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
        <Clock className="w-3 h-3" />
        Pending
      </span>
    );
  }
  if (s === "under_review") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-200">
        <Eye className="w-3 h-3" />
        Under Review
      </span>
    );
  }
  if (s === "action_taken") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200">
        <ShieldAlert className="w-3 h-3" />
        Action Taken
      </span>
    );
  }
  if (s === "resolved") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" />
        Resolved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
      <XCircle className="w-3 h-3" />
      Dismissed
    </span>
  );
}

function getListingStatusBadge(status?: string | null) {
  const s = (status || "Active").trim();
  if (s === "Hidden") {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
        Hidden
      </span>
    );
  }
  if (s === "Removed") {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-300">
        Removed
      </span>
    );
  }
  if (s === "Delisted") {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
        Delisted
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
      {s}
    </span>
  );
}

function formatActionLabel(actionType: string): string {
  switch (actionType) {
    case "mark_under_review":
      return "Marked Under Investigation";
    case "dismiss_report":
      return "Dismissed Report";
    case "hide_listing":
      return "Temporarily Hid Listing";
    case "restore_listing":
      return "Restored Listing";
    case "remove_listing":
      return "Removed Listing";
    case "resolve_report":
      return "Resolved Report";
    case "add_note":
      return "Added Moderation Note";
    default:
      return actionType;
  }
}

export const AdminReportsPanel: React.FC<AdminReportsPanelProps> = ({
  authToken,
  showToast,
  onModerationComplete,
}) => {
  const [reports, setReports] = useState<ListingReport[]>([]);
  const [actionsHistory, setActionsHistory] = useState<ListingModerationAction[]>([]);
  const [stats, setStats] = useState<ReportStats>(DEFAULT_STATS);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selected report investigation modal state
  const [selectedReport, setSelectedReport] = useState<ListingReport | null>(null);
  const [siblingReports, setSiblingReports] = useState<ListingReport[]>([]);
  const [listingActions, setListingActions] = useState<ListingModerationAction[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);
  const [moderationNotes, setModerationNotes] = useState<string>("");
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [rowBusyKey, setRowBusyKey] = useState<string | null>(null);
  const [highlightedReportId, setHighlightedReportId] = useState<number | null>(null);
  const [actionBanner, setActionBanner] = useState<{
    title: string;
    detail: string;
    tone: "emerald" | "amber" | "red" | "sky";
  } | null>(null);
  const [modalInlineNotice, setModalInlineNotice] = useState<string | null>(null);
  const [modalSuccessCard, setModalSuccessCard] = useState<{
    title: string;
    detail: string;
    tone: "emerald" | "amber" | "red" | "sky";
  } | null>(null);

  const modalCloseTimerRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const rowHighlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (modalCloseTimerRef.current) window.clearTimeout(modalCloseTimerRef.current);
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
      if (rowHighlightTimerRef.current) window.clearTimeout(rowHighlightTimerRef.current);
    };
  }, []);

  const showActionBanner = (
    title: string,
    detail: string,
    tone: "emerald" | "amber" | "red" | "sky" = "emerald"
  ) => {
    setActionBanner({ title, detail, tone });
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => {
      setActionBanner(null);
      bannerTimerRef.current = null;
    }, 6000);
  };

  const closeReportModal = () => {
    if (modalCloseTimerRef.current) {
      window.clearTimeout(modalCloseTimerRef.current);
      modalCloseTimerRef.current = null;
    }
    setModalSuccessCard(null);
    setModalInlineNotice(null);
    setSelectedReport(null);
  };

  const loadReports = useCallback(async () => {
    if (!authToken) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      const res = await fetch(`/api/admin/reports?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "x-landlord-token": authToken,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error || "Failed to load listing reports.");
        return;
      }
      setReports(Array.isArray(data.reports) ? data.reports : []);
      setActionsHistory(Array.isArray(data.moderationActions) ? data.moderationActions : []);
      if (data.stats) {
        setStats({ ...DEFAULT_STATS, ...data.stats });
      }
    } catch {
      setErrorMsg("Network error loading reports.");
    } finally {
      setIsLoading(false);
    }
  }, [authToken, statusFilter, searchQuery]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const openReportDetail = async (report: ListingReport) => {
    if (modalCloseTimerRef.current) {
      window.clearTimeout(modalCloseTimerRef.current);
      modalCloseTimerRef.current = null;
    }
    setModalSuccessCard(null);
    setModalInlineNotice(null);
    setSelectedReport(report);
    setModerationNotes(report.moderation_notes || "");
    setIsDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}`, {
        headers: {
          Accept: "application/json",
          "x-landlord-token": authToken,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.report) {
          setSelectedReport(data.report);
          setModerationNotes(data.report.moderation_notes || "");
        }
        setSiblingReports(Array.isArray(data.siblingReports) ? data.siblingReports : []);
        setListingActions(Array.isArray(data.moderationActions) ? data.moderationActions : []);
      }
    } catch {
      // Keep basic report info
    } finally {
      setIsDetailLoading(false);
    }
  };

  const runModerationAction = async (
    action:
      | "mark_under_review"
      | "dismiss_report"
      | "hide_listing"
      | "restore_listing"
      | "remove_listing"
      | "resolve_report"
      | "add_note",
    report: ListingReport,
    customReason?: string,
    triggeredFromRow?: boolean
  ) => {
    if (!authToken || isMutating) return;
    setIsMutating(true);
    setPendingAction(action);
    if (triggeredFromRow) {
      setRowBusyKey(`${action}-${report.id}`);
    }
    setModalInlineNotice(null);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-landlord-token": authToken,
        },
        body: JSON.stringify({
          action,
          notes: moderationNotes.trim() || undefined,
          reason: customReason || report.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⚠️ ${data?.error || "Moderation update failed."}`);
        return;
      }

      const listingLabel = report.listing_title
        ? `${report.listing_title} (#${report.listing_id})`
        : `Listing #${report.listing_id}`;

      const feedbackMeta: Record<
        string,
        { toast: string; title: string; detail: string; tone: "emerald" | "amber" | "red" | "sky"; closesModal: boolean }
      > = {
        mark_under_review: {
          toast: "🔎 Report marked under investigation.",
          title: "Marked Under Investigation",
          detail: `Report #${report.id} on ${listingLabel} is now under review.`,
          tone: "sky",
          closesModal: false,
        },
        dismiss_report: {
          toast: "✅ Report dismissed; listing stays active.",
          title: "Report Dismissed Successfully",
          detail: `Report #${report.id} was dismissed and ${listingLabel} remains live.`,
          tone: "emerald",
          closesModal: true,
        },
        hide_listing: {
          toast: "🙈 Listing temporarily hidden from website & WhatsApp search.",
          title: "Property Hidden Successfully",
          detail: `${listingLabel} has been hidden from public search and WhatsApp results.`,
          tone: "amber",
          closesModal: true,
        },
        restore_listing: {
          toast: "🔄 Listing restored to active search.",
          title: "Property Restored Successfully",
          detail: `${listingLabel} is now live again on website and WhatsApp search.`,
          tone: "emerald",
          closesModal: true,
        },
        remove_listing: {
          toast: "🚫 Listing removed from website & WhatsApp search.",
          title: "Property Removed Successfully",
          detail: `${listingLabel} has been removed from public listings (audit record preserved).`,
          tone: "red",
          closesModal: true,
        },
        resolve_report: {
          toast: "✅ Report marked as resolved.",
          title: "Report Resolved Successfully",
          detail: `Report #${report.id} for ${listingLabel} has been marked resolved.`,
          tone: "emerald",
          closesModal: true,
        },
        add_note: {
          toast: "📝 Moderation note saved.",
          title: "Moderation Note Saved",
          detail: `Internal note added to Report #${report.id}.`,
          tone: "sky",
          closesModal: false,
        },
      };

      const meta = feedbackMeta[action] || {
        toast: "✅ Moderation updated.",
        title: "Action Completed",
        detail: `Updated Report #${report.id}.`,
        tone: "emerald" as const,
        closesModal: false,
      };

      showToast(meta.toast);
      showActionBanner(meta.title, meta.detail, meta.tone);
      setHighlightedReportId(report.id);
      if (rowHighlightTimerRef.current) window.clearTimeout(rowHighlightTimerRef.current);
      rowHighlightTimerRef.current = window.setTimeout(() => {
        setHighlightedReportId(null);
        rowHighlightTimerRef.current = null;
      }, 2800);

      await loadReports();
      await onModerationComplete();

      if (selectedReport && selectedReport.id === report.id) {
        if (meta.closesModal) {
          setModalSuccessCard({
            title: meta.title,
            detail: meta.detail,
            tone: meta.tone,
          });
          if (modalCloseTimerRef.current) window.clearTimeout(modalCloseTimerRef.current);
          modalCloseTimerRef.current = window.setTimeout(() => {
            setModalSuccessCard(null);
            setSelectedReport(null);
            modalCloseTimerRef.current = null;
          }, 1400);
        } else {
          setModalInlineNotice(meta.title);
          await openReportDetail({
            ...selectedReport,
            status: data.reportStatus || selectedReport.status,
            listing_status: data.newListingStatus || selectedReport.listing_status,
          });
        }
      }
    } catch {
      showToast("⚠️ Network error updating moderation state.");
    } finally {
      setIsMutating(false);
      setPendingAction(null);
      setRowBusyKey(null);
    }
  };

  const isListingHiddenOrRemoved = (status?: string | null) =>
    status === "Hidden" || status === "Removed" || status === "Delisted";

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-amber-200/80 shadow-2xs">
          <span className="text-[10px] font-mono font-bold uppercase text-amber-600 block">
            Pending Reports
          </span>
          <span className="text-xl font-black text-slate-900">{stats.pending}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-sky-200/80 shadow-2xs">
          <span className="text-[10px] font-mono font-bold uppercase text-sky-700 block">
            Under Review
          </span>
          <span className="text-xl font-black text-slate-900">{stats.under_review}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-orange-200/80 shadow-2xs">
          <span className="text-[10px] font-mono font-bold uppercase text-orange-700 block">
            Hidden Listings
          </span>
          <span className="text-xl font-black text-slate-900">{stats.hiddenListings}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-red-200/80 shadow-2xs">
          <span className="text-[10px] font-mono font-bold uppercase text-red-700 block">
            Removed Listings
          </span>
          <span className="text-xl font-black text-slate-900">{stats.removedListings}</span>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: "all", label: `All (${stats.total})` },
            { key: "pending", label: `Pending (${stats.pending})` },
            { key: "under_review", label: `Under Review (${stats.under_review})` },
            { key: "action_taken", label: `Action Taken (${stats.action_taken})` },
            { key: "resolved", label: `Resolved (${stats.resolved})` },
            { key: "dismissed", label: `Dismissed (${stats.dismissed})` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                statusFilter === tab.key
                  ? "bg-[#052659] text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tenant ID, phone, listing, reason..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium focus:outline-none focus:border-[#052659]"
            />
          </div>
          <button
            type="button"
            onClick={loadReports}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {actionBanner && (
        <div
          className={`flex items-start justify-between gap-3 px-4 py-3 rounded-2xl border shadow-xs animate-fade-in ${
            actionBanner.tone === "red"
              ? "bg-red-50 border-red-200 text-red-900"
              : actionBanner.tone === "amber"
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : actionBanner.tone === "sky"
              ? "bg-sky-50 border-sky-200 text-sky-900"
              : "bg-emerald-50 border-emerald-200 text-emerald-900"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                actionBanner.tone === "red"
                  ? "bg-red-100 text-red-700"
                  : actionBanner.tone === "amber"
                  ? "bg-amber-100 text-amber-700"
                  : actionBanner.tone === "sky"
                  ? "bg-sky-100 text-sky-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-extrabold">{actionBanner.title}</div>
              <div className="text-[11px] opacity-85 mt-0.5">{actionBanner.detail}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
            aria-label="Dismiss status message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-4 py-3 rounded-xl">
          {errorMsg}
        </div>
      )}

      {/* Reports Queue Table */}
      <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-2xs">
        <table className="w-full min-w-[820px] text-left text-xs align-middle">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-mono text-[9.5px]">
            <tr>
              <th className="px-4 py-3">Report &amp; Tenant ID</th>
              <th className="px-4 py-3">Listing &amp; Visibility</th>
              <th className="px-4 py-3">Reason &amp; Details</th>
              <th className="px-4 py-3">Report Status</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3 text-right">Moderation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && reports.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400 font-mono">
                  Loading listing reports...
                </td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No listing reports match the current filter.
                </td>
              </tr>
            ) : (
              reports.map((rep) => {
                const tenantIdLabel = rep.reporter_id || `TEN-${rep.id}`;
                const isRowHighlighted = highlightedReportId === rep.id;
                const isRowRestoring = rowBusyKey === `restore_listing-${rep.id}`;
                const isRowHiding = rowBusyKey === `hide_listing-${rep.id}`;
                return (
                <tr
                  key={rep.id}
                  className={`transition-colors ${
                    isRowHighlighted ? "bg-emerald-50/90" : "hover:bg-slate-50/80"
                  }`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-mono font-bold text-slate-800">Report #{rep.id}</div>
                    <div className="mt-1 inline-flex items-center gap-1 bg-indigo-50 text-indigo-800 border border-indigo-200/80 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold">
                      <UserCheck className="w-3 h-3 shrink-0" />
                      <span>{tenantIdLabel}</span>
                    </div>
                    {rep.reporter_name && (
                      <div className="text-[10.5px] font-sans font-medium text-slate-600 truncate max-w-[140px] mt-0.5">
                        {rep.reporter_name}
                      </div>
                    )}
                    {rep.reporter_phone && (
                      <div className="text-[10.5px] font-sans text-slate-500">
                        {rep.reporter_phone}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[240px]">
                    <div className="font-bold text-slate-900 truncate">
                      {rep.listing_title || `Listing #${rep.listing_id}`}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      Listing #{rep.listing_id} • {rep.listing_suburb || "-"}, {rep.listing_city || "-"}
                    </div>
                    {rep.listing_landlord_id && (
                      <div className="text-[10.5px] text-slate-500 truncate mt-0.5">
                        Owner ID: <strong className="text-slate-700">#{rep.listing_landlord_id}</strong>
                        {rep.listing_landlord_name ? ` (${rep.listing_landlord_name})` : ""}
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {getListingStatusBadge(rep.listing_status)}
                      {Number(rep.listing_reports_count || 0) > 1 && (
                        <span className="text-[10px] font-mono font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                          {rep.listing_reports_count} reports
                        </span>
                      )}
                      {Number(rep.same_ip_reports_count || 0) > 1 && (
                        <span
                          className="text-[10px] font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                          title="Multiple reports on this listing came from a shared IP network"
                        >
                          {rep.same_ip_reports_count} same network
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[240px]">
                    <div className="font-bold text-red-700">{rep.reason}</div>
                    {rep.details && (
                      <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">
                        {rep.details}
                      </p>
                    )}
                    {rep.moderation_notes && (
                      <p className="text-[10px] text-[#052659] bg-blue-50/80 px-2 py-0.5 rounded mt-1 line-clamp-1">
                        Note: {rep.moderation_notes}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {getReportStatusBadge(rep.status)}
                    {rep.reviewed_by_name && (
                      <div className="text-[10px] text-slate-400 mt-1">
                        by {rep.reviewed_by_name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-500 font-mono whitespace-nowrap">
                    {formatDateTime(rep.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                    <button
                      type="button"
                      onClick={() => openReportDetail(rep)}
                      className="bg-[#052659] hover:bg-[#021024] text-white font-bold px-3 py-1.5 rounded-lg text-[11px] transition-all cursor-pointer"
                    >
                      Review
                    </button>
                    {isListingHiddenOrRemoved(rep.listing_status) ? (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => runModerationAction("restore_listing", rep, undefined, true)}
                        className="bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-1.5 rounded-lg text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {isRowRestoring && <RefreshCw className="w-3 h-3 animate-spin" />}
                        <span>{isRowRestoring ? "Restoring..." : "Restore"}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => runModerationAction("hide_listing", rep, undefined, true)}
                        className="bg-amber-50 hover:bg-amber-100 disabled:opacity-60 text-amber-800 border border-amber-200 font-bold px-2.5 py-1.5 rounded-lg text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {isRowHiding && <RefreshCw className="w-3 h-3 animate-spin" />}
                        <span>{isRowHiding ? "Hiding..." : "Hide"}</span>
                      </button>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Recent Moderation Audit Log */}
      {actionsHistory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
          <h4 className="text-xs font-bold text-[#052659] uppercase tracking-wider font-mono flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-orange-500" />
            <span>Recent Moderation Audit Log</span>
          </h4>
          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {actionsHistory.slice(0, 15).map((act) => (
              <div
                key={act.id}
                className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5">
                  <span className="font-bold text-slate-800">
                    {formatActionLabel(act.action_type)}
                  </span>{" "}
                  <span className="text-slate-500">
                    on <strong>{act.listing_title || `Listing #${act.listing_id}`}</strong>
                  </span>
                  {act.previous_listing_status &&
                    act.new_listing_status &&
                    act.previous_listing_status !== act.new_listing_status && (
                      <span className="ml-1.5 font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                        {act.previous_listing_status} → {act.new_listing_status}
                      </span>
                    )}
                  {act.notes && (
                    <div className="text-[11px] text-slate-500 italic">
                      &ldquo;{act.notes}&rdquo;
                    </div>
                  )}
                </div>
                <div className="text-[10px] font-mono text-slate-400 text-right">
                  <div>{act.admin_name}</div>
                  <div>{formatDateTime(act.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Report Review & Moderation Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-55 bg-slate-950/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
            <div className="bg-[#052659] text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {modalSuccessCard ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-[#FF7A00]" />
                )}
                <div>
                  <h3 className="font-display font-black text-base">
                    Report #{selectedReport.id} · Moderation Review
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Listing #{selectedReport.listing_id} • Tenant ID {selectedReport.reporter_id || `TEN-${selectedReport.id}`} • Submitted {formatDateTime(selectedReport.created_at)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeReportModal}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
                aria-label="Close report review"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalSuccessCard ? (
              <div className="p-8 sm:p-10 text-center space-y-4 bg-white">
                <div
                  className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ring-8 ${
                    modalSuccessCard.tone === "red"
                      ? "bg-red-100 text-red-600 ring-red-50"
                      : modalSuccessCard.tone === "amber"
                      ? "bg-amber-100 text-amber-600 ring-amber-50"
                      : "bg-emerald-100 text-emerald-600 ring-emerald-50"
                  }`}
                >
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-lg font-display font-black text-slate-900">
                    {modalSuccessCard.title}
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                    {modalSuccessCard.detail}
                  </p>
                </div>
                <div className="pt-2 flex flex-col items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-400">
                    Closing review card...
                  </span>
                  <button
                    type="button"
                    onClick={closeReportModal}
                    className="bg-[#052659] hover:bg-[#021024] text-white font-bold text-xs px-5 py-2 rounded-xl cursor-pointer transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
            <div className="p-5 overflow-y-auto space-y-4 text-left flex-grow">
              {modalInlineNotice && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{modalInlineNotice}</span>
                </div>
              )}

              {/* Listing summary card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-mono text-slate-400 uppercase font-bold">
                      Reported Property
                    </div>
                    <h4 className="text-sm font-black text-slate-900">
                      {selectedReport.listing_title || `Listing #${selectedReport.listing_id}`}
                    </h4>
                    <p className="text-xs text-slate-600">
                      {selectedReport.listing_suburb || "-"}, {selectedReport.listing_city || "-"} • $
                      {selectedReport.listing_price ?? 0}/{selectedReport.listing_frequency || "Month"}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 mt-1">
                      <span>
                        Listing ID: <strong className="font-mono text-slate-900">#{selectedReport.listing_id}</strong>
                      </span>
                      {selectedReport.listing_landlord_id && (
                        <span>
                          Landlord ID: <strong className="font-mono text-slate-900">#{selectedReport.listing_landlord_id}</strong>
                        </span>
                      )}
                      {selectedReport.listing_landlord_name && (
                        <span>
                          Host: <strong className="text-slate-900">{selectedReport.listing_landlord_name}</strong>
                        </span>
                      )}
                      {selectedReport.listing_contact_phone && (
                        <span>
                          Host Phone: <strong className="font-sans text-slate-900">{selectedReport.listing_contact_phone}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {getListingStatusBadge(selectedReport.listing_status)}
                    {getReportStatusBadge(selectedReport.status)}
                  </div>
                </div>
              </div>

              {/* Report details + Reported Tenant Identity */}
              <div className="bg-red-50/60 border border-red-200/80 rounded-2xl p-4 space-y-2.5">
                <div>
                  <div className="text-[10px] font-mono font-bold uppercase text-red-700">
                    Reported Reason
                  </div>
                  <div className="text-sm font-bold text-red-900 mt-0.5">{selectedReport.reason}</div>
                  <p className="text-xs text-slate-700 leading-relaxed mt-1">
                    {selectedReport.details || "No additional description provided by reporter."}
                  </p>
                </div>

                <div className="bg-white/90 border border-red-200/70 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                  <div>
                    <span className="block text-[9.5px] font-mono uppercase text-slate-400 font-bold">
                      Reported Tenant ID
                    </span>
                    <span className="inline-flex items-center gap-1 mt-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded font-mono text-[11px] font-extrabold">
                      <UserCheck className="w-3 h-3 shrink-0" />
                      {selectedReport.reporter_id || `TEN-${selectedReport.id}`}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9.5px] font-mono uppercase text-slate-400 font-bold">
                      Tenant / Reporter Name
                    </span>
                    <strong className="text-slate-800 mt-0.5 block">
                      {selectedReport.reporter_name || "Anonymous Tenant"}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[9.5px] font-mono uppercase text-slate-400 font-bold">
                      Tenant Contact Phone
                    </span>
                    <strong className="font-sans text-slate-800 mt-0.5 block">
                      {selectedReport.reporter_phone || "Not provided"}
                    </strong>
                  </div>
                </div>

                {Number(selectedReport.same_ip_reports_count || 0) > 1 && (
                  <div className="text-[11px] text-amber-800 font-semibold">
                    Network signal: {selectedReport.same_ip_reports_count} reports on this listing share the same network hash
                  </div>
                )}
              </div>

              {/* Sibling reports on same listing */}
              {siblingReports.length > 1 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono font-bold uppercase text-slate-500">
                    All Reports For This Listing ({siblingReports.length})
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200/70 max-h-36 overflow-y-auto">
                    {siblingReports.map((sib) => (
                      <div key={sib.id} className="p-2.5 text-xs flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-slate-700">#{sib.id}</span>{" "}
                          <span className="inline-flex items-center bg-indigo-50 text-indigo-800 border border-indigo-200/80 px-1.5 py-0.2 rounded font-mono text-[10px] font-bold mr-1">
                            {sib.reporter_id || `TEN-${sib.id}`}
                          </span>
                          <span className="font-semibold text-slate-800">{sib.reason}</span>
                        </div>
                        {getReportStatusBadge(sib.status)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Internal moderation notes */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono font-bold uppercase text-slate-500">
                  Internal Moderation Notes
                </label>
                <textarea
                  rows={3}
                  value={moderationNotes}
                  onChange={(e) => setModerationNotes(e.target.value)}
                  placeholder="Record investigation findings, landlord contact outcome, or reason for hiding/dismissing..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-[#052659]"
                />
              </div>

              {/* Moderation Action Buttons */}
              <div className="space-y-2 pt-1">
                <div className="text-[10px] font-mono font-bold uppercase text-slate-500">
                  Moderation Actions
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => runModerationAction("mark_under_review", selectedReport)}
                    className="bg-sky-50 hover:bg-sky-100 disabled:opacity-60 text-sky-800 border border-sky-200 font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {pendingAction === "mark_under_review" ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    <span>{pendingAction === "mark_under_review" ? "Updating..." : "Investigate"}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => runModerationAction("dismiss_report", selectedReport)}
                    className="bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 border border-slate-200 font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {pendingAction === "dismiss_report" ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    <span>{pendingAction === "dismiss_report" ? "Dismissing..." : "Dismiss Report"}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => runModerationAction("resolve_report", selectedReport)}
                    className="bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 text-emerald-800 border border-emerald-200 font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {pendingAction === "resolve_report" ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>{pendingAction === "resolve_report" ? "Resolving..." : "Mark Resolved"}</span>
                  </button>

                  {isListingHiddenOrRemoved(selectedReport.listing_status) ? (
                    <button
                      type="button"
                      disabled={isMutating}
                      onClick={() => runModerationAction("restore_listing", selectedReport)}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {pendingAction === "restore_listing" ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      <span>{pendingAction === "restore_listing" ? "Restoring..." : "Restore Listing"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isMutating}
                      onClick={() => runModerationAction("hide_listing", selectedReport)}
                      className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {pendingAction === "hide_listing" ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                      <span>{pendingAction === "hide_listing" ? "Hiding..." : "Temporarily Hide"}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isMutating || selectedReport.listing_status === "Removed"}
                    onClick={() => runModerationAction("remove_listing", selectedReport)}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {pendingAction === "remove_listing" ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>{pendingAction === "remove_listing" ? "Removing..." : "Remove Listing"}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => runModerationAction("add_note", selectedReport)}
                    className="bg-[#052659] hover:bg-[#021024] disabled:opacity-60 text-white font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {pendingAction === "add_note" ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    <span>{pendingAction === "add_note" ? "Saving..." : "Save Note"}</span>
                  </button>
                </div>
              </div>

              {/* Listing moderation audit history */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono font-bold uppercase text-slate-500">
                  Moderation Action History
                </div>
                {isDetailLoading ? (
                  <p className="text-xs text-slate-400 font-mono">Loading audit trail...</p>
                ) : listingActions.length === 0 ? (
                  <p className="text-xs text-slate-400">No moderation actions recorded yet for this listing.</p>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200/70 max-h-40 overflow-y-auto">
                    {listingActions.map((act) => (
                      <div key={act.id} className="p-2.5 text-xs space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800">
                            {formatActionLabel(act.action_type)}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {formatDateTime(act.created_at)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Admin: {act.admin_name}
                          {act.previous_listing_status !== act.new_listing_status &&
                            ` • Status: ${act.previous_listing_status} → ${act.new_listing_status}`}
                        </div>
                        {act.notes && (
                          <p className="text-[11px] text-slate-700 italic">&ldquo;{act.notes}&rdquo;</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
