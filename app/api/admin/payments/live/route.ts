import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { createPrivilegedClient } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json(
      { message: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
  const planFilter = searchParams.get('plan') || 'all';
  const paymentStatusFilter = searchParams.get('paymentStatus') || 'all';
  const subscriptionStatusFilter = searchParams.get('subscriptionStatus') || 'all';
  const search = searchParams.get('search')?.trim().toLowerCase() || '';

  const privileged = createPrivilegedClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const startOfTodayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysFromNowIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. Concurrent Summary Metrics calculation
    const [
      activeSubsResult,
      proSubsResult,
      teamSubsResult,
      expiringSoonResult,
      todayPaymentsResult,
      failedPaymentsResult,
      plansResult,
    ] = await Promise.all([
      // Active subscriptions (not expired)
      privileged
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gt('current_period_end', nowIso),

      // Active Pro users
      privileged
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('plan_id', 'pro')
        .gt('current_period_end', nowIso),

      // Active Team users
      privileged
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .in('plan_id', ['premium', 'business', 'team'])
        .gt('current_period_end', nowIso),

      // Expiring soon (within 7 days)
      privileged
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gt('current_period_end', nowIso)
        .lte('current_period_end', sevenDaysFromNowIso),

      // Successful payments made today
      privileged
        .from('payments')
        .select('amount')
        .eq('status', 'paid')
        .gte('created_at', startOfTodayIso),

      // Failed payments
      privileged
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed'),

      // Active subscription plans
      privileged.from('subscription_plans').select('*'),
    ]);

    const activeSubscriptions = activeSubsResult.count ?? 0;
    const activeProUsers = proSubsResult.count ?? 0;
    const activeTeamUsers = teamSubsResult.count ?? 0;
    const expiringSoon = expiringSoonResult.count ?? 0;
    const failedPayments = failedPaymentsResult.count ?? 0;

    const paymentsToday = (todayPaymentsResult.data || []).reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );

    // Map plans by id for rapid lookup
    const plansMap = new Map<string, any>();
    if (plansResult.data) {
      for (const p of plansResult.data) {
        plansMap.set(p.id, p);
      }
    }

    // 2. Query payments with filters
    let paymentsQuery = privileged
      .from('payments')
      .select('*', { count: 'exact' });

    if (planFilter !== 'all') {
      paymentsQuery = paymentsQuery.eq('plan_id', planFilter);
    }

    if (paymentStatusFilter !== 'all') {
      paymentsQuery = paymentsQuery.eq('status', paymentStatusFilter as any);
    }

    if (search) {
      paymentsQuery = paymentsQuery.or(
        `coupon_code.ilike.%${search}%,razorpay_order_id.ilike.%${search}%,razorpay_payment_id.ilike.%${search}%`
      );
    }

    // Fetch payments sorted by created_at DESC
    const { data: rawPayments, count: totalPaymentsCount, error: paymentsErr } = await paymentsQuery
      .order('created_at', { ascending: false });

    if (paymentsErr) {
      throw paymentsErr;
    }

    const allPayments = rawPayments || [];

    // Extract all user IDs to load profiles and subscriptions concurrently
    const userIds = Array.from(new Set(allPayments.map((p) => p.user_id).filter(Boolean)));

    const [profilesResult, subscriptionsResult] = await Promise.all([
      userIds.length > 0
        ? privileged.from('profiles').select('id, email, full_name, avatar_url, plan').in('id', userIds)
        : { data: [] },
      userIds.length > 0
        ? privileged.from('subscriptions').select('*').in('user_id', userIds)
        : { data: [] },
    ]);

    const profilesMap = new Map<string, any>();
    for (const prof of profilesResult.data || []) {
      profilesMap.set(prof.id, prof);
    }

    const subscriptionsMap = new Map<string, any>();
    for (const sub of subscriptionsResult.data || []) {
      subscriptionsMap.set(sub.user_id, sub);
    }

    // Format each payment record
    const formattedRecords = allPayments.map((p) => {
      const user = profilesMap.get(p.user_id) || {
        id: p.user_id,
        email: (p.metadata as any)?.userEmail || 'Unknown User',
        full_name: (p.metadata as any)?.userName || null,
        avatar_url: null,
      };

      const planRecord = plansMap.get(p.plan_id);
      const planName =
        planRecord?.name ||
        (p.metadata as any)?.planName ||
        (p.plan_id === 'pro'
          ? 'Developer Pro'
          : p.plan_id === 'premium' || p.plan_id === 'business'
            ? 'Team Premium'
            : 'Starter Free');

      const sub = subscriptionsMap.get(p.user_id);
      let daysRemaining: number | null = null;
      let subscriptionComputedStatus: 'active' | 'expiring_soon' | 'expired' | 'cancelled' | 'none' = 'none';

      if (sub && sub.current_period_end) {
        const endMs = new Date(sub.current_period_end).getTime();
        const diffMs = endMs - now.getTime();
        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (sub.status === 'cancelled') {
          subscriptionComputedStatus = 'cancelled';
        } else if (daysRemaining <= 0) {
          subscriptionComputedStatus = 'expired';
          daysRemaining = 0;
        } else if (daysRemaining <= 7) {
          subscriptionComputedStatus = 'expiring_soon';
        } else {
          subscriptionComputedStatus = 'active';
        }
      }

      // Determine payment method
      const method =
        p.payment_method ||
        (p.metadata as any)?.method ||
        (p.metadata as any)?.paymentMethod ||
        (p.status === 'paid' ? 'UPI' : '—');

      return {
        id: p.id,
        user: {
          id: user.id,
          name: user.full_name || user.email?.split('@')[0] || 'Customer',
          email: user.email || '—',
          avatarUrl: user.avatar_url || null,
          currentPlan: user.plan || 'free',
        },
        plan: {
          id: p.plan_id,
          name: planName,
          price: planRecord?.price ?? (p.plan_id === 'pro' ? 499 : p.plan_id === 'premium' ? 999 : 0),
          interval: planRecord?.interval || 'month',
        },
        amount: Number(p.amount),
        amountPaise: p.amount_paise,
        originalAmount: Number(p.original_amount),
        discountAmount: Number(p.discount_amount || 0),
        currency: p.currency || 'INR',
        couponCode: p.coupon_code || null,
        status: p.status as 'created' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded',
        paymentMethod: method,
        createdAt: p.created_at,
        razorpayOrderId: p.razorpay_order_id,
        razorpayPaymentId: p.razorpay_payment_id || null,
        subscription: sub
          ? {
            id: sub.id,
            status: subscriptionComputedStatus,
            rawStatus: sub.status,
            currentPeriodStart: sub.current_period_start,
            currentPeriodEnd: sub.current_period_end,
            daysRemaining,
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
          }
          : null,
      };
    });

    // Filter by user search or subscriptionStatus if client filtered on them
    let filtered = formattedRecords;
    if (search) {
      filtered = filtered.filter((r) => {
        return (
          r.user.name.toLowerCase().includes(search) ||
          r.user.email.toLowerCase().includes(search) ||
          r.razorpayOrderId.toLowerCase().includes(search) ||
          (r.razorpayPaymentId && r.razorpayPaymentId.toLowerCase().includes(search)) ||
          (r.couponCode && r.couponCode.toLowerCase().includes(search))
        );
      });
    }

    if (subscriptionStatusFilter !== 'all') {
      filtered = filtered.filter((r) => {
        if (!r.subscription) return false;
        return r.subscription.status === subscriptionStatusFilter;
      });
    }

    // Apply pagination
    const totalCount = filtered.length;
    const offset = (page - 1) * limit;
    const paginatedRecords = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      metrics: {
        activeSubscriptions,
        paymentsToday,
        activeProUsers,
        activeTeamUsers,
        expiringSoon,
        failedPayments,
      },
      payments: paginatedRecords,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      },
    });
  } catch (error: unknown) {
    console.error('[Admin Live Payments API Error]:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch live payments.';
    return NextResponse.json({ message }, { status: 500 });
  }
}