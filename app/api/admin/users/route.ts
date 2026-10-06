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
  const roleFilter = searchParams.get('role');
  const statusFilter = searchParams.get('status');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  const privileged = createPrivilegedClient();

  try {
    const adminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    let baseQuery = privileged
      .from('profiles')
      .select('id, email, full_name, avatar_url, credit_limit, credits_used, credits_reserved, created_at, updated_at', {
        count: 'exact',
      });

    if (query) {
      baseQuery = baseQuery.or(`email.ilike.%${query}%,full_name.ilike.%${query}%`);
    }

    const { data: users, count, error } = await baseQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Admin Users API Error]:', error);
      return NextResponse.json({ message: 'Error fetching users list.' }, { status: 500 });
    }

    // Attach project counts and AI usage summary for each user in this page
    const userList = ((users || []) as any[]);
    let enrichedUsers = await Promise.all(
      userList.map(async (user: any) => {
        const [projectsCountRes, aiUsageRes] = await Promise.all([
          privileged.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          privileged.from('ai_token_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        ]);

        const remainingCredits = Math.max(0, (user.credit_limit || 20) - (user.credits_used || 0));
        const isAdmin = adminEmails.includes(user.email?.toLowerCase());
        const userRole = user.role || (isAdmin ? 'admin' : 'user');
        const userStatus = user.status || 'active';

        return {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: userRole,
          status: userStatus,
          creditLimit: user.credit_limit || 20,
          creditsUsed: user.credits_used || 0,
          creditsRemaining: userRole === 'admin' ? 999999 : remainingCredits,
          projectCount: projectsCountRes.count ?? 0,
          aiRequestCount: aiUsageRes.count ?? 0,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        };
      })
    );

    if (roleFilter && (roleFilter === 'admin' || roleFilter === 'user')) {
      enrichedUsers = enrichedUsers.filter((u) => u.role === roleFilter);
    }

    if (statusFilter && (statusFilter === 'active' || statusFilter === 'suspended')) {
      enrichedUsers = enrichedUsers.filter((u) => u.status === statusFilter);
    }

    return NextResponse.json({
      users: enrichedUsers,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error: unknown) {
    console.error('[Admin Users API Exception]:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
