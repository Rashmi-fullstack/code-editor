import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { getAllPlans, savePlan, deletePlan } from '@/lib/billing/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json({ message: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  }

  try {
    const plans = await getAllPlans();
    return NextResponse.json({ plans });
  } catch (error: unknown) {
    console.error('[Admin Plans GET Exception]:', error);
    return NextResponse.json({ message: 'Failed to fetch plans' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json({ message: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  }

  try {
    const body = await request.json();
    if (!body.id || !body.name) {
      return NextResponse.json({ message: 'Plan ID and Name are required.' }, { status: 400 });
    }

    const saved = await savePlan(
      body,
      auth.user?.email || 'admin@codatron.ai',
      auth.user?.id
    );

    return NextResponse.json({
      success: true,
      message: 'Plan saved successfully.',
      plan: saved,
    });
  } catch (error: unknown) {
    console.error('[Admin Plans POST Exception]:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to save plan' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json({ message: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ message: 'Plan ID is required.' }, { status: 400 });
    }

    await deletePlan(id, auth.user?.email || 'admin@codatron.ai', auth.user?.id);

    return NextResponse.json({ success: true, message: 'Plan deleted successfully.' });
  } catch (error: unknown) {
    console.error('[Admin Plans DELETE Exception]:', error);
    return NextResponse.json({ message: 'Failed to delete plan' }, { status: 500 });
  }
}
