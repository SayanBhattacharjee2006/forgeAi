"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  GitCommit,
  HelpCircle,
  Shield,
  Loader2,
  Code2,
  Check,
  ArrowRight,
  ExternalLink,
  Layers,
  ScrollText,
  FileCheck,
  Server,
  Database,
  Terminal,
  Cpu,
  ArrowLeft,
  XCircle,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  ProjectStateSnapshot,
  ProjectRisk,
  RiskStatus,
  ConsistencyIssue,
  KnowledgeGap,
  ProjectTimelineEvent,
  SemanticChangeGroup,
} from "@/types";

export default function ProjectIntelligencePage() {
  const { id: projectId } = useParams() as { id: string };

  const [activeTab, setActiveTab] = useState<
    "overview" | "changes" | "consistency" | "risks" | "gaps" | "timeline"
  >("overview");

  const [stateSnapshot, setStateSnapshot] = useState<ProjectStateSnapshot | null>(null);
  const [changes, setChanges] = useState<SemanticChangeGroup[]>([]);
  const [consistencyIssues, setConsistencyIssues] = useState<ConsistencyIssue[]>([]);
  const [risks, setRisks] = useState<ProjectRisk[]>([]);
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([]);
  const [timeline, setTimeline] = useState<ProjectTimelineEvent[]>([]);
  const [timelineFilter, setTimelineFilter] = useState<string>("");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadIntelligenceData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [snap, chg, cons, rsk, gap, time] = await Promise.allSettled([
        api.get<ProjectStateSnapshot>(`/projects/${projectId}/intelligence/state`),
        api.get<SemanticChangeGroup[]>(`/projects/${projectId}/intelligence/changes`),
        api.get<ConsistencyIssue[]>(`/projects/${projectId}/intelligence/consistency`),
        api.get<ProjectRisk[]>(`/projects/${projectId}/intelligence/risks`),
        api.get<KnowledgeGap[]>(`/projects/${projectId}/intelligence/gaps`),
        api.get<ProjectTimelineEvent[]>(
          `/projects/${projectId}/intelligence/timeline${
            timelineFilter ? `?type=${timelineFilter}` : ""
          }`
        ),
      ]);

      if (snap.status === "fulfilled") setStateSnapshot(snap.value);
      if (chg.status === "fulfilled") setChanges(chg.value || []);
      if (cons.status === "fulfilled") setConsistencyIssues(cons.value || []);
      if (rsk.status === "fulfilled") setRisks(rsk.value || []);
      if (gap.status === "fulfilled") setKnowledgeGaps(gap.value || []);
      if (time.status === "fulfilled") setTimeline(time.value || []);
    } catch (err) {
      console.error("Failed to load project intelligence:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, timelineFilter]);

  useEffect(() => {
    let ignore = false;
    async function fetchData() {
      if (!projectId || ignore) return;
      await loadIntelligenceData();
    }
    fetchData();
    return () => {
      ignore = true;
    };
  }, [projectId, loadIntelligenceData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await api.post(`/projects/${projectId}/intelligence/refresh`);
      await loadIntelligenceData();
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRiskStatus = async (riskId: string, nextStatus: RiskStatus) => {
    try {
      await api.patch(`/projects/${projectId}/intelligence/risks/${riskId}`, {
        status: nextStatus,
      });
      setRisks((prev) =>
        prev.map((r) => (r.risk_id === riskId ? { ...r, status: nextStatus } : r))
      );
    } catch (err) {
      console.error("Failed to update risk status:", err);
    }
  };

  const openRisksCount = risks.filter((r) => r.status === "OPEN").length;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] lg:h-screen w-full bg-[#070707] text-[#ededed] overflow-hidden select-none">
      {/* ── Top Header Bar ── */}
      <div className="shrink-0 px-4 sm:px-6 py-3.5 border-b border-[#1f1f1f] bg-[#0c0c0c] flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link
            href={`/project/${projectId}`}
            className="p-2 rounded-lg bg-[#141414] hover:bg-[#202020] border border-[#262626] text-[#888] hover:text-[#fafafa] transition-colors cursor-pointer shrink-0 shadow-xs"
            title="Back to Project"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
            <Activity className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-[#fafafa]">
                Project Intelligence Engine
              </h1>
              {stateSnapshot && (
                <span
                  className={`text-xs font-mono px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold border flex items-center gap-1.5 ${
                    stateSnapshot.health_status === "HEALTHY"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : stateSnapshot.health_status === "ATTENTION"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      : "bg-red-500/10 text-red-400 border-red-500/30"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      stateSnapshot.health_status === "HEALTHY"
                        ? "bg-emerald-400"
                        : stateSnapshot.health_status === "ATTENTION"
                        ? "bg-amber-400"
                        : "bg-red-400 animate-pulse"
                    }`}
                  />
                  {stateSnapshot.health_status}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-[#888] mt-0.5">
              Cross-system diagnostic synthesizer · Constitution, Decisions, Code Chunks & Activities
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-all disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Synthesizing Evidence..." : "Refresh Intelligence"}
          </button>
        </div>
      </div>

      {/* ── Key Performance Metrics Bar ── */}
      {stateSnapshot && (
        <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-[#1c1c1c] bg-[#090909] grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[#111] border border-[#222]">
            <div className="w-7 h-7 rounded-md bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
              <ScrollText className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] uppercase font-mono text-[#888] block leading-none">Active Decisions</span>
              <span className="text-sm sm:text-base font-bold text-[#fafafa] leading-tight">
                {stateSnapshot.active_decisions_count} Logged
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[#111] border border-[#222]">
            <div className="w-7 h-7 rounded-md bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] uppercase font-mono text-[#888] block leading-none">Open Risks</span>
              <span className={`text-sm sm:text-base font-bold leading-tight ${openRisksCount > 0 ? "text-amber-400" : "text-[#fafafa]"}`}>
                {openRisksCount} Active
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[#111] border border-[#222]">
            <div className="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <Shield className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] uppercase font-mono text-[#888] block leading-none">Drift Signals</span>
              <span className="text-sm sm:text-base font-bold text-[#fafafa] leading-tight">
                {consistencyIssues.length} Detected
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[#111] border border-[#222]">
            <div className="w-7 h-7 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] uppercase font-mono text-[#888] block leading-none">Timeline Depth</span>
              <span className="text-sm sm:text-base font-bold text-[#fafafa] leading-tight">
                {timeline.length} Milestones
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-Navigation Tabs ── */}
      <div className="flex items-center border-b border-[#1c1c1c] bg-[#0c0c0c] px-4 sm:px-6 gap-2 text-xs sm:text-sm shrink-0 overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`py-3 px-3 font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer text-xs sm:text-sm ${
            activeTab === "overview"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-[#888] hover:text-[#ededed]"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Executive Overview
        </button>
        <button
          onClick={() => setActiveTab("changes")}
          className={`py-3 px-3 font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer text-xs sm:text-sm ${
            activeTab === "changes"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-[#888] hover:text-[#ededed]"
          }`}
        >
          <GitCommit className="w-4 h-4" />
          Semantic Changes ({changes.length})
        </button>
        <button
          onClick={() => setActiveTab("consistency")}
          className={`py-3 px-3 font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer text-xs sm:text-sm ${
            activeTab === "consistency"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-[#888] hover:text-[#ededed]"
          }`}
        >
          <Shield className="w-4 h-4" />
          Consistency & Drift ({consistencyIssues.length})
        </button>
        <button
          onClick={() => setActiveTab("risks")}
          className={`py-3 px-3 font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer text-xs sm:text-sm ${
            activeTab === "risks"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-[#888] hover:text-[#ededed]"
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Risks & Blockers ({risks.length})
        </button>
        <button
          onClick={() => setActiveTab("gaps")}
          className={`py-3 px-3 font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer text-xs sm:text-sm ${
            activeTab === "gaps"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-[#888] hover:text-[#ededed]"
          }`}
        >
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          Knowledge Gaps ({knowledgeGaps.length})
        </button>
        <button
          onClick={() => setActiveTab("timeline")}
          className={`py-3 px-3 font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer text-xs sm:text-sm ${
            activeTab === "timeline"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-[#888] hover:text-[#ededed]"
          }`}
        >
          <Clock className="w-4 h-4" />
          Unified Timeline ({timeline.length})
        </button>
      </div>

      {/* ── Scrollable Tab Content Area ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-20 text-xs sm:text-sm text-[#737373]">
            <Loader2 className="w-7 h-7 animate-spin mb-3 text-emerald-400" />
            <p className="font-mono">Synthesizing Project Intelligence across Constitution, Decisions, Code, and Meetings...</p>
          </div>
        ) : (
          <>
            {/* ══════════════════ TAB 1: EXECUTIVE OVERVIEW ══════════════════ */}
            {activeTab === "overview" && stateSnapshot && (
              <div className="space-y-6 animate-fade-in">
                {/* Current Phase & Executive Synthesis Card */}
                <div className="p-5 sm:p-6 rounded-2xl bg-[#0f0f0f] border border-[#242424] space-y-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1f1f1f]">
                    <div>
                      <span className="text-xs font-mono text-[#888] uppercase tracking-wider block font-bold">
                        Derived Project Phase
                      </span>
                      <h2 className="text-base sm:text-lg font-extrabold text-emerald-400 mt-0.5 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                        {stateSnapshot.current_phase}
                      </h2>
                    </div>
                    <div className="flex items-center gap-3 text-xs sm:text-sm">
                      <Link
                        href={`/project/${projectId}/constitution`}
                        className="px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#222] border border-[#2a2a2a] text-[#fafafa] font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <ScrollText className="w-4 h-4 text-indigo-400" />
                        Constitution
                      </Link>
                      <Link
                        href={`/project/${projectId}/decisions`}
                        className="px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#222] border border-[#2a2a2a] text-[#fafafa] font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <FileCheck className="w-4 h-4 text-emerald-400" />
                        Decision Log
                      </Link>
                      <Link
                        href={`/project/${projectId}/graph`}
                        className="px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#222] border border-[#2a2a2a] text-[#fafafa] font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Layers className="w-4 h-4 text-cyan-400" />
                        Architecture
                      </Link>
                    </div>
                  </div>

                  {/* Summary Text */}
                  <div className="p-4 rounded-xl bg-[#141414] border border-[#222] text-xs sm:text-sm text-[#dedede] leading-relaxed">
                    <span className="font-bold text-emerald-400 uppercase tracking-wider font-mono text-xs block mb-1">
                      Executive Health Synthesis:
                    </span>
                    {stateSnapshot.project_summary}
                  </div>

                  {/* Health Diagnostic Signals */}
                  <div className="space-y-2 pt-1">
                    <span className="text-xs font-bold text-[#888] uppercase tracking-wider block">
                      Diagnostic Signals & Alignment Indicators:
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {stateSnapshot.health_reasons.map((reason, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2.5 p-3 rounded-lg bg-[#121212] border border-[#1f1f1f] text-xs sm:text-sm text-[#cfcfcf]"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span className="leading-snug">{reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Grid: Active Focus vs Delivered Milestones */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Active In-Progress Work */}
                  <div className="p-5 rounded-2xl bg-[#0f0f0f] border border-[#242424] space-y-3">
                    <h3 className="text-xs sm:text-sm font-bold text-[#fafafa] uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Active In-Progress Work
                    </h3>
                    <div className="space-y-2">
                      {stateSnapshot.active_work.length === 0 ? (
                        <p className="text-xs sm:text-sm text-[#666] italic p-3">No active in-progress items recorded.</p>
                      ) : (
                        stateSnapshot.active_work.map((w, idx) => (
                          <div
                            key={idx}
                            className="text-xs sm:text-sm p-3 rounded-xl bg-[#131313] border border-[#222] text-[#ededed] font-medium flex items-center gap-2.5"
                          >
                            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                            <span className="leading-tight">{w}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Delivered Milestones */}
                  <div className="p-5 rounded-2xl bg-[#0f0f0f] border border-[#242424] space-y-3">
                    <h3 className="text-xs sm:text-sm font-bold text-[#fafafa] uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Recently Delivered Milestones
                    </h3>
                    <div className="space-y-2">
                      {stateSnapshot.completed_work.length === 0 ? (
                        <p className="text-xs sm:text-sm text-[#666] italic p-3">No completed milestones recorded yet.</p>
                      ) : (
                        stateSnapshot.completed_work.map((w, idx) => (
                          <div
                            key={idx}
                            className="text-xs sm:text-sm p-3 rounded-xl bg-[#131313] border border-[#222] text-[#d4d4d4] flex items-center gap-2.5"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="leading-tight">{w}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Technical Stack Architecture Grid */}
                <div className="p-5 sm:p-6 rounded-2xl bg-[#0f0f0f] border border-[#242424] space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs sm:text-sm font-bold text-[#fafafa] uppercase tracking-wider flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-indigo-400" />
                      Active Technology Stack Architecture
                    </h3>
                    <Link
                      href={`/project/${projectId}/constitution`}
                      className="text-xs sm:text-sm text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                    >
                      Edit Constitution <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {Object.entries(stateSnapshot.technical_stack).map(([category, items]) => (
                      <div key={category} className="p-4 rounded-xl bg-[#141414] border border-[#222] space-y-2">
                        <span className="text-xs font-mono font-bold text-[#888] uppercase tracking-wider block">
                          {category}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {items && items.length > 0 ? (
                            items.map((item, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-[#1c1c1c] text-[#fafafa] text-xs sm:text-sm font-mono font-medium border border-[#2c2c2c]"
                              >
                                {item}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[#666] italic">None specified</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════ TAB 2: SEMANTIC CHANGES ══════════════════ */}
            {activeTab === "changes" && (
              <div className="space-y-4 animate-fade-in">
                <div className="pb-3 border-b border-[#222] flex items-center justify-between">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[#fafafa]">Semantic Development Changes</h2>
                    <p className="text-xs sm:text-sm text-[#888]">
                      Higher-level thematic changes synthesized from Decisions, Constitution bumps, Meetings, and Git Syncs
                    </p>
                  </div>
                  <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[#141414] border border-[#262626] text-[#a3a3a3]">
                    {changes.length} Semantic Groups
                  </span>
                </div>

                {changes.length === 0 ? (
                  <div className="p-16 text-center text-xs sm:text-sm text-[#777] bg-[#111] rounded-2xl border border-[#222]">
                    <GitCommit className="w-8 h-8 text-[#333] mx-auto mb-2" />
                    No semantic change groups synthesized yet. Activity will appear as decisions and code are logged.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {changes.map((g, gIdx) => (
                      <div
                        key={`chg-${g.group_id || gIdx}-${gIdx}`}
                        className="p-4 rounded-xl bg-[#111] border border-[#222] space-y-2 hover:border-[#383838] transition-colors shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-[#fafafa] flex items-center gap-2">
                            <GitCommit className="w-4 h-4 text-emerald-400 shrink-0" />
                            {g.title}
                          </h4>
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-[#1a1a1a] text-emerald-400 border border-emerald-500/20">
                              {g.area}
                            </span>
                            <span className="text-xs font-mono text-[#888]">
                              {new Date(g.timestamp).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs sm:text-sm text-[#a3a3a3] leading-relaxed">{g.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════ TAB 3: CONSISTENCY & DRIFT ══════════════════ */}
            {activeTab === "consistency" && (
              <div className="space-y-4 animate-fade-in">
                <div className="pb-3 border-b border-[#222]">
                  <h2 className="text-sm sm:text-base font-bold text-[#fafafa]">Cross-System Consistency & Drift Verification</h2>
                  <p className="text-xs sm:text-sm text-[#888]">
                    Continuous automated verification between Constitution Rules, Decision Records, and Code Implementation
                  </p>
                </div>

                {consistencyIssues.length === 0 ? (
                  <div className="p-16 text-center text-xs sm:text-sm text-[#777] bg-[#111] rounded-2xl border border-[#222]">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <h3 className="text-sm sm:text-base font-bold text-[#fafafa] mb-1">0 Architectural Drift Detected</h3>
                    <p className="text-xs sm:text-sm text-[#888] max-w-md mx-auto">
                      All active project decisions, codebase implementations, and technology stacks align strictly with the Project Constitution.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {consistencyIssues.map((iss, issIdx) => (
                      <div
                        key={`iss-${iss.issue_id || issIdx}-${issIdx}`}
                        className="p-5 rounded-2xl bg-[#111] border border-amber-500/30 space-y-3.5 shadow-md"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-amber-300 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                            {iss.title}
                          </h4>
                          <span className="text-xs px-2.5 py-0.5 rounded font-mono font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/25">
                            {iss.issue_type}
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-[#dedede] leading-relaxed">{iss.description}</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs sm:text-sm pt-2 border-t border-[#1f1f1f]">
                          <div className="p-3 rounded-xl bg-[#161616] border border-[#242424]">
                            <span className="text-xs font-mono text-[#888] uppercase block mb-1 font-bold">
                              Documented Claim / Rule:
                            </span>
                            <span className="text-[#fafafa] font-mono text-xs sm:text-sm">{iss.documented_claim}</span>
                          </div>
                          <div className="p-3 rounded-xl bg-[#161616] border border-[#242424]">
                            <span className="text-xs font-mono text-[#888] uppercase block mb-1 font-bold">
                              Observed Evidence:
                            </span>
                            <span className="text-amber-300 font-mono text-xs sm:text-sm">{iss.observed_evidence}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════ TAB 4: RISKS & BLOCKERS ══════════════════ */}
            {activeTab === "risks" && (
              <div className="space-y-4 animate-fade-in">
                <div className="pb-3 border-b border-[#222]">
                  <h2 className="text-sm sm:text-base font-bold text-[#fafafa]">Evidence-Based Project Risks & Blockers</h2>
                  <p className="text-xs sm:text-sm text-[#888]">
                    Contradictory decisions, disconnected repositories, blocked action items, and unmitigated single points of failure
                  </p>
                </div>

                {risks.length === 0 ? (
                  <div className="p-16 text-center text-xs sm:text-sm text-[#777] bg-[#111] rounded-2xl border border-[#222]">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <h3 className="text-sm sm:text-base font-bold text-[#fafafa] mb-1">No Active Project Risks</h3>
                    <p className="text-xs sm:text-sm text-[#888] max-w-md mx-auto">
                      Forge AI has not identified any architectural blockers or conflicting decisions.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {risks.map((r, rIdx) => {
                      const isResolved = r.status === "RESOLVED";
                      const isHigh = r.severity === "HIGH" || r.severity === "CRITICAL";
                      return (
                        <div
                          key={`risk-${r.risk_id || rIdx}-${rIdx}`}
                          className={`p-5 rounded-2xl border transition-all space-y-3.5 ${
                            isResolved
                              ? "bg-[#0e0e0e] border-[#1f1f1f] opacity-50"
                              : isHigh
                              ? "bg-red-950/10 border-red-500/35 shadow-lg"
                              : "bg-[#111] border-[#242424]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <h4
                              className={`text-xs sm:text-sm font-bold flex items-center gap-2 ${
                                isHigh && !isResolved ? "text-red-400" : "text-[#fafafa]"
                              }`}
                            >
                              <AlertTriangle className="w-4 h-4 shrink-0" />
                              {r.title}
                            </h4>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs px-2.5 py-0.5 rounded font-mono font-bold uppercase ${
                                  isHigh
                                    ? "bg-red-500/15 text-red-400 border border-red-500/30"
                                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                }`}
                              >
                                {r.severity}
                              </span>
                              <button
                                onClick={() => handleRiskStatus(r.risk_id, isResolved ? "OPEN" : "RESOLVED")}
                                className="text-xs px-3 py-1 rounded-lg bg-[#1f1f1f] hover:bg-[#2a2a2a] text-[#fafafa] font-semibold flex items-center gap-1.5 cursor-pointer border border-[#333] transition-colors"
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                {isResolved ? "Reopen Risk" : "Mark Resolved"}
                              </button>
                            </div>
                          </div>

                          <p className="text-xs sm:text-sm text-[#cfcfcf] leading-relaxed">{r.impact_explanation}</p>

                          {/* Evidence Box */}
                          {r.evidence && r.evidence.length > 0 && (
                            <div className="p-3 rounded-xl bg-[#141414] border border-[#222] text-xs text-[#888] space-y-1">
                              <span className="font-bold text-[#fafafa] text-xs uppercase font-mono block">
                                Traceable Source Evidence:
                              </span>
                              {r.evidence.map((ev, i) => (
                                <div key={`ev-${i}`} className="flex items-center gap-2 font-mono text-xs">
                                  <span className="text-emerald-400">[{String(ev.source_type || "evidence")}]</span>
                                  <span className="text-[#dedede]">{String(ev.title || ev.decision_text || ev.source_id)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════ TAB 5: KNOWLEDGE GAPS ══════════════════ */}
            {activeTab === "gaps" && (
              <div className="space-y-4 animate-fade-in">
                <div className="pb-3 border-b border-[#222]">
                  <h2 className="text-sm sm:text-base font-bold text-[#fafafa]">Identified Project Knowledge Gaps</h2>
                  <p className="text-xs sm:text-sm text-[#888]">
                    Missing architectural specifications, undocumented integrations, or unconfigured workflows
                  </p>
                </div>

                {knowledgeGaps.length === 0 ? (
                  <div className="p-16 text-center text-xs sm:text-sm text-[#777] bg-[#111] rounded-2xl border border-[#222]">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <h3 className="text-sm sm:text-base font-bold text-[#fafafa] mb-1">0 Knowledge Gaps</h3>
                    <p className="text-xs sm:text-sm text-[#888] max-w-md mx-auto">
                      All core architectural layers, database specifications, and integration channels are documented.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {knowledgeGaps.map((g, gIdx) => (
                      <div
                        key={`gap-${g.gap_id || gIdx}-${gIdx}`}
                        className="p-5 rounded-2xl bg-[#111] border border-cyan-500/25 space-y-3 shadow-md"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-[#fafafa] flex items-center gap-2">
                            <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0" />
                            {g.area}
                          </h4>
                          <span className="text-xs font-mono text-[#888]">
                            {new Date(g.detected_at).toLocaleDateString()}
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-[#cfcfcf] leading-relaxed">{g.description}</p>

                        <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs sm:text-sm text-cyan-300 flex items-center gap-2 font-medium">
                          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span>Recommended Action: {g.suggested_action}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════ TAB 6: UNIFIED TIMELINE ══════════════════ */}
            {activeTab === "timeline" && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#222]">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[#fafafa]">Unified Project Chronology</h2>
                    <p className="text-xs sm:text-sm text-[#888]">
                      Unified timeline across Decisions, Constitution Bumps, Voice Meetings, Code Ingests, and Actions
                    </p>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm flex-wrap">
                    {[
                      { id: "", label: "All Events" },
                      { id: "DECISION", label: "Decisions" },
                      { id: "CONSTITUTION", label: "Constitution" },
                      { id: "GITHUB", label: "GitHub Ingest" },
                      { id: "MEETING", label: "Meetings" },
                      { id: "ACTION_ITEM", label: "Action Items" },
                    ].map((f) => (
                      <button
                        key={f.id || "all"}
                        onClick={() => setTimelineFilter(f.id)}
                        className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer border ${
                          timelineFilter === f.id
                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                            : "bg-[#141414] border-[#262626] text-[#888] hover:text-[#fafafa]"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {timeline.length === 0 ? (
                  <div className="p-16 text-center text-xs sm:text-sm text-[#777] bg-[#111] rounded-2xl border border-[#222]">
                    <Clock className="w-8 h-8 text-[#333] mx-auto mb-2" />
                    No timeline events recorded yet for this filter.
                  </div>
                ) : (
                  <div className="space-y-3 relative before:absolute before:inset-0 before:left-4 before:w-0.5 before:bg-[#222]">
                    {timeline.map((ev, evIdx) => (
                      <div key={`ev-${ev.event_id || evIdx}-${evIdx}`} className="relative flex items-start gap-4 pl-9">
                        <div className="absolute left-2.5 top-2.5 w-3 h-3 rounded-full bg-[#0a0a0a] border-2 border-emerald-400" />
                        <div className="flex-1 p-4 rounded-xl bg-[#111] border border-[#222] space-y-1.5 hover:border-[#333] transition-colors">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-[#fafafa]">{ev.title}</span>
                            <span className="text-xs font-mono text-[#888]">
                              {new Date(ev.timestamp).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          {ev.description && (
                            <p className="text-xs sm:text-sm text-[#a3a3a3] leading-relaxed">{ev.description}</p>
                          )}
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#1c1c1c] text-emerald-300 border border-[#2c2c2c]">
                              {ev.event_type}
                            </span>
                            <span className="text-xs text-[#888] font-mono">By {ev.author}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
