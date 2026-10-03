"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import GoogleSignIn from "@/components/google-sign-in";
import { AuthShell, Divider, Field } from "@/components/auth-shell";
import { useAuth } from "@/components/auth-provider";

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (form.password !== form.confirmPassword) {
      return setMessage("Passwords do not match.");
    }

    setPending(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      setPending(false);

      if (!response.ok) {
        return setMessage(data.message || "Registration failed.");
      }

      if (data.authenticated) {
        await refresh(data.user);
        // Strictly redirect to Home ("/")
        router.push("/");
        router.refresh();
      } else {
        router.push("/login?registered=1");
      }
    } catch {
      setPending(false);
      setMessage("Network error occurred during signup. Please try again.");
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Start building your next idea with AI.">
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Full name"
          type="text"
          value={form.name}
          onChange={(value) => setForm({ ...form, name: value })}
        />
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
        <Field
          label="Confirm password"
          type="password"
          value={form.confirmPassword}
          onChange={(value) => setForm({ ...form, confirmPassword: value })}
        />
        {message && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
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
            "Creating account..."
          ) : (
            <>
              <span>Create account</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
      <Divider />
      <GoogleSignIn
        onSuccess={async (googleUser) => {
          await refresh(googleUser);
          router.push("/");
          router.refresh();
        }}
        onError={setMessage}
        onLoadingChange={setGooglePending}
      />
      <p className="mt-7 text-center text-sm text-slate-400">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-indigo-300 hover:text-white">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
