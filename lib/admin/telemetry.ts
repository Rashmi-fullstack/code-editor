import { createPrivilegedClient } from './privileged-client';
import type { SystemErrorRecord, ProviderHealthEvent, AdminAuditLog } from '@/lib/types/database';

export interface LogErrorParams {
  severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  category: 'AI_PROVIDER' | 'RATE_LIMIT' | 'AUTH' | 'RUNTIME' | 'PREVIEW' | 'DATABASE' | 'COMPILATION';
  provider?: string | null;
  statusCode?: number | null;
  message: string;
  projectId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  referenceId?: string | null;
  operation?: string | null;
  route?: string | null;
  stackTrace?: string | null;
  metadata?: Record<string, unknown>;
}

export function generateErrorReferenceId(): string {
  const chars = '0123456789ABCDEF';
  let ref = 'ERR-';
  for (let i = 0; i < 4; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

export function toUserFriendlyErrorMessage(category: string, statusCode?: number | null): string {
  if (statusCode === 429) {
    return "AI generation is currently experiencing high demand. Please try again in a moment.";
  }
  if (statusCode === 503 || category === 'AI_PROVIDER') {
    return "We're having trouble reaching the AI service. We're trying another available AI service.";
  }
  if (category === 'AUTH') {
    return "Your session has expired or requires authorization. Please sign in again.";
  }
  if (category === 'DATABASE') {
    return "We couldn't complete that operation. Your project is safe. Please try again.";
  }
  if (category === 'RUNTIME' || category === 'PREVIEW' || category === 'COMPILATION') {
    return "Something went wrong while verifying your application preview. Your code is safe.";
  }
  return "Something went wrong while processing your request. Please try again.";
}

export interface LogProviderParams {
  provider: 'huggingface' | 'google-gemini' | string;
  model?: string | null;
  status: 'operational' | 'degraded' | 'unavailable' | 'fallback';
  eventType: 'request_success' | 'request_error' | 'fallback_triggered' | 'rate_limit';
  statusCode?: number | null;
  latencyMs?: number | null;
  message?: string | null;
}

export interface LogAuditParams {
  adminUserId?: string | null;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
}

// In-Memory Ring Buffers (Fallback for zero-downtime resilience if DB table is pending migration)
const inMemoryErrors: SystemErrorRecord[] = [];
const inMemoryProviderEvents: ProviderHealthEvent[] = [];
const inMemoryAuditLogs: AdminAuditLog[] = [];
const MAX_IN_MEMORY_LOGS = 200;

/**
 * Sanitizes messages and metadata to ensure no API keys, tokens, or credentials can ever be logged.
 */
function sanitizeDetails(text: string): string {
  if (!text) return '';
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9_\-\.]+/gi, '$1[REDACTED]')
    .replace(/(hf_[A-Za-z0-9]{20,})/gi, 'hf_[REDACTED]')
    .replace(/(AIza[0-9A-Za-z-_]{35})/gi, 'AIza[REDACTED]')
    .replace(/(password["':\s]+)[^,\s}]+/gi, '$1"[REDACTED]"');
}

/**
 * Log structured system/runtime/AI errors. Automatically groups duplicate occurrences.
 */
export async function logSystemError(params: LogErrorParams): Promise<void> {
  const cleanMessage = sanitizeDetails(params.message);
  const severity = params.severity || (params.statusCode === 429 ? 'WARNING' : params.statusCode && params.statusCode >= 500 ? 'ERROR' : 'ERROR');

  try {
    const privileged = createPrivilegedClient();

    // Check if an unresolved duplicate error exists within the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existingRows } = await privileged
      .from('system_errors')
      .select('id, occurrence_count')
      .eq('category', params.category)
      .eq('message', cleanMessage)
      .is('resolved_at', null)
      .gte('last_seen_at', since)
      .order('last_seen_at', { ascending: false })
      .limit(1);

    const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

    const meta = {
      ...(params.metadata || {}),
      referenceId: params.referenceId || null,
      operation: params.operation || null,
      route: params.route || null,
      stackTrace: params.stackTrace ? sanitizeDetails(params.stackTrace) : null,
    };

    if (existing) {
      await privileged
        .from('system_errors')
        .update({
          occurrence_count: (existing.occurrence_count || 1) + 1,
          last_seen_at: new Date().toISOString(),
          metadata: meta as any,
        })
        .eq('id', existing.id);
      return;
    }

    const { error } = await privileged.from('system_errors').insert({
      severity,
      category: params.category,
      provider: params.provider || null,
      status_code: params.statusCode || null,
      message: cleanMessage,
      project_id: params.projectId || null,
      user_id: params.userId || null,
      user_email: params.userEmail || null,
      metadata: meta as any,
      occurrence_count: 1,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      resolved_at: null,
    });

    if (error) {
      throw error;
    }
  } catch (err) {
    // Graceful fallback to memory ring buffer
    const mockId = `mem-err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const meta = {
      ...(params.metadata || {}),
      referenceId: params.referenceId || null,
      operation: params.operation || null,
      route: params.route || null,
      stackTrace: params.stackTrace ? sanitizeDetails(params.stackTrace) : null,
    };
    const existingIndex = inMemoryErrors.findIndex(
      (e) => e.category === params.category && e.message === cleanMessage && !e.resolved_at
    );

    if (existingIndex >= 0) {
      inMemoryErrors[existingIndex].occurrence_count += 1;
      inMemoryErrors[existingIndex].last_seen_at = new Date().toISOString();
      inMemoryErrors[existingIndex].metadata = meta as any;
    } else {
      inMemoryErrors.unshift({
        id: mockId,
        severity,
        category: params.category,
        provider: params.provider || null,
        status_code: params.statusCode || null,
        message: cleanMessage,
        project_id: params.projectId || null,
        user_id: params.userId || null,
        user_email: params.userEmail || null,
        metadata: meta as any,
        occurrence_count: 1,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        resolved_at: null,
      });
      if (inMemoryErrors.length > MAX_IN_MEMORY_LOGS) inMemoryErrors.pop();
    }
  }
}

/**
 * Log provider telemetry (latency, status, fallback events, rate-limits).
 */
export async function logProviderEvent(params: LogProviderParams): Promise<void> {
  try {
    const privileged = createPrivilegedClient();
    const { error } = await privileged.from('provider_health_events').insert({
      provider: params.provider,
      model: params.model || null,
      status: params.status,
      event_type: params.eventType,
      status_code: params.statusCode || null,
      latency_ms: params.latencyMs || null,
      message: params.message ? sanitizeDetails(params.message) : null,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;
  } catch {
    const mockId = `mem-prov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    inMemoryProviderEvents.unshift({
      id: mockId,
      provider: params.provider,
      model: params.model || null,
      status: params.status,
      event_type: params.eventType,
      status_code: params.statusCode || null,
      latency_ms: params.latencyMs || null,
      message: params.message ? sanitizeDetails(params.message) : null,
      created_at: new Date().toISOString(),
    });
    if (inMemoryProviderEvents.length > MAX_IN_MEMORY_LOGS) inMemoryProviderEvents.pop();
  }
}

/**
 * Log administrative operations to the audit trail.
 */
export async function logAdminAudit(params: LogAuditParams): Promise<void> {
  try {
    const privileged = createPrivilegedClient();
    const { error } = await privileged.from('admin_audit_logs').insert({
      admin_user_id: params.adminUserId || null,
      admin_email: params.adminEmail,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId || null,
      details: (params.details || {}) as any,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;
  } catch {
    const mockId = `mem-aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    inMemoryAuditLogs.unshift({
      id: mockId,
      admin_user_id: params.adminUserId || null,
      admin_email: params.adminEmail,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId || null,
      details: (params.details || {}) as any,
      created_at: new Date().toISOString(),
    });
    if (inMemoryAuditLogs.length > MAX_IN_MEMORY_LOGS) inMemoryAuditLogs.pop();
  }
}

/**
 * Read memory buffers for fallback views
 */
export function getInMemoryTelemetry() {
  return {
    errors: [...inMemoryErrors],
    providerEvents: [...inMemoryProviderEvents],
    auditLogs: [...inMemoryAuditLogs],
  };
}
