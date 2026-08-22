"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, AuthState } from "@/types";
import { api } from "@/lib/api";

// Direct backend URL for OAuth — must bypass Next.js rewrite proxy
// because the proxy follows 302 redirects internally instead of
// forwarding them to the browser.
const BACKEND_AUTH_URL = process.env.NEXT_PUBLIC_BACKEND_URL
  ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1`
  : "http://localhost:8000/api/v1";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: () => {
        // Navigate directly to backend (not through Next.js proxy)
        // so the browser receives the 302 redirect to GitHub properly
        window.location.href = `${BACKEND_AUTH_URL}/auth/github/login`;
      },

      setAuth: (user: User, token: string) => {
        api.setToken(token);
        set({ user, token, isAuthenticated: true, isLoading: false });
      },

      logout: async () => {
        // Revoke refresh token on server (clears HttpOnly cookie)
        await api.serverLogout();
        // Clear local state
        api.setToken(null);
        set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      },

      checkAuth: async () => {
        let token = get().token;
        if (!token && typeof window !== "undefined") {
          try {
            const raw = localStorage.getItem("forge-auth");
            if (raw) {
              const parsed = JSON.parse(raw);
              token = parsed?.state?.token;
            }
          } catch {}
        }

        if (!token) {
          // No access token — try to get one via refresh cookie
          const refreshed = await api.refreshAccessToken();
          if (refreshed) {
            token = api.getToken();
            if (token) {
              set({ token, isAuthenticated: true, isLoading: true });
            }
          }

          if (!token) {
            set({ user: null, token: null, isAuthenticated: false, isLoading: false });
            return;
          }
        }

        api.setToken(token);
        set({ token, isAuthenticated: true, isLoading: true });

        try {
          const user = await api.get<User>("/auth/me");
          set({ user, token: api.getToken(), isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          console.warn("Session check returned error:", err);
          // If auth fails (401, 403, 404, unauthorized, invalid user), reset token and clear auth
          if (
            err?.message?.includes("401") ||
            err?.message?.includes("403") ||
            err?.message?.includes("404") ||
            err?.message?.includes("Unauthorized") ||
            err?.message?.includes("expired") ||
            err?.message?.includes("User not found")
          ) {
            api.setToken(null);
            if (typeof window !== "undefined") {
              try {
                localStorage.removeItem("forge-auth");
                localStorage.removeItem("token");
              } catch {}
            }
            set({ user: null, token: null, isAuthenticated: false, isLoading: false });
          } else {
            // Network error or other issue — don't wipe session
            set({ isLoading: false });
          }
        }
      },
    }),
    {
      name: "forge-auth",
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          api.setToken(state.token);
          state.isAuthenticated = true;
        }
      },
    }
  )
);
