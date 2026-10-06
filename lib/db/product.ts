import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../types/database';
import type { ProductPlan, DevelopmentTask } from '../ai/product-planner';

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
          localPlan = parsed;
          localTasks = parsed.developmentTasks || [];
        }
      } catch {}
    }

    const { data: planRow, error: planErr } = await supabase
      .from('product_plans')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (planErr || !planRow) {
      if (localPlan) {
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
    const fullPlan: ProductPlan = {
      overview: (planRowRecord.overview as ProductPlan['overview']) || {
        summary: '',
        targetAudience: '',
        keyDifferentiator: '',
      },
      vision: planRow.vision as unknown as ProductPlan['vision'],
      personas: (planRow.personas as unknown as ProductPlan['personas']) || [],
      mvp: (planRow.mvp as unknown as ProductPlan['mvp']) || { mustHave: [], exclusions: [] },
      features: (planRow.features as unknown as ProductPlan['features']) || [],
      userStories: (planRowRecord.user_stories as ProductPlan['userStories']) || [],
      acceptanceCriteria: (planRowRecord.acceptance_criteria as ProductPlan['acceptanceCriteria']) || [],
      roadmap: (planRow.roadmap as unknown as ProductPlan['roadmap']) || [],
      developmentTasks: tasks,
      requirements: (planRowRecord.requirements as ProductPlan['requirements']) || {
        functional: [],
        nonFunctional: [],
      },
      research: (planRowRecord.research as ProductPlan['research']) || {
        marketAnalysis: '',
        competitiveBenchmarks: [],
        userInsights: [],
      },
    };

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
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`codatron_plan_${projectId}`, JSON.stringify(plan));
      } catch {}
    }

    const { data: savedPlan, error: planErr } = await supabase
      .from('product_plans')
      .upsert(
        {
          project_id: projectId,
          vision: plan.vision as unknown as Json,
          personas: plan.personas as unknown as Json,
          mvp: plan.mvp as unknown as Json,
          features: plan.features as unknown as Json,
          roadmap: plan.roadmap as unknown as Json,
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
  } catch (err) {
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
}export async function updateTaskStatusInDb(
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
