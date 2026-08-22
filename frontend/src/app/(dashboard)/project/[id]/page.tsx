"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  Mic,
  FileText,
  Loader2,
  Database,
  ChevronRight,
  ArrowUpRight,
  Users,
  Trash2,
  Network,
  Folder,
  UserPlus,
  X,
  Check,
  RefreshCw,
  Sparkles,
  Bot,
  Settings,
  Shield,
  ShieldCheck,
  Copy,
  ScrollText,
  Activity,
  ArrowLeft,
  GitBranch,
  ExternalLink,
  Clock,
} from "lucide-react";
import { GithubIcon } from "@/components/shared/github-icon";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { DiscordConnectDialog } from "@/components/project/discord-connect-dialog";
import { useProjectStore } from "@/store/use-project-store";
import { useAuthStore } from "@/store/use-auth-store";
import { api } from "@/lib/api";
import { ActivityItem, MemberDetail } from "@/types";

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

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const currentProject = useProjectStore((state) => state.currentProject);
  const fetchProject = useProjectStore((state) => state.fetchProject);
  const updateMemberRole = useProjectStore((state) => state.updateMemberRole);
  const removeMember = useProjectStore((state) => state.removeMember);
  const inviteMember = useProjectStore((state) => state.inviteMember);
  const isLoading = useProjectStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [discordModalOpen, setDiscordModalOpen] = useState(false);
  const [processingJoinId, setProcessingJoinId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);
  const [decisionsCount, setDecisionsCount] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Quick invite state
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  const isOwner =
    currentProject?.user_role === "owner" ||
    user?.user_id === currentProject?.owner_id ||
    (currentProject?.member_roles && user?.user_id && currentProject.member_roles[user.user_id] === "owner");

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      setIsLoadingActivity(true);
      api
        .get<ActivityItem[]>(`/projects/${projectId}/activity`)
        .then((data) => setActivities(data || []))
        .catch((err) => {
          console.error("Failed to fetch project activity:", err);
          setActivities([]);
        })
        .finally(() => setIsLoadingActivity(false));

      api
        .get<any[]>(`/projects/${projectId}/decisions`)
        .then((data) => setDecisionsCount(data?.length ?? 0))
        .catch(() => setDecisionsCount(0));
    }
  }, [projectId, fetchProject]);

  const handleCopyJoinCode = () => {
    if (currentProject?.join_code) {
      navigator.clipboard.writeText(currentProject.join_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleKick = async (memberId: string, memberName?: string) => {
    const isSelf = memberId === user?.user_id;
    const confirmText = isSelf
      ? "Are you sure you want to leave this project?"
      : `Are you sure you want to remove ${memberName || "this user"} from this project?`;

    if (!confirm(confirmText)) return;

    try {
      await removeMember(projectId, memberId);
      if (isSelf) {
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      console.error("Failed to remove member:", err);
      alert((err as Error).message || "Failed to remove member.");
    }
  };

  const handleRoleChange = async (member: MemberDetail, newRole: "owner" | "member") => {
    if (member.role === newRole) return;
    setChangingRoleId(member.user_id);
    try {
      await updateMemberRole(projectId, member.user_id, newRole);
    } catch (err: unknown) {
      console.error("Failed to update role:", err);
      alert((err as Error).message || "Failed to update member role.");
    } finally {
      setChangingRoleId(null);
    }
  };

  const handleQuickInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim()) return;

    setIsInviting(true);
    setInviteFeedback(null);
    try {
      await inviteMember(projectId, inviteUsername.trim());
      setInviteFeedback({ type: "success", text: `Added @${inviteUsername.trim()} to team!` });
      setInviteUsername("");
      setTimeout(() => {
        setShowInviteInput(false);
        setInviteFeedback(null);
      }, 2000);
    } catch (err: unknown) {
      setInviteFeedback({ type: "error", text: (err as Error).message || "Failed to invite user." });
    } finally {
      setIsInviting(false);
    }
  };

  const handleApproveRequest = async (applicantId: string) => {
    setProcessingJoinId(applicantId);
    try {
      await api.post(`/projects/${projectId}/join/requests/${applicantId}/approve`);
      await fetchProject(projectId, true);
    } catch (err) {
      console.error("Failed to approve join request:", err);
      alert("Failed to approve join request.");
    } finally {
      setProcessingJoinId(null);
    }
  };

  const handleRejectRequest = async (applicantId: string) => {
    setProcessingJoinId(applicantId);
    try {
      await api.post(`/projects/${projectId}/join/requests/${applicantId}/reject`);
      await fetchProject(projectId, true);
    } catch (err) {
      console.error("Failed to reject join request:", err);
      alert("Failed to reject join request.");
    } finally {
      setProcessingJoinId(null);
    }
  };

  const handleSyncGithub = async () => {
    setIsSyncing(true);
    setSyncMessage("");
    try {
      await api.post(`/projects/${projectId}/ingest/github`);
      setSyncMessage("Sync started! Processing in background...");
      await fetchProject(projectId, true);
    } catch (err) {
      console.error("Failed to start sync", err);
      setSyncMessage("Failed to start sync.");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(""), 5000);
    }
  };

  if (isLoading || (currentProject && currentProject.project_id !== projectId)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" strokeWidth={2} />
        <p className="text-xs font-mono text-muted-foreground animate-pulse">Loading project details...</p>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-12 h-12 rounded-lg bg-card border border-border flex items-center justify-center mb-3">
          <Folder className="w-6 h-6 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <h2 className="text-base font-semibold text-foreground mb-1">Project Not Found</h2>
        <p className="text-sm text-muted-foreground max-w-sm mb-5">
          This project may not exist, or you might not be a member yet.
        </p>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-md bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const p = currentProject;
  const ai = p.ai_config || { name: "Forge", role: "Project Assistant", invocation_phrase: "Forge" };
  const totalChunks =
    (p.ingestion_status?.github_chunks_count || 0) +
    (p.ingestion_status?.discord_chunks_count || 0);

  const connectedSources =
    (p.github_repo_name || p.ingestion_status?.github_backfill_complete ? 1 : 0) +
    (p.discord_guild_id ? 1 : 0);

  const features = [
    {
      href: `/project/${projectId}/intelligence`,
      icon: Activity,
      title: "Project Intelligence",
      description: "Real-time derived project state, semantic changes, consistency checks, risks, and unified timeline",
      color: "text-emerald-500",
    },
    {
      href: `/project/${projectId}/constitution`,
      icon: ScrollText,
      title: "Project Constitution",
      description: "Authoritative technical agreements, architecture rules, coding standards & Git workflows",
      color: "text-amber-500",
    },
    {
      href: `/project/${projectId}/chat`,
      icon: MessageSquare,
      title: "Unified Team & AI Chat",
      description: `Real-time team collaboration with @${ai.invocation_phrase || ai.name} assistant and Constitution memory`,
      color: "text-sky-500",
    },
    {
      href: `/project/${projectId}/voice`,
      icon: Mic,
      title: "Voice Meeting Room",
      description: "Host team meetings, transcribe discussions, and save filtered key decisions",
      color: "text-rose-500",
    },
    {
      href: `/project/${projectId}/decisions`,
      icon: FileText,
      title: "Decision Log",
      description: "AI-extracted architectural decisions with automated conflict reconciliation",
      color: "text-emerald-500",
    },
    {
      href: `/project/${projectId}/graph`,
      icon: Network,
      title: "Knowledge Graph",
      description: "Visualize how decisions connect to source files, messages, and people",
      color: "text-purple-500",
    },
  ];

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8 max-w-[1400px] w-full mx-auto animate-fade-in bg-background text-foreground transition-colors duration-200">
      {/* 1. Project Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg bg-card hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 mt-0.5 shadow-xs"
            title="Back to Dashboard"
            aria-label="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
                {p.name}
              </h1>
              {isOwner ? (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Owner
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-muted text-muted-foreground border border-border">
                  <Shield className="w-3.5 h-3.5" />
                  Member
                </span>
              )}
              {p.join_code && (
                <button
                  onClick={handleCopyJoinCode}
                  title="Click to copy join code"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-card border border-border text-foreground hover:bg-accent cursor-pointer transition-colors"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                  CODE: {p.join_code}
                </button>
              )}
              {p.github_repo_url && (
                <a
                  href={p.github_repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <GithubIcon size={14} className="text-foreground" />
                  <span className="truncate max-w-[200px]">{p.github_repo_name || "Repository"}</span>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              {p.description || "Knowledge workspace with AI-powered memory and decision tracking."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href={`/project/${projectId}/chat`}
            prefetch={true}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-accent border border-border text-xs sm:text-sm font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-500" />
            AI Chat
          </Link>
          <Link
            href={`/project/${projectId}/decisions`}
            prefetch={true}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-accent border border-border text-xs sm:text-sm font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <FileText className="w-4 h-4 text-emerald-500" />
            Decisions
          </Link>
          <Link
            href="/settings"
            prefetch={true}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-accent border border-border text-xs sm:text-sm font-medium transition-colors shadow-xs cursor-pointer"
            title="Project Settings"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
            Settings
          </Link>
        </div>
      </div>

      {/* Project AI Persona Card */}
      <div className="bg-card p-4 border border-emerald-500/20 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">{ai.name}</span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                @{ai.invocation_phrase}
              </span>
              <span className="text-xs text-muted-foreground font-mono">Project AI Persona</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Role: <span className="text-foreground font-medium">{ai.role}</span>
            </p>
          </div>
        </div>
        {isOwner && (
          <Link
            href="/settings"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition-colors w-fit shrink-0 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Configure AI Identity
          </Link>
        )}
      </div>

      {/* Pending Join Requests Banner (Owner only) */}
      {isOwner && p.join_requests && p.join_requests.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                Pending Join Requests ({p.join_requests.length})
              </h3>
            </div>
            <span className="text-xs text-amber-500 font-mono font-semibold">Action Required</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(p.join_request_details && p.join_request_details.length > 0
              ? p.join_request_details
              : p.join_requests.map((uid) => ({
                  user_id: uid,
                  github_username: uid,
                  name: "Applicant",
                  avatar_url: null,
                  role: "applicant" as const,
                }))
            ).map((applicant) => (
              <div
                key={applicant.user_id}
                className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {applicant.avatar_url ? (
                    <img
                      src={applicant.avatar_url}
                      alt={applicant.github_username || ""}
                      className="w-8 h-8 rounded-full shrink-0 border border-border"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs text-foreground shrink-0 font-bold">
                      {(applicant.github_username || "??").substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {applicant.name || applicant.github_username}
                    </p>
                    <p className="text-xs text-muted-foreground truncate font-mono">
                      @{applicant.github_username || applicant.user_id}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    onClick={() => handleRejectRequest(applicant.user_id)}
                    disabled={processingJoinId === applicant.user_id}
                    className="p-1.5 rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-40 cursor-pointer"
                    title="Reject Request"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleApproveRequest(applicant.user_id)}
                    disabled={processingJoinId === applicant.user_id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
                  >
                    {processingJoinId === applicant.user_id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Top Metric Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Knowledge Chunks */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors shadow-xs">
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
            <p className="text-xs text-muted-foreground">GitHub commits, PRs & chats</p>
          </div>
        </div>

        {/* Metric 2: Team Members */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Team Members</span>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-border bg-background text-xs text-muted-foreground font-medium">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{p?.members?.length || 1} / {p?.max_members || 10}</span>
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-foreground mt-2">
              {p?.members?.length || 1}
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-border space-y-0.5">
            <p className="text-xs sm:text-sm font-medium text-foreground">Active collaborators</p>
            <p className="text-xs text-muted-foreground">Workspace member permissions</p>
          </div>
        </div>

        {/* Metric 3: Decisions Extracted */}
        <div
          onClick={() => router.push(`/project/${projectId}/decisions`)}
          className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors shadow-xs cursor-pointer"
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
              {decisionsCount !== null ? decisionsCount : "—"}
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-border space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-foreground">
              <span>AI Decision Engine</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">Auto-extracted architectural choices</p>
          </div>
        </div>

        {/* Metric 4: Connected Sources */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Connected Sources</span>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-border bg-background text-xs text-muted-foreground font-medium">
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Pipelines</span>
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-foreground mt-2">
              {connectedSources}
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-border space-y-0.5">
            <p className="text-xs sm:text-sm font-medium text-foreground">GitHub & Discord active</p>
            <p className="text-xs text-muted-foreground">Live webhook synchronization</p>
          </div>
        </div>
      </div>

      {/* 3. Middle Row: Compact Integrations + Team Roster */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Compact GitHub Pipeline */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center text-foreground shrink-0 border border-border">
                  <GithubIcon size={16} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-foreground">GitHub Pipeline</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${p?.ingestion_status?.github_backfill_complete ? "bg-emerald-500" : p?.github_repo_url ? "bg-amber-500 animate-pulse" : "bg-zinc-400"}`} />
                    <span className="text-xs text-muted-foreground font-medium">
                      {p?.ingestion_status?.github_backfill_complete ? "Live & Synced" : p?.github_repo_url ? "Ready to sync" : "Not connected"}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSyncGithub}
                disabled={isSyncing || !p?.github_repo_url}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-accent border border-border text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} strokeWidth={1.5} />
                Sync Now
              </button>
            </div>

            <div className="py-3 space-y-2 text-xs sm:text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Repository</span>
                <span className="font-mono text-foreground font-semibold truncate max-w-[180px]" title={p?.github_repo_name || "None"}>
                  {p?.github_repo_name || "None"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Indexed Chunks</span>
                <span className="font-mono text-foreground font-semibold">
                  {p?.ingestion_status?.github_chunks_count || 0} chunks ({p?.ingestion_status?.indexed_commits_count || 0} commits, {p?.ingestion_status?.indexed_prs_count || 0} PRs)
                </span>
              </div>
              {syncMessage && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium pt-1 font-mono">
                  {syncMessage}
                </p>
              )}
            </div>
          </div>

          <div className="pt-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Branch</span>
            <span className="font-mono">{p?.github_branch || "main"}</span>
          </div>
        </div>

        {/* Compact Discord Bot Sync */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center text-[#5865F2] shrink-0 border border-border">
                  <DiscordIcon size={16} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-foreground">Discord Bot Sync</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${p?.discord_guild_id ? "bg-emerald-500" : "bg-zinc-400"}`} />
                    <span className="text-xs text-muted-foreground font-medium">
                      {p?.discord_guild_id ? "Connected & Listening" : "Optional"}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setDiscordModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-accent border border-border text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                {p?.discord_guild_id ? "Configure" : "Connect"}
              </button>
            </div>

            <div className="py-3 space-y-2 text-xs sm:text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Server Status</span>
                <span className="font-mono text-foreground font-semibold truncate max-w-[180px]">
                  {p?.discord_guild_id ? "Listening to messages" : "Not configured"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Chat Chunks</span>
                <span className="font-mono text-foreground font-semibold">
                  {p?.ingestion_status?.discord_chunks_count || 0} chunks
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Monitored Channels</span>
            <span className="font-mono">{p?.discord_channels?.length ? `${p.discord_channels.length} channels` : "All"}</span>
          </div>
        </div>

        {/* Team Members Roster */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center text-muted-foreground shrink-0 border border-border">
                  <Users className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-foreground">Project Members</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Workspace team</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-muted-foreground bg-background px-2.5 py-1 rounded-md border border-border">
                  {p?.members?.length || 1} / {p?.max_members || 10}
                </span>
                {isOwner && (
                  <button
                    onClick={() => setShowInviteInput(!showInviteInput)}
                    className="p-1 rounded bg-secondary text-secondary-foreground hover:bg-accent border border-border transition-colors cursor-pointer"
                    title="Invite Member"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick invite form */}
            {showInviteInput && isOwner && (
              <form onSubmit={handleQuickInvite} className="my-2 p-2 rounded-lg bg-background border border-border">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder="GitHub username"
                    className="flex-1 px-2 py-1 text-xs bg-card border border-border rounded text-foreground focus:outline-hidden"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isInviting || !inviteUsername.trim()}
                    className="px-2.5 py-1 rounded bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    {isInviting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
                  </button>
                </div>
                {inviteFeedback && (
                  <p className={`text-[10px] mt-1 ${inviteFeedback.type === "error" ? "text-rose-500" : "text-emerald-500"}`}>
                    {inviteFeedback.text}
                  </p>
                )}
              </form>
            )}

            <div className="py-2.5 space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
              {(p?.member_details && p.member_details.length > 0
                ? p.member_details
                : (p?.members || []).map((mId) => ({ user_id: mId, github_username: mId, name: mId, avatar_url: null, role: "member" as const }))
              ).map((member) => (
                <div key={member.user_id} className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-accent/40 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt={member.github_username || ""} className="w-5 h-5 rounded-full shrink-0 border border-border" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[9px] text-foreground shrink-0 font-bold">
                        {(member.github_username || "??").substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs sm:text-sm font-medium text-foreground truncate">
                      {member.name || member.github_username}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isOwner && member.user_id !== p?.owner_id ? (
                      <select
                        value={member.role}
                        disabled={changingRoleId === member.user_id}
                        onChange={(e) => handleRoleChange(member, e.target.value as "owner" | "member")}
                        className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <option value="member">Member</option>
                        <option value="owner">Owner</option>
                      </select>
                    ) : (
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.25 rounded font-mono ${
                          member.role === "owner"
                            ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                            : "text-muted-foreground bg-muted border border-border"
                        }`}
                      >
                        {member.role === "owner" ? "Owner" : "Member"}
                      </span>
                    )}

                    {(isOwner || member.user_id === user?.user_id) && member.user_id !== p?.owner_id && (
                      <button
                        onClick={() => handleKick(member.user_id, member.github_username)}
                        className="text-muted-foreground hover:text-rose-500 p-0.5 rounded cursor-pointer transition-colors"
                        title={member.user_id === user?.user_id ? "Leave Project" : "Remove Member"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Invite via code</span>
            <span
              onClick={handleCopyJoinCode}
              title="Click to copy join code"
              className="font-mono font-semibold text-foreground hover:text-emerald-500 cursor-pointer transition-colors"
            >
              {p.join_code || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Bottom Row: Project Capabilities + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        {/* Project Capabilities */}
        <div className="lg:col-span-3 space-y-3.5">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">Project Capabilities</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Interactive AI tools, governance, and persistent memory explorer</p>
          </div>

          <div className="space-y-3">
            {features.map((feature) => (
              <Link key={feature.href} href={feature.href} prefetch={true} className="block group">
                <div className="bg-card border border-border rounded-xl p-4 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors shadow-xs flex items-center gap-4 cursor-pointer">
                  <feature.icon className={`w-5 h-5 ${feature.color} shrink-0`} strokeWidth={2} />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate mt-0.5">
                      {feature.description}
                    </p>
                  </div>
                  <ChevronRight className="w-4.5 h-4.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Project Activity */}
        <div className="lg:col-span-2 space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">Recent Activity</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Real-time updates for {p.name}</p>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border text-muted-foreground text-xs font-semibold font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Feed
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
            <div className="overflow-y-auto pr-1 space-y-2.5 max-h-[365px]">
              {isLoadingActivity ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                  <span className="text-xs text-muted-foreground">Loading activity...</span>
                </div>
              ) : activities.length === 0 ? (
                <div className="p-8 text-center my-auto">
                  <p className="text-sm text-foreground font-semibold">No recent activity recorded</p>
                  <p className="text-xs text-muted-foreground mt-1">Sync GitHub or start chatting to see live updates.</p>
                </div>
              ) : (
                activities.slice(0, 10).map((item) => (
                  <div
                    key={item.id}
                    className="py-2.5 px-3 rounded-lg bg-background border border-border hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors shadow-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-md bg-card border border-border flex items-center justify-center mt-0.5 shrink-0">
                        {item.type === "decision" ? (
                          <FileText className="w-4 h-4 text-emerald-500" />
                        ) : item.type === "discord" ? (
                          <DiscordIcon size={15} className="text-[#5865F2]" />
                        ) : item.type === "chat" ? (
                          <MessageSquare className="w-4 h-4 text-sky-500" />
                        ) : item.type === "member" ? (
                          <Users className="w-4 h-4 text-amber-500" />
                        ) : (
                          <GithubIcon size={15} className="text-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-foreground leading-snug line-clamp-2" title={item.title}>
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground font-medium">{item.source}</span>
                          <span className="text-xs text-muted-foreground">&bull;</span>
                          <span className="text-xs text-muted-foreground font-mono">{formatRelativeTime(item.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Discord Connect Dialog */}
      <DiscordConnectDialog
        isOpen={discordModalOpen}
        onClose={() => setDiscordModalOpen(false)}
        projectId={projectId}
        currentGuildId={p?.discord_guild_id}
        currentChannels={p?.discord_channels}
        onSuccess={() => fetchProject(projectId, true)}
      />
    </div>
  );
}
