import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { createPrivilegedClient } from '@/lib/server';
import { logAdminAudit } from '@/lib/admin/telemetry';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json(
      { message: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  const { userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ message: 'User ID is required' }, { status: 400 });
  }

  // Prevent admin from suspending their own account
  if (auth.user?.id === userId) {
    return NextResponse.json(
      { message: 'You cannot suspend your own administrator account.' },
      { status: 400 }
    );
  }

  try {
    const body = (await request.json()) as { status: 'active' | 'suspended'; reason?: string };
    if (!body.status || (body.status !== 'active' && body.status !== 'suspended')) {
      return NextResponse.json(
        { message: 'Invalid status. Must be "active" or "suspended".' },
        { status: 400 }
      );
    }

    const privileged = createPrivilegedClient();

    // Verify user exists and fetch current status
    const { data: targetProfile, error: fetchErr } = await privileged
      .from('profiles')
      .select('id, email')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr || !targetProfile) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Update status
    const { error: updateErr } = await privileged
      .from('profiles')
      .update({
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateErr) {
      console.error('[Admin User Status Update Error]:', updateErr);
      return NextResponse.json({ message: 'Failed to update user status.' }, { status: 500 });
    }

    // Write audit log
    await logAdminAudit({
      adminUserId: auth.user?.id,
      adminEmail: auth.user?.email || 'admin@codatron.ai',
      action: body.status === 'suspended' ? 'USER_SUSPENDED' : 'USER_RESTORED',
      targetType: 'user',
      targetId: userId,
      details: {
        targetEmail: targetProfile.email,
        previousStatus: (targetProfile as any).status || 'active',
        newStatus: body.status,
        reason: body.reason || 'Admin action',
      },
    });

    return NextResponse.json({
      success: true,
      message: `User ${targetProfile.email} has been ${body.status === 'suspended' ? 'suspended' : 'restored'}.`,
      status: body.status,
    });
  } catch (error: unknown) {
    console.error('[Admin User Status Exception]:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
