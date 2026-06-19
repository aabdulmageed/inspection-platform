"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type AuthUser = {
  id: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "INSPECTOR";
  discipline: string | null;
};

type AuthCtx = {
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  // Refs so authedFetch always sees current values without re-creating itself.
  const tokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const refreshing = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("token");
    const rt = localStorage.getItem("refreshToken");
    const u = localStorage.getItem("user");
    if (t) {
      setToken(t);
      tokenRef.current = t;
    }
    if (rt) refreshTokenRef.current = rt;
    if (u) setUser(JSON.parse(u));
    setReady(true);
  }, []);

  function store(accessToken: string, refreshToken: string, u: AuthUser) {
    setToken(accessToken);
    tokenRef.current = accessToken;
    refreshTokenRef.current = refreshToken;
    setUser(u);
    localStorage.setItem("token", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    localStorage.setItem("user", JSON.stringify(u));
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("invalid-credentials");
    const data = await res.json();
    store(data.accessToken, data.refreshToken, data.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
    tokenRef.current = null;
    refreshTokenRef.current = null;
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
  }

  /** Single-flight refresh: concurrent 401s share one refresh request. */
  function tryRefresh(): Promise<boolean> {
    if (!refreshing.current) {
      refreshing.current = (async () => {
        const rt = refreshTokenRef.current;
        if (!rt) return false;
        try {
          const res = await fetch(`${API}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: rt }),
          });
          if (!res.ok) return false;
          const data = await res.json();
          store(data.accessToken, data.refreshToken, data.user);
          return true;
        } catch {
          return false;
        } finally {
          setTimeout(() => (refreshing.current = null), 0);
        }
      })();
    }
    return refreshing.current;
  }

  async function authedFetch(path: string, init: RequestInit = {}) {
    const doFetch = () => {
      const headers = new Headers(init.headers);
      if (tokenRef.current) headers.set("Authorization", `Bearer ${tokenRef.current}`);
      return fetch(`${API}${path}`, { ...init, headers, cache: "no-store" });
    };

    let res = await doFetch();
    if (res.status === 401 && refreshTokenRef.current) {
      // Access token likely expired — refresh once and retry.
      const ok = await tryRefresh();
      if (ok) {
        res = await doFetch();
      } else {
        logout();
      }
    }
    return res;
  }

  return (
    <Ctx.Provider value={{ ready, token, user, login, logout, authedFetch }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
