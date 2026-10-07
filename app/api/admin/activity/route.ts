import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { createPrivilegedClient } from '@/lib/server';
import { getInMemoryTelemetry } from '@/lib/admin/telemetry';
import type { AdminAuditLog } from '@/lib/types/database';

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
  const actionFilter = searchParams.get('action')?.trim();
  const targetTypeFilter = searchParams.get('target_type')?.trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
  const offset = (page - 1) * limit;

  const privileged = createPrivilegedClient();

  try {
    let baseQuery = privileged
      .from('admin_audit_logs')
      .select('*', { count: 'exact' });

    if (actionFilter) {
      baseQuery = baseQuery.eq('action', actionFilter);
    }

    if (targetTypeFilter) {
      baseQuery = baseQuery.eq('target_type', targetTypeFilter);
    }

    if (query) {
      baseQuery = baseQuery.or(
        `action.ilike.%${query}%,admin_email.ilike.%${query}%,target_type.ilike.%${query}%,target_id.ilike.%${query}%`
      );
    }

    const { data: dbLogs, count, error } = await baseQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const mem = getInMemoryTelemetry();
    let allRecords: AdminAuditLog[] = [];

    if (error || !dbLogs) {
      allRecords = [...mem.auditLogs];
    } else {
      allRecords = [...dbLogs];
      // Include any recent memory items not yet committed to DB
      const existingIds = new Set(allRecords.map((l) => l.id));
      for (const m of mem.auditLogs) {
        if (!existingIds.has(m.id)) {
          allRecords.push(m);
        }
      }
    }

    // Filter fallback/merged records if query or filter applied
    if (actionFilter) {
      allRecords = allRecords.filter((l) => l.action.toLowerCase() === actionFilter.toLowerCase());
    }
    if (targetTypeFilter) {
      allRecords = allRecords.filter((l) => l.target_type.toLowerCase() === targetTypeFilter.toLowerCase());
    }
    if (query) {
      const qLower = query.toLowerCase();
      allRecords = allRecords.filter(
        (l) =>
          l.action.toLowerCase().includes(qLower) ||
          l.admin_email.toLowerCase().includes(qLower) ||
          l.target_type.toLowerCase().includes(qLower) ||
          (l.target_id && l.target_id.toLowerCase().includes(qLower))
      );
    }

    // Sort descending by timestamp
    allRecords.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // If we only used DB without needing to paginate in-memory
    const useDirectDb = !error && dbLogs && mem.auditLogs.length === 0;
    const total = useDirectDb ? (count ?? dbLogs.length) : allRecords.length;
    const pagedLogs = useDirectDb ? dbLogs : allRecords.slice(offset, offset + limit);

    return NextResponse.json({
      logs: pagedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err: unknown) {
    console.error('[Admin Activity API Error]:', err);
    // Graceful fallback to memory logs on unexpected exceptions
    const mem = getInMemoryTelemetry();
    let allRecords = [...mem.auditLogs];

    if (query) {
      const qLower = query.toLowerCase();
      allRecords = allRecords.filter(
        (l) =>
          l.action.toLowerCase().includes(qLower) ||
          l.admin_email.toLowerCase().includes(qLower) ||
          l.target_type.toLowerCase().includes(qLower) ||
          (l.target_id && l.target_id.toLowerCase().includes(qLower))
      );
    }

    const total = allRecords.length;
    const pagedLogs = allRecords.slice(offset, offset + limit);

    return NextResponse.json({
      logs: pagedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  }
}
