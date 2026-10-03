/**
 * Centralized AI Credit Configuration for Codatron.ai
 *
 * Initial Credit Limit: 4 credits per user.
 * Can be customized via AI_CREDIT_LIMIT environment variable without touching multiple files.
 */

export const DEFAULT_AI_CREDIT_LIMIT = Number(process.env.AI_CREDIT_LIMIT || 100);

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
