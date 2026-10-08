import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getCurrentUser } from '@/lib/auth';
import { getAvailableCouponsForPlan } from '@/lib/billing/coupons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const planId = searchParams.get('planId') || undefined;
    const planPriceStr = searchParams.get('planPrice');
    const planPriceInr =
      planPriceStr !== null && !isNaN(Number(planPriceStr)) ? Number(planPriceStr) : undefined;

    const availableCoupons = await getAvailableCouponsForPlan({
      planId,
      planPriceInr,
      userId,
    });

    return NextResponse.json(
      {
        hasAvailable: availableCoupons.length > 0,
        availableCount: availableCoupons.length,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error: unknown) {
    console.error('[Available Coupons GET Exception]:', error);
    return NextResponse.json(
      { hasAvailable: false, availableCount: 0, error: 'Failed to check coupon availability' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  }
}
