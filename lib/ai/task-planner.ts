
import { DEFAULT_GEMINI_MODEL, GeminiUnavailableError } from './coding-agent';
import type { DevelopmentTask } from './product-planner';
import type { ProjectFile } from '@/lib/types/database';

export interface TechnicalImplementationPlan {
  architectureOverview: string;
  filesToCreate: string[];
  filesToUpdate: string[];
  technicalSteps: string[];
  codingAgentPrompt: string;
}

/**
 * Technical Planner / Architect Agent.
 * Bridges high-level Product Manager development tasks into concrete,
 * architected technical specifications and instructions for the Coding Agent.
 */
export interface TaskPlannerOptions {
  aiConfig?: { apiKey: string; model?: string; providerId?: string; keySource?: string };
  onUsage?: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void;
}

export async function planTechnicalTask(
  task: DevelopmentTask,
  existingFiles: ProjectFile[],
  options?: TaskPlannerOptions
): Promise<TechnicalImplementationPlan> {
  const key = options?.aiConfig?.apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('Gemini is not configured. Add GEMINI_API_KEY to .env or add your personal API key in Profile.');
  const rawModel = options?.aiConfig?.model?.trim() || process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const model =
    !rawModel ||
      rawModel === 'gemini-1.5-flash' ||
      rawModel === 'gemini-1.5-pro' ||
      rawModel === 'gemini-2.5-flash' ||
      rawModel === 'gemini-2.5-flash-lite' ||
      rawModel === 'gemini-3.6-flash' ||
      rawModel.includes('Qwen') ||
      !rawModel.startsWith('gemini-')
      ? 'gemini-flash-latest'
      : rawModel;

  const fileTree = existingFiles.map((f) => f.path);
  const affected = task.affectedFiles || [];
  const relevantFiles = existingFiles
    .filter((f) => !f.is_folder && (affected.includes(f.path) || f.path === 'app/page.tsx' || f.path.startsWith('components/')))
    .slice(0, 8)
    .map((f) => ({ path: f.path, content: f.content.slice(0, 6000) }));

  const system = `You are an elite Principal Software Architect for Next.js and React applications.
Your job is to take a Product Development Task and translate it into a concrete, rigorous Technical Implementation Plan for a Coding Agent.

You must:
1. Deconstruct the feature into modular, maintainable Next.js/React components and utilities.
2. Identify all new files that must be CREATED (e.g. distinct UI components, data utilities, hooks).
3. Identify existing files that must be UPDATED (e.g. app/page.tsx, components/navbar.tsx) to integrate the new feature.
4. Formulate an exhaustive, highly specific "codingAgentPrompt" that instructs the Coding Agent on exact component props, Tailwind styling, Lucide icons, state management, and assembly so that it generates all required modular files.

Return ONLY JSON matching this schema:
{
  "architectureOverview": "string",
  "filesToCreate": ["string"],
  "filesToUpdate": ["string"],
  "technicalSteps": ["string"],
  "codingAgentPrompt": "Comprehensive prompt detailing components to create, exact props, styling, logic, and how to assemble them in the page"
}`;

  const userContent = JSON.stringify({
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      category: task.category,
      affectedFiles: task.affectedFiles,
      acceptanceCriteria: task.acceptanceCriteria,
    },
    projectContext: {
      allFiles: fileTree,
      relevantSnippets: relevantFiles,
    },
  });

  const candidateModels = [
    model,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-flash-latest',
  ].filter((m, idx, self) => Boolean(m) && self.indexOf(m) === idx);

  let rawText = '';

  for (const candidateModel of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent`;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body,
      });

      if (!response.ok) {
        console.warn(`[Task Planner] Model "${candidateModel}" returned HTTP ${response.status}. Trying next model...`);
        continue;
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: {
          candidatesTokenCount?: number;
          promptTokenCount?: number;
          totalTokenCount?: number;
        };
      };

      if (options?.onUsage && payload.usageMetadata) {
        const inputTokens = payload.usageMetadata.promptTokenCount ?? 0;
        const outputTokens = payload.usageMetadata.candidatesTokenCount ?? 0;
        const totalTokens = payload.usageMetadata.totalTokenCount ?? (inputTokens + outputTokens);
        options.onUsage({ inputTokens, outputTokens, totalTokens });
      }

      const candidateText = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (candidateText) {
        rawText = candidateText;
        break;
      }
    } catch (err) {
      console.warn(`[Task Planner] Model "${candidateModel}" error:`, err);
    }
  }

  // If Gemini models all failed, attempt transfer to Hugging Face
  if (!rawText) {
    const hfToken = process.env.HF_TOKEN?.trim();
    if (hfToken) {
      try {
        console.log('[Task Planner] Transferring to Hugging Face API...');
        const { HfInference } = await import('@huggingface/inference');
        const hf = new HfInference(hfToken);
        const hfRes = await hf.chatCompletion({
          model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userContent },
          ],
          temperature: 0.2,
          max_tokens: 4096,
        });
        rawText = hfRes.choices?.[0]?.message?.content?.trim() || '';
      } catch (hfErr) {
        console.warn('[Task Planner] Hugging Face transfer failed:', hfErr);
      }
    }
  }

  let text = rawText;
  if (text.startsWith('```')) {
    const match = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
    text = match ? match[1].trim() : text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  try {
    const parsed = JSON.parse(text) as TechnicalImplementationPlan;
    return parsed;
  } catch {
    return {
      architectureOverview: `Implementation plan for ${task.title}`,
      filesToCreate: task.affectedFiles.filter((p) => !fileTree.includes(p)),
      filesToUpdate: task.affectedFiles.filter((p) => fileTree.includes(p)),
      technicalSteps: task.acceptanceCriteria,
      codingAgentPrompt: `Build feature: ${task.title}\n\nDescription: ${task.description}\n\nAffected files: ${task.affectedFiles.join(', ')}\n\nAcceptance criteria:\n${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`,
    };
  }
}
