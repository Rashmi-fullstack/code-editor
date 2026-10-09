import type { SupabaseClient } from '@supabase/supabase-js';

export type AiOperation =
  | 'PLAN'
  | 'GENERATE'
  | 'DEBUG'
  | 'FIX'
  | 'CHAT'
  | 'REFACTOR'
  | 'ANALYZE';

export type AiKeySource = 'platform' | 'byok';

export interface TokenUsageRecord {
  userId: string;
  projectId?: string;
  provider: string;
  model: string;
  operation: AiOperation;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  keySource: AiKeySource;
  success: boolean;
  creditUsed?: number;
  latencyMs?: number;
}

export interface UserUsageSummary {
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  byokRequests: number;
  platformRequests: number;
  byokTokens: number;
  platformTokens: number;
  totalCreditsUsed?: number;
  byOperation: Record<AiOperation, { count: number; tokens: number }>;
  recentRecords: Array<{
    id: string;
    operation: AiOperation;
    model: string;
    totalTokens: number;
    keySource: AiKeySource;
    createdAt: string;
    success: boolean;
  }>;
}

/**
 * Record AI token usage into database.
 * Gracefully logs without crashing if table is undergoing migration.
 */
export async function recordTokenUsage(
  supabase: SupabaseClient,
  record: TokenUsageRecord
): Promise<void> {
  try {
    let targetProjectId: string | null = null;
    if (record.projectId) {
      // Validate project exists before attaching to avoid foreign key violation
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', record.projectId)
        .maybeSingle();

      if (project?.id) {
        targetProjectId = project.id;
      }
    }

    const payload = {
      user_id: record.userId,
      project_id: targetProjectId,
      provider: record.provider,
      model: record.model,
      operation: record.operation,
      input_tokens: Math.max(0, Math.round(record.inputTokens || 0)),
      output_tokens: Math.max(0, Math.round(record.outputTokens || 0)),
      total_tokens: Math.max(
        0,
        Math.round(
          record.totalTokens ||
            (record.inputTokens || 0) + (record.outputTokens || 0)
        )
      ),
      key_source: record.keySource,
      success: record.success,
      credit_used: typeof record.creditUsed === 'number' ? record.creditUsed : (record.success ? 1 : 0),
      latency_ms: record.latencyMs || null,
    };

    const { error } = await supabase.from('ai_token_usage').insert(payload);

    if (error) {
      // If foreign key constraint failed (e.g., project was deleted or unsaved), retry with null project_id
      if (error.code === '23503' && payload.project_id) {
        const { error: retryError } = await supabase.from('ai_token_usage').insert({
          ...payload,
          project_id: null,
        });
        if (retryError) {
          console.warn('[AI Usage] Could not persist usage record on retry:', retryError.message);
        }
      } else {
        console.warn('[AI Usage] Could not persist usage record:', error.message);
      }
    }
  } catch (err) {
    console.warn('[AI Usage] Exception persisting token usage:', err);
  }
}

/**
 * Retrieve aggregated token usage summary for a user.
 */
export async function getUserUsageSummary(
  supabase: SupabaseClient,
  userId: string
): Promise<UserUsageSummary> {
  const emptySummary: UserUsageSummary = {
    totalRequests: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    byokRequests: 0,
    platformRequests: 0,
    byokTokens: 0,
    platformTokens: 0,
    byOperation: {
      PLAN: { count: 0, tokens: 0 },
      GENERATE: { count: 0, tokens: 0 },
      DEBUG: { count: 0, tokens: 0 },
      FIX: { count: 0, tokens: 0 },
      CHAT: { count: 0, tokens: 0 },
      REFACTOR: { count: 0, tokens: 0 },
      ANALYZE: { count: 0, tokens: 0 },
    },
    recentRecords: [],
  };

  try {
    const { data, error } = await supabase
      .from('ai_token_usage')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !data || data.length === 0) {
      return emptySummary;
    }

    const summary: UserUsageSummary = { ...emptySummary };

    for (const row of data) {
      const inTok = Number(row.input_tokens) || 0;
      const outTok = Number(row.output_tokens) || 0;
      const totTok = Number(row.total_tokens) || inTok + outTok;
      const op = (row.operation as AiOperation) || 'GENERATE';
      const isByok = row.key_source === 'byok';

      summary.totalRequests += 1;
      summary.totalTokens += totTok;
      summary.inputTokens += inTok;
      summary.outputTokens += outTok;

      if (isByok) {
        summary.byokRequests += 1;
        summary.byokTokens += totTok;
      } else {
        summary.platformRequests += 1;
        summary.platformTokens += totTok;
      }

      if (!summary.byOperation[op]) {
        summary.byOperation[op] = { count: 0, tokens: 0 };
      }
      summary.byOperation[op].count += 1;
      summary.byOperation[op].tokens += totTok;
    }

    summary.recentRecords = data.slice(0, 10).map((r) => ({
      id: r.id,
      operation: r.operation as AiOperation,
      model: r.model,
      totalTokens: Number(r.total_tokens) || 0,
      keySource: (r.key_source as AiKeySource) || 'platform',
      createdAt: r.created_at,
      success: Boolean(r.success),
    }));

    return summary;
  } catch (err) {
    console.warn('[AI Usage] Error fetching usage summary:', err);
    return emptySummary;
  }
}
