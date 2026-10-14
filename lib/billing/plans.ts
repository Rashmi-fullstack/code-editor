import { createPrivilegedClient } from '@/lib/admin/privileged-client';
import { logAdminAudit } from '@/lib/admin/telemetry';
import type { SubscriptionPlan } from '@/lib/types/database';

export interface PlanInput {
  id: string;
  name: string;
  description?: string;
  price_inr: number;
  billing_interval?: string;
  credits: number;
  features: string[];
  badge?: string;
  razorpay_plan_id?: string;
  is_active?: boolean;
  is_published?: boolean;
  display_order?: number;
}

export const FALLBACK_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Starter Free',
    description: 'Initial allowance for autonomous AI web application synthesis.',
    price_inr: 0,
    billing_interval: 'month',
    credits: 100,
    badge: 'Starter',
    features: [
      '100 Codatron AI credits',
      'Autonomous project architecture & code synthesis',
      'Instant in-browser WebContainer preview runtime',
      'Monaco Code Editor with zero-cost manual editing',
      'Full project ZIP export',
    ] as any,
    razorpay_plan_id: null,
    is_active: true,
    is_published: true,
    display_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'pro',
    name: 'Developer Pro',
    description: 'For active builders creating production-ready applications.',
    price_inr: 499,
    billing_interval: 'month',
    credits: 500,
    badge: 'Most Popular',
    features: [
      '500 Codatron AI credits / month',
      'Up to 50 AI generation & refactoring operations',
      'High-priority generation queues & low latency',
      'Autonomous Product Manager planning & roadmaps',
      'Full-stack autonomous AI generation & refactoring',
      'Unlimited manual editing, preview & live HMR',
    ] as any,
    razorpay_plan_id: null,
    is_active: true,
    is_published: true,
    display_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'premium',
    name: 'Team Premium',
    description: 'For teams and studios shipping complex multi-page applications.',
    price_inr: 999,
    billing_interval: 'month',
    credits: 1200,
    badge: 'Best Value',
    features: [
      '1,200 Codatron AI credits / month',
      'Multi-seat collaboration & shared workspaces',
      'Deep multi-file refactoring & automatic repair loops',
      'Dedicated engineering support & custom models',
      'All Developer Pro features included',
    ] as any,
    razorpay_plan_id: null,
    is_active: true,
    is_published: true,
    display_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

let cachedPlans: SubscriptionPlan[] = [...FALLBACK_PLANS];

export async function getAllPlans(): Promise<SubscriptionPlan[]> {
  try {
    const privileged = createPrivilegedClient();
    const { data, error } = await privileged
      .from('subscription_plans')
      .select('*')
      .order('display_order', { ascending: true });

    if (!error && data && data.length > 0) {
      cachedPlans = data;
      return data;
    }
  } catch (err) {
    console.warn('[Billing Plans] Failed to fetch from database, using cached fallback:', err);
  }
  return cachedPlans;
}

export async function getActivePlans(): Promise<SubscriptionPlan[]> {
  const all = await getAllPlans();
  return all.filter((p) => p.is_active && p.is_published);
}

export async function savePlan(
  input: PlanInput,
  adminEmail: string,
  adminUserId?: string
): Promise<SubscriptionPlan> {
  const planRecord: SubscriptionPlan = {
    id: input.id.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-'),
    name: input.name.trim(),
    description: input.description || null,
    price_inr: Math.max(0, Math.round(input.price_inr)),
    billing_interval: input.billing_interval || 'month',
    credits: input.credits,
    features: input.features as any,
    badge: input.badge || null,
    razorpay_plan_id: input.razorpay_plan_id || null,
    is_active: input.is_active !== false,
    is_published: input.is_published !== false,
    display_order: input.display_order ?? 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const privileged = createPrivilegedClient();
    const { data, error } = await privileged
      .from('subscription_plans')
      .upsert(planRecord)
      .select('*')
      .single();

    if (!error && data) {
      const idx = cachedPlans.findIndex((p) => p.id === planRecord.id);
      if (idx >= 0) cachedPlans[idx] = data;
      else cachedPlans.push(data);
    } else {
      updateInMemoryPlan(planRecord);
    }
  } catch {
    updateInMemoryPlan(planRecord);
  }

  await logAdminAudit({
    adminUserId,
    adminEmail,
    action: 'PLAN_SAVED',
    targetType: 'subscription_plan',
    targetId: planRecord.id,
    details: { name: planRecord.name, price_inr: planRecord.price_inr, credits: planRecord.credits },
  });

  return planRecord;
}

function updateInMemoryPlan(record: SubscriptionPlan) {
  const idx = cachedPlans.findIndex((p) => p.id === record.id);
  if (idx >= 0) cachedPlans[idx] = record;
  else cachedPlans.push(record);
}

export async function deletePlan(
  planId: string,
  adminEmail: string,
  adminUserId?: string
): Promise<boolean> {
  try {
    const privileged = createPrivilegedClient();
    await privileged.from('subscription_plans').delete().eq('id', planId);
  } catch {
    // Non-blocking
  }
  cachedPlans = cachedPlans.filter((p) => p.id !== planId);

  await logAdminAudit({
    adminUserId,
    adminEmail,
    action: 'PLAN_DELETED',
    targetType: 'subscription_plan',
    targetId: planId,
  });

  return true;
}
