import { NextResponse } from 'next/server';
import { createClient, createPrivilegedClient } from '@/lib/server';
import { getCurrentUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  HuggingFaceQuotaError,
  HuggingFaceUnavailableError,
  HuggingFaceAuthError,
  HuggingFaceRateLimitError,
  GeminiUnavailableError,
  GeminiQuotaError,
  MalformedAIResponseError,
  runCodingAgent,
  selectProjectContext,
  validateAgentResult,
} from '@/lib/ai/coding-agent';
import { resolveAIConfig, trackAiUsage } from '@/lib/ai/router';
import { DEVELOPER_IDE_CONFIG } from '@/lib/ai/developer-ide-config';
import { reserveCredit, finalizeCredit } from '@/lib/credits/manager';
import { determineOperationCost } from '@/lib/credits/config';
import { logSystemError, logProviderEvent, generateErrorReferenceId } from '@/lib/admin/telemetry';
import type { ProjectFile } from '@/lib/types/database';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  let projectId = '';
  let currentUserId: string | null = null;
  let currentUserEmail: string | null = null;
  let isAdmin = false;
  try {
    const params = await context.params;
    projectId = params.projectId;
    const body = (await request.json()) as {
      prompt?: string;
      mode?: 'build' | 'code' | 'debug';
      activePath?: string;
      selectedCode?: string;
      previewError?: string;
      files?: ProjectFile[];
      referenceImage?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
      isInternalRepair?: boolean;
    };

    if (!body.prompt?.trim() || body.prompt.length > 8_000) {
      return NextResponse.json(
        { message: 'Provide a prompt under 8,000 characters.' },
        { status: 400 }
      );
    }

    // 1. Strict Server-Side Authentication Check
    const supabase = await createClient();
    const {
      data: { user: sbUser },
    } = await supabase.auth.getUser();

    const sessionUser = await getCurrentUser();
    const user = sbUser || sessionUser;
    if (user) {
      currentUserId = user.id;
      currentUserEmail = user.email || null;
    }

    if (!user) {
      return NextResponse.json(
        { message: 'Authentication required to use AI generation.' },
        { status: 401 }
      );
    }

    // Check canonical account status and role from database
    const privileged = createPrivilegedClient();
    const { data: userProfile } = await privileged
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

    // Canonical server-side admin detection: Only the database profile role is authoritative
    isAdmin = userProfile?.role === 'admin';

    // Global Platform Maintenance Mode Check
    try {
      const { getAdminSettings } = await import('@/lib/admin/settings');
      const settings = await getAdminSettings();
      if (settings.maintenance_mode && !isAdmin) {
        return NextResponse.json(
          {
            message: settings.system_announcement || 'Codatron is currently undergoing scheduled platform maintenance. Please check back shortly.',
            error: 'MAINTENANCE_MODE',
          },
          { status: 503 }
        );
      }
    } catch {
      // Non-blocking in dev
    }

    // 2. Strict Project Ownership Verification
    let project: { id: string; name: string; user_id: string } | null = null;
    const { data: dbProject } = await privileged
      .from('projects')
      .select('id, name, user_id')
      .eq('id', projectId)
      .maybeSingle();

    if (dbProject) {
      if (dbProject.user_id !== user.id && !isAdmin) {
        return NextResponse.json(
          { message: 'Project access denied.' },
          { status: 403 }
        );
      }
      project = dbProject;
    } else {
      // Local or client-side workspace project tied to authenticated user session
      project = {
        id: projectId,
        name: deriveProjectName(body.prompt?.trim() || '') || 'Untitled Project',
        user_id: user.id,
      };
      try {
        await privileged.from('projects').insert({
          id: projectId,
          user_id: user.id,
          name: project.name,
          framework: 'nextjs',
          is_public: false,
        });
      } catch { }
    }

    // Rate Limiting per authenticated user
    const rateLimit = checkRateLimit(`generate:${user.id}`, 10, 60_000);
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          message: `Generation rate limit reached. Please wait ${rateLimit.reset}s before trying again.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.reset),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimit.reset),
          },
        }
      );
    }

    // Resolve active centralized platform AI Configuration
    const aiConfig = await resolveAIConfig(supabase, user.id, 'developer');
    const isByok = false;

    let currentFiles: ProjectFile[] = body.files && body.files.length > 0 ? body.files : [];
    try {
      const { data: dbFiles } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('path');
      if (dbFiles && dbFiles.length > 0) {
        currentFiles = dbFiles;
      }
    } catch { }

    // 3. Server-Side Atomic Usage-Based Credit Check & Reservation
    // Admin accounts bypass Codatron application credit limits.
    // Internal auto-repair loops (isInternalRepair === true) are part of the original generation and NOT billed again.
    const costInfo = determineOperationCost({
      prompt: body.prompt.trim(),
      mode: body.mode,
      filesCount: currentFiles.length,
      activePath: body.activePath,
      selectedCode: body.selectedCode,
      previewError: body.previewError,
      isInitialBuild: currentFiles.length === 0,
    });
    const effectiveCost = body.isInternalRepair ? 0 : costInfo.cost;

    if (!isByok && !isAdmin && effectiveCost > 0) {
      const creditReservation = await reserveCredit(supabase, user.id, effectiveCost);
      if (!creditReservation.success) {
        return NextResponse.json(
          {
            code: 'INSUFFICIENT_CREDITS',
            message:
              creditReservation.message ||
              "You've used your Codatron AI credits. Upgrade your plan to continue building with AI.",
            remaining: creditReservation.remaining ?? 0,
            required: effectiveCost,
            upgradeRequired: true,
          },
          { status: 403 }
        );
      }
    }
    try {
      const { data: dbFiles } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('path');
      if (dbFiles && dbFiles.length > 0) {
        currentFiles = dbFiles;
      }
    } catch { }
    const startTime = Date.now();
    let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const operation = body.mode === 'debug' ? 'DEBUG' : body.mode === 'code' ? 'FIX' : 'GENERATE';

    let isCreditFinalized = false;
    let activeProvider = aiConfig.providerId || DEVELOPER_IDE_CONFIG.provider;
    let usedModel = aiConfig.model || DEVELOPER_IDE_CONFIG.model;
    let isFallback = false;

    try {
      // 4. Execute AI Generation with authoritative Hugging Face Qwen3-Coder provider (with Gemini fallback)
      const proposed = await runCodingAgent(
        body.prompt.trim(),
        selectProjectContext(
          currentFiles,
          body.activePath,
          body.selectedCode,
          body.previewError,
          body.mode,
          body.referenceImage,
          body.conversationHistory
        ),
        {
          aiConfig,
          onUsage: (u) => {
            tokenUsage = u;
          },
          onFallback: (fb) => {
            activeProvider = fb.providerId;
            usedModel = fb.model;
            isFallback = true;
          },
        }
      );

      const result = validateAgentResult(proposed, currentFiles);

      // Preflight the generation history record
      let generationId: string | null = null;
      try {
        const generation = await supabase
          .from('generation_history')
          .insert({
            project_id: projectId,
            user_id: user.id,
            prompt: body.prompt.trim(),
            model: usedModel,
            status: 'applying',
          })
          .select('id')
          .maybeSingle();

        if (generation.data) {
          generationId = generation.data.id;
        }
      } catch { }

      const serializedOperations = result.operations.map((op) =>
        op.type === 'create' || op.type === 'update'
          ? { ...op, language: op.language || inferLanguage(op.path) }
          : op
      );

      // Attempt RPC first, fallback to direct table updates
      let appliedViaRpc = false;
      const dbClient = privileged || supabase;

      try {
        const { error: rpcError } = await dbClient.rpc('apply_ai_generation', {
          p_project_id: projectId,
          p_operations: serializedOperations,
          p_dependencies: result.dependencies ?? [],
        });
        if (!rpcError) appliedViaRpc = true;
      } catch {
        appliedViaRpc = false;
      }

      if (!appliedViaRpc) {
        for (const op of serializedOperations) {
          if (op.type === 'create' || op.type === 'update') {
            const name = op.path.split('/').pop() || op.path;
            try {
              await dbClient.from('project_files').upsert(
                {
                  project_id: projectId,
                  path: op.path,
                  name,
                  content: op.content,
                  language: op.language || inferLanguage(op.path),
                  is_folder: false,
                },
                { onConflict: 'project_id,path' }
              );
            } catch { }
          } else if (op.type === 'delete') {
            try {
              await dbClient
                .from('project_files')
                .delete()
                .eq('project_id', projectId)
                .eq('path', op.path);
            } catch { }
          } else if (op.type === 'rename') {
            const name = op.newPath.split('/').pop() || op.newPath;
            try {
              await dbClient
                .from('project_files')
                .update({ path: op.newPath, name })
                .eq('project_id', projectId)
                .eq('path', op.path);
            } catch { }
          }
        }

        if (result.dependencies && result.dependencies.length > 0) {
          for (const dep of result.dependencies) {
            try {
              await dbClient.from('project_dependencies').upsert(
                {
                  project_id: projectId,
                  name: dep.name,
                  version: dep.version,
                },
                { onConflict: 'project_id,name' }
              );
            } catch { }
          }
        }
      }

      // Check if project name should be derived from first build prompt
      const isGenericName =
        !project.name ||
        ['Untitled Project', 'My AI Project', 'AI Studio Project'].includes(project.name.trim());
      const projectUpdates: { prompt?: string; name?: string; updated_at?: string } = {
        prompt: body.prompt.trim(),
      };
      if (isGenericName && body.prompt.trim()) {
        const derivedName = deriveProjectName(body.prompt.trim());
        if (derivedName) {
          projectUpdates.name = derivedName;
        }
      }

      try {
        await dbClient.from('projects').update(projectUpdates).eq('id', projectId);
      } catch { }

      if (generationId) {
        try {
          await dbClient
            .from('generation_history')
            .update({ status: 'completed' })
            .eq('id', generationId);
        } catch { }
      }

      // 5. Finalize Credit Consumption on Success
      if (!isByok && !isAdmin && effectiveCost > 0) {
        await finalizeCredit(supabase, user.id, true, effectiveCost);
        isCreditFinalized = true;
      }

      // 6. Record Real Token Usage with Credit Consumption Metric
      await trackAiUsage(dbClient, {
        userId: user.id,
        projectId,
        config: {
          ...aiConfig,
          providerId: activeProvider,
          model: usedModel,
        },
        operation,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens,
        success: true,
        creditUsed: (isByok || isAdmin) ? 0 : effectiveCost,
        latencyMs: Date.now() - startTime,
      });

      let updatedFiles: ProjectFile[] = [];
      try {
        const { data: dbFiles } = await dbClient
          .from('project_files')
          .select('*')
          .eq('project_id', projectId)
          .order('is_folder', { ascending: false })
          .order('path');
        if (dbFiles && dbFiles.length > 0) {
          updatedFiles = dbFiles;
        }
      } catch { }

      // If DB reload is empty, synthesize state from currentFiles + serializedOperations
      if (updatedFiles.length === 0) {
        const fileMap = new Map<string, ProjectFile>();
        for (const f of currentFiles) {
          fileMap.set(f.path, f);
        }
        for (const op of serializedOperations) {
          if (op.type === 'create' || op.type === 'update') {
            fileMap.set(op.path, {
              id: op.path,
              project_id: projectId,
              path: op.path,
              name: op.path.split('/').pop() || op.path,
              content: op.content,
              language: op.language || inferLanguage(op.path),
              is_folder: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          } else if (op.type === 'delete') {
            fileMap.delete(op.path);
          } else if (op.type === 'rename') {
            const old = fileMap.get(op.path);
            if (old) {
              fileMap.delete(op.path);
              fileMap.set(op.newPath, {
                ...old,
                path: op.newPath,
                name: op.newPath.split('/').pop() || op.newPath,
              });
            }
          }
        }
        updatedFiles = Array.from(fileMap.values());
      }

      const responsePayload: Record<string, unknown> = {
        summary: result.summary,
        plan: result.plan ?? [],
        operations: result.operations,
        files: updatedFiles,
        dependencies: result.dependencies ?? [],
        cleanupReport: result.cleanupReport,
        projectName: projectUpdates.name || project.name,
        usage: tokenUsage,
        creditCost: isAdmin ? 0 : effectiveCost,
        isAdmin,
      };

      // Only expose internal technical telemetry and provider routing to authorized platform administrators
      if (isAdmin) {
        responsePayload.provider = activeProvider;
        responsePayload.model = usedModel;
        responsePayload.isFallback = isFallback;
        responsePayload.keySource = aiConfig.keySource;
      }

      return NextResponse.json(responsePayload);
    } catch (operationError) {
      // 7. On Failure: Release Reserved Credit so user is NOT charged
      if (!isAdmin && !isCreditFinalized && effectiveCost > 0) {
        await finalizeCredit(supabase, user.id, false, effectiveCost);
        isCreditFinalized = true;
      }
      throw operationError;
    }
  } catch (error) {
    console.error('[Generate Route Error]:', error);
    let status = 500;
    let message = "We couldn't finish generating your changes. Your project is safe, and you can try again.";

    if (error instanceof HuggingFaceQuotaError || error instanceof GeminiQuotaError) {
      status = 429;
      message = "We're having trouble completing your request. Please try again shortly.";
    } else if (error instanceof HuggingFaceRateLimitError) {
      status = 429;
      message = "We're having trouble completing your request. Please try again shortly.";
    } else if (
      error instanceof HuggingFaceAuthError ||
      error instanceof HuggingFaceUnavailableError ||
      error instanceof GeminiUnavailableError
    ) {
      status = 503;
      message = 'Codatron AI is temporarily unavailable. Please try again in a moment.';
    } else if (error instanceof MalformedAIResponseError) {
      status = 422;
      message = "We couldn't finish generating your changes. Your project is safe, and you can try again.";
    } else if (error instanceof Error) {
      const rawMsg = error.message.toLowerCase();
      if (rawMsg.includes('quota') || rawMsg.includes('429') || rawMsg.includes('rate limit')) {
        status = 429;
        message = "We're having trouble completing your request. Please try again shortly.";
      } else if (
        rawMsg.includes('500') ||
        rawMsg.includes('502') ||
        rawMsg.includes('503') ||
        rawMsg.includes('504') ||
        rawMsg.includes('unavailable') ||
        rawMsg.includes('fetch failed') ||
        rawMsg.includes('network')
      ) {
        status = 503;
        message = 'Codatron AI is temporarily unavailable. Please try again in a moment.';
      } else if (rawMsg.includes('credit') || rawMsg.includes('limit')) {
        status = 402;
        message = "You've reached your current AI usage limit. Upgrade your plan to continue building.";
      }
    }

    // Record structured error in admin telemetry asynchronously for Admin Diagnostics
    const finalStatus = typeof status === 'number' && status >= 400 && status < 600 ? status : 500;
    const severity = finalStatus === 429 ? 'WARNING' : finalStatus >= 500 ? 'ERROR' : 'INFO';
    const errorCategory = finalStatus === 429 ? 'RATE_LIMIT' : finalStatus === 401 || finalStatus === 403 ? 'AUTH' : 'AI_PROVIDER';

    const errorProvider =
      error instanceof HuggingFaceQuotaError ||
      error instanceof HuggingFaceAuthError ||
      error instanceof HuggingFaceRateLimitError ||
      error instanceof HuggingFaceUnavailableError
        ? 'huggingface'
        : error instanceof GeminiQuotaError || error instanceof GeminiUnavailableError
          ? 'google-gemini'
          : 'ai-gateway';

    const referenceId = generateErrorReferenceId();

    logSystemError({
      severity,
      category: errorCategory,
      provider: errorProvider,
      statusCode: finalStatus,
      message: error instanceof Error ? error.message : String(error), // Full technical message stored for Admin Diagnostics
      projectId,
      userId: currentUserId,
      userEmail: currentUserEmail,
      referenceId,
      operation: 'ai_generation',
      route: `/api/projects/${projectId}/generate`,
      stackTrace: error instanceof Error ? error.stack : undefined,
    }).catch(() => { });

    logProviderEvent({
      provider: errorProvider,
      status: finalStatus === 429 ? 'degraded' : finalStatus >= 500 ? 'unavailable' : 'degraded',
      eventType: finalStatus === 429 ? 'rate_limit' : 'request_error',
      statusCode: finalStatus,
      message: error instanceof Error ? error.message : String(error),
    }).catch(() => { });

    return NextResponse.json(
      {
        message,
        status: finalStatus,
        referenceId,
        ...(isAdmin ? { debugMessage: error instanceof Error ? error.message : String(error) } : {}),
      },
      { status: finalStatus }
    );
  }
}

function deriveProjectName(prompt: string): string | null {
  const cleaned = prompt.replace(/^(create|build|make|generate|start|design)\s+(a|an|the)?\s*/i, '').trim();
  if (!cleaned) return null;
  const firstSentence = cleaned.split(/[.\n]/)[0].trim();
  const words = firstSentence.split(/\s+/).slice(0, 4);
  if (words.length === 0) return null;
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function inferLanguage(path: string) {
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.jsx') || path.endsWith('.js') || path.endsWith('.mjs')) return 'javascript';
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.java')) return 'java';
  if (path.endsWith('.cpp') || path.endsWith('.cc') || path.endsWith('.cxx') || path.endsWith('.h') || path.endsWith('.hpp')) return 'cpp';
  if (path.endsWith('.c')) return 'c';
  if (path.endsWith('.go')) return 'go';
  if (path.endsWith('.rs')) return 'rust';
  if (path.endsWith('.css') || path.endsWith('.scss')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.html') || path.endsWith('.htm')) return 'html';
  if (path.endsWith('.md') || path.endsWith('.markdown')) return 'markdown';
  if (path.endsWith('.sql')) return 'sql';
  return 'plaintext';
}