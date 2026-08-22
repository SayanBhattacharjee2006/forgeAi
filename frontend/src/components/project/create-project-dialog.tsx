"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  UserPlus,
  Loader2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useProjectStore } from "@/store/use-project-store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function JoinProjectDialog({
  isOpen,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const storeIsOpen = useProjectStore((s) => s.isJoinDialogOpen);
  const closeJoinDialog = useProjectStore((s) => s.closeJoinDialog);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);

  const open = isOpen !== undefined ? isOpen : storeIsOpen;
  const handleClose = () => {
    if (onClose) onClose();
    else closeJoinDialog();
  };

  const handleJoin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!joinCode.trim() || joinCode.length !== 6) return;
    setIsJoining(true);
    setError("");
    setSuccess(false);
    try {
      await api.post("/projects/join/request", { join_code: joinCode.trim().toUpperCase() });
      setSuccess(true);
      await fetchProjects();
      setTimeout(() => {
        setJoinCode("");
        setSuccess(false);
        handleClose();
      }, 1500);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to join project");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(openState) => !openState && handleClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border text-foreground">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-foreground">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">Join Project</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                Enter the 6-character code provided by the project owner.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleJoin} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Join Code</label>
            <Input
              type="text"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3"
              className="h-10 text-center font-mono text-lg tracking-widest bg-background border-border text-foreground focus-visible:ring-ring uppercase"
              autoFocus
            />
          </div>

          {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
          {success && (
            <p className="text-xs text-emerald-500 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Request sent! Awaiting owner approval.
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              className="h-9 px-4 text-sm bg-secondary text-secondary-foreground border-border hover:bg-accent cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={joinCode.trim().length !== 6 || isJoining}
              className="h-9 px-4 text-sm bg-primary text-primary-foreground hover:opacity-90 font-semibold cursor-pointer"
            >
              {isJoining ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Send Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateProjectDialog({
  isOpen,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [discordGuildId, setDiscordGuildId] = useState("");
  const [maxMembers, setMaxMembers] = useState(10);
  const [aiName, setAiName] = useState("Forge");
  const [aiRole, setAiRole] = useState("Project Assistant");
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const storeIsOpen = useProjectStore((s) => s.isCreateDialogOpen);
  const closeCreateDialog = useProjectStore((s) => s.closeCreateDialog);
  const createProject = useProjectStore((s) => s.createProject);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);

  const open = isOpen !== undefined ? isOpen : storeIsOpen;
  const handleClose = () => {
    if (onClose) onClose();
    else closeCreateDialog();
  };

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const created = await createProject({
        name: name.trim(),
        description: description.trim(),
        github_repo_url: githubUrl.trim(),
        discord_guild_id: discordGuildId.trim(),
        max_members: Number(maxMembers),
        ai_config: {
          name: aiName.trim() || "Forge",
          role: aiRole.trim() || "Project Assistant",
          invocation_phrase: aiName.trim() || "Forge",
        },
      });
      setName("");
      setDescription("");
      setGithubUrl("");
      setDiscordGuildId("");
      setMaxMembers(10);
      setAiName("Forge");
      setAiRole("Project Assistant");
      setShowAiConfig(false);
      await fetchProjects();
      handleClose();
      if (created?.project_id) {
        router.push(`/project/${created.project_id}`);
      }
    } catch (err) {
      console.error("Failed to create project:", err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(openState) => !openState && handleClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-foreground">
              <Plus className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">Create New Project</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                Connect GitHub & Discord to initialize persistent AI project memory.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Project Name <span className="text-foreground">*</span>
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. backend_service"
              className="h-9.5 text-sm bg-background border-border focus-visible:ring-ring text-foreground placeholder:text-muted-foreground/60"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Description</label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of your project goals"
              className="h-9.5 text-sm bg-background border-border focus-visible:ring-ring text-foreground placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">GitHub Repository URL</label>
            <Input
              type="text"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/owner/repository"
              className="h-9.5 text-sm font-mono bg-background border-border focus-visible:ring-ring text-foreground placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                <span>Discord Server ID</span>
                <span className="text-xs text-muted-foreground">Optional</span>
              </label>
              <Input
                type="text"
                value={discordGuildId}
                onChange={(e) => setDiscordGuildId(e.target.value)}
                placeholder="1234567890..."
                className="h-9.5 text-sm font-mono bg-background border-border focus-visible:ring-ring text-foreground placeholder:text-muted-foreground/60"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Max Members</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={maxMembers}
                onChange={(e) => setMaxMembers(Math.max(1, Number(e.target.value)))}
                className="h-9.5 text-sm bg-background border-border focus-visible:ring-ring text-foreground"
              />
            </div>
          </div>

          {/* AI Persona Customization Toggle */}
          <div className="pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => setShowAiConfig(!showAiConfig)}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{showAiConfig ? "− Hide AI Persona Options" : "+ Customize AI Identity & Persona"}</span>
            </button>

            {showAiConfig && (
              <div className="mt-2.5 p-3 rounded-lg bg-background border border-border space-y-2.5">
                <div>
                  <label className="block text-xs text-muted-foreground mb-0.5 font-medium">AI Display Name</label>
                  <Input
                    type="text"
                    value={aiName}
                    onChange={(e) => setAiName(e.target.value)}
                    placeholder="e.g. Atlas, Forge, Hermes"
                    className="h-8.5 text-xs bg-card border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-0.5 font-medium">AI Role / Persona</label>
                  <Input
                    type="text"
                    value={aiRole}
                    onChange={(e) => setAiRole(e.target.value)}
                    placeholder="e.g. Senior Software Architect"
                    className="h-8.5 text-xs bg-card border-border text-foreground"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              className="h-9 px-4 text-sm bg-secondary text-secondary-foreground border-border hover:bg-accent cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || isCreating}
              className="h-9 px-4 text-sm bg-primary text-primary-foreground hover:opacity-90 font-semibold disabled:opacity-50 cursor-pointer"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
