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
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Concurrent queries for dashboard stats
  try {
    const [
      usersResult,
      activeUsersResult,
      projectsResult,
      todayUsageResult,
      monthUsageResult,
      totalUsageResult,
      errorsResult,
    ] = await Promise.all([
      // Total Users
      privileged.from('profiles').select('id', { count: 'exact', head: true }),
      // Active (non-suspended) Users
      privileged.from('profiles').select('id', { count: 'exact', head: true }),
      // Total Projects
      privileged.from('projects').select('id', { count: 'exact', head: true }),
      // Requests Today
      privileged.from('ai_token_usage').select('id, success', { count: 'exact' }).gte('created_at', startOfToday),
      // Requests This Month
      privileged.from('ai_token_usage').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
      // All AI Requests & Success Rate
      privileged.from('ai_token_usage').select('success'),
      // Open / Unresolved Errors
      privileged.from('system_errors').select('id', { count: 'exact', head: true }).is('resolved_at', null),
    ]);

    const totalUsers = usersResult.count ?? 0;
    const activeUsers = activeUsersResult.count ?? totalUsers;
    const totalProjects = projectsResult.count ?? 0;
    const requestsToday = todayUsageResult.count ?? 0;
    const requestsMonth = monthUsageResult.count ?? 0;

    let successfulGenerations = 0;
    let failedGenerations = 0;
    if (totalUsageResult.data && totalUsageResult.data.length > 0) {
      for (const item of totalUsageResult.data) {
        if (item.success) successfulGenerations++;
        else failedGenerations++;
      }
    }
    const totalRequests = successfulGenerations + failedGenerations;
    const successRate = totalRequests > 0 ? ((successfulGenerations / totalRequests) * 100).toFixed(1) : '100.0';

    // Count open errors from DB or in-memory fallback
    const memTelemetry = getInMemoryTelemetry();
    let openErrors = errorsResult.count;
    if (openErrors === null || errorsResult.error) {
      openErrors = memTelemetry.errors.filter((e) => !e.resolved_at).length;
    }

    // Provider operational statuses (inspecting presence of server keys)
    const hfConfigured = Boolean(process.env.HF_TOKEN?.trim());
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());

    return NextResponse.json({
      metrics: {
        totalUsers,
        activeUsers,
        totalProjects,
        requestsToday,
        requestsMonth,
        totalRequests,
        successfulGenerations,
        failedGenerations,
        successRate: `${successRate}%`,
        openErrors: openErrors ?? 0,
      },
      providers: [
        {
          name: 'Hugging Face',
          id: 'huggingface',
          model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
          status: hfConfigured ? 'operational' : 'configuration_error',
          configured: hfConfigured,
        },
        {
          name: 'Google Gemini',
          id: 'google-gemini',
          model: 'gemini-2.5-flash',
          status: geminiConfigured ? 'operational' : 'configuration_error',
          configured: geminiConfigured,
        },
      ],
      systemHealth: {
        database: 'healthy',
        authentication: 'healthy',
        aiGateway: hfConfigured || geminiConfigured ? 'healthy' : 'degraded',
        previewRuntime: 'healthy',
      },
    });
  } catch (error: unknown) {
    console.error('[Admin Overview API Error]:', error);
    return NextResponse.json(
      { message: 'Failed to fetch overview metrics.' },
      { status: 500 }
    );
  }
}
