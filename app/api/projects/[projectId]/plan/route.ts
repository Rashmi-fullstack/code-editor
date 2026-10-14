import { NextResponse } from 'next/server';
import { createClient, createPrivilegedClient } from '@/lib/server';
import { getCurrentUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { GeminiUnavailableError } from '@/lib/ai/coding-agent';
import { runProductManagerAgent, ProductPlannerError } from '@/lib/ai/product-planner';
import { resolveAIConfig, trackAiUsage } from '@/lib/ai/router';
import { reserveCredit, finalizeCredit } from '@/lib/credits/manager';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as { idea?: string; existingPaths?: string[] };

    if (!body.idea?.trim() || body.idea.length > 8_000) {
      return NextResponse.json(
        { message: 'Provide a product idea under 8,000 characters.' },
        { status: 400 }
      );
    }

    // 1. Strict Server-Side Authentication (Supabase Auth + Session Cookie)
    const supabase = await createClient();
    const {
      data: { user: sbUser },
    } = await supabase.auth.getUser();

    const sessionUser = await getCurrentUser();
    const user = sbUser || sessionUser;

    if (!user) {
      return NextResponse.json(
        { message: 'Authentication required for Product Manager planning.' },
        { status: 401 }
      );
    }

    const privileged = createPrivilegedClient();
    const dbClient = privileged || supabase;

    // Check canonical account status and role from database
    const { data: userProfile } = await dbClient
      .from('profiles')
      .select('status, role')
      .eq('id', user.id)
      .maybeSingle();

    if (userProfile?.status === 'suspended') {
      return NextResponse.json(
        { message: 'Your account has been suspended. Please contact administrator.' },
        { status: 403 }
      );
    }

    const isAdmin = userProfile?.role === 'admin';

    // 2. Strict Project Ownership Verification
    const { data: project } = await dbClient
      .from('projects')
      .select('id, name, user_id')
      .eq('id', projectId)
      .maybeSingle();

    if (project) {
      if (project.user_id !== user.id && !isAdmin) {
        return NextResponse.json(
          { message: 'Project access denied.' },
          { status: 403 }
        );
      }
    }

    // Rate Limit check
    const rateLimit = checkRateLimit(`plan:${user.id}`, 10, 60_000);
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          message: `Planning rate limit reached. Please wait ${rateLimit.reset}s before trying again.`,
        },
        { status: 429 }
      );
    }

    // 3. Server-Side Atomic Credit Reservation (Standard change cost = 10 credits)
    const cost = 10;
    if (!isAdmin) {
      const creditReservation = await reserveCredit(dbClient, user.id, cost);
      if (!creditReservation.success) {
        return NextResponse.json(
          {
            code: 'INSUFFICIENT_CREDITS',
            message:
              creditReservation.message ||
              "You've used your Codatron AI credits. Upgrade your plan to continue building with AI.",
            remaining: creditReservation.remaining ?? 0,
            required: cost,
            upgradeRequired: true,
          },
          { status: 403 }
        );
      }
    }

    const { data: files } = await dbClient
      .from('project_files')
      .select('path')
      .eq('project_id', projectId);

    const existingPaths = (files ?? []).map((f) => f.path);

    const startTime = Date.now();
    const aiConfig = await resolveAIConfig(dbClient, user.id, 'product');
    let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let isCreditFinalized = false;

    try {
      // 4. Execute AI Product Planning
      const plan = await runProductManagerAgent(body.idea.trim(), existingPaths, {
        aiConfig,
        onUsage: (u) => {
          tokenUsage = u;
        },
      });

      // 5. Finalize Credit on Success
      if (!isAdmin) {
        await finalizeCredit(dbClient, user.id, true, cost);
        isCreditFinalized = true;
      }

      // 6. Record Real Token Usage with Credit Flag
      await trackAiUsage(dbClient, {
        userId: user.id,
        projectId,
        config: aiConfig,
        operation: 'PLAN',
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens,
        success: true,
        creditUsed: isAdmin ? 0 : cost,
        latencyMs: Date.now() - startTime,
      });

      // Persist plan and tasks to Supabase
      try {
        const { saveProductPlanToDb } = await import('@/lib/db/product');
        await saveProductPlanToDb(dbClient, projectId, plan);
      } catch (dbErr) {
        console.warn('Could not persist product plan to DB:', dbErr);
      }

      return NextResponse.json({
        plan,
        keySource: aiConfig.keySource,
        usage: tokenUsage,
        creditCost: isAdmin ? 0 : cost,
        isAdmin,
      });
    } catch (operationError) {
      // 7. On Failure: Release Reserved Credit
      if (!isAdmin && !isCreditFinalized) {
        await finalizeCredit(dbClient, user.id, false, cost);
        isCreditFinalized = true;
      }
      throw operationError;
    }
  } catch (error) {
    console.error('[Plan Route Error]:', error);
    let status = 500;
    let code = 'FAILED';
    let provider: string | undefined = undefined;

    if (error instanceof GeminiUnavailableError) {
      status = error.status;
      code = error.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE';
      provider = 'google-gemini';
    } else if (error instanceof ProductPlannerError) {
      status = error.status;
      code = error.code;
      provider = error.provider;
    } else if (
      error instanceof Error &&
      (error.message.includes('429') ||
        error.message.toLowerCase().includes('rate limit') ||
        error.message.toLowerCase().includes('quota'))
    ) {
      status = 429;
      code = 'RATE_LIMITED';
    }

    const userMessage =
      status === 429
        ? "We're having trouble completing your request. Please try again shortly."
        : status === 503
          ? 'Codatron AI is temporarily unavailable. Please try again in a moment.'
          : "We couldn't finish generating your product plan. Please try again.";

    return NextResponse.json(
      {
        message: userMessage,
        code,
        status,
      },
      { status }
    );
  }
}
