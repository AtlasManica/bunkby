import React, { useCallback, useEffect, useState } from "react";
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
  if (!value) return "—";
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
    customReason?: string
  ) => {
    if (!authToken || isMutating) return;
    setIsMutating(true);
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

      const labels: Record<string, string> = {
        mark_under_review: "🔎 Report marked under investigation.",
        dismiss_report: "✅ Report dismissed; listing stays active.",
        hide_listing: "🙈 Listing temporarily hidden from website & WhatsApp search.",
        restore_listing: "🔄 Listing restored to active search.",
        remove_listing: "🚫 Listing removed from website & WhatsApp search.",
        resolve_report: "✅ Report marked as resolved.",
        add_note: "📝 Moderation note saved.",
      };
      showToast(labels[action] || "✅ Moderation updated.");

      await loadReports();
      await onModerationComplete();

      // Refresh open modal details
      if (selectedReport && selectedReport.id === report.id) {
        await openReportDetail({
          ...selectedReport,
          status: data.reportStatus || selectedReport.status,
          listing_status: data.newListingStatus || selectedReport.listing_status,
        });
      }
    } catch {
      showToast("⚠️ Network error updating moderation state.");
    } finally {
      setIsMutating(false);
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
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reason, title, suburb..."
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

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-4 py-3 rounded-xl">
          {errorMsg}
        </div>
      )}

      {/* Reports Queue Table */}
      <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-2xs">
        <table className="w-full min-w-[760px] text-left text-xs align-middle">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-mono text-[9.5px]">
            <tr>
              <th className="px-4 py-3">Report</th>
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
              reports.map((rep) => (
                <tr key={rep.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                    #{rep.id}
                    {rep.reporter_name && (
                      <div className="text-[10px] font-sans font-medium text-slate-500 truncate max-w-[110px]">
                        {rep.reporter_name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[230px]">
                    <div className="font-bold text-slate-900 truncate">
                      {rep.listing_title || `Listing #${rep.listing_id}`}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      #{rep.listing_id} • {rep.listing_suburb || "—"}, {rep.listing_city || "—"}
                    </div>
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
                        onClick={() => runModerationAction("restore_listing", rep)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => runModerationAction("hide_listing", rep)}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer"
                      >
                        Hide
                      </button>
                    )}
                  </td>
                </tr>
              ))
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
                <AlertTriangle className="w-5 h-5 text-[#FF7A00]" />
                <div>
                  <h3 className="font-display font-black text-base">
                    Report #{selectedReport.id} — Moderation Review
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Listing #{selectedReport.listing_id} • Submitted {formatDateTime(selectedReport.created_at)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-left flex-grow">
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
                      {selectedReport.listing_suburb || "—"}, {selectedReport.listing_city || "—"} • $
                      {selectedReport.listing_price ?? 0}/{selectedReport.listing_frequency || "Month"}
                    </p>
                    {selectedReport.listing_landlord_name && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Landlord/Host: <strong>{selectedReport.listing_landlord_name}</strong>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {getListingStatusBadge(selectedReport.listing_status)}
                    {getReportStatusBadge(selectedReport.status)}
                  </div>
                </div>
              </div>

              {/* Report details */}
              <div className="bg-red-50/60 border border-red-200/80 rounded-2xl p-4 space-y-1.5">
                <div className="text-[10px] font-mono font-bold uppercase text-red-700">
                  Reported Reason
                </div>
                <div className="text-sm font-bold text-red-900">{selectedReport.reason}</div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {selectedReport.details || "No additional description provided by reporter."}
                </p>
                <div className="pt-1 text-[11px] text-slate-500 flex flex-wrap gap-3">
                  <span>
                    Reporter:{" "}
                    <strong>{selectedReport.reporter_name || "Anonymous Reporter"}</strong>
                  </span>
                  {selectedReport.reporter_phone && (
                    <span>
                      Contact: <strong>{selectedReport.reporter_phone}</strong>
                    </span>
                  )}
                  {Number(selectedReport.same_ip_reports_count || 0) > 1 && (
                    <span className="text-amber-800 font-semibold">
                      Network signal: {selectedReport.same_ip_reports_count} reports on this listing share the same network hash
                    </span>
                  )}
                </div>
              </div>

              {/* Sibling reports on same listing */}
              {siblingReports.length > 1 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono font-bold uppercase text-slate-500">
                    All Reports For This Listing ({siblingReports.length})
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200/70 max-h-32 overflow-y-auto">
                    {siblingReports.map((sib) => (
                      <div key={sib.id} className="p-2.5 text-xs flex items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-slate-700">#{sib.id}</span>{" "}
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
                    className="bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Investigate</span>
                  </button>

                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => runModerationAction("dismiss_report", selectedReport)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Dismiss Report</span>
                  </button>

                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => runModerationAction("resolve_report", selectedReport)}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Mark Resolved</span>
                  </button>

                  {isListingHiddenOrRemoved(selectedReport.listing_status) ? (
                    <button
                      type="button"
                      disabled={isMutating}
                      onClick={() => runModerationAction("restore_listing", selectedReport)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore Listing</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isMutating}
                      onClick={() => runModerationAction("hide_listing", selectedReport)}
                      className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Temporarily Hide</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isMutating || selectedReport.listing_status === "Removed"}
                    onClick={() => runModerationAction("remove_listing", selectedReport)}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Listing</span>
                  </button>

                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => runModerationAction("add_note", selectedReport)}
                    className="bg-[#052659] hover:bg-[#021024] text-white font-bold py-2 px-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Save Note</span>
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
          </div>
        </div>
      )}
    </div>
  );
};
