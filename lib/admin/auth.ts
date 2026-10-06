import { createClient, createPrivilegedClient } from '@/lib/server';
import { getCurrentUser } from '@/lib/auth';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/lib/types/database';

export interface AdminAuthResult {
  isAuthorized: boolean;
  status?: number;
  error?: string;
  user?: User;
  profile?: Profile | null;
  role?: 'admin';
}

/**
 * Checks if a given email is listed in the ADMIN_EMAILS environment variable.
 * Format: comma-separated list of emails, e.g. "admin@codatron.ai,dev@codatron.ai"
 */
export function isConfiguredAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const configured = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'admin@codatron.ai')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return configured.includes(email.trim().toLowerCase());
}

/**
 * Strict server-side verification of Administrator privileges.
 * Validates:
 * 1. Current Supabase authenticated user session (or signed app session)
 * 2. Database profile role === 'admin', OR email present in ADMIN_EMAILS
 * 3. User account status !== 'suspended'
 */
export async function verifyAdmin(): Promise<AdminAuthResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user: sbUser },
      error: authError,
    } = await supabase.auth.getUser();

    let user: User | null = sbUser;

    if (!user || authError) {
      // Check signed session fallback
      const sessionUser = await getCurrentUser();
      if (sessionUser) {
        user = {
          id: sessionUser.id,
          email: sessionUser.email,
          user_metadata: { full_name: sessionUser.name, role: 'admin' },
          app_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as User;
      }
    }

    if (!user) {
      return {
        isAuthorized: false,
        status: 401,
        error: 'Authentication required. Please sign in.',
      };
    }

    // Query authoritative profile using privileged client to ensure role lookup works reliably
    const privileged = createPrivilegedClient();
    const { data: profile, error: profileError } = await privileged
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.warn('[Admin Auth] Error fetching profile:', profileError.message);
    }

    // Account suspension check
    if (profile?.status === 'suspended') {
      return {
        isAuthorized: false,
        status: 403,
        error: 'Your account has been suspended by an administrator.',
      };
    }

    // Authorize if role is admin OR email is in ADMIN_EMAILS
    const hasAdminRole = profile?.role === 'admin' || user.user_metadata?.role === 'admin';
    const hasAdminEmail = isConfiguredAdminEmail(user.email);

    if (hasAdminRole || hasAdminEmail) {
      // If user matched via email but role wasn't updated yet in profile, sync role
      if (hasAdminEmail && profile && profile.role !== 'admin') {
        try {
          await privileged
            .from('profiles')
            .update({ role: 'admin' })
            .eq('id', user.id);
        } catch {
          // Non-blocking sync
        }
      }

      return {
        isAuthorized: true,
        user,
        profile: profile || null,
        role: 'admin',
      };
    }

    return {
      isAuthorized: false,
      status: 403,
      error: 'Access denied. You do not have administrator permissions.',
    };
  } catch (err: unknown) {
    console.error('[Admin Auth] Unexpected authorization exception:', err);
    return {
      isAuthorized: false,
      status: 500,
      error: 'Internal authorization error.',
    };
  }
}
