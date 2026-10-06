import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { createPrivilegedClient } from '@/lib/server';
import { logAdminAudit } from '@/lib/admin/telemetry';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json(
      { message: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ message: 'Error ID is required' }, { status: 400 });
  }

  const privileged = createPrivilegedClient();

  try {
    const { data: errorRecord } = await privileged
      .from('system_errors')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const { error: updateErr } = await privileged
      .from('system_errors')
      .update({
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) {
      console.warn('[Admin Resolve Error] Could not update system_errors in DB:', updateErr.message);
    }

    await logAdminAudit({
      adminUserId: auth.user?.id,
      adminEmail: auth.user?.email || 'admin@codatron.ai',
      action: 'SYSTEM_ERROR_RESOLVED',
      targetType: 'system_error',
      targetId: id,
      details: {
        message: errorRecord?.message || 'Error resolved by admin',
        category: errorRecord?.category,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Error marked as resolved.',
    });
  } catch (error: unknown) {
    console.error('[Admin Resolve Error Exception]:', error);
    return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
  }
}
