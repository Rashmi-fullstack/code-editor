import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_AI_CREDIT_LIMIT,
  CREDIT_COSTS,
  determineOperationCost,
  CODATRON_PLANS,
} from './config';
import {
  getUserCreditBalance,
  reserveCredit,
  finalizeCredit,
  releaseCredit,
} from './manager';

// Mock Supabase Client implementation for comprehensive unit & concurrency testing
function createMockSupabase(
  initialProfile: {
    id: string;
    email: string;
    role: 'user' | 'admin';
    credit_limit: number;
    credits_used: number;
    credits_reserved: number;
    plan?: string;
    status?: 'active' | 'suspended';
  },
  initialSubscription?: any
) {
  const profile = { ...initialProfile };
  const subscription = initialSubscription ? { ...initialSubscription } : null;

  const client: any = {
    _profile: profile,
    _subscription: subscription,
    from: (table: string) => {
      if (table !== 'profiles') throw new Error(`Table ${table} not mocked`);
      return {
        select: () => ({
          eq: (field: string, val: any) => ({
            maybeSingle: async () => ({
              data: { ...profile },
              error: null,
            }),
          }),
        }),
        update: (updates: any) => ({
          eq: (field: string, val: any) => ({
            lt: (ltField: string, ltVal: any) => {
              const currentVal = (profile as any)[ltField];
              if (currentVal !== undefined && currentVal < ltVal) {
                Object.assign(profile, updates);
              }
              return Promise.resolve({ data: null, error: null });
            },
            then: (resolve: any) => {
              Object.assign(profile, updates);
              resolve({ data: null, error: null });
            },
          }),
        }),
      };
    },
    rpc: async (fn: string, args: any) => {
      if (fn === 'reserve_user_credit') {
        const { p_user_id, p_amount = 10, p_limit = 100 } = args;
        if (profile.role === 'admin') {
          return { data: true, error: null };
        }
        const effLimit = Math.max(profile.credit_limit, p_limit);
        if (profile.credits_used + profile.credits_reserved + p_amount > effLimit) {
          return { data: false, error: null };
        }
        profile.credits_reserved += p_amount;
        return { data: true, error: null };
      }
      if (fn === 'finalize_user_credit') {
        const { p_success, p_amount = 10 } = args;
        if (profile.role === 'admin') {
          return { data: null, error: null };
        }
        profile.credits_reserved = Math.max(0, profile.credits_reserved - p_amount);
        if (p_success) {
          profile.credits_used += p_amount;
        }
        return { data: null, error: null };
      }
      return { data: null, error: new Error('RPC function not found') };
    },
  };

  return client;
}

test('Config: Initial normal user allowance defaults to 100 credits', () => {
  assert.equal(DEFAULT_AI_CREDIT_LIMIT, 100);
  assert.equal(CODATRON_PLANS.free.credits, 100);
  assert.equal(CODATRON_PLANS.admin.credits, -1);
});

test('Cost Classifier: Deterministically calculates centralized generation costs', () => {
  // Case 1: Initial project generation from scratch
  const fullGen = determineOperationCost({
    prompt: 'Build me a Netflix-style streaming website',
    filesCount: 0,
    isInitialBuild: true,
  });
  assert.equal(fullGen.cost, CREDIT_COSTS.FULL_GENERATION); // 20 credits
  assert.equal(fullGen.operationType, 'FULL_GENERATION');

  // Case 2: Major multi-file change or refactor
  const majorChange = determineOperationCost({
    prompt: 'Refactor the entire authentication system across all routes and components',
    filesCount: 8,
    mode: 'code',
  });
  assert.equal(majorChange.cost, CREDIT_COSTS.MAJOR_CHANGE); // 15 credits
  assert.equal(majorChange.operationType, 'MAJOR_CHANGE');

  // Case 3: Standard feature or UI change
  const standardChange = determineOperationCost({
    prompt: 'Add a search bar and filter dropdown in the dashboard header',
    filesCount: 6,
    mode: 'code',
  });
  assert.equal(standardChange.cost, CREDIT_COSTS.STANDARD_CHANGE); // 10 credits
  assert.equal(standardChange.operationType, 'STANDARD_CHANGE');

  // Case 4: Small targeted code or debug change
  const smallDebug = determineOperationCost({
    prompt: 'Fix TypeError: cannot read property of undefined in Button.tsx',
    filesCount: 4,
    mode: 'debug',
    previewError: 'TypeError: Button is undefined',
  });
  assert.equal(smallDebug.cost, CREDIT_COSTS.SMALL_CHANGE); // 5 credits
  assert.equal(smallDebug.operationType, 'SMALL_CHANGE');

  const smallSnippet = determineOperationCost({
    prompt: 'Change button background color to purple',
    filesCount: 3,
    selectedCode: 'const bg = "blue";',
  });
  assert.equal(smallSnippet.cost, CREDIT_COSTS.SMALL_CHANGE); // 5 credits
});

test('Case 1: Normal user with 100 credits can generate and balance updates', async () => {
  const supabase = createMockSupabase({
    id: 'user-case-1',
    email: 'user1@example.com',
    role: 'user',
    credit_limit: 100,
    credits_used: 0,
    credits_reserved: 0,
  });

  const balance = await getUserCreditBalance(supabase, 'user-case-1');
  assert.equal(balance.remaining, 100);
  assert.equal(balance.limit, 100);
  assert.equal(balance.isAdmin, false);

  // Reserve 20 credits for initial build
  const reservation = await reserveCredit(supabase, 'user-case-1', 20);
  assert.equal(reservation.success, true);
  assert.equal(supabase._profile.credits_reserved, 20);

  // Finalize on success
  await finalizeCredit(supabase, 'user-case-1', true, 20);
  assert.equal(supabase._profile.credits_reserved, 0);
  assert.equal(supabase._profile.credits_used, 20);

  const updatedBalance = await getUserCreditBalance(supabase, 'user-case-1');
  assert.equal(updatedBalance.remaining, 80);
});

test('Case 2: Normal user with 80 credits allows 20-credit generation', async () => {
  const supabase = createMockSupabase({
    id: 'user-case-2',
    email: 'user2@example.com',
    role: 'user',
    credit_limit: 100,
    credits_used: 20,
    credits_reserved: 0,
  });

  const balance = await getUserCreditBalance(supabase, 'user-case-2');
  assert.equal(balance.remaining, 80);

  const reservation = await reserveCredit(supabase, 'user-case-2', 20);
  assert.equal(reservation.success, true);

  await finalizeCredit(supabase, 'user-case-2', true, 20);
  const updatedBalance = await getUserCreditBalance(supabase, 'user-case-2');
  assert.equal(updatedBalance.remaining, 60);
  assert.equal(updatedBalance.used, 40);
});

test('Case 3: Normal user with 15 credits blocks 20-credit generation', async () => {
  const supabase = createMockSupabase({
    id: 'user-case-3',
    email: 'user3@example.com',
    role: 'user',
    credit_limit: 100,
    credits_used: 85,
    credits_reserved: 0,
  });

  const balance = await getUserCreditBalance(supabase, 'user-case-3');
  assert.equal(balance.remaining, 15);

  // Attempt 20-credit generation
  const reservation = await reserveCredit(supabase, 'user-case-3', 20);
  assert.equal(reservation.success, false);
  assert.match(reservation.message || '', /used your Codatron AI credits|Upgrade/i);
  assert.equal(supabase._profile.credits_reserved, 0); // No credits reserved
});

test('Case 4: Normal user with 10 credits allows 5-credit operation', async () => {
  const supabase = createMockSupabase({
    id: 'user-case-4',
    email: 'user4@example.com',
    role: 'user',
    credit_limit: 100,
    credits_used: 90,
    credits_reserved: 0,
  });

  const balance = await getUserCreditBalance(supabase, 'user-case-4');
  assert.equal(balance.remaining, 10);

  const reservation = await reserveCredit(supabase, 'user-case-4', 5);
  assert.equal(reservation.success, true);

  await finalizeCredit(supabase, 'user-case-4', true, 5);
  const updatedBalance = await getUserCreditBalance(supabase, 'user-case-4');
  assert.equal(updatedBalance.remaining, 5);
  assert.equal(updatedBalance.used, 95);
});

test('Case 5: Normal user with 0 credits blocks generation and keeps 0 balance', async () => {
  const supabase = createMockSupabase({
    id: 'user-case-5',
    email: 'user5@example.com',
    role: 'user',
    credit_limit: 100,
    credits_used: 100,
    credits_reserved: 0,
  });

  const balance = await getUserCreditBalance(supabase, 'user-case-5');
  assert.equal(balance.remaining, 0);

  const reservation = await reserveCredit(supabase, 'user-case-5', 5);
  assert.equal(reservation.success, false);
  assert.match(reservation.message || '', /used your Codatron AI credits|Upgrade/i);
});

test('Case 6, 7, 8: Admin accounts canonically bypass Codatron credit limits', async () => {
  const supabase = createMockSupabase({
    id: 'admin-user',
    email: 'admin@codatron.ai',
    role: 'admin',
    credit_limit: 100,
    credits_used: 9999, // High usage
    credits_reserved: 0,
  });

  const balance = await getUserCreditBalance(supabase, 'admin-user');
  assert.equal(balance.isAdmin, true);
  assert.equal(balance.limit, -1);
  assert.equal(balance.remaining, -1);

  // Admin reservation always succeeds regardless of amount
  const reservation = await reserveCredit(supabase, 'admin-user', 20);
  assert.equal(reservation.success, true);
  assert.equal(reservation.remaining, -1);

  // Admin credit deduction does NOT increment application credits_used
  await finalizeCredit(supabase, 'admin-user', true, 20);
  assert.equal(supabase._profile.credits_used, 9999);
});

test('Case 10, 11, 12: Security - Server enforces canonical role and balance check', async () => {
  // Normal user attempting to claim admin via request payload or client state
  const normalUserSupabase = createMockSupabase({
    id: 'attacker-1',
    email: 'attacker@example.com',
    role: 'user', // Server DB says user
    credit_limit: 100,
    credits_used: 100,
    credits_reserved: 0,
  });

  const balance = await getUserCreditBalance(normalUserSupabase, 'attacker-1');
  assert.equal(balance.isAdmin, false);
  assert.equal(balance.remaining, 0);

  // Even if client sent 100 credits in state, server database check blocks it
  const reservation = await reserveCredit(normalUserSupabase, 'attacker-1', 10);
  assert.equal(reservation.success, false);
});

test('Case 13: Concurrency - Simultaneous generation requests cannot overspend credits', async () => {
  const supabase = createMockSupabase({
    id: 'concurrent-user',
    email: 'concurrent@example.com',
    role: 'user',
    credit_limit: 100,
    credits_used: 90, // Exactly 10 credits remaining
    credits_reserved: 0,
  });

  // Two tabs simultaneously request 10-credit operations
  const [res1, res2] = await Promise.all([
    reserveCredit(supabase, 'concurrent-user', 10),
    reserveCredit(supabase, 'concurrent-user', 10),
  ]);

  // Exactly one request must succeed, and the other must be rejected
  const successes = [res1.success, res2.success].filter(Boolean).length;
  const failures = [res1.success, res2.success].filter((s) => !s).length;

  assert.equal(successes, 1);
  assert.equal(failures, 1);

  // Balance must never become negative
  const balance = await getUserCreditBalance(supabase, 'concurrent-user');
  assert.equal(balance.used + balance.reserved, 100);
  assert.equal(balance.remaining, 0);
});

test('Failure handling: Failed generation refunds reserved credit without charging', async () => {
  const supabase = createMockSupabase({
    id: 'failed-gen-user',
    email: 'failed@example.com',
    role: 'user',
    credit_limit: 100,
    credits_used: 20,
    credits_reserved: 0,
  });

  // Reserve 15 credits for major change
  const reservation = await reserveCredit(supabase, 'failed-gen-user', 15);
  assert.equal(reservation.success, true);
  assert.equal(supabase._profile.credits_reserved, 15);

  // Provider failed before generation completes -> release credit
  await releaseCredit(supabase, 'failed-gen-user', 15);

  // Reserved credits are released; used credits did NOT increase
  assert.equal(supabase._profile.credits_reserved, 0);
  assert.equal(supabase._profile.credits_used, 20);

  const balance = await getUserCreditBalance(supabase, 'failed-gen-user');
  assert.equal(balance.remaining, 80);
});

test('Smooth migration: Legacy profiles with credit_limit < 100 are upgraded to 100', async () => {
  const supabase = createMockSupabase({
    id: 'legacy-user',
    email: 'legacy@example.com',
    role: 'user',
    credit_limit: 4, // Old default
    credits_used: 1,
    credits_reserved: 0,
  });

  const balance = await getUserCreditBalance(supabase, 'legacy-user');
  assert.equal(balance.limit, 100);
  assert.equal(balance.used, 1);
  assert.equal(balance.remaining, 99);
  assert.equal(supabase._profile.credit_limit, 100);
});

test('Developer Pro: Active subscription grants 500 credit limit and calculates 490 remaining from 10 used', async () => {
  const supabase = createMockSupabase(
    {
      id: 'arnab-user-pro',
      email: 'arnabjava12@gmail.com',
      role: 'user',
      plan: 'pro',
      credit_limit: 100, // Legacy desynchronized value from Google sign-in
      credits_used: 10,  // 10 credits consumed
      credits_reserved: 0,
    },
    {
      id: 'sub-pro-1',
      user_id: 'arnab-user-pro',
      plan_id: 'pro',
      status: 'active',
      current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
    }
  );

  const balance = await getUserCreditBalance(supabase, 'arnab-user-pro', 'arnabjava12@gmail.com');

  // Must heal and report authoritative 500 limit, 10 used, 490 remaining
  assert.equal(balance.limit, 500);
  assert.equal(balance.used, 10);
  assert.equal(balance.remaining, 490);
  assert.equal(balance.plan, 'pro');
  assert.equal(balance.planName, 'Developer Pro');
  assert.equal(supabase._profile.credit_limit, 500);
});

test('Team Premium: Active subscription grants 1,200 credit limit and calculates 1,150 remaining from 50 used', async () => {
  const supabase = createMockSupabase(
    {
      id: 'team-user-1',
      email: 'team@example.com',
      role: 'user',
      plan: 'premium',
      credit_limit: 100,
      credits_used: 50,
      credits_reserved: 0,
    },
    {
      id: 'sub-team-1',
      user_id: 'team-user-1',
      plan_id: 'premium',
      status: 'active',
      current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
    }
  );

  const balance = await getUserCreditBalance(supabase, 'team-user-1', 'team@example.com');

  assert.equal(balance.limit, 1200);
  assert.equal(balance.used, 50);
  assert.equal(balance.remaining, 1150);
  assert.equal(balance.plan, 'premium');
  assert.equal(balance.planName, 'Team Premium');
  assert.equal(supabase._profile.credit_limit, 1200);
});

test('Subscription Expiration: Expired paid plan falls back to Starter Free 100 credits', async () => {
  const supabase = createMockSupabase(
    {
      id: 'expired-user-1',
      email: 'expired@example.com',
      role: 'user',
      plan: 'pro',
      credit_limit: 500,
      credits_used: 20,
      credits_reserved: 0,
    },
    {
      id: 'sub-pro-expired',
      user_id: 'expired-user-1',
      plan_id: 'pro',
      status: 'active',
      current_period_end: new Date(Date.now() - 86400000).toISOString(), // Expired 1 day ago
    }
  );

  const balance = await getUserCreditBalance(supabase, 'expired-user-1');

  // Must cleanly fallback to Free tier (100 credits)
  assert.equal(balance.limit, 100);
  assert.equal(balance.used, 20);
  assert.equal(balance.remaining, 80);
  assert.equal(balance.plan, 'free');
  assert.equal(balance.planName, 'Starter Free');
});

test('Starter Free: Clean user with no subscription defaults to 100 credits and free plan', async () => {
  const supabase = createMockSupabase({
    id: 'free-user-1',
    email: 'free@example.com',
    role: 'user',
    plan: 'free',
    credit_limit: 100,
    credits_used: 0,
    credits_reserved: 0,
  });

  const balance = await getUserCreditBalance(supabase, 'free-user-1');

  assert.equal(balance.limit, 100);
  assert.equal(balance.used, 0);
  assert.equal(balance.remaining, 100);
  assert.equal(balance.plan, 'free');
  assert.equal(balance.planName, 'Starter Free');
});

