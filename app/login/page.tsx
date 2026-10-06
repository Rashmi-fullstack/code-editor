"use client";

import { FormEvent, Suspense, useCallback, useState } from "react";
import Link from "next/link";
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
    async (optimisticUser?: User, isAdmin?: boolean, redirectTo?: string) => {
      await refresh(optimisticUser);
      const rawNext = search.get("redirect") || search.get("next") || redirectTo;
      let nextUrl = "/";
      if (isAdmin && (rawNext === "/admin" || !rawNext || rawNext === "/")) {
        nextUrl = "/admin";
      } else if (rawNext && rawNext !== "/editor" && rawNext.startsWith("/")) {
        nextUrl = rawNext;
      }
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

      await finish(data.user, data.isAdmin, data.redirectTo);
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
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white hover:bg-slate-200 text-black font-semibold h-11 px-5 py-2.5 shadow-[0_0_24px_rgba(255,255,255,0.25)] transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60 cursor-pointer"
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
      <p className="mt-7 text-center text-sm text-slate-400">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-indigo-300 hover:text-white">
          Sign up
        </Link>
      </p>
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
