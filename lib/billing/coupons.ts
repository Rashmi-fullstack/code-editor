import { createPrivilegedClient } from '@/lib/admin/privileged-client';
import { logAdminAudit } from '@/lib/admin/telemetry';
import type { DbCoupon, DbCouponRedemption } from '@/lib/types/database';

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

const FALLBACK_COUPONS: DbCoupon[] = [
  {
    id: 'f87a3b12-9c10-449e-b9e7-5e60882ef941',
    code: 'WELCOME20',
    description: '20% Welcome discount for new developers',
    discount_type: 'percent',
    discount_value: 20,
    max_redemptions: 100,
    redemptions_count: 0,
    per_user_limit: 1,
    min_plan_amount: 0,
    applicable_plans: [] as any,
    expires_at: '2026-12-31T23:59:59Z',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

let cachedCoupons: DbCoupon[] = [...FALLBACK_COUPONS];

export async function getAllCoupons(): Promise<DbCoupon[]> {
  try {
    const privileged = createPrivilegedClient();
    const { data, error } = await privileged
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      cachedCoupons = data;
      return data;
    }
  } catch (err) {
    console.warn('[Coupons] Failed to fetch coupons from database, using cached fallback:', err);
  }
  return cachedCoupons;
}

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

  const id = input.id || crypto.randomUUID();
  const existing = cachedCoupons.find((c) => c.id === id || c.code === code);

  const couponRecord: DbCoupon = {
    id,
    code,
    description: input.description ?? null,
    discount_type: input.discount_type,
    discount_value: discountValue,
    max_redemptions: input.max_redemptions !== undefined ? input.max_redemptions : null,
    redemptions_count: existing ? existing.redemptions_count : 0,
    per_user_limit: input.per_user_limit ?? 1,
    min_plan_amount: Math.max(0, input.min_plan_amount ?? 0),
    applicable_plans: (input.applicable_plans || []) as any,
    expires_at: input.expires_at || null,
    is_active: input.is_active !== false,
    created_at: existing ? existing.created_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const privileged = createPrivilegedClient();
    const { data, error } = await privileged
      .from('coupons')
      .upsert(couponRecord)
      .select('*')
      .single();

    if (!error && data) {
      const idx = cachedCoupons.findIndex((c) => c.id === couponRecord.id);
      if (idx >= 0) cachedCoupons[idx] = data;
      else cachedCoupons.unshift(data);
    } else {
      updateInMemoryCoupon(couponRecord);
    }
  } catch {
    updateInMemoryCoupon(couponRecord);
  }

  await logAdminAudit({
    adminUserId,
    adminEmail,
    action: 'COUPON_SAVED',
    targetType: 'coupon',
    targetId: couponRecord.id,
    details: { code: couponRecord.code, discount: `${couponRecord.discount_value} ${couponRecord.discount_type}` },
  });

  return couponRecord;
}

function updateInMemoryCoupon(record: DbCoupon) {
  const idx = cachedCoupons.findIndex((c) => c.id === record.id);
  if (idx >= 0) cachedCoupons[idx] = record;
  else cachedCoupons.unshift(record);
}

export async function deleteCoupon(
  couponId: string,
  adminEmail: string,
  adminUserId?: string
): Promise<boolean> {
  try {
    const privileged = createPrivilegedClient();
    await privileged.from('coupons').delete().eq('id', couponId);
  } catch {
    // Non-blocking
  }
  cachedCoupons = cachedCoupons.filter((c) => c.id !== couponId);

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
  const coupon = allCoupons.find((c) => c.code === cleanCode);

  if (!coupon) {
    return { valid: false, error: 'Invalid coupon code.' };
  }

  if (!coupon.is_active) {
    return { valid: false, error: 'This coupon is no longer active.' };
  }

  if (coupon.expires_at) {
    const expiry = new Date(coupon.expires_at).getTime();
    if (Date.now() > expiry) {
      return { valid: false, error: 'This coupon has expired.' };
    }
  }

  if (coupon.max_redemptions !== null && coupon.redemptions_count >= coupon.max_redemptions) {
    return { valid: false, error: 'This coupon has reached its maximum redemptions limit.' };
  }

  if (coupon.min_plan_amount > 0 && planPriceInr < coupon.min_plan_amount) {
    return {
      valid: false,
      error: `This coupon requires a minimum plan value of ₹${coupon.min_plan_amount}.`,
    };
  }

  const applicable = Array.isArray(coupon.applicable_plans) ? (coupon.applicable_plans as string[]) : [];
  if (applicable.length > 0 && !applicable.includes(planId)) {
    return { valid: false, error: 'This coupon is not valid for the selected plan.' };
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
          error: `You have already redeemed this coupon the maximum allowed number of times (${coupon.per_user_limit}).`,
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
