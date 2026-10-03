"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/client";

export type User = { id: string; name: string; email: string };
export type Auth = {
  user: User | null;
  isLoading: boolean;
  refresh: (optimisticUser?: User | null) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSessionUser = useCallback(async (): Promise<User | null> => {
    // 1. Try Supabase browser client (always works without depending on internal API routing)
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        return {
          id: session.user.id,
          name:
            session.user.user_metadata?.full_name ||
            session.user.user_metadata?.name ||
            session.user.email?.split("@")[0] ||
            "User",
          email: session.user.email || "",
        };
      }
    } catch {
      // Fallback to route handler below if client SDK encountered issues
    }

    // 2. Fallback to /api/auth/session route
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        return data.user || null;
      }
    } catch {
      // Unauthenticated
    }

    return null;
  }, []);

  const refresh = useCallback(async (optimisticUser?: User | null) => {
    if (optimisticUser !== undefined) {
      setUser(optimisticUser);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const u = await fetchSessionUser();
    setUser(u);
    setIsLoading(false);
  }, [fetchSessionUser]);

  useEffect(() => {
    let active = true;
    fetchSessionUser().then((u) => {
      if (active) {
        setUser(u);
        setIsLoading(false);
      }
    });

    // Subscribe to client-side auth state changes so session persists across tab/page switches
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        setUser({
          id: session.user.id,
          name:
            session.user.user_metadata?.full_name ||
            session.user.user_metadata?.name ||
            session.user.email?.split("@")[0] ||
            "User",
          email: session.user.email || "",
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [fetchSessionUser]);

  const logout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Continue
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Continue
    }
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, isLoading, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}