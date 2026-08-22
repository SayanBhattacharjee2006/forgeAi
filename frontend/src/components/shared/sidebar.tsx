"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Zap,
  LayoutDashboard,
  Settings,
  Plus,
  LogOut,
  Folder,
  ChevronDown,
  Search,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useAuthStore } from "@/store/use-auth-store";
import { useProjectStore } from "@/store/use-project-store";
import { useSearchStore } from "@/store/use-search-store";
import { Badge } from "@/components/ui/badge";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setShowLogoutConfirm(false);
      router.replace("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const { projects, openCreateDialog } = useProjectStore();
  const { openSearch } = useSearchStore();
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  return (
    <>
      <aside className="fixed left-0 top-0 bottom-0 z-40 w-[250px] flex flex-col bg-sidebar border-r border-sidebar-border text-foreground transition-colors duration-200">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-sidebar-border">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <Zap className="w-4 h-4 text-background fill-background" strokeWidth={2} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-foreground tracking-tight">Forge</span>
              <Badge variant="outline" className="h-4.5 px-1.5 text-[10px] font-mono text-muted-foreground border-border bg-card">
                v0.1
              </Badge>
            </div>
          </Link>
        </div>

        {/* Quick Search */}
        <div className="px-3 pt-3 pb-1">
          <button
            type="button"
            onClick={() => openSearch()}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md bg-card border border-border text-muted-foreground text-sm hover:border-ring transition-colors cursor-pointer text-left"
          >
            <Search className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={2} />
            <span className="text-muted-foreground text-xs font-normal">Search workspace...</span>
            <kbd className="ml-auto text-[11px] text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5 font-mono">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-4">
          {/* Main Section */}
          <div>
            <p className="px-2 pb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Overview
            </p>
            <div className="space-y-1">
              <Link
                href="/dashboard"
                prefetch={true}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname === "/dashboard"
                    ? "bg-accent text-accent-foreground shadow-xs border border-border font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <span>Dashboard</span>
              </Link>
            </div>
          </div>

          {/* Projects Section */}
          <div>
            <div className="flex items-center justify-between px-2 pb-1.5">
              <button
                onClick={() => setProjectsExpanded(!projectsExpanded)}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer"
              >
                <span>Projects</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    projectsExpanded ? "" : "-rotate-90"
                  }`}
                  strokeWidth={2}
                />
              </button>
              <button
                type="button"
                onClick={openCreateDialog}
                title="Create New Project"
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </div>

            {projectsExpanded && (
              <div className="mt-1 space-y-1">
                {projects.length === 0 ? (
                  <div className="px-3 py-3 text-center rounded-md border border-dashed border-border bg-card">
                    <p className="text-xs text-foreground font-medium">No projects yet</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Create your first project</p>
                  </div>
                ) : (
                  projects.map((project) => {
                    const isActive = pathname.includes(`/project/${project.project_id}`);
                    const isReady =
                      project.ingestion_status?.github_backfill_complete ||
                      project.ingestion_status?.discord_backfill_complete;

                    return (
                      <Link
                        key={project.project_id}
                        href={`/project/${project.project_id}`}
                        prefetch={true}
                        className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                          isActive
                            ? "bg-accent text-accent-foreground border border-border font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/60 font-medium"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Folder
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                            }`}
                            strokeWidth={1.5}
                          />
                          <span className="truncate">{project.name}</span>
                        </div>
                        {isReady && (
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        )}
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* System & Settings */}
          <div>
            <p className="px-2 pb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              System
            </p>
            <div className="space-y-1">
              <Link
                href="/settings"
                prefetch={true}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname === "/settings"
                    ? "bg-accent text-accent-foreground border border-border font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                }`}
              >
                <Settings className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <span>Settings</span>
              </Link>
            </div>
          </div>
        </nav>

        {/* User Footer Profile Card */}
        <div className="p-3 border-t border-sidebar-border bg-sidebar">
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-card border border-border">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name || ""}
                className="w-8 h-8 rounded-full shrink-0 border border-border object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-accent border border-border text-foreground font-bold text-sm flex items-center justify-center shrink-0">
                {(user?.github_username || "U").substring(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate font-semibold leading-tight">
                {user?.name || user?.github_username}
              </p>
              <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
                @{user?.github_username}
              </p>
            </div>
            <button
              onClick={handleLogoutClick}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Global Project Creation Modal */}
        <CreateProjectDialog />
      </aside>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in"
          onClick={() => {
            if (!isLoggingOut) setShowLogoutConfirm(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-card border border-border p-5 shadow-2xl space-y-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">Sign Out of Forge AI?</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Are you sure you want to log out? You will need to authenticate with GitHub to access your workspace and projects again.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setShowLogoutConfirm(false)}
                className="px-3.5 py-1.5 rounded-lg border border-border text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={confirmLogout}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isLoggingOut ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Signing out...</span>
                  </>
                ) : (
                  <>
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Yes, Log Out</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
