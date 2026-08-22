"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Save,
  Users,
  Settings as SettingsIcon,
  Check,
  X,
  UserPlus,
  Copy,
  User,
  Shield,
  AlertTriangle,
  ExternalLink,
  ArrowLeft,
  Bot,
  Sparkles,
  Trash2,
} from "lucide-react";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { useProjectStore } from "@/store/use-project-store";
import { useAuthStore } from "@/store/use-auth-store";
import { api } from "@/lib/api";
import { MemberDetail, ProjectAIConfig } from "@/types";

type JoinRequest = {
  request_id: string;
  user_id: string;
  user_name: string;
  github_username: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const currentProject = useProjectStore((state) => state.currentProject);
  const projects = useProjectStore((state) => state.projects);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject);
  const fetchProject = useProjectStore((state) => state.fetchProject);
  const updateProjectSettings = useProjectStore((state) => state.updateProjectSettings);
  const updateAIConfig = useProjectStore((state) => state.updateAIConfig);
  const updateMemberRole = useProjectStore((state) => state.updateMemberRole);
  const removeMember = useProjectStore((state) => state.removeMember);
  const inviteMember = useProjectStore((state) => state.inviteMember);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const user = useAuthStore((state) => state.user);

  const [activeTab, setActiveTab] = useState<"general" | "ai" | "team" | "account">("general");

  // Track project ID for state sync
  const [syncedProjectId, setSyncedProjectId] = useState<string | null>(null);

  // General Project form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [discordGuildId, setDiscordGuildId] = useState("");
  const [maxMembers, setMaxMembers] = useState(10);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [generalMessage, setGeneralMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // AI Persona form
  const [aiName, setAiName] = useState("Forge");
  const [aiRole, setAiRole] = useState("Project Assistant");
  const [aiInvocationPhrase, setAiInvocationPhrase] = useState("Forge");
  const [isSavingAI, setIsSavingAI] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Team state
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [inviteUsername, setInviteUsername] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  // Account / API Key
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const mockApiKey = "forge_sk_a3f2d1e4b5c6d7e8f921";

  // Danger Zone: Delete Project
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  // Sync form inputs when current project changes during render
  if (currentProject && currentProject.project_id !== syncedProjectId) {
    setSyncedProjectId(currentProject.project_id);
    setName(currentProject.name || "");
    setDescription(currentProject.description || "");
    setGithubRepoUrl(currentProject.github_repo_url || "");
    setDiscordGuildId(currentProject.discord_guild_id || "");
    setMaxMembers(currentProject.max_members || 10);

    const ai = currentProject.ai_config || {
      name: "Forge",
      role: "Project Assistant",
      invocation_phrase: "Forge",
    };
    setAiName(ai.name || "Forge");
    setAiRole(ai.role || "Project Assistant");
    setAiInvocationPhrase(ai.invocation_phrase || "Forge");
  }

  // Auto-fetch projects on load
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (!currentProject && projects.length > 0) {
      setCurrentProject(projects[0]);
    }
  }, [currentProject, projects, setCurrentProject]);

  const isOwner =
    currentProject?.user_role === "owner" ||
    user?.user_id === currentProject?.owner_id ||
    (currentProject?.member_roles && user?.user_id && currentProject.member_roles[user.user_id] === "owner");

  // Fetch pending requests if owner
  useEffect(() => {
    if (currentProject && isOwner && activeTab === "team") {
      api
        .get<JoinRequest[]>(`/projects/${currentProject.project_id}/join/requests`)
        .then(setPendingRequests)
        .catch(console.error);
    }
  }, [currentProject, isOwner, activeTab]);

  // Save General Settings
  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject) return;
    setIsSavingGeneral(true);
    setGeneralMessage(null);

    try {
      await updateProjectSettings(currentProject.project_id, {
        name: name.trim(),
        description: description.trim(),
        github_repo_url: githubRepoUrl.trim(),
        discord_guild_id: discordGuildId.trim(),
        max_members: Number(maxMembers),
      });
      setGeneralMessage({ type: "success", text: "Settings saved successfully!" });
    } catch (err: unknown) {
      console.error(err);
      setGeneralMessage({ type: "error", text: (err as Error).message || "Failed to save settings." });
    } finally {
      setIsSavingGeneral(false);
      setTimeout(() => setGeneralMessage(null), 4000);
    }
  };

  // Save AI Persona Configuration
  const handleSaveAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject) return;

    if (!aiName.trim() || !aiRole.trim() || !aiInvocationPhrase.trim()) {
      setAiMessage({ type: "error", text: "All AI persona fields are required." });
      return;
    }

    setIsSavingAI(true);
    setAiMessage(null);

    try {
      const config: ProjectAIConfig = {
        name: aiName.trim(),
        role: aiRole.trim(),
        invocation_phrase: aiInvocationPhrase.trim(),
      };
      await updateAIConfig(currentProject.project_id, config);
      setAiMessage({ type: "success", text: "AI persona configuration updated!" });
    } catch (err: unknown) {
      console.error(err);
      setAiMessage({ type: "error", text: (err as Error).message || "Failed to update AI configuration." });
    } finally {
      setIsSavingAI(false);
      setTimeout(() => setAiMessage(null), 4000);
    }
  };

  // Invite Member
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject || !inviteUsername.trim()) return;

    setIsInviting(true);
    setInviteMessage(null);
    try {
      await inviteMember(currentProject.project_id, inviteUsername.trim());
      setInviteMessage({ type: "success", text: `Invited @${inviteUsername.trim()} successfully!` });
      setInviteUsername("");
    } catch (err: unknown) {
      setInviteMessage({ type: "error", text: (err as Error).message || "Failed to invite member" });
    } finally {
      setIsInviting(false);
      setTimeout(() => setInviteMessage(null), 4000);
    }
  };

  // Change Member Role
  const handleRoleChange = async (member: MemberDetail, newRole: "owner" | "member") => {
    if (!currentProject || member.role === newRole) return;
    setChangingRoleId(member.user_id);
    try {
      await updateMemberRole(currentProject.project_id, member.user_id, newRole);
    } catch (err: unknown) {
      console.error(err);
      alert((err as Error).message || "Failed to update member role");
    } finally {
      setChangingRoleId(null);
    }
  };

  // Remove Member
  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!currentProject) return;
    if (!confirm(`Are you sure you want to remove ${memberName} from this project?`)) return;
    try {
      await removeMember(currentProject.project_id, memberId);
    } catch (err: unknown) {
      console.error(err);
      alert((err as Error).message || "Failed to remove member");
    }
  };

  // Approve / Reject Join Request
  const handleRequestAction = async (userId: string, action: "approve" | "reject") => {
    if (!currentProject) return;
    try {
      await api.post(`/projects/${currentProject.project_id}/join/requests/${userId}/${action}`);
      setPendingRequests((prev) => prev.filter((r) => r.user_id !== userId && r.request_id !== userId));
      if (action === "approve") {
        await fetchProject(currentProject.project_id, true);
      }
    } catch (err: unknown) {
      console.error(err);
      alert((err as Error).message || `Failed to ${action} request`);
    }
  };

  // Delete Project
  const handleDeleteProject = async () => {
    if (!currentProject) return;
    if (deleteConfirmName !== currentProject.name) {
      alert("Project name does not match confirmation.");
      return;
    }

    setIsDeletingProject(true);
    try {
      await deleteProject(currentProject.project_id);
      router.push("/dashboard");
    } catch (err: unknown) {
      console.error("Failed to delete project:", err);
      alert((err as Error).message || "Failed to delete project.");
      setIsDeletingProject(false);
    }
  };

  const copyJoinCode = () => {
    if (currentProject?.join_code) {
      navigator.clipboard.writeText(currentProject.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyApiKey = () => {
    navigator.clipboard.writeText(mockApiKey);
    setApiKeyCopied(true);
    setTimeout(() => setApiKeyCopied(false), 2000);
  };

  return (
    <div className="flex-1 space-y-6 p-5 lg:p-8 max-w-[1100px] w-full mx-auto animate-fade-in bg-background text-foreground transition-colors duration-200">
      {/* Header & Project Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg bg-card hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 shadow-xs mt-0.5"
            title="Back to Dashboard"
            aria-label="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">Project Settings</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Configure workspace settings, AI persona, team permissions, and credentials
            </p>
          </div>
        </div>

        {projects.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Workspace:</span>
            <select
              value={currentProject?.project_id || ""}
              onChange={(e) => {
                const found = projects.find((p) => p.project_id === e.target.value);
                if (found) setCurrentProject(found);
              }}
              className="px-3 py-1.5 text-xs bg-card border border-border rounded-md text-foreground focus:outline-hidden focus:border-ring"
            >
              {projects.map((proj) => (
                <option key={proj.project_id} value={proj.project_id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab("general")}
          className={`pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === "general"
              ? "border-emerald-500 text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <SettingsIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
          General Settings
        </button>
        <button
          onClick={() => setActiveTab("ai")}
          className={`pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === "ai"
              ? "border-emerald-500 text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.5} />
          AI Persona & Identity
        </button>
        <button
          onClick={() => setActiveTab("team")}
          className={`pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === "team"
              ? "border-emerald-500 text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="w-3.5 h-3.5" strokeWidth={1.5} />
          Team & Permissions
          {currentProject?.join_requests && currentProject.join_requests.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("account")}
          className={`pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === "account"
              ? "border-emerald-500 text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <User className="w-3.5 h-3.5" strokeWidth={1.5} />
          Account & Danger Zone
        </button>
      </div>

      {/* Tab 1: General Settings */}
      {activeTab === "general" && (
        <form onSubmit={handleSaveGeneral} className="space-y-5 max-w-3xl">
          {!isOwner && (
            <div className="p-3 rounded-lg bg-card border border-border text-muted-foreground text-xs flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400 shrink-0" />
              <span>You are viewing settings as a Member. Only Owners can update project metadata and connected sources.</span>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-xs">
            <h2 className="text-xs sm:text-sm font-bold text-foreground border-b border-border pb-3">
              Project Information
            </h2>

            <div className="space-y-1.5">
              <label className="block text-xs text-muted-foreground font-medium">Project Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwner}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:border-ring disabled:opacity-50"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs text-muted-foreground font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!isOwner}
                placeholder="What is your team building in this project?"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:border-ring min-h-[80px] disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs text-muted-foreground font-medium">Maximum Members Allowed</label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxMembers}
                onChange={(e) => setMaxMembers(Math.max(1, Number(e.target.value)))}
                disabled={!isOwner}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:border-ring disabled:opacity-50"
              />
              <p className="text-[11px] text-muted-foreground">Allowed between 1 and 100 members.</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-xs">
            <h2 className="text-xs sm:text-sm font-bold text-foreground border-b border-border pb-3">
              Connected Sources
            </h2>

            <div className="space-y-1.5">
              <label className="block text-xs text-muted-foreground font-medium">GitHub Repository URL</label>
              <input
                type="url"
                value={githubRepoUrl}
                onChange={(e) => setGithubRepoUrl(e.target.value)}
                disabled={!isOwner}
                placeholder="https://github.com/owner/repo"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:border-ring font-mono disabled:opacity-50"
              />
              <p className="text-[11px] text-muted-foreground">
                Repository code, pull requests, and commit history are indexed into vector memory.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <label className="block text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <DiscordIcon size={14} className="text-[#5865F2]" />
                  Discord Server ID (Guild ID)
                </label>
                <a
                  href="https://discord.com/oauth2/authorize?permissions=68608&scope=bot%20applications.commands"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#5865F2] hover:underline"
                >
                  Invite Bot to Server
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="text"
                value={discordGuildId}
                onChange={(e) => setDiscordGuildId(e.target.value)}
                disabled={!isOwner}
                placeholder="e.g. 123456789012345678"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:border-ring font-mono disabled:opacity-50"
              />
              <p className="text-[11px] text-muted-foreground">
                Enable Developer Mode in Discord, right-click your server name, and select &quot;Copy Server ID&quot;.
              </p>
            </div>
          </div>

          {isOwner && (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSavingGeneral}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
              >
                {isSavingGeneral ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                ) : (
                  <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                Save General Settings
              </button>

              {generalMessage && (
                <span
                  className={`text-xs font-medium ${
                    generalMessage.type === "error" ? "text-rose-500" : "text-emerald-500"
                  }`}
                >
                  {generalMessage.text}
                </span>
              )}
            </div>
          )}
        </form>
      )}

      {/* Tab 2: AI Persona & Identity */}
      {activeTab === "ai" && (
        <div className="space-y-6 max-w-3xl">
          {!isOwner && (
            <div className="p-3 rounded-lg bg-card border border-border text-muted-foreground text-xs flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400 shrink-0" />
              <span>You are viewing AI configuration as a Member. Only Owners can customize the Project AI Persona.</span>
            </div>
          )}

          {/* AI Interactive Persona Preview */}
          <div className="p-5 border border-emerald-500/30 bg-card rounded-xl shadow-xs">
            <div className="flex items-center justify-between mb-3 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">AI Persona Identity Preview</h2>
                  <p className="text-xs text-muted-foreground">How your AI identifies across Q&A, meetings, and group chat</p>
                </div>
              </div>
              <span className="text-[10px] text-emerald-500 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Live Preview
              </span>
            </div>

            <div className="p-4 rounded-lg bg-background border border-border space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-semibold text-foreground">{aiName || "Forge"}</span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono">
                  @{aiInvocationPhrase || "Forge"}
                </span>
                <span className="text-xs text-muted-foreground">· {aiRole || "Project Assistant"}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                &ldquo;Hello team! I am <strong className="text-foreground">{aiName || "Forge"}</strong>, your{" "}
                <span className="text-emerald-500 font-medium">{aiRole || "Project Assistant"}</span>. You can invoke me anytime
                by typing <code className="text-emerald-500 font-mono">@{aiInvocationPhrase || "Forge"}</code> in chat or speaking during
                voice meetings.&rdquo;
              </p>
            </div>
          </div>

          {/* AI Settings Form */}
          <form onSubmit={handleSaveAI} className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-xs">
            <h2 className="text-xs sm:text-sm font-bold text-foreground border-b border-border pb-3">
              Configure Persona
            </h2>

            <div className="space-y-1.5">
              <label className="block text-xs text-muted-foreground font-medium">AI Display Name *</label>
              <input
                type="text"
                value={aiName}
                onChange={(e) => setAiName(e.target.value)}
                disabled={!isOwner}
                placeholder="e.g. Atlas, Forge, Hermes, Jarvis"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:border-ring disabled:opacity-50"
                required
              />
              <p className="text-[11px] text-muted-foreground">The conversational name your AI assistant will respond as.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs text-muted-foreground font-medium">AI Role / Persona *</label>
              <input
                type="text"
                value={aiRole}
                onChange={(e) => setAiRole(e.target.value)}
                disabled={!isOwner}
                placeholder="e.g. Senior Software Architect, Security Lead, Project Assistant"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:border-ring disabled:opacity-50"
                required
              />
              <p className="text-[11px] text-muted-foreground">Defines the tone, depth, and domain expertise of the AI.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs text-muted-foreground font-medium">Invocation Phrase *</label>
              <input
                type="text"
                value={aiInvocationPhrase}
                onChange={(e) => setAiInvocationPhrase(e.target.value)}
                disabled={!isOwner}
                placeholder="e.g. Atlas, Forge, Assistant"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:border-ring font-mono disabled:opacity-50"
                required
              />
              <p className="text-[11px] text-muted-foreground">The keyword or handle teammates will use to invoke this assistant.</p>
            </div>

            {isOwner && (
              <div className="pt-3 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSavingAI}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
                >
                  {isSavingAI ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                  )}
                  Save AI Persona
                </button>

                {aiMessage && (
                  <span
                    className={`text-xs font-medium ${
                      aiMessage.type === "error" ? "text-rose-500" : "text-emerald-500"
                    }`}
                  >
                    {aiMessage.text}
                  </span>
                )}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Tab 3: Team Management */}
      {activeTab === "team" && (
        <div className="space-y-5 max-w-3xl">
          {/* Join Code Card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-xs">
            <h2 className="text-xs sm:text-sm font-bold text-foreground mb-1">Project Join Code</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Share this 6-character code with your team members to request access.
            </p>
            <div className="flex items-center gap-3 bg-background p-3 rounded-lg border border-border w-fit">
              <span className="text-2xl font-mono tracking-widest text-emerald-600 dark:text-emerald-500 font-bold">
                {currentProject?.join_code || "------"}
              </span>
              <button
                onClick={copyJoinCode}
                className="p-1.5 rounded bg-secondary text-secondary-foreground hover:bg-accent transition-colors cursor-pointer"
                title="Copy Join Code"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          </div>

          {/* Pending Join Requests */}
          {isOwner && pendingRequests.length > 0 && (
            <div className="bg-card border border-amber-500/30 rounded-xl p-5 shadow-xs">
              <h2 className="text-xs sm:text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-amber-500" />
                Pending Join Requests ({pendingRequests.length})
              </h2>
              <div className="space-y-2">
                {pendingRequests.map((req) => (
                  <div
                    key={req.request_id || req.user_id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                  >
                    <div>
                      <p className="text-foreground font-medium text-xs sm:text-sm">{req.user_name}</p>
                      <p className="text-muted-foreground text-[11px] font-mono">@{req.github_username}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRequestAction(req.user_id || req.request_id, "reject")}
                        className="px-2.5 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </button>
                      <button
                        onClick={() => handleRequestAction(req.user_id || req.request_id, "approve")}
                        className="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Direct Invite (Owner Only) */}
          {isOwner && (
            <div className="bg-card border border-border rounded-xl p-5 shadow-xs">
              <h2 className="text-xs sm:text-sm font-bold text-foreground mb-3">Direct Invite by GitHub Username</h2>
              <form onSubmit={handleInvite} className="flex flex-col gap-2.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder="e.g. torvalds"
                    className="flex-1 px-3 py-2 text-xs sm:text-sm bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:border-ring"
                  />
                  <button
                    type="submit"
                    disabled={isInviting || !inviteUsername.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
                  >
                    {isInviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    Invite
                  </button>
                </div>
                {inviteMessage && (
                  <span
                    className={`text-xs ${
                      inviteMessage.type === "error" ? "text-rose-500" : "text-emerald-500"
                    }`}
                  >
                    {inviteMessage.text}
                  </span>
                )}
              </form>
            </div>
          )}

          {/* Members List with Role Management */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-xs sm:text-sm font-bold text-foreground">
                Project Members ({currentProject?.members?.length || 0} / {currentProject?.max_members || 10})
              </h2>
            </div>

            <div className="space-y-2">
              {currentProject?.member_details?.map((member) => (
                <div
                  key={member.user_id}
                  className="p-3 rounded-lg bg-background border border-border flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.github_username || ""}
                        className="w-8 h-8 rounded-full shrink-0 border border-border"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-accent border border-border flex items-center justify-center text-[10px] text-foreground font-bold shrink-0">
                        {(member.github_username || "??").substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                        {member.name || member.github_username}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">@{member.github_username}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isOwner && member.user_id !== currentProject?.owner_id ? (
                      <select
                        value={member.role}
                        disabled={changingRoleId === member.user_id}
                        onChange={(e) => handleRoleChange(member, e.target.value as "owner" | "member")}
                        className="text-[11px] bg-card border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <option value="member">Member</option>
                        <option value="owner">Owner</option>
                      </select>
                    ) : (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded font-mono ${
                          member.role === "owner"
                            ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                            : "text-muted-foreground bg-muted border border-border"
                        }`}
                      >
                        {member.role === "owner" ? "Owner" : "Member"}
                      </span>
                    )}

                    {isOwner && member.user_id !== currentProject?.owner_id && (
                      <button
                        onClick={() => handleRemoveMember(member.user_id, member.github_username)}
                        className="p-1 text-muted-foreground hover:text-rose-500 rounded transition-colors cursor-pointer"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Account & Danger Zone */}
      {activeTab === "account" && (
        <div className="space-y-5 max-w-3xl">
          {/* Profile */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                <User className="w-3.5 h-3.5" strokeWidth={1.5} />
                User Profile
              </h2>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-4">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name || ""}
                    className="w-12 h-12 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-accent border border-border flex items-center justify-center text-sm font-bold text-foreground">
                    {(user?.name || "??").substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground">{user?.name || "—"}</p>
                  <p className="text-xs text-muted-foreground">@{user?.github_username || "—"}</p>
                  <p className="text-[11px] text-muted-foreground/75 mt-0.5">{user?.email || "No email"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* API Key section */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" strokeWidth={1.5} />
                API Access Token
              </h2>
            </div>
            <div className="p-5">
              <p className="text-xs text-muted-foreground mb-3">
                Use this API key to interact with Forge REST endpoints programmatically.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 text-xs font-mono bg-background border border-border rounded-md text-foreground flex items-center">
                  {showApiKey ? mockApiKey : "forge_sk_••••••••••••••••••••"}
                </div>
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="px-3 py-2 rounded-md bg-secondary border border-border text-secondary-foreground hover:text-foreground text-xs font-medium transition-colors cursor-pointer"
                >
                  {showApiKey ? "Hide" : "Reveal"}
                </button>
                <button
                  onClick={copyApiKey}
                  className="px-3 py-2 rounded-md bg-secondary border border-border text-secondary-foreground hover:text-emerald-500 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                >
                  {apiKeyCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </button>
              </div>
            </div>
          </div>

          {/* Danger Zone: Delete Project (Owner Only) */}
          {isOwner && currentProject && (
            <div className="bg-card border border-rose-500/30 rounded-xl overflow-hidden shadow-xs">
              <div className="px-5 py-3 border-b border-rose-500/20 bg-rose-500/5">
                <h2 className="text-xs sm:text-sm font-bold text-rose-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500" strokeWidth={1.5} />
                  Danger Zone — Delete Project
                </h2>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs sm:text-sm text-foreground font-semibold">Delete this project</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Once deleted, all vector memories, chat history, decisions, and settings associated with{" "}
                    <strong className="text-foreground">{currentProject.name}</strong> will be permanently destroyed.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs text-muted-foreground">
                    Please type <strong className="text-rose-500 font-mono">{currentProject.name}</strong> to confirm:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={deleteConfirmName}
                      onChange={(e) => setDeleteConfirmName(e.target.value)}
                      placeholder={currentProject.name}
                      className="flex-1 px-3 py-2 text-xs sm:text-sm bg-background border border-rose-500/30 rounded-md text-foreground focus:outline-hidden"
                    />
                    <button
                      onClick={handleDeleteProject}
                      disabled={deleteConfirmName !== currentProject.name || isDeletingProject}
                      className="px-4 py-2 rounded-md bg-rose-500 hover:bg-rose-600 text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      {isDeletingProject ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Delete Project
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
