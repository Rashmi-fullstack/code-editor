import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
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
import type { ProjectFile } from '@/lib/types/database';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      prompt?: string;
      mode?: 'build' | 'code' | 'debug';
      activePath?: string;
      selectedCode?: string;
      previewError?: string;
      files?: ProjectFile[];
      referenceImage?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
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
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { message: 'Authentication required to use AI generation.' },
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

    // Resolve active AI Configuration (prioritizes BYOK personal key, then platform Qwen3-Coder)
    const aiConfig = await resolveAIConfig(supabase, user.id, 'developer');
    const isByok = aiConfig.keySource === 'byok';

    // 3. Server-Side Atomic Credit Check & Reservation (for platform shared keys)
    if (!isByok) {
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
    }

    const { data: files, error: filesError } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .order('path');

    if (filesError) {
      if (!isByok) await finalizeCredit(supabase, user.id, false);
      throw new Error(filesError.message);
    }

    const currentFiles = files ?? [];
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
        .single();

      if (generation.error || !generation.data) {
        throw new Error(generation.error?.message || 'Could not create generation record.');
      }

      const serializedOperations = result.operations.map((op) =>
        op.type === 'create' || op.type === 'update'
          ? { ...op, language: op.language || inferLanguage(op.path) }
          : op
      );

      // Attempt RPC first, fallback to direct table updates
      let appliedViaRpc = false;
      try {
        const { error: rpcError } = await supabase.rpc('apply_ai_generation', {
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
            await supabase.from('project_files').upsert(
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
          } else if (op.type === 'delete') {
            await supabase
              .from('project_files')
              .delete()
              .eq('project_id', projectId)
              .eq('path', op.path);
          } else if (op.type === 'rename') {
            const name = op.newPath.split('/').pop() || op.newPath;
            await supabase
              .from('project_files')
              .update({ path: op.newPath, name })
              .eq('project_id', projectId)
              .eq('path', op.path);
          }
        }

        if (result.dependencies && result.dependencies.length > 0) {
          for (const dep of result.dependencies) {
            await supabase.from('project_dependencies').upsert(
              {
                project_id: projectId,
                name: dep.name,
                version: dep.version,
              },
              { onConflict: 'project_id,name' }
            );
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

      await supabase.from('projects').update(projectUpdates).eq('id', projectId);
      await supabase
        .from('generation_history')
        .update({ status: 'completed' })
        .eq('id', generation.data.id);

      // 5. Finalize Credit Consumption on Success
      if (!isByok) {
        await finalizeCredit(supabase, user.id, true);
        isCreditFinalized = true;
      }

      // 6. Record Real Token Usage with Credit Consumption Metric
      await trackAiUsage(supabase, {
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
        creditUsed: isByok ? 0 : 1,
        latencyMs: Date.now() - startTime,
      });

      const { data: updatedFiles, error: reloadError } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('is_folder', { ascending: false })
        .order('path');

      if (reloadError) throw new Error(reloadError.message);

      return NextResponse.json({
        summary: result.summary,
        plan: result.plan ?? [],
        operations: result.operations,
        files: updatedFiles,
        dependencies: result.dependencies ?? [],
        cleanupReport: result.cleanupReport,
        projectName: projectUpdates.name || project.name,
        keySource: aiConfig.keySource,
        usage: tokenUsage,
        provider: activeProvider,
        model: usedModel,
        isFallback,
      });
    } catch (operationError) {
      // 7. On Failure: Release Reserved Credit so user is NOT charged
      if (!isByok && !isCreditFinalized) {
        await finalizeCredit(supabase, user.id, false);
        isCreditFinalized = true;
      }
      throw operationError;
    }
  } catch (error) {
    console.error('[Generate Route Error]:', error);
    let status = 500;
    let message = 'Generation failed.';

    if (error instanceof HuggingFaceQuotaError) {
      status = 402;
      message = 'Hugging Face API credits or balance is insufficient. Please check billing or token settings.';
    } else if (error instanceof HuggingFaceAuthError) {
      status = 401;
      message = 'Hugging Face API authentication failed. Check the server-side HF_TOKEN configuration.';
    } else if (error instanceof HuggingFaceRateLimitError) {
      status = 429;
      message = 'Hugging Face API rate limit reached. Please retry shortly.';
    } else if (error instanceof HuggingFaceUnavailableError) {
      status = 503;
      message = 'Hugging Face Inference Provider is temporarily unavailable. Please retry.';
    } else if (error instanceof GeminiQuotaError) {
      status = 429;
      message = 'Gemini API quota has been exceeded for the configured API key/project.';
    } else if (error instanceof GeminiUnavailableError) {
      status = 503;
      message = 'Gemini fallback service is temporarily unavailable. Please retry.';
    } else if (error instanceof MalformedAIResponseError) {
      status = 422;
      message = 'AI returned an invalid project response. Retrying with a safer generation format.';
    } else if (error instanceof Error) {
      const rawMsg = error.message;
      if (
        rawMsg.includes('402') ||
        rawMsg.toLowerCase().includes('balance') ||
        rawMsg.toLowerCase().includes('insufficient')
      ) {
        status = 402;
        message = 'AI service credits or balance is insufficient. Please check billing or token settings.';
      } else if (
        rawMsg.includes('401') ||
        rawMsg.toLowerCase().includes('authentication')
      ) {
        status = 401;
        message = 'AI service authentication failed. Check server-side API key configuration.';
      } else if (rawMsg.includes('429')) {
        status = 429;
        message = 'AI service rate limit reached. Please retry shortly.';
      } else if (
        rawMsg.includes('500') ||
        rawMsg.includes('502') ||
        rawMsg.includes('503') ||
        rawMsg.includes('504') ||
        rawMsg.toLowerCase().includes('unavailable')
      ) {
        status = 503;
        message = 'AI service is temporarily unavailable. Please retry.';
      } else if (
        rawMsg.toLowerCase().includes('token limit') ||
        rawMsg.toLowerCase().includes('incomplete structured response')
      ) {
        status = 422;
        message = 'AI returned an invalid project response. Retrying with a safer generation format.';
      } else {
        // Strip raw JSON and request IDs from error message
        const cleaned = rawMsg
          .replace(/\{"error":\{.*\}\}/g, '')
          .replace(/\(request_id:[^)]+\)/g, '')
          .trim();
        message = cleaned || 'Generation failed.';
      }
    }

    return NextResponse.json(
      { message, error: message },
      { status: typeof status === 'number' && status >= 400 && status < 600 ? status : 500 }
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