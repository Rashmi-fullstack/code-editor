"use client";

import { FormEvent, Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import GoogleSignIn from "@/components/google-sign-in";
import { useAuth, type User } from "@/components/auth-provider";
import { AuthShell, Divider, Field } from "@/components/auth-shell";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { refresh } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [message, setMessage] = useState(
    search.get("registered") ? "Account created. Log in to continue." : ""
  );
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  const finish = useCallback(
    async (optimisticUser?: User) => {
      await refresh(optimisticUser);
      // Strictly default to Home ("/") unless an explicit non-editor return URL was requested
      const rawNext = search.get("next");
      const nextUrl =
        rawNext && rawNext !== "/editor" && rawNext.startsWith("/") ? rawNext : "/";
      router.push(nextUrl);
      router.refresh();
    },
    [refresh, router, search]
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      setPending(false);

      if (!response.ok) {
        return setMessage(data.message || "Failed to log in.");
      }

      await finish(data.user);
    } catch {
      setPending(false);
      setMessage("Network error occurred during login. Please try again.");
    }
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Email address"
          type="email"
          value={form.email}
          onChange={(value) => setForm({ ...form, email: value })}
        />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={(value) => setForm({ ...form, password: value })}
        />
        {message && (
          <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            {message}
          </p>
        )}
        {googlePending && (
          <div className="flex items-center justify-center gap-2.5 rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-3 text-xs sm:text-sm text-indigo-200 animate-pulse">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
            <span>Completing sign in with Google…</span>
          </div>
        )}
        <button
          disabled={pending || googlePending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-3 font-medium shadow-lg shadow-blue-500/20 transition hover:to-purple-700 disabled:opacity-60 cursor-pointer"
        >
          {pending ? (
            "Logging in..."
          ) : (
            <>
              <span>Log in</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
      <Divider />
      <GoogleSignIn
        onSuccess={finish}
        onError={setMessage}
        onLoadingChange={setGooglePending}
      />
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue building with AI.">
      <Suspense
        fallback={
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
