"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { useProjectStore } from "@/store/use-project-store";
import { useSearchStore } from "@/store/use-search-store";
import { Sidebar } from "@/components/shared/sidebar";
import { SearchCommandDialog } from "@/components/shared/search-command-dialog";
import { useTheme } from "@/components/theme-provider";
import { Loader2, Menu, X, Sun, Moon, LayoutDashboard } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { openSearch } = useSearchStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated && !token) {
      router.replace("/login");
    }
  }, [mounted, isLoading, isAuthenticated, token, router]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchProjects();
    }
  }, [isAuthenticated, token, fetchProjects]);

  if (!mounted || (isLoading && !user && !token)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-5 h-5 text-[#10b981] animate-spin" strokeWidth={2} />
          <p className="text-[#525252] text-[13px]">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !token) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-background/90 backdrop-blur-md border-b border-border flex items-center justify-between px-4">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-foreground flex items-center justify-center">
            <span className="text-[11px] font-bold text-background">F</span>
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight">Forge</span>
        </div>
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title={theme === "dark" ? "Switch to Light mode" : "Switch to Dark mode"}
        >
          {theme === "dark" ? (
            <Sun className="w-4.5 h-4.5 text-amber-400" />
          ) : (
            <Moon className="w-4.5 h-4.5 text-zinc-700" />
          )}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile unless menu open */}
      <div className={`hidden lg:block`}>
        <Sidebar />
      </div>
      {mobileMenuOpen && (
        <div className="lg:hidden fixed z-50 top-0 left-0 bottom-0">
          <Sidebar />
        </div>
      )}

      {/* Main content */}
      <main className="lg:ml-[250px] pt-14 lg:pt-0 min-h-screen flex flex-col bg-background text-foreground transition-colors duration-200">
        {/* Desktop Top Header Bar */}
        <header className="hidden lg:flex h-14 items-center justify-between px-6 border-b border-border shrink-0 bg-background/95 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              prefetch={true}
              className={`p-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center border shadow-xs ${
                pathname === "/dashboard"
                  ? "bg-accent text-foreground border-border font-semibold"
                  : "bg-card text-muted-foreground hover:text-foreground hover:bg-accent border-border"
              }`}
              title="Go to Dashboard"
              aria-label="Go to Dashboard"
            >
              <LayoutDashboard className="w-4.5 h-4.5 text-emerald-500" strokeWidth={2} />
            </Link>
            <div
              onClick={() => openSearch()}
              className="relative w-72 cursor-pointer group"
            >
              <div className="w-full h-8.5 pl-8.5 pr-8 rounded-md bg-card border border-border text-sm text-muted-foreground flex items-center group-hover:border-ring transition-colors select-none">
                <span>Search workspace...</span>
              </div>
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-mono bg-background px-1.5 py-0.5 rounded border border-border">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/dashboard"
              prefetch={true}
              className={`transition-colors font-medium ${
                pathname === "/dashboard"
                  ? "text-emerald-500 font-bold"
                  : "text-foreground hover:text-emerald-500"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/"
              className="text-xs text-muted-foreground/75 hover:text-foreground transition-colors"
            >
              Landing Page
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              GitHub
            </a>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border transition-all duration-200 cursor-pointer flex items-center justify-center relative"
              title={theme === "dark" ? "Switch to Light mode" : "Switch to Dark mode"}
            >
              <div className="transition-transform duration-300 transform hover:scale-110">
                {theme === "dark" ? (
                  <Sun className="w-4.5 h-4.5 text-amber-400" />
                ) : (
                  <Moon className="w-4.5 h-4.5 text-zinc-700" />
                )}
              </div>
            </button>
          </div>
        </header>

        {children}
      </main>

      {/* Global Command Palette / Search Dialog */}
      <SearchCommandDialog />
    </div>
  );
}
