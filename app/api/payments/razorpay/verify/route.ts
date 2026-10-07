import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getCurrentUser } from '@/lib/auth';
import { verifyAndFulfillPayment } from '@/lib/billing/razorpay';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user: sbUser },
    } = await supabase.auth.getUser();

    let userId = sbUser?.id;

    if (!userId) {
      const sessionUser = await getCurrentUser();
      if (sessionUser) {
        userId = sessionUser.id;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { message: 'Authentication required to verify payment.' },
        { status: 401 }
      );
    }

    const body = (await request.json()) as {
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      razorpaySignature?: string;
    };

    if (!body.razorpayOrderId || !body.razorpayPaymentId) {
      return NextResponse.json(
        { message: 'Missing Razorpay order or payment details.' },
        { status: 400 }
      );
    }

    const verificationResult = await verifyAndFulfillPayment({
      userId,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature || '',
    });

    return NextResponse.json(verificationResult);
  } catch (error: unknown) {
    console.error('[Verify Razorpay Payment Error]:', error);
    const message = error instanceof Error ? error.message : 'Payment verification failed.';
    return NextResponse.json({ message }, { status: 400 });
  }
}