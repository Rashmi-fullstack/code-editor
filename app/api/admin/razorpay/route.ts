import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { getSafeRazorpayConfig, updateRazorpayConfig } from '@/lib/billing/razorpay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json({ message: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  }

  try {
    const config = await getSafeRazorpayConfig();
    return NextResponse.json({ config });
  } catch (error: unknown) {
    console.error('[Admin Razorpay GET Exception]:', error);
    return NextResponse.json({ message: 'Failed to fetch Razorpay config' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json({ message: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  }

  try {
    const body = await request.json();
    const updated = await updateRazorpayConfig(
      body,
      auth.user?.email || 'admin@codatron.ai',
      auth.user?.id
    );

    return NextResponse.json({
      success: true,
      message: 'Razorpay configuration updated successfully.',
      config: updated,
    });
  } catch (error: unknown) {
    console.error('[Admin Razorpay POST Exception]:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to update Razorpay configuration' },
      { status: 500 }
    );
  }
}
