import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getCurrentUser } from '@/lib/auth';
import { validateCoupon } from '@/lib/billing/coupons';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    let userId: string | undefined = undefined;
    try {
      const supabase = await createClient();
      const {
        data: { user: sbUser },
      } = await supabase.auth.getUser();

      const sessionUser = await getCurrentUser();
      const user = sbUser || sessionUser;
      userId = user?.id;
    } catch {
      // Supabase optional in local dev
    }

    const body = await request.json();
    const code = body.code;
    const planId = body.planId || '';
    const planPriceInr = typeof body.planPriceInr === 'number' ? body.planPriceInr : typeof body.planPrice === 'number' ? body.planPrice : null;

    if (!code || planPriceInr === null) {
      return NextResponse.json(
        { valid: false, error: 'Coupon code and plan price are required.' },
        { status: 400 }
      );
    }

    const result = await validateCoupon(
      code,
      planId || '',
      planPriceInr,
      userId
    );

    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      discountAmount: result.discountAmount,
      finalPrice: result.finalPrice,
      discountType: result.coupon?.discount_type,
      discountValue: result.coupon?.discount_value,
      code: result.coupon?.code,
    });
  } catch (error: unknown) {
    console.error('[Validate Coupon Exception]:', error);
    return NextResponse.json(
      { valid: false, error: 'Internal validation error.' },
      { status: 500 }
    );
  }
}
