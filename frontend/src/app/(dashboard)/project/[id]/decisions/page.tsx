"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Filter,
  List,
  Clock,
  Users,
  Sparkles,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  GitBranch,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { getSourceConfig } from "@/lib/sourceTypes";
import { Decision, DecisionStatus } from "@/types";

export default function DecisionsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractMessage, setExtractMessage] = useState("");
  const [isDetectingConflicts, setIsDetectingConflicts] = useState(false);
  const [conflictMessage, setConflictMessage] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"timeline" | "table">("timeline");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

  const fetchDecisions = useCallback(async () => {
    try {
      const data = await api.get<Decision[]>(
        `/projects/${projectId}/decisions`
      );
      setDecisions(data || []);
    } catch (err) {
      console.error("Failed to load decisions", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let isMounted = true;
    if (projectId) {
      api.get<Decision[]>(`/projects/${projectId}/decisions`)
        .then((data) => {
          if (isMounted) {
            setDecisions(data || []);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            console.error("Failed to load decisions", err);
            setIsLoading(false);
          }
        });
    }
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const handleExtract = async () => {
    setIsExtracting(true);
    setExtractMessage("");
    try {
      const result = await api.post<{ message: string; count: number }>(
        `/projects/${projectId}/decisions/extract`
      );
      setExtractMessage(result.message || "Decisions extracted and reconciled");
      await fetchDecisions();
    } catch (err) {
      console.error(err);
      setExtractMessage("Failed to extract decisions.");
    } finally {
      setIsExtracting(false);
      setTimeout(() => setExtractMessage(""), 5000);
    }
  };

  const handleDetectConflicts = async () => {
    setIsDetectingConflicts(true);
    setConflictMessage("");
    try {
      const result = await api.post<{ message: string; count: number }>(
        `/projects/${projectId}/decisions/detect-conflicts`
      );
      setConflictMessage(result.message || "Conflict detection complete");
      await fetchDecisions();
    } catch (err) {
      console.error(err);
      setConflictMessage("Failed to detect conflicts.");
    } finally {
      setIsDetectingConflicts(false);
      setTimeout(() => setConflictMessage(""), 5000);
    }
  };

  const handleStatusUpdate = async (decisionId: string, newStatus: DecisionStatus) => {
    setIsUpdatingStatus(decisionId);
    try {
      await api.put(`/projects/${projectId}/decisions/${decisionId}/status`, {
        status: newStatus,
      });
      await fetchDecisions();
    } catch (err) {
      console.error("Failed to update status", err);
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Status counts
  const activeCount = decisions.filter((d) => (d.status || "ACTIVE") === "ACTIVE").length;
  const conflictCount = decisions.filter((d) => d.status === "CONFLICTED").length;
  const supersededCount = decisions.filter((d) => d.status === "SUPERSEDED").length;

  const filtered = decisions.filter((d) => {
    // 1. Status Filter
    const currentStatus = d.status || "ACTIVE";
    if (statusFilter !== "ALL" && currentStatus !== statusFilter) {
      return false;
    }

    // 2. Source Filter
    if (sourceFilter === "all") return true;
    const norm = (d.source_type || "").toLowerCase();
    const sourceId = (d.source_id || "").toLowerCase();

    if (sourceFilter === "pr") {
      return norm.includes("pr") || norm.includes("pull") || sourceId.includes("pr") || sourceId.includes("pull");
    }
    if (sourceFilter === "commit") {
      return (
        norm.includes("commit") ||
        norm.includes("file") ||
        norm.includes("git") ||
        sourceId.includes("/") ||
        sourceId.includes(".") ||
        sourceId.length === 40 ||
        sourceId.length === 7
      );
    }
    if (sourceFilter === "discord") {
      return (
        norm.includes("discord") ||
        norm.includes("chat") ||
        norm.includes("message") ||
        sourceId.includes("discord") ||
        sourceId.includes("channel")
      );
    }
    return norm === sourceFilter;
  });

  return (
    <div className="flex-1 space-y-6 p-5 lg:p-8 max-w-[1400px] w-full mx-auto animate-fade-in bg-background text-foreground transition-colors duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href={`/project/${projectId}`}
            className="p-2 rounded-lg bg-card hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 shadow-xs mt-0.5"
            title="Back to Project"
            aria-label="Back to Project"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
              Decision Intelligence Log
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Structured architectural & product decisions with automatic supersession and conflict resolution.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {extractMessage && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-mono animate-pulse">
              {extractMessage}
            </span>
          )}

          {conflictMessage && (
            <span className="text-xs text-amber-500 font-mono animate-pulse">
              {conflictMessage}
            </span>
          )}

          {/* Extract Button */}
          <button
            onClick={handleExtract}
            disabled={isExtracting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
          >
            {isExtracting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
            )}
            Extract Decisions
          </button>

          {/* Detect Conflicts Button */}
          <button
            onClick={handleDetectConflicts}
            disabled={isDetectingConflicts || decisions.length < 2}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-secondary text-secondary-foreground border border-border text-xs sm:text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
            title={decisions.length < 2 ? "Need at least 2 decisions" : "Scan for contradicting decisions"}
          >
            {isDetectingConflicts ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" strokeWidth={2} />
            )}
            Scan Conflicts
          </button>

          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border bg-card overflow-hidden shadow-xs">
            <button
              onClick={() => setView("timeline")}
              title="Timeline view"
              className={`p-1.5 text-xs transition-colors cursor-pointer ${
                view === "timeline"
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setView("table")}
              title="Table view"
              className={`p-1.5 text-xs transition-colors cursor-pointer ${
                view === "table"
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Source Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 bg-card p-1 rounded-lg border border-border overflow-x-auto shadow-xs">
          {[
            { key: "ALL", label: "All Decisions", count: decisions.length },
            { key: "ACTIVE", label: "Active", count: activeCount, color: "text-emerald-600 dark:text-emerald-400" },
            { key: "CONFLICTED", label: "Conflicted", count: conflictCount, color: "text-rose-500" },
            { key: "SUPERSEDED", label: "Superseded", count: supersededCount, color: "text-zinc-500" },
          ].map(({ key, label, count, color }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === key
                  ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{label}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-mono bg-background border border-border ${color || ""}`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Source Dropdown / Buttons */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          {[
            { key: "all", label: "All" },
            { key: "pr", label: "Pull Requests" },
            { key: "commit", label: "Commits" },
            { key: "discord", label: "Discord" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSourceFilter(key)}
              className={`px-3 py-1 rounded-md text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                sourceFilter === key
                  ? "bg-card text-foreground font-semibold border border-border shadow-xs"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" strokeWidth={2} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card p-12 text-center border border-border rounded-xl shadow-xs">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-60" strokeWidth={1.5} />
          <h3 className="text-base font-bold text-foreground mb-1">No decisions match filter</h3>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto mb-5">
            Extract decisions from your repository code, discussions, and chat messages into structured project memory.
          </p>
          <button
            onClick={handleExtract}
            disabled={isExtracting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            <Sparkles className="w-4 h-4" strokeWidth={2} />
            Extract Decisions Now
          </button>
        </div>
      ) : view === "timeline" ? (
        /* Timeline view */
        <div className="space-y-4">
          {filtered.map((decision, i) => {
            const config = getSourceConfig(decision.source_type);
            const Icon = config.icon;
            const confidence = decision.confidence_score !== undefined ? decision.confidence_score : 0.9;
            const confidencePct = Math.round(confidence * 100);
            const isExpanded = expandedIds.has(decision.decision_id);
            const alternatives = decision.alternatives_considered || [];
            const participants = decision.participants || [];
            const status = decision.status || "ACTIVE";

            return (
              <div
                key={decision.decision_id || i}
                className={`bg-card p-5 rounded-xl border transition-all shadow-xs ${
                  status === "CONFLICTED"
                    ? "border-rose-500/30 bg-rose-500/5"
                    : status === "SUPERSEDED"
                    ? "border-border opacity-75"
                    : "border-border hover:border-zinc-400 dark:hover:border-zinc-700"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon indicator */}
                  <div className="flex flex-col items-center shrink-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        status === "CONFLICTED"
                          ? "bg-rose-500/10 text-rose-500"
                          : status === "SUPERSEDED"
                          ? "bg-muted text-muted-foreground"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      <Icon className="w-4 h-4" strokeWidth={1.5} />
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
                            status === "ACTIVE"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                              : status === "CONFLICTED"
                              ? "bg-rose-500/10 text-rose-500 border border-rose-500/25"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {status === "ACTIVE" && <CheckCircle2 className="w-3 h-3" strokeWidth={2} />}
                          {status === "CONFLICTED" && <AlertTriangle className="w-3 h-3" strokeWidth={2} />}
                          {status === "SUPERSEDED" && <GitBranch className="w-3 h-3" strokeWidth={2} />}
                          {status}
                        </span>

                        <h3 className="text-sm sm:text-base font-bold text-foreground leading-snug">
                          {decision.decision_text}
                        </h3>
                      </div>

                      <button
                        onClick={() => toggleExpand(decision.decision_id)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded cursor-pointer shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" strokeWidth={1.5} />
                        ) : (
                          <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
                        )}
                      </button>
                    </div>

                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-3">
                      {decision.reasoning}
                    </p>

                    {/* Supersedes / Superseded by banner */}
                    {decision.supersedes && (
                      <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2 font-medium">
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          <strong>Supersedes older decision:</strong> (ID: {decision.supersedes.slice(0, 8)}...)
                        </span>
                      </div>
                    )}

                    {decision.superseded_by && (
                      <div className="mb-3 px-3 py-2 rounded-lg bg-muted border border-border text-xs text-muted-foreground flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          <strong>Superseded by newer decision:</strong> (ID: {decision.superseded_by.slice(0, 8)}...)
                        </span>
                      </div>
                    )}

                    {/* Conflict Explanation Block */}
                    {decision.conflicts && decision.conflicts.length > 0 && (
                      <div className="mb-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-rose-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                            Conflicting with {decision.conflicts.length} decision{decision.conflicts.length !== 1 ? "s" : ""}
                          </p>

                          {status === "CONFLICTED" && (
                            <button
                              onClick={() => handleStatusUpdate(decision.decision_id, "ACTIVE")}
                              disabled={isUpdatingStatus === decision.decision_id}
                              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              Resolve to Active
                            </button>
                          )}
                        </div>

                        {decision.conflicts.map((c, idx) => (
                          <div key={idx} className="text-xs text-foreground bg-background/50 p-2 rounded border border-rose-500/20">
                            <span className="text-rose-500 font-semibold">
                              {c.relationship === "conflict" ? "Conflict" : c.relationship}:
                            </span>{" "}
                            &ldquo;{c.other_decision_text}&rdquo;
                            {c.explanation && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Reason: {c.explanation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Alternatives considered */}
                    {alternatives.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                          Alternatives considered
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {alternatives.map((alt, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded bg-background border border-border text-xs text-muted-foreground font-mono"
                            >
                              {alt}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Meta Row */}
                    <div className="flex items-center gap-4 flex-wrap pt-3 border-t border-border">
                      {decision.source_url ? (
                        <a
                          href={decision.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-background border border-border text-foreground hover:text-emerald-500 hover:border-emerald-500/40 transition-colors font-medium"
                          title={decision.source_url}
                        >
                          <Icon className="w-3 h-3" style={{ color: config.color }} strokeWidth={2} />
                          <span>{config.label}</span>
                          {decision.source_id && (
                            <span className="font-mono text-muted-foreground truncate max-w-[200px]">
                              {decision.source_id.startsWith("#") || decision.source_id.includes("/") ? decision.source_id : `#${decision.source_id}`}
                            </span>
                          )}
                          <ExternalLink className="w-2.5 h-2.5 text-muted-foreground ml-0.5" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-background border border-border text-foreground font-medium">
                          <Icon className="w-3 h-3" style={{ color: config.color }} strokeWidth={2} />
                          <span>{config.label}</span>
                          {decision.source_id && (
                            <span className="font-mono text-muted-foreground truncate max-w-[200px]">
                              {decision.source_id.startsWith("#") || decision.source_id.includes("/") ? decision.source_id : `#${decision.source_id}`}
                            </span>
                          )}
                        </span>
                      )}

                      {participants.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="w-3 h-3 text-muted-foreground" strokeWidth={2} />
                          <span>{participants.join(", ")}</span>
                        </div>
                      )}

                      {decision.timestamp && (
                        <span className="text-xs text-muted-foreground font-mono" suppressHydrationWarning>
                          {new Date(decision.timestamp).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      )}

                      {/* Confidence Meter */}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <div className="w-12 h-1.5 bg-background border border-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${confidencePct}%`,
                              background: confidencePct > 85 ? "#10b981" : confidencePct > 70 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground font-mono">{confidencePct}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table view */
        <div className="bg-card overflow-hidden rounded-xl border border-border shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-muted-foreground uppercase tracking-wider font-semibold text-[11px]">
                  <th className="py-3 px-4 min-w-[280px]">Decision</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Participants</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((decision, i) => {
                  const config = getSourceConfig(decision.source_type);
                  const Icon = config.icon;
                  const confidence = decision.confidence_score !== undefined ? decision.confidence_score : 0.9;
                  const confidencePct = Math.round(confidence * 100);
                  const participants = decision.participants || [];
                  const status = decision.status || "ACTIVE";

                  return (
                    <tr key={decision.decision_id || i} className="hover:bg-accent/40 transition-colors">
                      <td className="py-3 px-4">
                        <span className="text-foreground text-xs sm:text-sm font-bold block">
                          {decision.decision_text}
                        </span>
                        {decision.reasoning && (
                          <span className="text-muted-foreground text-xs line-clamp-1 mt-0.5">
                            {decision.reasoning}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            status === "ACTIVE"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                              : status === "CONFLICTED"
                              ? "bg-rose-500/10 text-rose-500 border border-rose-500/25"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {decision.source_url ? (
                          <a
                            href={decision.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-background border border-border text-foreground hover:text-emerald-500 hover:border-emerald-500/40 transition-colors font-medium"
                          >
                            <Icon className="w-3 h-3" style={{ color: config.color }} strokeWidth={2} />
                            <span>{config.label}</span>
                            <ExternalLink className="w-2.5 h-2.5 text-muted-foreground ml-0.5" />
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-background border border-border text-foreground font-medium">
                            <Icon className="w-3 h-3" style={{ color: config.color }} strokeWidth={2} />
                            <span>{config.label}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-muted-foreground">
                          {participants.length > 0 ? participants.join(", ") : "—"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-10 h-1.5 bg-background border border-border rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${confidencePct}%`,
                                background: confidencePct > 85 ? "#10b981" : confidencePct > 70 ? "#f59e0b" : "#ef4444",
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">{confidencePct}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-muted-foreground font-mono" suppressHydrationWarning>
                          {decision.timestamp
                            ? new Date(decision.timestamp).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
