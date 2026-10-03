import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv, isSupabaseConfigured } from './env';
import type { Database } from './types/database';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/editor')) {
    supabaseResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    supabaseResponse.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  if (!isSupabaseConfigured()) {
    return supabaseResponse;
  }

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        if (pathname.startsWith('/editor')) {
          supabaseResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
          supabaseResponse.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        }
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: Avoid using getSession() on the server as it can be spoofed.
  // getUser() validates the token against Supabase Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Handle /developer route shortcut
  if (pathname === '/developer') {
    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('next', '/editor?view=developer');
      return NextResponse.redirect(redirectUrl);
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/editor';
    redirectUrl.searchParams.set('view', 'developer');
    return NextResponse.redirect(redirectUrl);
  }

  // Protect the editor, projects, profile, and developer routes if unauthenticated
  const isProtectedPath =
    pathname.startsWith('/editor') ||
    pathname.startsWith('/projects') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/developer');

  if (!user && isProtectedPath && process.env.NODE_ENV === 'production') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    const nextPath = pathname + request.nextUrl.search;
    redirectUrl.searchParams.set('next', nextPath);
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
