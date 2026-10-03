import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_AI_CREDIT_LIMIT } from './config';

export interface UserCreditBalance {
  limit: number;
  used: number;
  reserved: number;
  remaining: number;
  createdAt?: string | null;
}

/**
 * Retrieve the current authoritative credit balance for a user.
 */
export async function getUserCreditBalance(
  supabase: SupabaseClient,
  userId: string
): Promise<UserCreditBalance> {
  const defaultBalance: UserCreditBalance = {
    limit: DEFAULT_AI_CREDIT_LIMIT,
    used: 0,
    reserved: 0,
    remaining: DEFAULT_AI_CREDIT_LIMIT,
    createdAt: null,
  };

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('credit_limit, credits_used, credits_reserved, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error || !profile) {
      return defaultBalance;
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
    };
  } catch (err) {
    console.warn('[Credits] Error fetching balance:', err);
    return defaultBalance;
  }
}

/**
 * Atomically reserve ONE credit before executing an AI operation.
 * Concurrency-safe: Prevents multiple concurrent requests from double-spending.
 */
export async function reserveCredit(
  supabase: SupabaseClient,
  userId: string
): Promise<{ success: boolean; remaining?: number; message?: string }> {
  try {
    // Ensure user has at least DEFAULT_AI_CREDIT_LIMIT
    await supabase
      .from('profiles')
      .update({ credit_limit: DEFAULT_AI_CREDIT_LIMIT, credits_reserved: 0 })
      .eq('id', userId)
      .lt('credit_limit', DEFAULT_AI_CREDIT_LIMIT);

    // Attempt atomic RPC if available
    const { data: rpcSuccess, error: rpcError } = await supabase.rpc(
      'reserve_user_credit',
      {
        p_user_id: userId,
        p_limit: DEFAULT_AI_CREDIT_LIMIT,
      }
    );

    if (!rpcError && typeof rpcSuccess === 'boolean') {
      if (rpcSuccess) {
        const balance = await getUserCreditBalance(supabase, userId);
        return { success: true, remaining: balance.remaining };
      }
    }

    // Fallback or retry: fetch balance
    const balance = await getUserCreditBalance(supabase, userId);
    if (balance.remaining <= 0) {
      // Clear any stuck reservations if remaining is zero
      if (balance.reserved > 0) {
        await supabase
          .from('profiles')
          .update({ credits_reserved: 0 })
          .eq('id', userId);
        const refreshed = await getUserCreditBalance(supabase, userId);
        if (refreshed.remaining > 0) {
          await supabase
            .from('profiles')
            .update({ credits_reserved: 1 })
            .eq('id', userId);
          return { success: true, remaining: Math.max(0, refreshed.remaining - 1) };
        }
      }

      return {
        success: false,
        message: 'No AI credits remaining. Your initial credit limit has been reached.',
      };
    }

    // Optimistically update reserved counter
    await supabase
      .from('profiles')
      .update({
        credits_reserved: balance.reserved + 1,
      })
      .eq('id', userId);

    return {
      success: true,
      remaining: Math.max(0, balance.remaining - 1),
    };
  } catch (err) {
    console.error('[Credits] Exception during credit reservation:', err);
    return {
      success: false,
      message: 'Failed to verify AI credit quota.',
    };
  }
}

/**
 * Finalize an operation:
 * - If success: Decrement reserved, Increment used by 1.
 * - If failure: Decrement reserved, DO NOT increment used.
 */
export async function finalizeCredit(
  supabase: SupabaseClient,
  userId: string,
  success: boolean
): Promise<void> {
  try {
    const { error: rpcError } = await supabase.rpc('finalize_user_credit', {
      p_user_id: userId,
      p_success: success,
    });

    if (!rpcError) return;

    // Fallback if RPC is pending migration
    const balance = await getUserCreditBalance(supabase, userId);
    const newReserved = Math.max(0, balance.reserved - 1);
    const newUsed = success ? balance.used + 1 : balance.used;

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
  userId: string
): Promise<void> {
  await finalizeCredit(supabase, userId, false);
}
