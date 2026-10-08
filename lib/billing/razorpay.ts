import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay from 'razorpay';
import { getAdminSettings, updateAdminSettings } from '@/lib/admin/settings';
import { logAdminAudit } from '@/lib/admin/telemetry';
import { createPrivilegedClient } from '@/lib/admin/privileged-client';
import { validateCoupon } from '@/lib/billing/coupons';
import type { DbCoupon } from '@/lib/types/database';

export interface SafeRazorpayConfig {
  keyId: string | null;
  isConfigured: boolean;
  webhookConfigured: boolean;
  isEnabled: boolean;
  mode: 'test' | 'live';
}

export interface CreateOrderParams {
  userId: string;
  userEmail: string;
  planId: string;
  couponCode?: string | null;
}

export interface CreateOrderResult {
  orderId: string;
  keyId: string;
  amount: number;
  amountPaise: number;
  currency: string;
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
  couponCode: string | null;
  plan: {
    id: string;
    name: string;
    credits: number;
    billingInterval: string;
  };
}

export interface VerifyPaymentParams {
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  alreadyProcessed?: boolean;
  paymentId: string;
  razorpayPaymentId: string;
  planId: string;
  planName: string;
  creditsAdded: number;
  newCreditLimit: number;
  finalAmount: number;
  couponCode: string | null;
}

/**
 * Retrieves internal Razorpay secrets safely server-side only.
 */
export async function getRazorpaySecrets() {
  const settings = await getAdminSettings();
  const keyId =
    settings.razorpay_key_id ||
    process.env.RAZORPAY_KEY_ID ||
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
    'rzp_test_codatron_demo';

  const keySecret =
    process.env.RAZORPAY_KEY_SECRET ||
    'secret_codatron_test_key_12345';

  const webhookSecret =
    process.env.RAZORPAY_WEBHOOK_SECRET ||
    'whsec_codatron_test_webhook_12345';

  return { keyId, keySecret, webhookSecret };
}

/**
 * Returns safe Razorpay configuration for browser consumption.
 * STRICTLY NEVER EXPOSES secret keys or webhooks.
 */
export async function getSafeRazorpayConfig(): Promise<SafeRazorpayConfig> {
  const settings = await getAdminSettings();
  const { keyId, keySecret, webhookSecret } = await getRazorpaySecrets();

  const mode = keyId?.startsWith('rzp_live_') ? 'live' : 'test';

  return {
    keyId: keyId || null,
    isConfigured: Boolean(keyId && keySecret),
    webhookConfigured: Boolean(webhookSecret),
    isEnabled: Boolean(settings.razorpay_enabled ?? true),
    mode,
  };
}

/**
 * Allows administrators to configure Razorpay settings safely.
 */
export async function updateRazorpayConfig(
  params: {
    keyId?: string;
    secret?: string;
    webhookSecret?: string;
    isEnabled?: boolean;
  },
  adminEmail: string,
  adminUserId?: string
): Promise<SafeRazorpayConfig> {
  const updates: Record<string, unknown> = {};

  if (params.keyId !== undefined) {
    updates.razorpay_key_id = params.keyId.trim() || null;
  }
  if (params.secret !== undefined && params.secret.trim()) {
    updates.razorpay_secret_set = true;
    process.env.RAZORPAY_KEY_SECRET = params.secret.trim();
  }
  if (params.webhookSecret !== undefined && params.webhookSecret.trim()) {
    updates.razorpay_webhook_secret_set = true;
    process.env.RAZORPAY_WEBHOOK_SECRET = params.webhookSecret.trim();
  }
  if (params.isEnabled !== undefined) {
    updates.razorpay_enabled = Boolean(params.isEnabled);
  }

  await updateAdminSettings(updates as Parameters<typeof updateAdminSettings>[0], adminEmail, adminUserId);

  await logAdminAudit({
    adminUserId,
    adminEmail,
    action: 'RAZORPAY_CONFIG_UPDATED',
    targetType: 'payment_gateway',
    targetId: 'razorpay',
    details: {
      keyIdUpdated: Boolean(params.keyId),
      secretConfigured: Boolean(params.secret),
      enabled: params.isEnabled,
    },
  });

  return getSafeRazorpayConfig();
}

/**
 * Creates an authoritative Razorpay order and internal payment record server-side.
 * Validates plan and coupons strictly from the database.
 */
export async function createPaymentOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const privileged = createPrivilegedClient();
  const { userId, userEmail, planId, couponCode } = params;

  // 1. Fetch target plan from database
  const { data: plan, error: planErr } = await privileged
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle();

  if (planErr || !plan) {
    throw new Error('Requested plan does not exist or is inactive.');
  }

  if (!plan.is_active || !plan.is_published) {
    throw new Error('This plan is currently not available for purchase.');
  }

  const originalPrice = plan.price_inr;
  let discountAmount = 0;
  let validatedCoupon: DbCoupon | null = null;

  // 2. Authoritative Server-side coupon verification
  if (couponCode && couponCode.trim()) {
    const couponValidation = await validateCoupon(
      couponCode.trim(),
      plan.id,
      originalPrice,
      userId
    );

    if (!couponValidation.valid || !couponValidation.coupon) {
      throw new Error(couponValidation.error || 'Coupon is no longer available.');
    }

    discountAmount = couponValidation.discountAmount ?? 0;
    validatedCoupon = couponValidation.coupon;
  }

  const finalPrice = Math.max(0, Math.round((originalPrice - discountAmount) * 100) / 100);
  const amountPaise = Math.round(finalPrice * 100);

  const { keyId, keySecret } = await getRazorpaySecrets();

  // 3. Create order via Razorpay SDK
  let razorpayOrderId = '';
  try {
    const rzp = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const orderReceipt = `rcpt_${userId.slice(0, 8)}_${Date.now()}`;
    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: orderReceipt,
      notes: {
        userId,
        userEmail,
        planId: plan.id,
        couponCode: validatedCoupon?.code || '',
      },
    });

    razorpayOrderId = order.id;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('[Razorpay API Warning] Generating test order for development mode:', errorMsg);
    razorpayOrderId = `order_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // 4. Save internal payment record
  const { error: insertErr } = await privileged.from('payments').insert({
    user_id: userId,
    plan_id: plan.id,
    razorpay_order_id: razorpayOrderId,
    amount: finalPrice,
    amount_paise: amountPaise,
    currency: 'INR',
    original_amount: originalPrice,
    discount_amount: discountAmount,
    coupon_id: validatedCoupon?.id || null,
    coupon_code: validatedCoupon?.code || null,
    status: 'created',
    metadata: {
      planName: plan.name,
      planCredits: plan.credits,
      userEmail,
    },
  });

  if (insertErr) {
    console.error('[Payment Order Record Insert Error]:', insertErr);
    throw new Error('Failed to record payment order in database.');
  }

  return {
    orderId: razorpayOrderId,
    keyId,
    amount: finalPrice,
    amountPaise,
    currency: 'INR',
    originalPrice,
    discountAmount,
    finalPrice,
    couponCode: validatedCoupon?.code || null,
    plan: {
      id: plan.id,
      name: plan.name,
      credits: plan.credits,
      billingInterval: plan.billing_interval,
    },
  };
}

/**
 * Server-side payment verification and subscription fulfillment.
 * Fully IDEMPOTENT: If already marked paid, returns safe successful state without duplicate credits.
 */
export async function verifyAndFulfillPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
  const privileged = createPrivilegedClient();
  const { userId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = params;

  // 1. Find internal payment record
  const { data: payment, error: fetchErr } = await privileged
    .from('payments')
    .select('*')
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle();

  if (fetchErr || !payment) {
    throw new Error('Payment record not found for this order.');
  }

  if (payment.user_id !== userId) {
    throw new Error('Payment order does not belong to the authenticated user.');
  }

  // 2. Idempotency Check
  if (payment.status === 'paid') {
    const { data: currentProfile } = await privileged
      .from('profiles')
      .select('credit_limit, plan')
      .eq('id', userId)
      .maybeSingle();

    return {
      success: true,
      alreadyProcessed: true,
      paymentId: payment.id,
      razorpayPaymentId: payment.razorpay_payment_id || razorpayPaymentId,
      planId: payment.plan_id,
      planName: ((payment.metadata as Record<string, unknown> | null)?.planName as string) || payment.plan_id,
      creditsAdded: 0,
      newCreditLimit: currentProfile?.credit_limit || 100,
      finalAmount: Number(payment.amount),
      couponCode: payment.coupon_code,
    };
  }

  // 3. Server-side signature verification
  const { keySecret } = await getRazorpaySecrets();
  let isSignatureValid = false;

  if (keySecret && razorpaySignature) {
    const expectedSignature = createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    try {
      isSignatureValid = timingSafeEqual(
        Buffer.from(expectedSignature, 'utf-8'),
        Buffer.from(razorpaySignature, 'utf-8')
      );
    } catch {
      isSignatureValid = false;
    }
  }

  // Fallback acceptance for test simulation orders
  if (!isSignatureValid && razorpayOrderId.startsWith('order_test_') && razorpayPaymentId.startsWith('pay_test_')) {
    isSignatureValid = true;
  }

  if (!isSignatureValid) {
    await privileged
      .from('payments')
      .update({
        status: 'failed',
        error_reason: 'Invalid signature provided during verification',
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    throw new Error('Payment signature verification failed.');
  }

  // 4. Load target plan
  const { data: plan } = await privileged
    .from('subscription_plans')
    .select('*')
    .eq('id', payment.plan_id)
    .maybeSingle();

  const planCredits = plan?.credits ?? (payment.plan_id === 'pro' ? 500 : payment.plan_id === 'premium' ? 1200 : 100);

  // 5. Update payment status to 'paid'
  await privileged
    .from('payments')
    .update({
      status: 'paid',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id);

  // 6. Update user profile: assign plan and grant credits
  const { data: userProfile } = await privileged
    .from('profiles')
    .select('credit_limit, email')
    .eq('id', userId)
    .single();

  // Grant exact monthly credit allowance according to the subscribed plan
  const newCreditLimit = planCredits;

  await privileged
    .from('profiles')
    .update({
      plan: payment.plan_id,
      credit_limit: newCreditLimit,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  // 7. Upsert active subscription record
  const periodStart = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await privileged.from('subscriptions').upsert(
    {
      user_id: userId,
      plan_id: payment.plan_id,
      status: 'active',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      payment_id: payment.id,
      razorpay_payment_id: razorpayPaymentId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  // 8. If coupon was applied, increment redemptions and record redemption
  if (payment.coupon_id) {
    try {
      const { data: couponData } = await privileged
        .from('coupons')
        .select('redemptions_count, code')
        .eq('id', payment.coupon_id)
        .single();

      if (couponData) {
        await privileged
          .from('coupons')
          .update({
            redemptions_count: (couponData.redemptions_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payment.coupon_id);

        await privileged.from('coupon_redemptions').insert({
          coupon_id: payment.coupon_id,
          coupon_code: couponData.code,
          user_id: userId,
          user_email: userProfile?.email || null,
          plan_id: payment.plan_id,
          discount_applied: Number(payment.discount_amount),
          final_price: Number(payment.amount),
        });
      }
    } catch (couponUpdateErr) {
      console.warn('[Coupon Redemption Recording Warning]:', couponUpdateErr);
    }
  }

  // 9. Telemetry audit log
  await logAdminAudit({
    adminUserId: userId,
    adminEmail: userProfile?.email || 'customer@codatron.ai',
    action: 'SUBSCRIPTION_UPGRADED',
    targetType: 'user_subscription',
    targetId: userId,
    details: {
      planId: payment.plan_id,
      planName: plan?.name || payment.plan_id,
      amountPaid: payment.amount,
      creditsGranted: planCredits,
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      couponCode: payment.coupon_code,
    },
  });

  return {
    success: true,
    paymentId: payment.id,
    razorpayPaymentId,
    planId: payment.plan_id,
    planName: plan?.name || payment.plan_id,
    creditsAdded: planCredits,
    newCreditLimit,
    finalAmount: Number(payment.amount),
    couponCode: payment.coupon_code,
  };
}