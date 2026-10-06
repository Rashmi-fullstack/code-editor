import { createClient as createDirectClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/env';
import type { Database } from '@/lib/types/database';

/**
 * Creates an authoritative Supabase client for secure administrative backend operations.
 * Uses SUPABASE_SERVICE_ROLE_KEY if available on the server; otherwise uses anonKey.
 * Strictly server-side only. Does NOT depend on cookies() or next/headers.
 */
export function createPrivilegedClient() {
  const { url, anonKey } = getSupabaseEnv();
  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  )?.trim();

  return createDirectClient<Database>(url, serviceRoleKey || anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
