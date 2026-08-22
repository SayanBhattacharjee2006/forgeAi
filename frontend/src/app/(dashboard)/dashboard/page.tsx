"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Zap,
  Settings,
  TrendingUp,
  Database,
  GitBranch,
  FileText,
  MessageSquare,
  Loader2,
  Folder,
  Trash2,
  Users,
  Search,
  CheckCircle2,
  Circle,
  Activity,
  ChevronRight,
  ChevronDown,
  Clock,
  ExternalLink,
  UserPlus,
  ShieldCheck,
  Radio,
  ArrowUpRight,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { GithubIcon } from "@/components/shared/github-icon";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { useProjectStore } from "@/store/use-project-store";
import { useAuthStore } from "@/store/use-auth-store";
import type { Project, ActivityItem } from "@/types";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateProjectDialog, JoinProjectDialog } from "@/components/project/create-project-dialog";

function formatRelativeTime(isoString: string): string {
  if (!isoString) return "Just now";
  try {
    let normalized = String(isoString).trim();
    if (!normalized) return "Just now";

    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalized)) {
      normalized = normalized.replace(" ", "T") + "Z";
    } else if (normalized.endsWith("+00:00")) {
      normalized = normalized.slice(0, -6) + "Z";
    }

    const date = new Date(normalized);
    if (isNaN(date.getTime())) return "Recently";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (diffMs < 0 && diffMs > -120000) return "Just now";

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 45) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

export default function DashboardPage() {
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [pendingProjects, setPendingProjects] = useState<Project[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuthStore();
  const { projects, isLoading, fetchProjects, deleteProject, openCreateDialog, openJoinDialog } = useProjectStore();
  const router = useRouter();

  const fetchPendingRequests = useCallback(async () => {
    try {
      const pending = await api.get<Project[]>("/projects/join/pending");
      setPendingProjects(pending || []);
    } catch {
      setPendingProjects([]);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchProjects();
      api.get<Project[]>("/projects/join/pending")
        .then((pending) => setPendingProjects(pending || []))
        .catch(() => setPendingProjects([]));
    }
  }, [user, fetchProjects]);

  useEffect(() => {
    api.get<ActivityItem[]>("/projects/activity/all")
      .then((data) => setActivities(data || []))
      .catch((err) => {
        console.error("Failed to fetch recent activity:", err);
        setActivities([]);
      })
      .finally(() => setIsLoadingActivity(false));
  }, [projects]);

  const totalChunks = (projects || []).reduce(
    (sum, p) =>
      sum +
      (p?.ingestion_status?.github_chunks_count || 0) +
      (p?.ingestion_status?.discord_chunks_count || 0),
    0
  );

  const connectedSources = (projects || []).filter(
    (p) =>
      p?.ingestion_status?.github_backfill_complete ||
      p?.ingestion_status?.discord_backfill_complete
  ).length;

  const decisionsList = useMemo(() => {
    return (activities || []).filter((a) => a.type === "decision");
  }, [activities]);

  const teamActivitiesList = useMemo(() => {
    return (activities || []).filter((a) => a.type !== "decision");
  }, [activities]);

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.github_repo_name && p.github_repo_name.toLowerCase().includes(q))
    );
  }, [projects, searchQuery]);

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project? This cannot be undone.")) return;
    try {
      await deleteProject(projectId);
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };

  const primaryProject = projects && projects.length > 0 ? projects[0] : null;

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8 max-w-[1400px] w-full mx-auto animate-fade-in bg-background text-foreground transition-colors duration-200">
      {/* 1. Header (Forge Dashboard + Action Buttons) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <Badge variant="outline" className="border-border text-muted-foreground bg-card text-xs px-2.5 py-1 font-mono font-medium">
              Live Memory
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5">
            Your team&apos;s project memory at a glance.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            onClick={openJoinDialog}
            variant="outline"
            size="sm"
            className="h-9 px-4 text-xs sm:text-sm bg-secondary text-secondary-foreground border-border hover:bg-accent font-medium cursor-pointer shadow-2xs"
          >
            <UserPlus className="w-4 h-4 mr-1.5 text-muted-foreground" />
            Join Project
          </Button>

          <Button
            onClick={openCreateDialog}
            size="sm"
            className="h-9 px-4 text-xs sm:text-sm bg-primary text-primary-foreground hover:opacity-90 font-semibold shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-1.5" strokeWidth={2.5} />
            New Project
          </Button>
        </div>
      </div>

      {/* 2. Pending Join Requests Collapsible Banner */}
      {pendingProjects.length > 0 && (
        <div className="rounded-xl border border-border bg-card text-foreground overflow-hidden transition-all shadow-2xs">
          <button
            onClick={() => setPendingExpanded(!pendingExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-accent/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-muted-foreground shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                <span className="text-sm font-semibold text-foreground">
                  Pending Join Requests
                </span>
                <Badge variant="secondary" className="h-5 px-2 text-xs font-mono bg-background border-border text-muted-foreground">
                  {pendingProjects.length}
                </Badge>
                <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline truncate">
                  — Awaiting project owner approval
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
                {pendingExpanded ? "Hide details" : "View details"}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                  pendingExpanded ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {pendingExpanded && (
            <div className="px-4 pb-4 pt-1 border-t border-border animate-in fade-in-50 duration-200">
              <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                You requested to join the following workspaces. They will become accessible once approved by the project owner.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pendingProjects.map((p) => (
                  <div
                    key={p.project_id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs sm:text-sm font-semibold text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {p.github_repo_name || "No repo attached"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-border bg-card text-muted-foreground text-[11px] px-2 py-0.5 shrink-0 font-medium"
                    >
                      Awaiting Approval
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. 4 KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Active Projects */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Active Projects</span>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-border bg-background text-xs text-muted-foreground font-medium">
                <Folder className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Active</span>
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-foreground mt-2">
              {projects.length}
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-border space-y-0.5">
            <p className="text-xs sm:text-sm font-medium text-foreground">Active in your workspace</p>
            <p className="text-xs text-muted-foreground">Connected repositories & teams</p>
          </div>
        </div>

        {/* Metric 2: Knowledge Chunks */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Knowledge Chunks</span>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-border bg-background text-xs text-muted-foreground font-semibold font-mono">
                <Database className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Qdrant</span>
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-foreground font-mono mt-2">
              {totalChunks.toLocaleString()}
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-border space-y-0.5">
            <p className="text-xs sm:text-sm font-medium text-foreground">Vector chunks indexed</p>
            <p className="text-xs text-muted-foreground">GitHub, Discord & project context</p>
          </div>
        </div>

        {/* Metric 3: Active Integrations */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Active Integrations</span>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-border bg-background text-xs text-muted-foreground font-medium">
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Pipelines</span>
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-foreground mt-2">
              {connectedSources > 0 ? connectedSources : projects.length}
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-border space-y-0.5">
            <p className="text-xs sm:text-sm font-medium text-foreground">GitHub & Discord active</p>
            <p className="text-xs text-muted-foreground">Live webhook synchronization</p>
          </div>
        </div>

        {/* Metric 4: Decisions Extracted */}
        <div
          onClick={() => {
            if (primaryProject) {
              router.push(`/project/${primaryProject.project_id}/decisions`);
            }
          }}
          onMouseEnter={() => {
            if (primaryProject) {
              router.prefetch(`/project/${primaryProject.project_id}/decisions`);
            }
          }}
          className={`bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-2xs ${
            primaryProject ? "hover:border-zinc-400 dark:hover:border-zinc-700 cursor-pointer transition-colors" : ""
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Decisions Extracted</span>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-border bg-background text-xs text-muted-foreground font-semibold">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Architecture</span>
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-foreground mt-2">
              {decisionsList.length > 0 ? decisionsList.length : "—"}
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-border space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-foreground">
              <span>AI Decision Engine</span>
              {primaryProject && <ArrowUpRight className="w-4 h-4 text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground">AI-extracted architectural choices</p>
          </div>
        </div>
      </div>

      {/* 4. Middle Section: Recent Activity (Left 3/5) + Connected Sources (Right 2/5) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch">
        {/* Left 3/5: Recent Activity Feed */}
        <div className="lg:col-span-3 flex flex-col">
          <div className="bg-card border border-border rounded-xl p-4 sm:p-5 h-full flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-border shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-foreground">Recent Activity</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Real-time events across connected sources</p>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-background border border-border text-muted-foreground text-xs font-semibold font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Feed
              </div>
            </div>

            {/* Activity Items List with Wheel Scroll */}
            <div className="flex-1 min-h-0 mt-2.5 overflow-y-auto pr-1 space-y-2 max-h-[220px]">
              {isLoadingActivity ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                  <span className="text-xs text-muted-foreground">Loading activity feed...</span>
                </div>
              ) : activities.length === 0 ? (
                <div className="p-6 text-center my-auto">
                  <Activity className="w-6 h-6 text-muted-foreground mx-auto mb-1.5 opacity-60" />
                  <p className="text-xs sm:text-sm text-foreground font-semibold">No recent activity recorded</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sync a repository or chat to generate activity logs.</p>
                </div>
              ) : (
                activities.map((item) => {
                  const isDecision = item.type === "decision";
                  const isDiscord = item.type === "discord";
                  const isChat = item.type === "chat";

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (item.url) router.push(item.url);
                      }}
                      onMouseEnter={() => {
                        if (item.url) router.prefetch(item.url);
                      }}
                      className="py-2 px-2.5 rounded-lg bg-background border border-border hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors cursor-pointer group flex items-center justify-between gap-2.5 shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-md flex items-center justify-center font-medium text-xs shrink-0 bg-card border border-border ${
                            isDecision
                              ? "text-emerald-500"
                              : isDiscord
                              ? "text-[#5865F2]"
                              : isChat
                              ? "text-sky-500"
                              : "text-black dark:text-white"
                          }`}
                        >
                          {isDecision ? (
                            <FileText className="w-3.5 h-3.5 text-emerald-500" />
                          ) : isDiscord ? (
                            <DiscordIcon size={14} className="text-[#5865F2]" />
                          ) : isChat ? (
                            <MessageSquare className="w-3.5 h-3.5 text-sky-500" />
                          ) : (
                            <GithubIcon size={14} className="text-black dark:text-white" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate" title={item.title}>
                            {item.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{item.source}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className="text-[11px] px-1.5 py-0.2 font-medium border-border bg-card text-muted-foreground"
                        >
                          {isDecision ? "Decision" : isDiscord ? "Discord" : isChat ? "Team Chat" : "GitHub Sync"}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground font-mono w-14 text-right">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right 2/5: Connected Sources & Project Health */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="bg-card border border-border rounded-xl p-4 sm:p-5 h-full flex flex-col justify-between shadow-2xs">
            <div className="pb-2.5 border-b border-border shrink-0">
              <h3 className="text-sm sm:text-base font-bold text-foreground">Connected Sources</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Pipeline status & memory feeds</p>
            </div>

            {/* Health & Sources Breakdown */}
            <div className="space-y-2 py-2 flex-1 flex flex-col justify-between">
              {/* GitHub Source Row */}
              <div className="p-2.5 rounded-lg bg-background border border-border flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-card border border-border flex items-center justify-center text-foreground shrink-0">
                    <GithubIcon size={16} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-foreground block truncate">GitHub Ingestion</span>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {primaryProject?.github_repo_name || "Repository pipeline"}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="flex items-center gap-1.5 justify-end">
                    <div className={`w-2 h-2 rounded-full ${primaryProject?.github_repo_name || primaryProject?.ingestion_status?.github_backfill_complete ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"}`} />
                    <span className={`text-xs font-semibold ${primaryProject?.github_repo_name || primaryProject?.ingestion_status?.github_backfill_complete ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground"}`}>
                      {primaryProject?.github_repo_name || primaryProject?.ingestion_status?.github_backfill_complete ? "Connected" : "Optional"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {primaryProject?.ingestion_status?.github_backfill_complete ? "Live Sync" : primaryProject?.github_repo_name ? "Ready to Sync" : "Not configured"}
                  </p>
                </div>
              </div>

              {/* Discord Source Row */}
              <div className="p-2.5 rounded-lg bg-background border border-border flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-card border border-border flex items-center justify-center text-[#5865F2] shrink-0">
                    <DiscordIcon size={16} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-foreground block truncate">Discord Bot Sync</span>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {primaryProject?.discord_guild_id ? `Server ID: ${primaryProject.discord_guild_id}` : "Community discussions"}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="flex items-center gap-1.5 justify-end">
                    <div className={`w-2 h-2 rounded-full ${primaryProject?.discord_guild_id ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"}`} />
                    <span className={`text-xs font-semibold ${primaryProject?.discord_guild_id ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground"}`}>
                      {primaryProject?.discord_guild_id ? "Connected" : "Optional"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {primaryProject?.discord_guild_id ? "Syncing" : "Not configured"}
                  </p>
                </div>
              </div>

              {/* Project Health Quick Summary */}
              <div className="pt-2 border-t border-border grid grid-cols-3 gap-2 text-center">
                <div className="p-1.5 rounded-md bg-background border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Indexing</p>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-500 font-mono">● Ready</p>
                </div>
                <div className="p-1.5 rounded-md bg-background border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Knowledge</p>
                  <p className="text-xs font-bold text-foreground font-mono">{totalChunks} chunks</p>
                </div>
                <div className="p-1.5 rounded-md bg-background border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Members</p>
                  <p className="text-xs font-bold text-foreground font-mono">
                    {projects.reduce((acc, p) => acc + (p.members?.length || 1), 0)} total
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Projects Section (Data Table) */}
      <Card className="bg-card border-border text-foreground overflow-hidden shadow-2xs">
        <CardHeader className="p-5 border-b border-border flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <CardTitle className="text-base sm:text-lg font-bold text-foreground">Projects</CardTitle>
              <Badge variant="secondary" className="bg-background text-muted-foreground border border-border text-xs px-2.5 py-0.5 font-mono font-medium">
                {filteredProjects.length} active
              </Badge>
            </div>
            <CardDescription className="text-xs sm:text-sm text-muted-foreground">
              Manage connected code repositories and knowledge indexes.
            </CardDescription>
          </div>

          {/* Table search filter */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 pr-3 text-xs sm:text-sm bg-background border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-ring"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              <span className="text-xs text-muted-foreground">Loading projects...</span>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="p-10 text-center flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center mb-2.5 text-muted-foreground">
                <Folder className="w-5 h-5" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                {searchQuery ? "No matching projects found" : "No projects in workspace"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mb-4">
                {searchQuery
                  ? "Try searching for a different project name or repository URL."
                  : "Create your first project or enter a join code to get started with team memory."}
              </p>
              {searchQuery ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                  className="h-8 px-3 text-xs bg-secondary text-secondary-foreground border-border hover:bg-accent"
                >
                  Clear search
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={openCreateDialog}
                  className="h-8 px-3 text-xs bg-primary text-primary-foreground hover:opacity-90 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  New Project
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground bg-background uppercase tracking-wider font-semibold text-xs">
                    <th className="py-3 px-4 font-semibold">Project</th>
                    <th className="py-3 px-4 font-semibold">Repository</th>
                    <th className="py-3 px-4 font-semibold">Integrations</th>
                    <th className="py-3 px-4 font-semibold text-right">Knowledge</th>
                    <th className="py-3 px-4 font-semibold text-center">Team</th>
                    <th className="py-3 px-4 font-semibold text-center">Status</th>
                    <th className="py-3 px-4 font-semibold text-right w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredProjects.map((project) => {
                    const githubReady = project?.ingestion_status?.github_backfill_complete;
                    const discordReady = project?.ingestion_status?.discord_backfill_complete;
                    const chunks =
                      (project?.ingestion_status?.github_chunks_count || 0) +
                      (project?.ingestion_status?.discord_chunks_count || 0);

                    return (
                      <tr
                        key={project.project_id}
                        onClick={() => router.push(`/project/${project.project_id}`)}
                        onMouseEnter={() => router.prefetch(`/project/${project.project_id}`)}
                        className="group hover:bg-accent/50 transition-colors cursor-pointer"
                      >
                        {/* Project Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-md bg-background border border-border flex items-center justify-center shrink-0 transition-colors">
                              <Folder className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground transition-colors truncate text-sm sm:text-base">
                                  {project.name}
                                </span>
                                {project.join_code && (
                                  <span className="text-[11px] font-mono px-2 py-0.2 rounded bg-background border border-border text-muted-foreground">
                                    {project.join_code}
                                  </span>
                                )}
                              </div>
                              {project.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-[280px] mt-0.5">
                                  {project.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Repository */}
                        <td className="py-3 px-4">
                          {project.github_repo_name ? (
                            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-foreground bg-background px-2.5 py-1 rounded-md border border-border">
                              <GithubIcon size={14} className="text-muted-foreground" />
                              <span className="truncate max-w-[160px]">{project.github_repo_name}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>

                        {/* Integrations Badges */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              title={githubReady ? "GitHub: Indexed" : "GitHub: Connected"}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border border-border bg-background text-muted-foreground"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span>GitHub</span>
                            </div>

                            <div
                              title={project.discord_guild_id ? "Discord: Connected" : "Discord: Not configured"}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border border-border bg-background text-muted-foreground"
                            >
                              <div
                                className={`w-1.5 h-1.5 rounded-full ${
                                  discordReady || project.discord_guild_id ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"
                                }`}
                              />
                              <span>Discord</span>
                            </div>
                          </div>
                        </td>

                        {/* Chunks */}
                        <td className="py-3 px-4 text-right">
                          <span className="font-mono text-xs sm:text-sm text-foreground font-semibold">
                            {chunks.toLocaleString()} chunks
                          </span>
                        </td>

                        {/* Team */}
                        <td className="py-3 px-4 text-center">
                          <Badge variant="outline" className="h-5.5 px-2 text-xs font-mono border-border bg-background text-muted-foreground">
                            <Users className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                            {project.members?.length || 1}
                          </Badge>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant="outline"
                            className="h-5.5 px-2.5 text-xs font-semibold border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500"
                          >
                            Ready
                          </Badge>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={(e) => handleDeleteProject(e, project.project_id)}
                              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                              title="Delete Project"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 6. Bottom Row: Recent Decisions (Left) + Team Activity (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Recent Decisions Panel */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between pb-3.5 border-b border-border">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-foreground">Recent Decisions</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Architectural choices extracted from discussions & PRs</p>
            </div>
            {primaryProject && (
              <Link
                href={`/project/${primaryProject.project_id}/decisions`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground border border-border text-xs sm:text-sm font-semibold hover:bg-accent transition-colors shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <span>View All</span>
              </Link>
            )}
          </div>

          <div className="divide-y divide-border/60 py-1 min-h-[160px]">
            {decisionsList.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-60" />
                <p className="text-sm sm:text-base text-foreground font-semibold">No decisions recorded yet</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Sync commits or chat in team channels to extract decisions automatically.
                </p>
              </div>
            ) : (
              decisionsList.slice(0, 4).map((dec) => (
                <div
                  key={dec.id}
                  onClick={() => {
                    if (dec.url) router.push(dec.url);
                  }}
                  className="py-3 flex items-start justify-between gap-3 hover:bg-accent/50 px-2.5 rounded-lg transition-colors cursor-pointer group"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-background text-emerald-500 border border-border flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-2">
                        {dec.title.replace(/^Decision:\s*/i, "")}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground font-medium">{dec.source}</span>
                        <span className="text-xs text-muted-foreground">&bull;</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatRelativeTime(dec.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-border bg-background text-muted-foreground text-xs px-2 py-0.5 shrink-0 font-medium">
                    Decision
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Team Activity & Collaborations Panel */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between pb-3.5 border-b border-border">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-foreground">Team Activity</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Recent member updates, chats, and workspace events</p>
            </div>
            {primaryProject && (
              <Link
                href={`/project/${primaryProject.project_id}/group-chat`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground border border-border text-xs sm:text-sm font-semibold hover:bg-accent transition-colors shadow-2xs"
              >
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Group Chat</span>
              </Link>
            )}
          </div>

          <div className="divide-y divide-border/60 py-1 min-h-[160px]">
            {teamActivitiesList.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-60" />
                <p className="text-sm sm:text-base text-foreground font-semibold">No team discussions recorded</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Send messages in group chat or connect a Discord guild to record team activity.
                </p>
              </div>
            ) : (
              teamActivitiesList.slice(0, 4).map((act) => (
                <div
                  key={act.id}
                  onClick={() => {
                    if (act.url) router.push(act.url);
                  }}
                  className="py-3 flex items-start justify-between gap-3 hover:bg-accent/50 px-2.5 rounded-lg transition-colors cursor-pointer group"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-background border border-border ${
                        act.type === "discord"
                          ? "text-[#5865F2]"
                          : act.type === "chat"
                          ? "text-sky-500"
                          : act.type === "member"
                          ? "text-amber-500"
                          : "text-foreground"
                      }`}
                    >
                      {act.type === "discord" ? (
                        <DiscordIcon size={14} />
                      ) : act.type === "chat" ? (
                        <MessageSquare className="w-4 h-4 text-sky-500" />
                      ) : act.type === "member" ? (
                        <Users className="w-4 h-4 text-amber-500" />
                      ) : (
                        <GithubIcon size={14} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-2">
                        {act.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground font-medium">{act.source}</span>
                        <span className="text-xs text-muted-foreground">&bull;</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatRelativeTime(act.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-border bg-background text-muted-foreground text-xs px-2 py-0.5 shrink-0 font-medium">
                    {act.type === "discord" ? "Discord" : act.type === "chat" ? "Team Chat" : act.type === "member" ? "Member" : "Activity"}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Global Dialog Modals */}
      <CreateProjectDialog />
      <JoinProjectDialog />
    </div>
  );
}
