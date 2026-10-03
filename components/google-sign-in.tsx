"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

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
  onSuccess: (user?: { id: string; name: string; email: string }) => void;
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
  const initializedClientId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();

  useEffect(() => {
    callbacks.current = { onSuccess, onError, onLoadingChange };
  }, [onSuccess, onError, onLoadingChange]);

  useEffect(() => {
    if (!ready || !clientId || !window.google || !target.current) return;
    if (initializedClientId.current === clientId) return;

    initializedClientId.current = clientId;

    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: async ({ credential }: { credential: string }) => {
        try {
          callbacks.current.onLoadingChange?.(true);
          const result = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential }),
          });

          const data = await result.json();
          if (result.ok && data.user) {
            callbacks.current.onSuccess(data.user);
          } else {
            callbacks.current.onLoadingChange?.(false);
            callbacks.current.onError(data.message || "Google sign-in failed.");
          }
        } catch (err: unknown) {
          callbacks.current.onLoadingChange?.(false);
          callbacks.current.onError(
            err instanceof Error ? err.message : "An error occurred during Google sign-in."
          );
        }
      },
    });

    window.google.accounts.id.renderButton(target.current, {
      theme: "outline",
      size: "large",
      width: 360,
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "left",
    });
  }, [ready, clientId]);

  if (!clientId) {
    return (
      <>
        <button
          type="button"
          disabled
          className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/3 text-sm font-medium text-slate-400 opacity-70"
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-bold text-blue-600">
            G
          </span>
          Continue with Google
        </button>
        <p className="mt-2 text-center text-xs text-amber-300">
          Set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in <code>.env.local</code> to activate Google sign-in.
        </p>
      </>
    );
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div ref={target} className="flex justify-center" />
    </>
  );
}
