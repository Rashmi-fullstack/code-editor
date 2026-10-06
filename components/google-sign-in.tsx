"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";
import { Loader2 } from "lucide-react";

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: string;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  prompt?: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}

interface GoogleSignInProps {
  onSuccess: (user?: { id: string; name: string; email: string }, isAdmin?: boolean, redirectTo?: string) => void;
  onError: (message: string) => void;
  onLoadingChange?: (loading: boolean) => void;
}

export default function GoogleSignIn({
  onSuccess,
  onError,
  onLoadingChange,
}: GoogleSignInProps) {
  const target = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSuccess, onError, onLoadingChange });
  const [isRendered, setIsRendered] = useState(false);
  const [loading, setLoading] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();

  useEffect(() => {
    callbacks.current = { onSuccess, onError, onLoadingChange };
  }, [onSuccess, onError, onLoadingChange]);

  const handleCredentialResponse = useCallback(async ({ credential }: { credential: string }) => {
    try {
      setLoading(true);
      callbacks.current.onLoadingChange?.(true);

      const result = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await result.json();
      setLoading(false);
      callbacks.current.onLoadingChange?.(false);

      if (result.ok && data.user) {
        callbacks.current.onSuccess(data.user, data.isAdmin, data.redirectTo);
      } else {
        callbacks.current.onError(data.message || "Google sign-in failed.");
      }
    } catch (err: unknown) {
      setLoading(false);
      callbacks.current.onLoadingChange?.(false);
      callbacks.current.onError(
        err instanceof Error ? err.message : "An error occurred during Google sign-in."
      );
    }
  }, []);

  const isInitialized = useRef(false);

  const renderGoogleButton = useCallback(() => {
    if (!clientId || typeof window === "undefined" || !window.google?.accounts?.id || !target.current) {
      return false;
    }

    try {
      // 1. Only call initialize() ONCE per session/client_id to prevent GSI_LOGGER warning
      if (!isInitialized.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: handleCredentialResponse,
        });
        isInitialized.current = true;
      }

      // 2. Only render if target is empty or not yet rendered
      if (!target.current.hasChildNodes()) {
        window.google.accounts.id.renderButton(target.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "left",
          width: 360,
        });
      }

      setIsRendered(true);
      return true;
    } catch (err) {
      console.warn("Failed to render Google Sign-In button:", err);
      return false;
    }
  }, [clientId, handleCredentialResponse]);

  // Robust script loader and mount synchronization
  useEffect(() => {
    if (!clientId) return;

    let mounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    // 1. If Google API already exists on window (e.g. client-side page navigation), render immediately
    if (typeof window !== "undefined" && window.google?.accounts?.id) {
      renderGoogleButton();
      return () => {
        mounted = false;
      };
    }

    // 2. Check if script is already present; if not, wait for Script component
    const scriptEl = document.getElementById("google-gsi-client") as HTMLScriptElement | null;
    if (scriptEl && !scriptEl.dataset.listenerAttached) {
      scriptEl.dataset.listenerAttached = "true";
      scriptEl.addEventListener("load", () => {
        if (mounted) renderGoogleButton();
      });
    }

    // 3. Fallback polling check to catch cached scripts or client-side navigation without page refresh
    intervalId = setInterval(() => {
      if (!mounted) return;
      if (typeof window !== "undefined" && window.google?.accounts?.id) {
        if (renderGoogleButton()) {
          if (intervalId) clearInterval(intervalId);
        }
      }
    }, 50);

    const timeoutId = setTimeout(() => {
      if (intervalId) clearInterval(intervalId);
    }, 3000);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [clientId, renderGoogleButton]);

  const handlePlaceholderClick = () => {
    if (typeof window !== "undefined" && window.google?.accounts?.id?.prompt) {
      try {
        window.google.accounts.id.prompt();
      } catch {
        // Fallback
      }
    } else {
      callbacks.current.onError("Connecting to Google authentication. Please try again in a moment.");
    }
  };

  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center w-full">
        <button
          type="button"
          disabled
          className="flex h-11 w-full max-w-[360px] cursor-not-allowed items-center justify-center gap-3 rounded-full border border-white/10 bg-white/[0.03] text-sm font-medium text-slate-400 opacity-70"
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-bold text-blue-600">
            G
          </span>
          Continue with Google
        </button>
        <p className="mt-2 text-center text-xs text-amber-300">
          Set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in <code>.env</code> to activate Google sign-in.
        </p>
      </div>
    );
  }

  return (
    <>
      <Script
        id="google-gsi-client"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => renderGoogleButton()}
      />

      <div className="relative flex flex-col items-center justify-center w-full min-h-[44px]">
        {/* Native Google rendered button container */}
        <div
          ref={target}
          className={`flex justify-center w-full min-h-[44px] transition-all duration-300 ${
            isRendered ? "opacity-100" : "opacity-0 absolute inset-0 pointer-events-none"
          }`}
        />

        {/* Sleek styled Google button placeholder - always visible immediately so it is never unseen */}
        {!isRendered && (
          <button
            type="button"
            onClick={handlePlaceholderClick}
            disabled={loading}
            className="group relative flex h-11 w-full max-w-[360px] items-center justify-center gap-3 rounded-full border border-white/15 bg-[#131314] px-5 py-2.5 text-sm font-medium text-white shadow-[0_2px_14px_rgba(0,0,0,0.4)] transition-all duration-200 hover:border-white/30 hover:bg-[#1a1a1f] hover:shadow-[0_0_24px_rgba(255,255,255,0.08)] active:scale-[0.98] cursor-pointer"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white/80" />
            ) : (
              <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.94 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
            )}
            <span className="font-medium text-white/90 group-hover:text-white">
              {loading ? "Signing in..." : "Continue with Google"}
            </span>
          </button>
        )}
      </div>
    </>
  );
}
