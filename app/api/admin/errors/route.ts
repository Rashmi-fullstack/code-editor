import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { createPrivilegedClient } from '@/lib/server';
import { getInMemoryTelemetry } from '@/lib/admin/telemetry';

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
  const category = searchParams.get('category');
  const severity = searchParams.get('severity');
  const resolvedFilter = searchParams.get('resolved'); // 'true' | 'false' | null
  const query = searchParams.get('q')?.trim() || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
  const offset = (page - 1) * limit;

  const privileged = createPrivilegedClient();

  try {
    let baseQuery = privileged
      .from('system_errors')
      .select('*', { count: 'exact' });

    if (category) {
      baseQuery = baseQuery.eq('category', category);
    }

    if (severity && ['INFO', 'WARNING', 'ERROR', 'CRITICAL'].includes(severity)) {
      baseQuery = baseQuery.eq('severity', severity as 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL');
    }

    if (resolvedFilter === 'true') {
      baseQuery = baseQuery.not('resolved_at', 'is', null);
    } else if (resolvedFilter === 'false') {
      baseQuery = baseQuery.is('resolved_at', null);
    }

    if (query) {
      baseQuery = baseQuery.ilike('message', `%${query}%`);
    }

    const { data: dbErrors, count, error } = await baseQuery
      .order('last_seen_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const mem = getInMemoryTelemetry();
    let allRecords: any[] = [];

    if (error || !dbErrors || dbErrors.length === 0) {
      allRecords = [...mem.errors];
    } else {
      allRecords = [...dbErrors];
      // Include any recent memory items not present in DB
      const existingIds = new Set(allRecords.map((e) => e.id));
      for (const m of mem.errors) {
        if (!existingIds.has(m.id)) {
          allRecords.push(m);
        }
      }
    }

    // Filter memory/combined records if filters apply
    if (category) {
      allRecords = allRecords.filter((e) => e.category === category);
    }
    if (severity) {
      allRecords = allRecords.filter((e) => e.severity === severity);
    }
    if (resolvedFilter === 'false') {
      allRecords = allRecords.filter((e) => !e.resolved_at);
    } else if (resolvedFilter === 'true') {
      allRecords = allRecords.filter((e) => Boolean(e.resolved_at));
    }
    if (query) {
      allRecords = allRecords.filter((e) => (e.message || '').toLowerCase().includes(query.toLowerCase()));
    }

    // Sort by last_seen_at desc
    allRecords.sort((a, b) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime());

    const total = allRecords.length;
    const paged = allRecords.slice(offset, offset + limit);

    return NextResponse.json({
      errors: paged,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error: unknown) {
    console.error('[Admin Errors API Exception]:', error);
    return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
  }
}
