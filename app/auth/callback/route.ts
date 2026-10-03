import { NextResponse } from "next/server";
import { createClient } from "@/lib/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");

  // Strictly default to Home ("/") unless an explicit non-editor return URL was requested
  const next =
    rawNext && rawNext !== "/editor" && rawNext.startsWith("/")
      ? rawNext
      : "/";

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    } catch (err) {
      console.error("Auth callback error exchanging code for session:", err);
    }
  }

  // Return to login with error if exchange fails or code is missing
  return NextResponse.redirect(`${origin}/login?error=oauth_exchange_failed`);
}