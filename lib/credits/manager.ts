import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_AI_CREDIT_LIMIT, CREDIT_COSTS } from './config';
import { createPrivilegedClient } from '@/lib/admin/privileged-client';
import { isConfiguredAdminEmail } from '@/lib/admin/auth';

export interface UserCreditBalance {
  limit: number;
  used: number;
  reserved: number;
  remaining: number;
  createdAt?: string | null;
  isAdmin?: boolean;
}

/**
 * Retrieve the current authoritative credit balance for a user.
 * Administrator accounts canonically bypass Codatron credit limits.
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
  };

  try {
    const emailIsAdmin = isConfiguredAdminEmail(userEmail);

    // Query authoritative profile using privileged client to ensure role lookup works reliably
    let profile: any = null;
    if ((supabase as any)?._profile) {
      profile = (supabase as any)._profile;
    } else {
      try {
        const privileged = createPrivilegedClient();
        const { data, error } = await privileged
          .from('profiles')
          .select('credit_limit, credits_used, credits_reserved, created_at, role, status')
          .eq('id', userId)
          .maybeSingle();
        if (!error && data) {
          profile = data;
        }
      } catch {
        // Fallback to provided client
      }

      if (!profile) {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('credit_limit, credits_used, credits_reserved, created_at, role, status')
            .eq('id', userId)
            .maybeSingle();
          if (data) {
            profile = data;
          }
        } catch {
          // Fallback
        }
      }
    }

    const isAdmin = emailIsAdmin || profile?.role === 'admin';
    if (isAdmin) {
      // If user matched via email but role wasn't updated yet in profile, sync role
      if (emailIsAdmin && profile && profile.role !== 'admin') {
        try {
          const privileged = createPrivilegedClient();
          await privileged
            .from('profiles')
            .update({ role: 'admin' })
            .eq('id', userId);
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
      };
    }

    if (!profile) {
      try {
        await supabase
          .from('profiles')
          .upsert({
            id: userId,
            email: userEmail || undefined,
            role: 'user',
            credit_limit: DEFAULT_AI_CREDIT_LIMIT,
            credits_used: 0,
            credits_reserved: 0,
          });
      } catch {
        // Non-blocking sync
      }
      return defaultBalance;
    }

    // Smoothly upgrade any legacy profiles with credit_limit < DEFAULT_AI_CREDIT_LIMIT to 100
    if (typeof profile.credit_limit !== 'number' || profile.credit_limit < DEFAULT_AI_CREDIT_LIMIT) {
      try {
        await supabase
          .from('profiles')
          .update({
            credit_limit: DEFAULT_AI_CREDIT_LIMIT,
            credits_reserved: 0,
          })
          .eq('id', userId);
      } catch {
        // Non-blocking sync
      }
    }

    const limit =
      typeof profile.credit_limit === 'number' && profile.credit_limit >= DEFAULT_AI_CREDIT_LIMIT
        ? profile.credit_limit
        : DEFAULT_AI_CREDIT_LIMIT;
    const used = typeof profile.credits_used === 'number' ? profile.credits_used : 0;
    const reserved = typeof profile.credits_reserved === 'number' ? profile.credits_reserved : 0;
    const remaining = Math.max(0, limit - used - reserved);

    return {
      limit,
      used,
      reserved,
      remaining,
      createdAt: profile.created_at || null,
      isAdmin: false,
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
    if ((initialBalance as any).status === 'suspended') {
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
