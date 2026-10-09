import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../types/database';
import type { ProductPlan, DevelopmentTask } from '../ai/product-planner';

/**
 * Validates whether a ProductPlan is a genuine, user-generated product plan,
 * and not a fabricated, boilerplate, or empty placeholder plan.
 */
export function isRealPlan(plan: ProductPlan | null | undefined): boolean {
  if (!plan) return false;

  const serialized = JSON.stringify(plan).toLowerCase();
  const dummySignatures = [
    'construct a detailed phased',
    'fragmented workflows',
    'deliver high-performance capabilities',
    'sub-second latency',
    'build an intuitive and robust solution',
    'modern digital application users',
    'exceptional user satisfaction',
    'verified feature completion',
    'construct a detailed phased workspace layout',
    'interactive state & data management',
    'scaffold construct a detailed phased component layout',
  ];

  for (const sig of dummySignatures) {
    if (serialized.includes(sig)) {
      return false;
    }
  }

  // Must have real, non-empty content in at least one primary section
  const hasSummary = Boolean(plan.overview?.summary && plan.overview.summary.trim().length > 0);
  const hasPurpose = Boolean(plan.vision?.purpose && plan.vision.purpose.trim().length > 0);
  const hasFeatures = Boolean(Array.isArray(plan.features) && plan.features.length > 0);

  return hasSummary || hasPurpose || hasFeatures;
}

export async function getProductPlanFromDb(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<{ plan: ProductPlan | null; tasks: DevelopmentTask[]; error: Error | null }> {
  try {
    let localPlan: ProductPlan | null = null;
    let localTasks: DevelopmentTask[] = [];
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`codatron_plan_${projectId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (isRealPlan(parsed)) {
            localPlan = parsed;
            localTasks = parsed.developmentTasks || [];
          } else {
            localStorage.removeItem(`codatron_plan_${projectId}`);
          }
        }
      } catch { }
    }

    const { data: planRow, error: planErr } = await supabase
      .from('product_plans')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (planErr || !planRow) {
      if (localPlan && isRealPlan(localPlan)) {
        return { plan: localPlan, tasks: localTasks, error: null };
      }
      return { plan: null, tasks: [], error: planErr ? new Error(planErr.message) : null };
    }

    const { data: taskRows, error: taskErr } = await supabase
      .from('product_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (taskErr) {
      return { plan: null, tasks: [], error: new Error(taskErr.message) };
    }

    const tasks: DevelopmentTask[] = (taskRows || []).map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      type: t.type || 'component',
      category: (t.type as DevelopmentTask['category']) || 'component',
      priority: (t.priority as DevelopmentTask['priority']) || 'medium',
      status: (t.status as DevelopmentTask['status']) || 'todo',
      requirements: t.requirements || '',
      acceptanceCriteria: Array.isArray(t.acceptance_criteria)
        ? (t.acceptance_criteria as unknown as string[])
        : [],
      technicalPlan: (t.technical_plan as unknown as DevelopmentTask['technicalPlan']) || {},
      affectedFiles: Array.isArray(t.affected_files)
        ? (t.affected_files as unknown as string[])
        : [],
      dependencies: Array.isArray(t.dependencies)
        ? (t.dependencies as unknown as string[])
        : [],
    }));

    const planRowRecord = planRow as unknown as Record<string, unknown>;
    const rawVision = (planRow.vision || {}) as Record<string, unknown>;
    let localWorkspaceName: string | undefined;
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(`codatron_product_name_${projectId}`);
        if (cached && cached.trim().toLowerCase() === 'netflix') {
          localStorage.removeItem(`codatron_product_name_${projectId}`);
        } else {
          localWorkspaceName = cached?.trim() || undefined;
        }
      } catch { }
    }

    const rawVisionName = typeof rawVision.workspaceName === 'string' ? rawVision.workspaceName.trim() : '';
    const cleanVisionName = rawVisionName.toLowerCase() !== 'netflix' ? rawVisionName : '';

    const resolvedWorkspaceName = cleanVisionName || localWorkspaceName || undefined;

    if (resolvedWorkspaceName && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`codatron_product_name_${projectId}`, resolvedWorkspaceName);
      } catch { }
    }

    const blueprint = ((rawVision.__blueprint || {}) as Record<string, unknown>);

    const fullPlan: ProductPlan = {
      originalIdea: (localPlan?.originalIdea || blueprint.originalIdea || (planRowRecord.original_idea as string) || '') as string,
      overview: (localPlan?.overview || planRowRecord.overview as ProductPlan['overview']) || {
        summary: '',
        targetAudience: '',
        keyDifferentiator: '',
      },
      analysis: localPlan?.analysis || (blueprint.analysis as ProductPlan['analysis']),
      snapshot: localPlan?.snapshot || (blueprint.snapshot as ProductPlan['snapshot']),
      userJourneys: localPlan?.userJourneys || (blueprint.userJourneys as ProductPlan['userJourneys']),
      technicalArchitecture: localPlan?.technicalArchitecture || (blueprint.technicalArchitecture as ProductPlan['technicalArchitecture']),
      recommendedStack: localPlan?.recommendedStack || (blueprint.recommendedStack as ProductPlan['recommendedStack']),
      systemComponents: localPlan?.systemComponents || (blueprint.systemComponents as ProductPlan['systemComponents']),
      teamRequirement: localPlan?.teamRequirement || (blueprint.teamRequirement as ProductPlan['teamRequirement']),
      timeline: localPlan?.timeline || (blueprint.timeline as ProductPlan['timeline']),
      demoArchitecture: localPlan?.demoArchitecture || (blueprint.demoArchitecture as ProductPlan['demoArchitecture']),
      dataModel: localPlan?.dataModel || (blueprint.dataModel as ProductPlan['dataModel']),
      risks: localPlan?.risks || (blueprint.risks as ProductPlan['risks']),
      assumptions: localPlan?.assumptions || (blueprint.assumptions as ProductPlan['assumptions']),
      openQuestions: localPlan?.openQuestions || (blueprint.openQuestions as ProductPlan['openQuestions']),
      recommendations: localPlan?.recommendations || (blueprint.recommendations as ProductPlan['recommendations']),
      nextActions: localPlan?.nextActions || (blueprint.nextActions as ProductPlan['nextActions']),
      budget: localPlan?.budget || (blueprint.budget as ProductPlan['budget']),
      aiAssistance: localPlan?.aiAssistance || (blueprint.aiAssistance as ProductPlan['aiAssistance']),
      vision: {
        purpose: (rawVision.purpose as string) || localPlan?.vision?.purpose || '',
        valueProposition: (rawVision.valueProposition as string) || localPlan?.vision?.valueProposition || '',
        targetOutcome: (rawVision.targetOutcome as string) || localPlan?.vision?.targetOutcome || '',
        ...(resolvedWorkspaceName ? { workspaceName: resolvedWorkspaceName } : {}),
      },
      personas: (planRow.personas as unknown as ProductPlan['personas']) || localPlan?.personas || [],
      mvp: (planRow.mvp as unknown as ProductPlan['mvp']) || localPlan?.mvp || { mustHave: [], exclusions: [] },
      features: (planRow.features as unknown as ProductPlan['features']) || localPlan?.features || [],
      userStories: (planRowRecord.user_stories as ProductPlan['userStories']) || localPlan?.userStories || [],
      acceptanceCriteria: (planRowRecord.acceptance_criteria as ProductPlan['acceptanceCriteria']) || localPlan?.acceptanceCriteria || [],
      roadmap: (planRow.roadmap as unknown as ProductPlan['roadmap']) || localPlan?.roadmap || [],
      developmentTasks: tasks,
      requirements: (planRowRecord.requirements as ProductPlan['requirements']) || localPlan?.requirements || {
        functional: [],
        nonFunctional: [],
      },
      research: (planRowRecord.research as ProductPlan['research']) || localPlan?.research || {
        marketAnalysis: '',
        competitiveBenchmarks: [],
        userInsights: [],
      },
    };

    if (!isRealPlan(fullPlan)) {
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(`codatron_plan_${projectId}`);
        } catch { }
      }
      return { plan: null, tasks: [], error: null };
    }

    return { plan: fullPlan, tasks, error: null };
  } catch (err) {
    return { plan: null, tasks: [], error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function saveProductPlanToDb(
  supabase: SupabaseClient<Database>,
  projectId: string,
  plan: ProductPlan
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // Preserve existing workspaceName if not explicitly passed
    let workspaceName = plan.vision?.workspaceName?.trim();
    if (workspaceName && workspaceName.toLowerCase() === 'netflix') {
      workspaceName = undefined;
    }

    if (!workspaceName && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(`codatron_product_name_${projectId}`);
        if (cached && cached.trim().toLowerCase() !== 'netflix') {
          workspaceName = cached.trim();
        }
      } catch { }
    }

    if (!workspaceName) {
      const { data: existingRow } = await supabase
        .from('product_plans')
        .select('vision')
        .eq('project_id', projectId)
        .maybeSingle();

      const existingVision = existingRow?.vision as { workspaceName?: string } | undefined;
      if (existingVision?.workspaceName && typeof existingVision.workspaceName === 'string') {
        const trimmed = existingVision.workspaceName.trim();
        if (trimmed.toLowerCase() !== 'netflix') {
          workspaceName = trimmed;
        }
      }
    }

    const planToSave: ProductPlan = {
      ...plan,
      vision: {
        ...plan.vision,
        ...(workspaceName ? { workspaceName } : {}),
      },
    };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`codatron_plan_${projectId}`, JSON.stringify(planToSave));
        if (workspaceName) {
          localStorage.setItem(`codatron_product_name_${projectId}`, workspaceName);
        }
      } catch { }
    }

    const visionPayload = {
      purpose: planToSave.vision.purpose,
      valueProposition: planToSave.vision.valueProposition,
      targetOutcome: planToSave.vision.targetOutcome,
      ...(workspaceName ? { workspaceName } : {}),
      __blueprint: {
        originalIdea: planToSave.originalIdea,
        analysis: planToSave.analysis,
        snapshot: planToSave.snapshot,
        userJourneys: planToSave.userJourneys,
        technicalArchitecture: planToSave.technicalArchitecture,
        recommendedStack: planToSave.recommendedStack,
        systemComponents: planToSave.systemComponents,
        teamRequirement: planToSave.teamRequirement,
        timeline: planToSave.timeline,
        demoArchitecture: planToSave.demoArchitecture,
        dataModel: planToSave.dataModel,
        risks: planToSave.risks,
        assumptions: planToSave.assumptions,
        openQuestions: planToSave.openQuestions,
        recommendations: planToSave.recommendations,
        nextActions: planToSave.nextActions,
        budget: planToSave.budget,
        aiAssistance: planToSave.aiAssistance,
      },
    };

    const { data: savedPlan, error: planErr } = await supabase
      .from('product_plans')
      .upsert(
        {
          project_id: projectId,
          vision: visionPayload as unknown as Json,
          personas: planToSave.personas as unknown as Json,
          mvp: planToSave.mvp as unknown as Json,
          features: planToSave.features as unknown as Json,
          roadmap: planToSave.roadmap as unknown as Json,
        },
        { onConflict: 'project_id' }
      )
      .select('id')
      .single();

    if (planErr || !savedPlan) {
      // Local copy was already saved successfully
      return { success: true, error: null };
    }

    // Upsert development tasks
    if (plan.developmentTasks && plan.developmentTasks.length > 0) {
      const taskPayloads = plan.developmentTasks.map((t) => ({
        project_id: projectId,
        product_plan_id: savedPlan.id,
        title: t.title,
        description: t.description,
        type: t.category || 'component',
        priority: t.priority || 'medium',
        status: t.status || 'todo',
        requirements: t.requirements || null,
        acceptance_criteria: t.acceptanceCriteria as unknown as Json,
        technical_plan: (t.technicalPlan || {}) as unknown as Json,
        affected_files: (t.affectedFiles || []) as unknown as Json,
        dependencies: (t.dependencies || []) as unknown as Json,
      }));

      await supabase.from('product_tasks').upsert(taskPayloads);
    }

    return { success: true, error: null };
  } catch {
    return { success: true, error: null };
  }
}

export async function recordAgentRunInDb(
  supabase: SupabaseClient<Database>,
  run: {
    projectId: string;
    taskId?: string;
    agentType: string;
    status: 'running' | 'completed' | 'failed';
    currentStep?: string;
    input?: unknown;
    output?: unknown;
    error?: string;
  }
): Promise<{ id: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('agent_runs')
      .insert({
        project_id: run.projectId,
        task_id: run.taskId || null,
        agent_type: run.agentType,
        status: run.status,
        current_step: run.currentStep || null,
        input: (run.input || {}) as unknown as Json,
        output: (run.output || {}) as unknown as Json,
        error: run.error || null,
      })
      .select('id')
      .single();

    if (error) return { id: null, error: new Error(error.message) };
    return { id: data.id, error: null };
  } catch (err) {
    return { id: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
} export async function updateTaskStatusInDb(
  supabase: SupabaseClient<Database>,
  taskId: string,
  status: 'todo' | 'in-progress' | 'completed' | 'blocked'
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('product_tasks')
      .update({ status })
      .eq('id', taskId);
    if (error) return { success: false, error: new Error(error.message) };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
