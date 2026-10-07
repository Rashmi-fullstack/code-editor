import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getRazorpaySecrets, verifyAndFulfillPayment } from '@/lib/billing/razorpay';
import { createPrivilegedClient } from '@/lib/admin/privileged-client';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    const { webhookSecret } = await getRazorpaySecrets();

    if (!signature || !webhookSecret) {
      return NextResponse.json({ message: 'Missing signature or webhook secret' }, { status: 400 });
    }

    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    let isValid = false;
    try {
      isValid = timingSafeEqual(
        Buffer.from(expectedSignature, 'utf-8'),
        Buffer.from(signature, 'utf-8')
      );
    } catch {
      isValid = false;
    }

    if (!isValid) {
      return NextResponse.json({ message: 'Invalid webhook signature' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    // Handle payment.captured or order.paid
    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;

      if (orderId && paymentId) {
        const privileged = createPrivilegedClient();
        const { data: internalPayment } = await privileged
          .from('payments')
          .select('user_id')
          .eq('razorpay_order_id', orderId)
          .maybeSingle();

        if (internalPayment?.user_id) {
          await verifyAndFulfillPayment({
            userId: internalPayment.user_id,
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            razorpaySignature: '', // Webhook signature was verified above
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error('[Razorpay Webhook Error]:', error);
    return NextResponse.json({ message: 'Webhook processing error' }, { status: 500 });
  }
}
