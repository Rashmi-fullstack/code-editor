import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { getAllCoupons, saveCoupon, deleteCoupon } from '@/lib/billing/coupons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json({ message: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  }

  try {
    const coupons = await getAllCoupons();
    return NextResponse.json({ coupons });
  } catch (error: unknown) {
    console.error('[Admin Coupons GET Exception]:', error);
    return NextResponse.json({ message: 'Failed to fetch coupons' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json({ message: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  }

  try {
    const body = await request.json();
    if (!body.code || !body.discount_value) {
      return NextResponse.json({ message: 'Coupon code and discount value are required.' }, { status: 400 });
    }

    const saved = await saveCoupon(
      body,
      auth.user?.email || 'admin@codatron.ai',
      auth.user?.id
    );

    return NextResponse.json({
      success: true,
      message: 'Coupon saved successfully.',
      coupon: saved,
    });
  } catch (error: unknown) {
    console.error('[Admin Coupons POST Exception]:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to save coupon' },
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
      return NextResponse.json({ message: 'Coupon ID is required.' }, { status: 400 });
    }

    await deleteCoupon(id, auth.user?.email || 'admin@codatron.ai', auth.user?.id);

    return NextResponse.json({ success: true, message: 'Coupon deleted successfully.' });
  } catch (error: unknown) {
    console.error('[Admin Coupons DELETE Exception]:', error);
    return NextResponse.json({ message: 'Failed to delete coupon' }, { status: 500 });
  }
}
