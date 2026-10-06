import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAllPlans, getActivePlans, savePlan, deletePlan } from './plans';
import { saveCoupon, validateCoupon, deleteCoupon } from './coupons';
import { getSafeRazorpayConfig } from './razorpay';

describe('Billing & Plan Management', () => {
  it('returns default active plans with INR pricing and credit limits', async () => {
    const plans = await getActivePlans();
    assert.ok(plans.length >= 3, 'Should have at least 3 default plans');
    const freePlan = plans.find((p) => p.id === 'free');
    assert.ok(freePlan, 'Free plan should exist');
    assert.equal(freePlan?.price_inr, 0);
    assert.equal(freePlan?.credits, 100);

    const proPlan = plans.find((p) => p.id === 'pro');
    assert.ok(proPlan, 'Pro plan should exist');
    assert.equal(proPlan?.price_inr, 499);
    assert.equal(proPlan?.credits, 500);
  });

  it('allows administrator to create and update custom plans', async () => {
    const customPlan = await savePlan({
      id: 'plan-custom-test',
      name: 'Startup Tier',
      description: 'Ideal for scaling dev teams',
      price_inr: 1499,
      billing_interval: 'month',
      credits: 2000,
      features: ['2000 Codatron credits', 'Full Qwen3-Coder access', 'Priority support'],
      is_active: true,
      is_published: true,
      display_order: 4,
    }, 'admin@codatron.ai');

    assert.equal(customPlan.id, 'plan-custom-test');
    assert.equal(customPlan.price_inr, 1499);

    const activePlans = await getActivePlans();
    assert.ok(activePlans.some((p) => p.id === 'plan-custom-test'));

    // Clean up
    await deletePlan('plan-custom-test', 'admin@codatron.ai');
  });
});

describe('Coupon System & Validation', () => {
  it('validates percentage and fixed discounts securely', async () => {
    // 1. Valid percentage coupon
    await saveCoupon({
      code: 'TESTPERCENT20',
      description: '20% discount for testing',
      discount_type: 'percent',
      discount_value: 20,
      is_active: true,
      max_redemptions: 100,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    }, 'admin@codatron.ai');

    const result = await validateCoupon('TESTPERCENT20', 'pro', 499);
    assert.equal(result.valid, true);
    assert.equal(result.discountAmount, 100);
    assert.equal(result.finalPrice, 399);

    // 2. Disabled coupon
    await saveCoupon({
      code: 'DISABLEDCODE',
      description: 'Disabled',
      discount_type: 'percent',
      discount_value: 50,
      is_active: false,
    }, 'admin@codatron.ai');

    const disabledResult = await validateCoupon('DISABLEDCODE', 'pro', 499);
    assert.equal(disabledResult.valid, false);
    assert.match(disabledResult.error || '', /no longer active/i);

    // 3. Expired coupon
    await saveCoupon({
      code: 'EXPIREDCODE',
      description: 'Expired',
      discount_type: 'percent',
      discount_value: 10,
      is_active: true,
      expires_at: new Date(Date.now() - 86400000).toISOString(),
    }, 'admin@codatron.ai');

    const expiredResult = await validateCoupon('EXPIREDCODE', 'pro', 499);
    assert.equal(expiredResult.valid, false);
    assert.match(expiredResult.error || '', /expired/i);

    // 4. Fixed amount discount coupon
    await saveCoupon({
      code: 'FLAT150',
      description: 'Flat ₹150 discount',
      discount_type: 'fixed',
      discount_value: 150,
      is_active: true,
      min_plan_amount: 300,
    }, 'admin@codatron.ai');

    const flatResult = await validateCoupon('FLAT150', 'pro', 499);
    assert.equal(flatResult.valid, true);
    assert.equal(flatResult.discountAmount, 150);
    assert.equal(flatResult.finalPrice, 349);

    // 5. Minimum plan amount violation
    const minAmountResult = await validateCoupon('FLAT150', 'free', 0);
    assert.equal(minAmountResult.valid, false);
    assert.match(minAmountResult.error || '', /minimum plan value/i);

    // 6. Plan-restricted coupon
    await saveCoupon({
      code: 'PREMIUMONLY',
      description: 'Exclusive to premium plan',
      discount_type: 'fixed',
      discount_value: 200,
      is_active: true,
      applicable_plans: ['premium'],
    }, 'admin@codatron.ai');

    const wrongPlanResult = await validateCoupon('PREMIUMONLY', 'pro', 499);
    assert.equal(wrongPlanResult.valid, false);
    assert.match(wrongPlanResult.error || '', /not valid for the selected plan/i);

    const rightPlanResult = await validateCoupon('PREMIUMONLY', 'premium', 999);
    assert.equal(rightPlanResult.valid, true);
    assert.equal(rightPlanResult.discountAmount, 200);
    assert.equal(rightPlanResult.finalPrice, 799);

    // Clean up
    await deleteCoupon('TESTPERCENT20', 'admin@codatron.ai');
    await deleteCoupon('DISABLEDCODE', 'admin@codatron.ai');
    await deleteCoupon('EXPIREDCODE', 'admin@codatron.ai');
    await deleteCoupon('FLAT150', 'admin@codatron.ai');
    await deleteCoupon('PREMIUMONLY', 'admin@codatron.ai');
  });

  it('rejects invalid coupon codes', async () => {
    const invalidResult = await validateCoupon('NONEXISTENT_CODE', 'pro', 499);
    assert.equal(invalidResult.valid, false);
    assert.match(invalidResult.error || '', /invalid/i);
  });
});

describe('Razorpay Configuration Security', () => {
  it('never exposes Razorpay secret keys in browser-safe configuration', async () => {
    const safeConfig = await getSafeRazorpayConfig();
    assert.ok(typeof safeConfig.isConfigured === 'boolean');
    assert.ok(typeof safeConfig.webhookConfigured === 'boolean');
    assert.ok(typeof safeConfig.isEnabled === 'boolean');
    assert.ok(safeConfig.mode === 'test' || safeConfig.mode === 'live');

    // Secrets must NOT exist on the returned object
    const rawKeys = Object.keys(safeConfig);
    assert.ok(!rawKeys.includes('keySecret'), 'keySecret must NEVER be present');
    assert.ok(!rawKeys.includes('webhookSecret'), 'webhookSecret must NEVER be present');
  });
});
