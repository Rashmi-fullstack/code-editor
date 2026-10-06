import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { createPrivilegedClient } from '@/lib/server';
import { getInMemoryTelemetry } from '@/lib/admin/telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json(
      { message: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  const privileged = createPrivilegedClient();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  try {
    const [allUsageRes, todayUsageRes, weekUsageRes, monthUsageRes, fallbackEventsRes] =
      await Promise.all([
        privileged
          .from('ai_token_usage')
          .select('id, provider, model, success, latency_ms, total_tokens, created_at')
          .order('created_at', { ascending: false })
          .limit(1000),
        privileged.from('ai_token_usage').select('id', { count: 'exact', head: true }).gte('created_at', startOfToday),
        privileged.from('ai_token_usage').select('id', { count: 'exact', head: true }).gte('created_at', startOfWeek),
        privileged.from('ai_token_usage').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
        privileged.from('provider_health_events').select('id', { count: 'exact', head: true }).eq('event_type', 'fallback_triggered'),
      ]);

    const records = (allUsageRes.data || []) as Array<{
      id: string;
      provider: string;
      model: string;
      success: boolean;
      latency_ms: number | null;
      total_tokens: number;
      created_at: string;
    }>;
    const totalRequests = records.length;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalLatency = 0;
    let latencyCount = 0;
    let totalTokens = 0;

    const providerCounts: Record<string, { total: number; success: number; failed: number }> = {};
    const modelCounts: Record<string, number> = {};

    for (const rec of records) {
      if (rec.success) successfulRequests++;
      else failedRequests++;

      if (typeof rec.latency_ms === 'number' && rec.latency_ms > 0) {
        totalLatency += rec.latency_ms;
        latencyCount++;
      }

      if (typeof rec.total_tokens === 'number') {
        totalTokens += rec.total_tokens;
      }

      const pKey = rec.provider || 'unknown';
      if (!providerCounts[pKey]) {
        providerCounts[pKey] = { total: 0, success: 0, failed: 0 };
      }
      providerCounts[pKey].total++;
      if (rec.success) providerCounts[pKey].success++;
      else providerCounts[pKey].failed++;

      const mKey = rec.model || 'unknown';
      modelCounts[mKey] = (modelCounts[mKey] || 0) + 1;
    }

    const avgLatencyMs = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;
    const errorRate = totalRequests > 0 ? ((failedRequests / totalRequests) * 100).toFixed(1) : '0.0';

    // Fallbacks from DB or in-memory
    let fallbackCount = fallbackEventsRes.count;
    if (fallbackCount === null || fallbackEventsRes.error) {
      const mem = getInMemoryTelemetry();
      fallbackCount = mem.providerEvents.filter((e) => e.event_type === 'fallback_triggered').length;
    }

    return NextResponse.json({
      summary: {
        totalRequests,
        successfulRequests,
        failedRequests,
        errorRate: `${errorRate}%`,
        avgLatencyMs,
        totalTokens,
        fallbackCount: fallbackCount ?? 0,
        requestsToday: todayUsageRes.count ?? 0,
        requestsThisWeek: weekUsageRes.count ?? 0,
        requestsThisMonth: monthUsageRes.count ?? 0,
      },
      providers: Object.entries(providerCounts).map(([provider, data]) => ({
        provider,
        total: data.total,
        success: data.success,
        failed: data.failed,
        successRate: data.total > 0 ? `${((data.success / data.total) * 100).toFixed(1)}%` : '100%',
      })),
      models: Object.entries(modelCounts).map(([model, count]) => ({
        model,
        count,
      })),
      recentActivity: records.slice(0, 15).map((r) => ({
        id: r.id,
        provider: r.provider,
        model: r.model,
        success: r.success,
        latencyMs: r.latency_ms,
        totalTokens: r.total_tokens,
        createdAt: r.created_at,
      })),
    });
  } catch (error: unknown) {
    console.error('[Admin AI Usage API Exception]:', error);
    return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
  }
}
