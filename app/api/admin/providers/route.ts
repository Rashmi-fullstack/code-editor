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
  const hfConfigured = Boolean(process.env.HF_TOKEN?.trim());
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());

  try {
    // Fetch last 50 provider health events
    const { data: dbEvents } = await privileged
      .from('provider_health_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const mem = getInMemoryTelemetry();
    const allEvents: any[] = dbEvents && dbEvents.length > 0 ? (dbEvents as any[]) : (mem.providerEvents as any[]);

    // Fetch token usage grouped by provider
    const { data: usageData } = await privileged
      .from('ai_token_usage')
      .select('provider, success, latency_ms, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    const usageRecords: any[] = (usageData as any[]) || [];

    // Compute stats for Hugging Face
    const hfUsage = usageRecords.filter((r: any) => r.provider === 'huggingface' || r.provider === 'hf');
    const hfTotal = hfUsage.length;
    const hfSuccesses = hfUsage.filter((r: any) => r.success).length;
    const hfErrors = hfTotal - hfSuccesses;
    const hfLatencies = hfUsage.map((r: any) => r.latency_ms).filter((l: any): l is number => typeof l === 'number' && l > 0);
    const hfAvgLatency = hfLatencies.length > 0 ? Math.round(hfLatencies.reduce((a: number, b: number) => a + b, 0) / hfLatencies.length) : 0;
    const hfLastSuccess = hfUsage.find((r: any) => r.success)?.created_at || null;

    // Compute stats for Gemini
    const geminiUsage = usageRecords.filter((r: any) => r.provider === 'google-gemini' || r.provider === 'gemini');
    const geminiTotal = geminiUsage.length;
    const geminiSuccesses = geminiUsage.filter((r: any) => r.success).length;
    const geminiErrors = geminiTotal - geminiSuccesses;
    const geminiLatencies = geminiUsage.map((r: any) => r.latency_ms).filter((l: any): l is number => typeof l === 'number' && l > 0);
    const geminiAvgLatency = geminiLatencies.length > 0 ? Math.round(geminiLatencies.reduce((a: number, b: number) => a + b, 0) / geminiLatencies.length) : 0;
    const geminiLastSuccess = geminiUsage.find((r: any) => r.success)?.created_at || null;

    // Recent rate limit (429) events
    const rateLimitEvents = allEvents.filter((e: any) => e.status_code === 429 || e.event_type === 'rate_limit');
    const hf429Count = rateLimitEvents.filter((e: any) => e.provider?.includes('hug') || e.provider?.includes('hf')).length;
    const gemini429Count = rateLimitEvents.filter((e: any) => e.provider?.includes('gemini')).length;

    // Fallback events
    const fallbackEvents = allEvents.filter((e: any) => e.event_type === 'fallback_triggered');

    // Recent errors from system_errors
    const { data: recentErrorsData } = await privileged
      .from('system_errors')
      .select('provider, message, status_code, last_seen_at')
      .eq('category', 'AI_PROVIDER')
      .order('last_seen_at', { ascending: false })
      .limit(10);

    const recentSysErrors: any[] = (recentErrorsData as any[]) || [];

    const hfLastError = recentSysErrors.find((e: any) => e.provider?.includes('hug') || e.provider?.includes('hf'))?.message || null;
    const geminiLastError = recentSysErrors.find((e: any) => e.provider?.includes('gemini'))?.message || null;

    // Status logic
    let hfStatus: 'Operational' | 'Degraded' | 'Unavailable' | 'Configuration Error' = 'Operational';
    if (!hfConfigured) hfStatus = 'Configuration Error';
    else if (hf429Count > 5 || (hfTotal > 0 && hfErrors / hfTotal > 0.3)) hfStatus = 'Degraded';

    let geminiStatus: 'Operational' | 'Degraded' | 'Unavailable' | 'Configuration Error' = 'Operational';
    if (!geminiConfigured) geminiStatus = 'Configuration Error';
    else if (gemini429Count > 5 || (geminiTotal > 0 && geminiErrors / geminiTotal > 0.3)) geminiStatus = 'Degraded';

    return NextResponse.json({
      providers: [
        {
          id: 'huggingface',
          name: 'Hugging Face Inference',
          model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
          role: 'Primary Provider',
          status: hfStatus,
          configured: hfConfigured,
          totalRequests: hfTotal,
          successfulRequests: hfSuccesses,
          errorCount: hfErrors,
          successRate: hfTotal > 0 ? `${((hfSuccesses / hfTotal) * 100).toFixed(1)}%` : '100%',
          averageLatencyMs: hfAvgLatency,
          rateLimitCount: hf429Count,
          lastError: hfLastError,
          lastSuccessfulRequest: hfLastSuccess,
        },
        {
          id: 'google-gemini',
          name: 'Google Gemini',
          model: 'gemini-2.5-flash',
          role: 'Automated Fallback',
          status: geminiStatus,
          configured: geminiConfigured,
          totalRequests: geminiTotal,
          successfulRequests: geminiSuccesses,
          errorCount: geminiErrors,
          successRate: geminiTotal > 0 ? `${((geminiSuccesses / geminiTotal) * 100).toFixed(1)}%` : '100%',
          averageLatencyMs: geminiAvgLatency,
          rateLimitCount: gemini429Count,
          lastError: geminiLastError,
          lastSuccessfulRequest: geminiLastSuccess,
        },
      ],
      fallbackEvents: fallbackEvents.slice(0, 10).map((f: any) => ({
        id: f.id,
        provider: f.provider,
        status: f.status,
        message: f.message,
        createdAt: f.created_at,
      })),
      recentEvents: allEvents.slice(0, 20),
    });
  } catch (error: unknown) {
    console.error('[Admin Providers API Exception]:', error);
    return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
  }
}
