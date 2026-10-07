import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getCurrentUser } from '@/lib/auth';
import { createPaymentOrder } from '@/lib/billing/razorpay';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const {
      data: { user: sbUser },
    } = await supabase.auth.getUser();

    let userId = sbUser?.id;
    let userEmail = sbUser?.email;

    if (!userId) {
      const sessionUser = await getCurrentUser();
      if (sessionUser) {
        userId = sessionUser.id;
        userEmail = sessionUser.email;
      }
    }

    if (!userId || !userEmail) {
      return NextResponse.json(
        { message: 'Authentication required to initiate payment.' },
        { status: 401 }
      );
    }

    const body = (await request.json()) as {
      planId?: string;
      couponCode?: string | null;
    };

    if (!body.planId) {
      return NextResponse.json({ message: 'Plan ID is required.' }, { status: 400 });
    }

    // 2. Authoritative server-side order creation
    const orderResult = await createPaymentOrder({
      userId,
      userEmail,
      planId: body.planId,
      couponCode: body.couponCode,
    });

    return NextResponse.json({
      success: true,
      order: orderResult,
    });
  } catch (error: unknown) {
    console.error('[Create Razorpay Order Error]:', error);
    const message = error instanceof Error ? error.message : 'Failed to create payment order.';
    return NextResponse.json({ message }, { status: 400 });
  }
}
