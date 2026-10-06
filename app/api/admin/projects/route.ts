import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { createPrivilegedClient } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json(
      { message: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  const privileged = createPrivilegedClient();

  try {
    let baseQuery = privileged
      .from('projects')
      .select('id, user_id, name, description, prompt, framework, created_at, updated_at', {
        count: 'exact',
      });

    if (query) {
      baseQuery = baseQuery.or(`name.ilike.%${query}%,prompt.ilike.%${query}%`);
    }

    const { data: projects, count, error } = await baseQuery
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Admin Projects API Error]:', error);
      return NextResponse.json({ message: 'Error fetching projects list.' }, { status: 500 });
    }

    // Attach file count, owner email, and preview/error status for each project
    const enrichedProjects = await Promise.all(
      ((projects || []) as any[]).map(async (proj) => {
        const [ownerRes, filesRes, errorRes] = await Promise.all([
          privileged.from('profiles').select('email, full_name').eq('id', proj.user_id).maybeSingle(),
          privileged.from('project_files').select('id', { count: 'exact', head: true }).eq('project_id', proj.id),
          privileged.from('system_errors').select('id, message, status_code').eq('project_id', proj.id).order('last_seen_at', { ascending: false }).limit(1).maybeSingle(),
        ]);

        return {
          id: proj.id,
          name: proj.name,
          description: proj.description,
          prompt: proj.prompt,
          framework: proj.framework || 'react-vite',
          userId: proj.user_id,
          ownerEmail: ownerRes.data?.email || 'Unknown',
          ownerName: ownerRes.data?.full_name || null,
          fileCount: filesRes.count ?? 0,
          recentError: errorRes.data ? { statusCode: errorRes.data.status_code, message: errorRes.data.message } : null,
          createdAt: proj.created_at,
          updatedAt: proj.updated_at,
        };
      })
    );

    return NextResponse.json({
      projects: enrichedProjects,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error: unknown) {
    console.error('[Admin Projects API Exception]:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
