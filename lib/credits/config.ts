/**
 * Centralized AI Credit & Pricing Plan Configuration for Codatron.ai
 *
 * Normal User Allowance: 100 credits
 * Usage-Based Operation Costs:
 *  - Full Project / Initial Generation: 20 credits
 *  - Major Multi-File Change / Large Feature: 15 credits
 *  - Standard Feature / UI Change: 10 credits
 *  - Small Targeted Code / Debug Change: 5 credits
 *
 * Administrator Bypass:
 *  - Canonical server admin accounts have ∞ Unlimited application credits.
 *  - External provider quotas (Gemini / Hugging Face) still apply to administrators.
 */

export const DEFAULT_AI_CREDIT_LIMIT = Number(process.env.AI_CREDIT_LIMIT || 100);

export const CREDIT_COSTS = {
  FULL_GENERATION: 20,
  MAJOR_CHANGE: 15,
  STANDARD_CHANGE: 10,
  SMALL_CHANGE: 5,
} as const;

export type OperationCostTier = keyof typeof CREDIT_COSTS;

export interface PlanTier {
  id: 'free' | 'pro' | 'business' | 'premium' | 'admin';
  name: string;
  credits: number; // -1 for unlimited
  priceMonthly: number;
  badge?: string;
  description: string;
  features: string[];
}

export const CODATRON_PLANS: Record<string, PlanTier> = {
  free: {
    id: 'free',
    name: 'Starter Plan',
    credits: DEFAULT_AI_CREDIT_LIMIT,
    priceMonthly: 0,
    description: 'Initial allowance for autonomous AI web application synthesis.',
    features: [
      '100 Codatron AI credits',
      'Usage-based generation (~4–5 full builds or ~10–20 updates)',
      'Autonomous project architecture & multi-file generation',
      'Instant in-browser WebContainer preview runtime',
      'Monaco Code Editor with zero-cost manual editing',
      'Export full project to ZIP at any time',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Developer Pro',
    credits: 500,
    priceMonthly: 499,
    badge: 'Most Popular',
    description: 'For active builders creating production-ready applications.',
    features: [
      '500 Codatron AI credits / month',
      'Up to 50 AI generation & refactoring operations',
      'High-priority generation queues & low latency',
      'Autonomous Product Manager planning & roadmaps',
      'Custom BYOK personal API key integration',
      'Unlimited manual editing, preview & live HMR',
    ],
  },
  business: {
    id: 'business',
    name: 'Team Premium',
    credits: 1200,
    priceMonthly: 999,
    badge: 'Best Value',
    description: 'For teams and studios shipping complex multi-page applications.',
    features: [
      '1,200 Codatron AI credits / month',
      'Multi-seat collaboration & shared workspaces',
      'Deep multi-file refactoring & automatic repair loops',
      'Dedicated engineering support & custom models',
      'All features included in Developer Pro',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Team Premium',
    credits: 1200,
    priceMonthly: 999,
    badge: 'Best Value',
    description: 'For teams and studios shipping complex multi-page applications.',
    features: [
      '1,200 Codatron AI credits / month',
      'Multi-seat collaboration & shared workspaces',
      'Deep multi-file refactoring & automatic repair loops',
      'Dedicated engineering support & custom models',
      'All features included in Developer Pro',
    ],
  },
  admin: {
    id: 'admin',
    name: 'Administrator',
    credits: -1,
    priceMonthly: 0,
    badge: 'Platform Admin',
    description: 'Internal platform administrator access.',
    features: [
      '∞ Unlimited Codatron application credits',
      'System Diagnostics, Error telemetry & Health checks',
      'Full administrative user & role controls',
      'External AI provider quota restrictions still apply',
    ],
  },
};

export interface CostEstimationParams {
  prompt?: string;
  mode?: 'build' | 'code' | 'debug' | string;
  filesCount?: number;
  activePath?: string;
  selectedCode?: string;
  previewError?: string;
  isInitialBuild?: boolean;
}

/**
 * Deterministically classifies generation complexity into centralized Codatron credit costs.
 * Avoids arbitrary secondary LLM classifiers by inspecting concrete operation parameters.
 */
export function determineOperationCost(params: CostEstimationParams): {
  cost: number;
  operationType: OperationCostTier;
  reason: string;
} {
  const prompt = (params.prompt || '').toLowerCase().trim();
  const isDebug = params.mode === 'debug' || Boolean(params.previewError);
  const hasSnippet = Boolean(params.selectedCode);
  const filesCount = typeof params.filesCount === 'number' ? params.filesCount : 0;
  const isInitial = Boolean(params.isInitialBuild || filesCount === 0);

  // 1. Initial build or full project generation: 20 credits
  if (
    isInitial ||
    /^(create|build|make|generate|start|design)\s+(a|an|the)?\s+(full|new|complete|entire)?\s*(website|app|application|platform|dashboard|system|portfolio|clone|store)/i.test(
      prompt
    )
  ) {
    return {
      cost: CREDIT_COSTS.FULL_GENERATION,
      operationType: 'FULL_GENERATION',
      reason: 'Full project generation',
    };
  }

  // 2. Small targeted code or debug change: 5 credits
  if (
    isDebug ||
    hasSnippet ||
    (prompt.length < 50 &&
      /(fix|button|color|padding|margin|font|text|title|typo|badge|icon|hover)/i.test(prompt) &&
      !/(page|route|database|auth|backend|refactor|redesign)/i.test(prompt))
  ) {
    return {
      cost: CREDIT_COSTS.SMALL_CHANGE,
      operationType: 'SMALL_CHANGE',
      reason: 'Small targeted code or debug change',
    };
  }

  // 3. Major multi-file change / large feature: 15 credits
  const isMajor =
    filesCount > 4 &&
    (prompt.includes('refactor') ||
      prompt.includes('redesign') ||
      prompt.includes('multi-page') ||
      prompt.includes('authentication') ||
      prompt.includes('integrate') ||
      prompt.includes('overhaul') ||
      prompt.includes('architecture') ||
      prompt.length > 200);

  if (isMajor) {
    return {
      cost: CREDIT_COSTS.MAJOR_CHANGE,
      operationType: 'MAJOR_CHANGE',
      reason: 'Major multi-file feature or redesign',
    };
  }

  // 4. Standard feature or UI change: 10 credits
  return {
    cost: CREDIT_COSTS.STANDARD_CHANGE,
    operationType: 'STANDARD_CHANGE',
    reason: 'Standard feature or UI update',
  };
}

export const CREDIT_CONSUMING_OPERATIONS = [
  'PLAN',
  'GENERATE',
  'DEBUG',
  'FIX',
  'REFACTOR',
  'ANALYZE',
] as const;

export type CreditConsumingOperation = (typeof CREDIT_CONSUMING_OPERATIONS)[number];

export function isCreditConsumingOperation(operation: string): boolean {
  return CREDIT_CONSUMING_OPERATIONS.includes(operation.toUpperCase() as CreditConsumingOperation);
}
