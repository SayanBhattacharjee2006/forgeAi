"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Folder,
  LayoutDashboard,
  Settings,
  MessageSquare,
  FileText,
  Network,
  Mic,
  Sun,
  Moon,
  ArrowRight,
  X,
  Plus,
  UserPlus,
} from "lucide-react";
import { GithubIcon } from "@/components/shared/github-icon";
import { useSearchStore } from "@/store/use-search-store";
import { useProjectStore } from "@/store/use-project-store";
import { useTheme } from "@/components/theme-provider";

interface SearchResultItem {
  id: string;
  category: "Projects" | "Navigation" | "Actions";
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  badge?: string;
  action: () => void;
}

export function SearchCommandDialog() {
  const router = useRouter();
  const { isOpen, query, setIsOpen, closeSearch, setQuery } = useSearchStore();
  const { projects, currentProject, openCreateDialog, openJoinDialog } = useProjectStore();
  const { theme, toggleTheme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut listener (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen(!isOpen);
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        closeSearch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setIsOpen, closeSearch]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const results = useMemo<SearchResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    const items: SearchResultItem[] = [];

    // 1. Projects
    (projects || []).forEach((p) => {
      const matchName = p.name?.toLowerCase().includes(q);
      const matchDesc = p.description?.toLowerCase().includes(q);
      const matchRepo = p.github_repo_name?.toLowerCase().includes(q);
      const matchJoin = p.join_code?.toLowerCase().includes(q);

      if (!q || matchName || matchDesc || matchRepo || matchJoin) {
        items.push({
          id: `project-${p.project_id}`,
          category: "Projects",
          title: p.name,
          subtitle: p.github_repo_name || p.description || "Active workspace",
          badge: p.join_code ? `Code: ${p.join_code}` : undefined,
          icon: <Folder className="w-4 h-4 text-emerald-500" />,
          action: () => {
            router.push(`/project/${p.project_id}`);
            closeSearch();
          },
        });
      }
    });

    // 2. Navigation items
    const navItems = [
      {
        title: "Dashboard",
        subtitle: "Overview & project metrics",
        url: "/dashboard",
        icon: <LayoutDashboard className="w-4 h-4 text-muted-foreground" />,
      },
      {
        title: "Settings",
        subtitle: "Project configuration & account credentials",
        url: "/settings",
        icon: <Settings className="w-4 h-4 text-muted-foreground" />,
      },
    ];

    const activeProject = currentProject || (projects && projects.length > 0 ? projects[0] : null);

    if (activeProject) {
      navItems.push(
        {
          title: "AI Chat",
          subtitle: `Ask questions about ${activeProject.name}`,
          url: `/project/${activeProject.project_id}/chat`,
          icon: <MessageSquare className="w-4 h-4 text-sky-500" />,
        },
        {
          title: "Decision Log",
          subtitle: `Extracted architectural choices for ${activeProject.name}`,
          url: `/project/${activeProject.project_id}/decisions`,
          icon: <FileText className="w-4 h-4 text-emerald-500" />,
        },
        {
          title: "Knowledge Graph",
          subtitle: `Visual relational graph for ${activeProject.name}`,
          url: `/project/${activeProject.project_id}/graph`,
          icon: <Network className="w-4 h-4 text-purple-400" />,
        },
        {
          title: "Team Group Chat",
          subtitle: `Real-time discussion in ${activeProject.name}`,
          url: `/project/${activeProject.project_id}/group-chat`,
          icon: <MessageSquare className="w-4 h-4 text-sky-500" />,
        },
        {
          title: "Voice Room",
          subtitle: `Live audio channel for ${activeProject.name}`,
          url: `/project/${activeProject.project_id}/voice`,
          icon: <Mic className="w-4 h-4 text-rose-500" />,
        }
      );
    }

    navItems.forEach((nav) => {
      if (!q || nav.title.toLowerCase().includes(q) || nav.subtitle.toLowerCase().includes(q)) {
        items.push({
          id: `nav-${nav.title}`,
          category: "Navigation",
          title: nav.title,
          subtitle: nav.subtitle,
          icon: nav.icon,
          action: () => {
            router.push(nav.url);
            closeSearch();
          },
        });
      }
    });

    // 3. Actions
    const actionItems = [
      {
        id: "action-new-project",
        title: "Create New Project",
        subtitle: "Initialize a new AI memory workspace with GitHub & Discord",
        icon: <Plus className="w-4 h-4 text-emerald-500" />,
        action: () => {
          closeSearch();
          openCreateDialog();
        },
      },
      {
        id: "action-join-project",
        title: "Join Project",
        subtitle: "Enter a 6-character code to join an existing workspace",
        icon: <UserPlus className="w-4 h-4 text-sky-500" />,
        action: () => {
          closeSearch();
          openJoinDialog();
        },
      },
      {
        id: "action-theme",
        title: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        subtitle: "Toggle application theme",
        icon: theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-700" />,
        action: () => {
          toggleTheme();
          closeSearch();
        },
      },
    ];

    actionItems.forEach((act) => {
      if (!q || act.title.toLowerCase().includes(q) || act.subtitle.toLowerCase().includes(q)) {
        items.push({
          id: act.id,
          category: "Actions",
          title: act.title,
          subtitle: act.subtitle,
          icon: act.icon,
          action: act.action,
        });
      }
    });

    return items;
  }, [query, projects, currentProject, router, closeSearch, theme, toggleTheme]);

  // Handle keyboard navigation inside the dialog
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        results[selectedIndex].action();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={closeSearch}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in-90 zoom-in-95 duration-150 text-foreground">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-background/50">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, navigation, or commands..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground focus:ring-0"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-muted-foreground bg-background rounded border border-border">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 divide-y divide-border/40">
          {results.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-foreground">No results found</p>
              <p className="text-xs text-muted-foreground mt-1">
                No matching projects, tools, or actions found for &ldquo;{query}&rdquo;.
              </p>
            </div>
          ) : (
            results.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? "bg-accent text-accent-foreground font-medium" : "text-foreground hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-background flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">{item.title}</span>
                        {item.badge && (
                          <span className="text-[10px] font-mono px-1.5 py-0.25 rounded bg-background border border-border text-muted-foreground">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                      {item.category}
                    </span>
                    {isSelected && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer Keyboard Guide */}
        <div className="px-4 py-2 bg-background/60 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-mono">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="bg-card px-1 py-0.5 rounded border border-border mr-1">↑</kbd>
              <kbd className="bg-card px-1 py-0.5 rounded border border-border mr-1">↓</kbd> to navigate
            </span>
            <span>
              <kbd className="bg-card px-1.5 py-0.5 rounded border border-border mr-1">↵</kbd> to select
            </span>
          </div>
          <span>
            <kbd className="bg-card px-1.5 py-0.5 rounded border border-border mr-1">ESC</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
