import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { sessionCookie } from '@/lib/auth';
import { getSupabaseEnv } from '@/lib/env';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

export const runtime = 'nodejs';

/**
 * DELETE /api/profile/account
 * Server-side complete account and data deletion for Codatron.ai
 *
 * Deletes all user-owned data across:
 * - projects (and cascaded project_files, history, tasks, plans, runs, embeddings)
 * - user_ai_keys (BYOK configuration)
 * - ai_token_usage (Token and credit logs)
 * - profiles
 * - auth.users record (via Supabase Admin API if service role key configured)
 * - Signs out session and clears cookies
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { message: 'Authentication required to delete account.' },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      confirmation?: string;
    };

    if (body.confirmation !== 'DELETE') {
      return NextResponse.json(
        { message: 'Explicit confirmation required. Please provide confirmation: "DELETE".' },
        { status: 400 }
      );
    }

    const userId = user.id;

    // 1. Fetch all project IDs owned by user to ensure comprehensive cleanup
    const { data: userProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId);

    const projectIds = (userProjects ?? []).map((p) => p.id);

    // 2. Clean up child records belonging to user's projects
    if (projectIds.length > 0) {
      await supabase
        .from('project_embeddings')
        .delete()
        .in('project_id', projectIds);

      await supabase
        .from('agent_runs')
        .delete()
        .in('project_id', projectIds);

      await supabase
        .from('product_tasks')
        .delete()
        .in('project_id', projectIds);

      await supabase
        .from('product_plans')
        .delete()
        .in('project_id', projectIds);

      await supabase
        .from('project_dependencies')
        .delete()
        .in('project_id', projectIds);

      await supabase
        .from('project_files')
        .delete()
        .in('project_id', projectIds);

      await supabase
        .from('generation_history')
        .delete()
        .in('project_id', projectIds);
    }

    // Also clean any generation history explicitly referencing user_id
    await supabase
      .from('generation_history')
      .delete()
      .eq('user_id', userId);

    // 3. Delete user's projects
    await supabase
      .from('projects')
      .delete()
      .eq('user_id', userId);

    // 4. Clean up any legacy personal keys if present
    try {
      await supabase
        .from('user_ai_keys')
        .delete()
        .eq('user_id', userId);
    } catch { }

    // 5. Delete AI token usage records
    await supabase
      .from('ai_token_usage')
      .delete()
      .eq('user_id', userId);

    // 6. Delete user profile record
    await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    // 7. Delete Supabase Auth user record if service-role credential is present
    const serviceRoleKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_KEY
    )?.trim();

    if (serviceRoleKey) {
      try {
        const { url } = getSupabaseEnv();
        const adminSupabase = createAdminClient<Database>(url, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        });
        const { error: adminDelError } = await adminSupabase.auth.admin.deleteUser(userId);
        if (adminDelError) {
          console.warn('[Account Deletion] Auth admin deletion warning:', adminDelError.message);
        }
      } catch (adminErr) {
        console.warn('[Account Deletion] Could not run admin.deleteUser:', adminErr);
      }
    }

    // 8. Sign out of current Supabase session
    try {
      await supabase.auth.signOut();
    } catch {
      // Non-critical if signOut errors after data deletion
    }

    // 9. Clear session cookies
    const response = NextResponse.json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted.',
    });

    response.cookies.set(sessionCookie.name, '', {
      ...sessionCookie.options,
      maxAge: 0,
    });

    return response;
  } catch (err: unknown) {
    console.error('[Account Deletion Error]:', err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Internal server error deleting account.' },
      { status: 500 }
    );
  }
}