import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/server";
import { createPrivilegedClient } from "@/lib/admin/privileged-client";
import { createSession, sessionCookie } from "@/lib/auth";
import { isConfiguredAdminEmail } from "@/lib/admin/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const rawPassword = String(password || "");

  const configuredAdminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const configuredAdminPassword = (process.env.ADMIN_PASSWORD || "").trim();

  const isAdminCredentials =
    Boolean(cleanEmail) &&
    configuredAdminEmails.includes(cleanEmail) &&
    Boolean(configuredAdminPassword) &&
    rawPassword === configuredAdminPassword;

  const supabase = await createClient();

  if (isAdminCredentials) {
    let adminUserId = "";

    // 1. Attempt Supabase signIn or signUp to obtain authoritative UUID
    try {
      const { data: sbData } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: rawPassword,
      });

      if (sbData?.user?.id) {
        adminUserId = sbData.user.id;
      } else {
        const { data: regData } = await supabase.auth.signUp({
          email: cleanEmail,
          password: rawPassword,
          options: {
            data: { full_name: "Codatron Administrator", role: "admin" },
          },
        });
        if (regData?.user?.id) {
          adminUserId = regData.user.id;
        }
      }
    } catch {
      // Non-blocking fallback
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(adminUserId)) {
      const hash = createHash("md5").update(`admin:${cleanEmail}`).digest("hex");
      adminUserId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    }

    // 2. Synchronize admin role & active status in profiles table
    try {
      const privileged = createPrivilegedClient();
      await privileged.from("profiles").upsert(
        {
          id: adminUserId,
          email: cleanEmail,
          full_name: "Codatron Administrator",
          role: "admin",
          status: "active",
          credit_limit: 999999,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    } catch {
      // Non-blocking fallback
    }

    // 3. Issue signed admin application session cookie
    const adminUser = {
      id: adminUserId,
      name: "Administrator",
      email: cleanEmail,
      role: "admin",
    };
    const sessionToken = createSession(adminUser);

    const response = NextResponse.json({
      user: adminUser,
      isAdmin: true,
      redirectTo: "/admin",
    });

    response.cookies.set(sessionCookie.name, sessionToken, sessionCookie.options);
    return response;
  }

  // Standard user authentication flow
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: rawPassword,
  });

  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") {
      return NextResponse.json(
        { message: "Please confirm your email address before logging in." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { message: error?.message || "Invalid email or password." },
      { status: 401 }
    );
  }

  const normalUser = {
    id: data.user.id,
    name:
      data.user.user_metadata?.full_name ||
      data.user.email?.split("@")[0] ||
      "User",
    email: data.user.email || "",
  };

  const isUserAdmin = isConfiguredAdminEmail(data.user.email);
  const response = NextResponse.json({
    user: normalUser,
    isAdmin: isUserAdmin,
  });

  // Also issue application session cookie for session reliability
  const sessionToken = createSession({
    id: data.user.id,
    name: normalUser.name,
    email: normalUser.email,
  });
  response.cookies.set(sessionCookie.name, sessionToken, sessionCookie.options);

  return response;
}
