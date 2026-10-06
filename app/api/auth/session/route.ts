import { NextResponse } from "next/server";
import { createClient, createPrivilegedClient } from "@/lib/server";
import { getCurrentUser } from "@/lib/auth";
import { isConfiguredAdminEmail } from "@/lib/admin/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user: sbUser },
    } = await supabase.auth.getUser();

    const sessionUser = await getCurrentUser();
    const user = sbUser || sessionUser;

    if (user) {
      let role = 'user';
      let isAdmin = isConfiguredAdminEmail(user.email);

      try {
        const privileged = createPrivilegedClient();
        const { data: profile } = await privileged
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.role === 'admin' || isAdmin) {
          isAdmin = true;
          role = 'admin';
        } else if (profile?.role) {
          role = profile.role;
        }
      } catch {
        // Fallback to configured email check
      }

      const name =
        ('user_metadata' in user && user.user_metadata?.full_name) ||
        ('user_metadata' in user && user.user_metadata?.name) ||
        ('name' in user && user.name) ||
        user.email?.split("@")[0] ||
        (isAdmin ? "Administrator" : "User");

      return NextResponse.json({
        user: {
          id: user.id,
          name,
          email: user.email || "",
          role,
          isAdmin,
        },
      });
    }
  } catch {
    // Return an unauthenticated response when Supabase is unavailable.
  }

  return NextResponse.json({ user: null });
}
