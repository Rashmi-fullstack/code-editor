import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { GeminiUnavailableError } from '@/lib/ai/coding-agent';
import { planTechnicalTask } from '@/lib/ai/task-planner';
import { resolveAIConfig, trackAiUsage } from '@/lib/ai/router';
import { reserveCredit, finalizeCredit } from '@/lib/credits/manager';
import type { DevelopmentTask } from '@/lib/ai/product-planner';
import type { ProjectFile } from '@/lib/types/database';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      task?: DevelopmentTask;
      files?: ProjectFile[];
    };

    if (!body.task || !body.task.title) {
      return NextResponse.json(
        { message: 'Valid development task required.' },
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
        { message: 'Authentication required for AI Technical Architecture.' },
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

    // Rate Limiting
    const rateLimit = checkRateLimit(`architect:${user.id}`, 15, 60_000);
    if (!rateLimit.success) {
      return NextResponse.json(
        { message: `Architect rate limit reached. Please wait ${rateLimit.reset}s.` },
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

    let projectFiles: ProjectFile[] = body.files ?? [];
    const { data: dbFiles } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId);

    if (dbFiles && dbFiles.length > 0) {
      projectFiles = dbFiles;
    }

    const startTime = Date.now();
    const aiConfig = await resolveAIConfig(supabase, user.id);
    let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let isCreditFinalized = false;

    try {
      // 4. Execute AI Task Planning
      const plan = await planTechnicalTask(body.task, projectFiles, {
        aiConfig,
        onUsage: (u) => {
          tokenUsage = u;
        },
      });

      // 5. Finalize Credit on Success
      await finalizeCredit(supabase, user.id, true);
      isCreditFinalized = true;

      // 6. Record Real Token Usage
      await trackAiUsage(supabase, {
        userId: user.id,
        projectId,
        config: aiConfig,
        operation: 'ANALYZE',
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens,
        success: true,
        creditUsed: 1,
        latencyMs: Date.now() - startTime,
      });

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
    console.error('[Architect Route Error]:', error);
    const status = error instanceof GeminiUnavailableError ? error.status : 500;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Architect planning failed.' },
      { status }
    );
  }
}
