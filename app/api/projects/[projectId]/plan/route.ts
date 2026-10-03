import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { GeminiUnavailableError } from '@/lib/ai/coding-agent';
import { runProductManagerAgent } from '@/lib/ai/product-planner';
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

    // 1. Strict Server-Side Authentication
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { message: 'Authentication required for Product Manager planning.' },
        { status: 401 }
      );
    }

    // 2. Strict Project Ownership Verification
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('id, name, user_id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (projError || !project) {
      return NextResponse.json(
        { message: 'Project not found or access denied.' },
        { status: 404 }
      );
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

    // 3. Server-Side Atomic Credit Reservation
    const creditReservation = await reserveCredit(supabase, user.id);
    if (!creditReservation.success) {
      return NextResponse.json(
        {
          message:
            creditReservation.message ||
            'No AI credits remaining. Your initial credit limit has been reached.',
        },
        { status: 403 }
      );
    }

    const { data: files } = await supabase
      .from('project_files')
      .select('path')
      .eq('project_id', projectId);

    const existingPaths = (files ?? []).map((f) => f.path);

    const startTime = Date.now();
    const aiConfig = await resolveAIConfig(supabase, user.id);
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
      await finalizeCredit(supabase, user.id, true);
      isCreditFinalized = true;

      // 6. Record Real Token Usage with Credit Flag
      await trackAiUsage(supabase, {
        userId: user.id,
        projectId,
        config: aiConfig,
        operation: 'PLAN',
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens,
        success: true,
        creditUsed: 1,
        latencyMs: Date.now() - startTime,
      });

      // Persist plan and tasks to Supabase
      try {
        const { saveProductPlanToDb } = await import('@/lib/db/product');
        await saveProductPlanToDb(supabase, projectId, plan);
      } catch (dbErr) {
        console.warn('Could not persist product plan to DB:', dbErr);
      }

      return NextResponse.json({
        plan,
        keySource: aiConfig.keySource,
        usage: tokenUsage,
      });
    } catch (operationError) {
      // 7. On Failure: Release Reserved Credit
      if (!isCreditFinalized) {
        await finalizeCredit(supabase, user.id, false);
        isCreditFinalized = true;
      }
      throw operationError;
    }
  } catch (error) {
    console.error('[Plan Route Error]:', error);
    const status = error instanceof GeminiUnavailableError ? error.status : 500;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Product planning failed.' },
      { status }
    );
  }
}
