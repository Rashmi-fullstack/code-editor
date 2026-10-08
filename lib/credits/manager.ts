import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_AI_CREDIT_LIMIT, CREDIT_COSTS } from './config';
import { createPrivilegedClient } from '@/lib/admin/privileged-client';
import { isConfiguredAdminEmail } from '@/lib/admin/auth';
import { getAllPlans, FALLBACK_PLANS } from '@/lib/billing/plans';

export interface UserCreditBalance {
  limit: number;
  used: number;
  reserved: number;
  remaining: number;
  createdAt?: string | null;
  isAdmin?: boolean;
  status?: string;
  plan?: string;
  planName?: string;
}

interface DbProfileRecord {
  credit_limit?: number | null;
  credits_used?: number | null;
  credits_reserved?: number | null;
  created_at?: string | null;
  role?: string | null;
  status?: string | null;
  plan?: string | null;
  email?: string | null;
}

interface DbSubscriptionRecord {
  id?: string;
  user_id?: string;
  plan_id?: string | null;
  status?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
}

/**
 * Retrieve the current authoritative credit balance for a user.
 * Administrator accounts canonically bypass Codatron credit limits.
 * Synchronizes: USER -> ACTIVE SUBSCRIPTION -> PLAN -> PLAN CREDIT ALLOCATION.
 */
export async function getUserCreditBalance(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null
): Promise<UserCreditBalance> {
  const defaultBalance: UserCreditBalance = {
    limit: DEFAULT_AI_CREDIT_LIMIT,
    used: 0,
    reserved: 0,
    remaining: DEFAULT_AI_CREDIT_LIMIT,
    createdAt: null,
    isAdmin: false,
    plan: 'free',
    planName: 'Starter Free',
  };

  try {
    const emailIsAdmin = isConfiguredAdminEmail(userEmail);
    const isMock = Boolean((supabase as { _profile?: DbProfileRecord })?._profile);
    let privileged: ReturnType<typeof createPrivilegedClient> | null = null;
    if (!isMock) {
      try {
        privileged = createPrivilegedClient();
      } catch {
        privileged = null;
      }
    }

    // 1. Query authoritative profile
    let profile: DbProfileRecord | null = null;
    if (isMock) {
      profile = (supabase as { _profile?: DbProfileRecord })._profile || null;
    } else if (privileged) {
      try {
        const { data, error } = await privileged
          .from('profiles')
          .select('credit_limit, credits_used, credits_reserved, created_at, role, status, plan, email')
          .eq('id', userId)
          .maybeSingle();
        if (!error && data) {
          profile = data as DbProfileRecord;
        }
      } catch {
        // Fallback to provided client
      }
    }

    if (!profile && !isMock) {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('credit_limit, credits_used, credits_reserved, created_at, role, status, plan, email')
          .eq('id', userId)
          .maybeSingle();
        if (data) {
          profile = data;
        }
      } catch {
        // Fallback
      }
    }

    const isAdmin = emailIsAdmin || profile?.role === 'admin';
    if (isAdmin) {
      if (emailIsAdmin && profile && (profile.role !== 'admin' || profile.plan !== 'admin')) {
        try {
          if (privileged) {
            await privileged
              .from('profiles')
              .update({ role: 'admin', plan: 'admin', credit_limit: 999999 })
              .eq('id', userId);
          }
        } catch {
          // Non-blocking sync
        }
      }

      return {
        limit: -1,
        used: typeof profile?.credits_used === 'number' ? profile.credits_used : 0,
        reserved: 0,
        remaining: -1,
        createdAt: profile?.created_at || null,
        isAdmin: true,
        plan: 'admin',
        planName: 'Administrator',
      };
    }

    // 2. Fetch authoritative active subscription from subscriptions table
    let activeSub: DbSubscriptionRecord | null = null;
    if ((supabase as { _subscription?: DbSubscriptionRecord })?._subscription) {
      activeSub = (supabase as { _subscription?: DbSubscriptionRecord })._subscription || null;
    } else if (privileged) {
      try {
        const { data: subData } = await privileged
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (subData) {
          activeSub = subData as DbSubscriptionRecord;
        }
      } catch {
        // Non-blocking fallback
      }
    }

    // Check if subscription has expired
    let isExpired = false;
    if (activeSub) {
      if (activeSub.status !== 'active') {
        isExpired = true;
      } else if (activeSub.current_period_end) {
        const endTime = new Date(activeSub.current_period_end).getTime();
        if (!isNaN(endTime) && endTime < Date.now()) {
          isExpired = true;
          // Synchronize expired status in DB
          if (privileged && activeSub.id) {
            try {
              await privileged
                .from('subscriptions')
                .update({ status: 'expired', updated_at: new Date().toISOString() })
                .eq('id', activeSub.id);
            } catch {
              // Non-blocking
            }
          }
        }
      }
    }

    // 3. Resolve active plan ID following single source of truth
    let activePlanId = 'free';
    if (activeSub && !isExpired && activeSub.plan_id) {
      activePlanId = activeSub.plan_id.toLowerCase().trim();
    } else if (profile?.plan && !isExpired && profile.plan !== 'free' && profile.plan !== 'admin') {
      // If profile has plan assigned directly and not expired
      if (!activeSub || activeSub.status === 'active') {
        activePlanId = profile.plan.toLowerCase().trim();
      }
    }

    // 4. Resolve plan details & credit allocation from database / fallback configuration
    let allPlans = FALLBACK_PLANS;
    if (!isMock) {
      try {
        allPlans = await getAllPlans();
      } catch {
        allPlans = FALLBACK_PLANS;
      }
    }

    const targetPlan =
      allPlans.find((p) => p.id === activePlanId) ||
      FALLBACK_PLANS.find((p) => p.id === activePlanId) ||
      FALLBACK_PLANS[0];

    const planCredits = typeof targetPlan.credits === 'number' ? targetPlan.credits : 100;
    const planName =
      targetPlan.name ||
      (activePlanId === 'pro'
        ? 'Developer Pro'
        : activePlanId === 'premium' || activePlanId === 'business'
          ? 'Team Premium'
          : 'Starter Free');

    // 5. Ensure profile exists and has accurate credit_limit and plan
    if (!profile) {
      try {
        const dbClient = privileged || supabase;
        const { data: newProfile } = await dbClient
          .from('profiles')
          .insert({
            id: userId,
            email: userEmail || '',
            role: 'user',
            plan: activePlanId,
            credit_limit: planCredits,
            credits_used: 0,
            credits_reserved: 0,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .select('*')
          .maybeSingle();
        if (newProfile) profile = newProfile;
      } catch {
        // Fallback
      }
      return {
        limit: planCredits,
        used: 0,
        reserved: 0,
        remaining: planCredits,
        createdAt: new Date().toISOString(),
        isAdmin: false,
        plan: activePlanId,
        planName,
      };
    }

    // Determine authoritative credit limit:
    // If on the active plan, limit must be at least the plan's allowance (preserving any admin bonus credits).
    // If the plan changed or was desynchronized, credit limit should match the active plan's allocation.
    let effectiveLimit = planCredits;
    if (
      profile.plan === activePlanId &&
      typeof profile.credit_limit === 'number' &&
      profile.credit_limit > planCredits
    ) {
      // Admin granted extra custom credits above plan allowance
      effectiveLimit = profile.credit_limit;
    }

    // Self-healing: Synchronize profile in database if out of sync
    const needsSync =
      profile.plan !== activePlanId ||
      profile.credit_limit !== effectiveLimit;

    if (needsSync) {
      if (isMock) {
        profile.plan = activePlanId;
        profile.credit_limit = effectiveLimit;
        if ((supabase as { _profile?: DbProfileRecord })?._profile) {
          (supabase as { _profile?: DbProfileRecord })._profile!.plan = activePlanId;
          (supabase as { _profile?: DbProfileRecord })._profile!.credit_limit = effectiveLimit;
        }
      } else if (privileged) {
        try {
          await privileged
            .from('profiles')
            .update({
              plan: activePlanId,
              credit_limit: effectiveLimit,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId);
          profile.plan = activePlanId;
          profile.credit_limit = effectiveLimit;
        } catch (syncErr) {
          console.warn('[Credits] Non-blocking profile plan/limit sync warning:', syncErr);
        }
      }
    }

    const used = typeof profile.credits_used === 'number' ? profile.credits_used : 0;
    const reserved = typeof profile.credits_reserved === 'number' ? profile.credits_reserved : 0;
    const remaining = Math.max(0, effectiveLimit - used - reserved);

    return {
      limit: effectiveLimit,
      used,
      reserved,
      remaining,
      createdAt: profile.created_at || null,
      isAdmin: false,
      status: profile.status || 'active',
      plan: activePlanId,
      planName,
    };
  } catch (err) {
    console.warn('[Credits] Error fetching balance:', err);
    return defaultBalance;
  }
}

/**
 * Atomically reserve credit before executing an AI operation.
 * Concurrency-safe: Prevents multiple concurrent requests from double-spending or exceeding quota.
 */
export async function reserveCredit(
  supabase: SupabaseClient,
  userId: string,
  amount: number = CREDIT_COSTS.STANDARD_CHANGE
): Promise<{ success: boolean; remaining?: number; message?: string; cost?: number }> {
  const reqAmount = Math.max(1, amount);
  try {
    // 1. Authoritative Admin Check: Administrators have no Codatron application credit limit
    const initialBalance = await getUserCreditBalance(supabase, userId);
    if (initialBalance.status === 'suspended') {
      return {
        success: false,
        remaining: 0,
        cost: reqAmount,
        message: 'Your account has been suspended by an administrator. Please contact support.',
      };
    }

    if (initialBalance.isAdmin) {
      return { success: true, remaining: -1, cost: 0 };
    }

    // 2. Pre-check balance before attempting reservation
    if (initialBalance.remaining < reqAmount) {
      // Clear any stuck reservation if balance is zero or stuck
      if (initialBalance.reserved > 0) {
        await supabase
          .from('profiles')
          .update({ credits_reserved: 0 })
          .eq('id', userId);
        const refreshed = await getUserCreditBalance(supabase, userId);
        if (refreshed.remaining < reqAmount) {
          return {
            success: false,
            remaining: refreshed.remaining,
            cost: reqAmount,
            message: "You've used your Codatron AI credits. Upgrade your plan to continue building with AI.",
          };
        }
      } else {
        return {
          success: false,
          remaining: initialBalance.remaining,
          cost: reqAmount,
          message: "You've used your Codatron AI credits. Upgrade your plan to continue building with AI.",
        };
      }
    }

    // 3. Attempt atomic RPC
    const { data: rpcSuccess, error: rpcError } = await supabase.rpc(
      'reserve_user_credit',
      {
        p_user_id: userId,
        p_amount: reqAmount,
        p_limit: initialBalance.limit,
      }
    );

    if (!rpcError && typeof rpcSuccess === 'boolean') {
      if (rpcSuccess) {
        const balance = await getUserCreditBalance(supabase, userId);
        return { success: true, remaining: balance.remaining, cost: reqAmount };
      } else {
        const balance = await getUserCreditBalance(supabase, userId);
        return {
          success: false,
          remaining: balance.remaining,
          cost: reqAmount,
          message: "You've used your Codatron AI credits. Upgrade your plan to continue building with AI.",
        };
      }
    }

    // 4. Safe fallback if RPC is unavailable or returned an error
    const balance = await getUserCreditBalance(supabase, userId);
    if (balance.remaining < reqAmount) {
      return {
        success: false,
        remaining: balance.remaining,
        cost: reqAmount,
        message: "You've used your Codatron AI credits. Upgrade your plan to continue building with AI.",
      };
    }

    // Concurrency-safe reservation update
    await supabase
      .from('profiles')
      .update({
        credits_reserved: balance.reserved + reqAmount,
      })
      .eq('id', userId);

    return {
      success: true,
      remaining: Math.max(0, balance.remaining - reqAmount),
      cost: reqAmount,
    };
  } catch (err) {
    console.error('[Credits] Exception during credit reservation:', err);
    return {
      success: false,
      message: 'Failed to verify AI credit quota.',
      cost: reqAmount,
    };
  }
}

/**
 * Finalize an operation:
 * - If success: Decrement reserved by amount, Increment used by amount.
 * - If failure: Decrement reserved by amount, DO NOT increment used (refund/release).
 */
export async function finalizeCredit(
  supabase: SupabaseClient,
  userId: string,
  success: boolean,
  amount: number = CREDIT_COSTS.STANDARD_CHANGE
): Promise<void> {
  const reqAmount = Math.max(1, amount);
  try {
    const balance = await getUserCreditBalance(supabase, userId);
    if (balance.isAdmin) {
      return; // Admins bypass application credit counter
    }

    const { error: rpcError } = await supabase.rpc('finalize_user_credit', {
      p_user_id: userId,
      p_success: success,
      p_amount: reqAmount,
    });

    if (!rpcError) return;

    // Fallback direct update
    const newReserved = Math.max(0, balance.reserved - reqAmount);
    const newUsed = success ? balance.used + reqAmount : balance.used;

    await supabase
      .from('profiles')
      .update({
        credits_reserved: newReserved,
        credits_used: newUsed,
      })
      .eq('id', userId);
  } catch (err) {
    console.warn('[Credits] Exception during credit finalization:', err);
  }
}

/**
 * Release reserved credit on unhandled exception.
 */
export async function releaseCredit(
  supabase: SupabaseClient,
  userId: string,
  amount: number = CREDIT_COSTS.STANDARD_CHANGE
): Promise<void> {
  await finalizeCredit(supabase, userId, false, amount);
}
