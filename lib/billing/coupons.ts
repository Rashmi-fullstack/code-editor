import { createPrivilegedClient } from '@/lib/admin/privileged-client';
import { logAdminAudit } from '@/lib/admin/telemetry';
import type { DbCoupon } from '@/lib/types/database';

export interface CouponInput {
  id?: string;
  code: string;
  description?: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_redemptions?: number | null;
  per_user_limit?: number;
  min_plan_amount?: number;
  applicable_plans?: string[];
  expires_at?: string | null;
  is_active?: boolean;
}

export interface CouponValidationResult {
  valid: boolean;
  error?: string;
  coupon?: DbCoupon;
  discountAmount?: number;
  finalPrice?: number;
}

let cachedCoupons: DbCoupon[] = [];

/**
 * Format coupon expiration date consistently without timezone/date-shifting artifacts.
 * If input is '2026-12-31' or '2026-12-31T23:59:59Z', returns '12/31/2026'.
 */
export function formatCouponExpirationDate(expiresAt?: string | null): string {
  if (!expiresAt) return 'Never';
  const match = expiresAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;
  }
  return new Date(expiresAt).toLocaleDateString();
}

/**
 * Checks if a coupon is expired based on end-of-calendar-day semantics.
 * A coupon with expiration '2026-12-31' remains valid through 23:59:59 of that date.
 */
export function isCouponExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const match = expiresAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    // Set to 23:59:59.999 local day boundary
    const endOfDay = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
    return Date.now() > endOfDay.getTime();
  }
  return Date.now() > new Date(expiresAt).getTime();
}

/**
 * Fetches all active & non-deleted coupons from PostgreSQL.
 */
export async function getAllCoupons(): Promise<DbCoupon[]> {
  try {
    const privileged = createPrivilegedClient();
    const { data, error } = await privileged
      .from('coupons')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!error && data) {
      cachedCoupons = data;
      return data;
    }
    if (error) {
      console.warn('[Coupons GET Warning]:', error.message);
    }
  } catch (err) {
    console.warn('[Coupons] Failed to fetch coupons from database, using cached fallback:', err);
  }
  return cachedCoupons;
}

/**
 * Saves or updates a coupon with full server-side validation and duplicate prevention.
 */
export async function saveCoupon(
  input: CouponInput,
  adminEmail: string,
  adminUserId?: string
): Promise<DbCoupon> {
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!code) {
    throw new Error('Coupon code cannot be empty.');
  }

  const discountValue = Number(input.discount_value);
  if (isNaN(discountValue) || discountValue <= 0) {
    throw new Error('Discount value must be greater than 0.');
  }
  if (input.discount_type === 'percent' && discountValue > 100) {
    throw new Error('Percentage discount cannot exceed 100%.');
  }

  const maxRedemptions =
    input.max_redemptions !== undefined && input.max_redemptions !== null && String(input.max_redemptions).trim() !== ''
      ? Math.max(0, Number(input.max_redemptions))
      : null;

  const perUserLimit = Math.max(1, Number(input.per_user_limit) || 1);
  const minPlanAmount = Math.max(0, Number(input.min_plan_amount) || 0);

  // Parse expiration date cleanly without UTC day-shifting
  let formattedExpiresAt: string | null = null;
  if (input.expires_at && input.expires_at.trim()) {
    const datePart = input.expires_at.split('T')[0].trim();
    if (datePart) {
      formattedExpiresAt = `${datePart}T23:59:59Z`;
    }
  }

  const privileged = createPrivilegedClient();

  if (input.id) {
    // 1. EDIT EXISTING COUPON
    // Verify no OTHER coupon already uses this code
    const { data: duplicate } = await privileged
      .from('coupons')
      .select('id, code')
      .ilike('code', code)
      .is('deleted_at', null)
      .neq('id', input.id)
      .maybeSingle();

    if (duplicate) {
      throw new Error(`Coupon code "${code}" already exists.`);
    }

    const { data: updatedCoupon, error: updateErr } = await privileged
      .from('coupons')
      .update({
        code,
        description: input.description ?? null,
        discount_type: input.discount_type,
        discount_value: discountValue,
        max_redemptions: maxRedemptions,
        per_user_limit: perUserLimit,
        min_plan_amount: minPlanAmount,
        applicable_plans: (input.applicable_plans || []) as unknown as DbCoupon['applicable_plans'],
        expires_at: formattedExpiresAt,
        is_active: input.is_active !== false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .select('*')
      .single();

    if (updateErr || !updatedCoupon) {
      console.error('[Update Coupon Error]:', updateErr);
      throw new Error(updateErr?.message || 'Failed to update coupon in database.');
    }

    // Refresh memory cache
    const idx = cachedCoupons.findIndex((c) => c.id === updatedCoupon.id);
    if (idx >= 0) cachedCoupons[idx] = updatedCoupon;
    else cachedCoupons.unshift(updatedCoupon);

    await logAdminAudit({
      adminUserId,
      adminEmail,
      action: 'COUPON_UPDATED',
      targetType: 'coupon',
      targetId: updatedCoupon.id,
      details: {
        code: updatedCoupon.code,
        discount: `${updatedCoupon.discount_value} ${updatedCoupon.discount_type}`,
        expiresAt: updatedCoupon.expires_at,
        isActive: updatedCoupon.is_active,
      },
    });

    return updatedCoupon;
  } else {
    // 2. CREATE NEW COUPON
    // Check if code already exists in PostgreSQL
    const { data: duplicate } = await privileged
      .from('coupons')
      .select('id, code, deleted_at')
      .ilike('code', code)
      .maybeSingle();

    if (duplicate && !duplicate.deleted_at) {
      throw new Error(`Coupon code "${code}" already exists.`);
    }

    let savedCoupon: DbCoupon | null = null;

    if (duplicate && duplicate.deleted_at) {
      // Reactivate previously soft-deleted coupon row with new configuration
      const { data: reactivatedCoupon, error: reactivateErr } = await privileged
        .from('coupons')
        .update({
          code,
          description: input.description ?? null,
          discount_type: input.discount_type,
          discount_value: discountValue,
          max_redemptions: maxRedemptions,
          redemptions_count: 0,
          per_user_limit: perUserLimit,
          min_plan_amount: minPlanAmount,
          applicable_plans: (input.applicable_plans || []) as unknown as DbCoupon['applicable_plans'],
          expires_at: formattedExpiresAt,
          is_active: input.is_active !== false,
          deleted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', duplicate.id)
        .select('*')
        .single();

      if (reactivateErr || !reactivatedCoupon) {
        console.error('[Reactivate Coupon Error]:', reactivateErr);
        throw new Error(reactivateErr?.message || 'Failed to create coupon in database.');
      }
      savedCoupon = reactivatedCoupon;
    } else {
      const { data: newCoupon, error: insertErr } = await privileged
        .from('coupons')
        .insert({
          code,
          description: input.description ?? null,
          discount_type: input.discount_type,
          discount_value: discountValue,
          max_redemptions: maxRedemptions,
          redemptions_count: 0,
          per_user_limit: perUserLimit,
          min_plan_amount: minPlanAmount,
          applicable_plans: (input.applicable_plans || []) as unknown as DbCoupon['applicable_plans'],
          expires_at: formattedExpiresAt,
          is_active: input.is_active !== false,
        })
        .select('*')
        .single();

      if (insertErr || !newCoupon) {
        console.error('[Insert Coupon Error]:', insertErr);
        throw new Error(insertErr?.message || 'Failed to create coupon in database.');
      }
      savedCoupon = newCoupon;
    }

    const existingIdx = cachedCoupons.findIndex((c) => c.id === savedCoupon!.id);
    if (existingIdx >= 0) {
      cachedCoupons[existingIdx] = savedCoupon;
    } else {
      cachedCoupons.unshift(savedCoupon);
    }

    await logAdminAudit({
      adminUserId,
      adminEmail,
      action: 'COUPON_CREATED',
      targetType: 'coupon',
      targetId: savedCoupon.id,
      details: {
        code: savedCoupon.code,
        discount: `${savedCoupon.discount_value} ${savedCoupon.discount_type}`,
      },
    });

    return savedCoupon;
  }
}

/**
 * Safely deactivates and soft-deletes a coupon.
 * Preserves historical payments and redemption records while preventing any future checkout redemptions.
 */
export async function deleteCoupon(
  couponId: string,
  adminEmail: string,
  adminUserId?: string
): Promise<boolean> {
  const privileged = createPrivilegedClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(couponId.trim());
  let updateQuery = privileged
    .from('coupons')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  updateQuery = isUuid
    ? updateQuery.eq('id', couponId.trim())
    : updateQuery.eq('code', couponId.trim().toUpperCase());

  const { error } = await updateQuery;

  if (error) {
    console.error('[Delete Coupon Error]:', error);
    throw new Error(error.message || 'Failed to delete coupon.');
  }

  cachedCoupons = cachedCoupons.filter((c) => c.id !== couponId && c.code !== couponId.toUpperCase());

  await logAdminAudit({
    adminUserId,
    adminEmail,
    action: 'COUPON_DELETED',
    targetType: 'coupon',
    targetId: couponId,
  });

  return true;
}

/**
 * Queries and evaluates all coupons to return only those that are currently active,
 * unexpired, non-deleted, and usable by the given user for the selected plan.
 */
export async function getAvailableCouponsForPlan(params: {
  planId?: string;
  planPriceInr?: number;
  userId?: string;
}): Promise<DbCoupon[]> {
  const allCoupons = await getAllCoupons();
  if (!allCoupons || allCoupons.length === 0) {
    return [];
  }

  const usable: DbCoupon[] = [];
  const privileged = createPrivilegedClient();

  for (const coupon of allCoupons) {
    // 1. Soft-deleted check
    if (coupon.deleted_at) continue;

    // 2. Active status check
    if (!coupon.is_active) continue;

    // 3. Expiration check
    if (coupon.expires_at && isCouponExpired(coupon.expires_at)) continue;

    // 4. Maximum redemptions limit
    if (coupon.max_redemptions !== null && coupon.redemptions_count >= coupon.max_redemptions) continue;

    // 5. Minimum plan price requirement
    if (
      params.planPriceInr !== undefined &&
      coupon.min_plan_amount > 0 &&
      params.planPriceInr < coupon.min_plan_amount
    ) {
      continue;
    }

    // 6. Plan-specific restrictions
    const applicable = Array.isArray(coupon.applicable_plans) ? (coupon.applicable_plans as string[]) : [];
    if (params.planId && applicable.length > 0 && !applicable.includes(params.planId)) {
      continue;
    }

    // 7. Per-user redemption limit
    if (params.userId && coupon.per_user_limit > 0) {
      try {
        const { count } = await privileged
          .from('coupon_redemptions')
          .select('*', { count: 'exact', head: true })
          .eq('coupon_id', coupon.id)
          .eq('user_id', params.userId);

        if (count !== null && count >= coupon.per_user_limit) {
          continue;
        }
      } catch {
        // Fallback gracefully in case redemptions table is unavailable
      }
    }

    usable.push(coupon);
  }

  return usable;
}

/**
 * Server-side validation of promotional coupons.
 * Prevents expired, disabled, or over-redeemed coupons.
 */
export async function validateCoupon(
  code: string,
  planId: string,
  planPriceInr: number,
  userId?: string
): Promise<CouponValidationResult> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, error: 'Please enter a coupon code.' };
  }

  const allCoupons = await getAllCoupons();
  const coupon = allCoupons.find((c) => c.code === cleanCode && !c.deleted_at);

  if (!coupon) {
    return { valid: false, error: 'Invalid or unavailable coupon.' };
  }

  if (!coupon.is_active) {
    return { valid: false, error: 'This coupon is no longer active.' };
  }

  if (coupon.expires_at && isCouponExpired(coupon.expires_at)) {
    return { valid: false, error: 'Coupon has expired.' };
  }

  if (coupon.max_redemptions !== null && coupon.redemptions_count >= coupon.max_redemptions) {
    return { valid: false, error: 'Coupon redemption limit reached.' };
  }

  if (coupon.min_plan_amount > 0 && planPriceInr < coupon.min_plan_amount) {
    return {
      valid: false,
      error: `This coupon requires a minimum plan value of ₹${coupon.min_plan_amount}.`,
    };
  }

  const applicable = Array.isArray(coupon.applicable_plans) ? (coupon.applicable_plans as string[]) : [];
  if (applicable.length > 0 && !applicable.includes(planId)) {
    return { valid: false, error: 'Coupon is not valid for the selected plan.' };
  }

  // Check user redemption limit if userId provided
  if (userId && coupon.per_user_limit > 0) {
    try {
      const privileged = createPrivilegedClient();
      const { count } = await privileged
        .from('coupon_redemptions')
        .select('*', { count: 'exact', head: true })
        .eq('coupon_id', coupon.id)
        .eq('user_id', userId);

      if (count && count >= coupon.per_user_limit) {
        return {
          valid: false,
          error: `You have already used this coupon.`,
        };
      }
    } catch {
      // Non-blocking in dev
    }
  }

  // Calculate discount
  let discountAmount = 0;
  if (coupon.discount_type === 'percent') {
    discountAmount = Math.round((planPriceInr * coupon.discount_value) / 100);
  } else {
    discountAmount = Math.min(planPriceInr, coupon.discount_value);
  }

  discountAmount = Math.max(0, Math.min(planPriceInr, discountAmount));
  const finalPrice = Math.max(0, planPriceInr - discountAmount);

  return {
    valid: true,
    coupon,
    discountAmount,
    finalPrice,
  };
}
