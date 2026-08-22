import { API_V1_URL } from "./constants";

// Direct backend URL for auth endpoints that need cookies
// The Next.js rewrite proxy works for JSON API calls, but we need the
// actual backend origin for cookie-based auth (refresh/logout).
const BACKEND_AUTH_URL = process.env.NEXT_PUBLIC_BACKEND_URL
  ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1`
  : "http://localhost:8000/api/v1";

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private getHeaders(): HeadersInit {
    let token = this.token;
    if (!token && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("forge-auth");
        if (raw) {
          const parsed = JSON.parse(raw);
          token = parsed?.state?.token;
        }
        if (!token) {
          token = localStorage.getItem("token");
        }
        if (token) {
          this.token = token;
        }
      } catch {}
    }
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Attempt to refresh the access token using the HttpOnly refresh cookie.
   * Returns true if refresh succeeded, false otherwise.
   * Uses a deduplication promise so concurrent 401s don't fire multiple refreshes.
   */
  async refreshAccessToken(): Promise<boolean> {
    // Deduplicate concurrent refresh calls
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${BACKEND_AUTH_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include", // Send HttpOnly cookie
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          return false;
        }

        const data = await res.json();
        if (data.access_token) {
          this.setToken(data.access_token);

          // Update the persisted store in localStorage
          if (typeof window !== "undefined") {
            try {
              const raw = localStorage.getItem("forge-auth");
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.state) {
                  parsed.state.token = data.access_token;
                  if (data.user) {
                    parsed.state.user = data.user;
                  }
                  localStorage.setItem("forge-auth", JSON.stringify(parsed));
                }
              }
            } catch {}
          }

          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T>(endpoint: string, options: RequestInit, retried = false): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });
    } catch (networkErr: unknown) {
      console.error(`[ApiClient Network Error] on ${endpoint}:`, networkErr);
      throw new Error(`Cannot connect to Forge API server (${this.baseUrl}). Please ensure backend is running.`);
    }

    if (!res.ok) {
      // On 401, try to refresh the token once and retry
      if (res.status === 401 && !retried) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.request<T>(endpoint, options, true);
        }

        // Refresh failed — clear auth state
        this.setToken(null);
        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem("forge-auth");
            localStorage.removeItem("token");
          } catch {}
          window.location.href = "/login";
        }
      } else if (endpoint.startsWith("/auth/") && (res.status === 403 || res.status === 404)) {
        this.setToken(null);
        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem("forge-auth");
            localStorage.removeItem("token");
          } catch {}
        }
      }

      let error: any = {};
      try {
        error = await res.json();
      } catch {
        error = { detail: res.statusText || `HTTP Error ${res.status}` };
      }

      if (res.status !== 401) {
        console.error(`[ApiClient Error] ${res.status} on ${endpoint}:`, error);
      }
      throw new Error(error?.detail || error?.message || `API request failed with status ${res.status}`);
    }

    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return {} as T;
    }

    const text = await res.text();
    if (!text || !text.trim()) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }

  async stream(endpoint: string, data?: unknown): Promise<ReadableStream<Uint8Array>> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: this.getHeaders(),
        body: data ? JSON.stringify(data) : undefined,
      });
    } catch (networkErr: unknown) {
      console.error(`[ApiClient Stream Network Error] on ${endpoint}:`, networkErr);
      throw new Error(`Cannot connect to Forge API server (${this.baseUrl}).`);
    }

    if (!res.ok) {
      // On 401, try refresh and retry for streams too
      if (res.status === 401) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry the stream request
          const retryRes = await fetch(`${this.baseUrl}${endpoint}`, {
            method: "POST",
            headers: this.getHeaders(),
            body: data ? JSON.stringify(data) : undefined,
          });
          if (retryRes.ok && retryRes.body) {
            return retryRes.body;
          }
        }
      }

      const error = await res.json().catch(() => ({ detail: res.statusText }));
      console.error(`[ApiClient STREAM Error] ${res.status} on ${endpoint}:`, error);
      throw new Error(error.detail || `Stream request failed with status ${res.status}`);
    }
    if (!res.body) {
      throw new Error("No response body for stream");
    }
    return res.body;
  }

  /**
   * Logout: revoke refresh token on the server, clear cookie, clear local state.
   */
  async serverLogout(): Promise<void> {
    try {
      await fetch(`${BACKEND_AUTH_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Best-effort — even if this fails, we still clear local state
    }
  }
}

export const api = new ApiClient(API_V1_URL);
