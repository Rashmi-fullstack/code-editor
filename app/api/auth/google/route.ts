import { NextResponse } from "next/server";
import { createClient } from "@/lib/server";
import { createPrivilegedClient } from "@/lib/admin/privileged-client";
import { createSession, sessionCookie } from "@/lib/auth";
import { isConfiguredAdminEmail } from "@/lib/admin/auth";
import { DEFAULT_AI_CREDIT_LIMIT } from "@/lib/credits/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { credential } = await request.json();

  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()) {
    return NextResponse.json(
      { message: "Google sign-in is not configured." },
      { status: 503 },
    );
  }

  if (typeof credential !== "string" || !credential) {
    return NextResponse.json({ message: "Google sign-in did not return a credential." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
  });

  if (error || !data.user) {
    const authError = error?.message.toLowerCase() || "";
    if (authError.includes("unsupported provider") || authError.includes("not enabled")) {
      return NextResponse.json(
        { message: "Google sign-in is disabled in Supabase. Enable Google under Authentication > Providers." },
        { status: 503 },
      );
    }

    return NextResponse.json({ message: error?.message || "Google sign-in failed." }, { status: 401 });
  }

  const cleanEmail = (data.user.email || "").trim().toLowerCase();
  const isUserAdmin = isConfiguredAdminEmail(cleanEmail);

  // Synchronize profile row and allowance
  try {
    const privileged = createPrivilegedClient();
    await privileged.from("profiles").upsert(
      {
        id: data.user.id,
        email: cleanEmail,
        full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || cleanEmail.split("@")[0] || "User",
        role: isUserAdmin ? "admin" : "user",
        status: "active",
        credit_limit: isUserAdmin ? 999999 : DEFAULT_AI_CREDIT_LIMIT,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch {
    // Non-blocking fallback
  }

  const user = {
    id: data.user.id,
    name:
      data.user.user_metadata?.full_name ||
      data.user.user_metadata?.name ||
      cleanEmail.split("@")[0] ||
      "User",
    email: cleanEmail,
    role: isUserAdmin ? "admin" : "user",
    isAdmin: isUserAdmin,
  };

  const response = NextResponse.json({
    user,
    isAdmin: isUserAdmin,
    redirectTo: isUserAdmin ? "/admin" : "/",
  });

  // Issue signed session cookie for authoritative session tracking
  const sessionToken = createSession(user);
  response.cookies.set(sessionCookie.name, sessionToken, sessionCookie.options);

  return response;
}