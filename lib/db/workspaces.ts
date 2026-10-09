import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Project } from '../types/database';
import type { ProductPlan } from '../ai/product-planner';
import { updateProject } from './projects';
import { saveProductPlanToDb } from './product';

export interface WorkspaceMetadata {
  developerName?: string;
  productName?: string;
  [key: string]: unknown;
}

/**
 * Safely parse workspace metadata from project.prompt or serialized JSON
 */
export function parseWorkspaceMetadata(promptText?: string | null): WorkspaceMetadata {
  if (!promptText || typeof promptText !== 'string') return {};
  try {
    const trimmed = promptText.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return parsed as WorkspaceMetadata;
      }
    }
  } catch {
    // If promptText is a plain text prompt, treat it gracefully
  }
  return {};
}

/**
 * Serialize workspace metadata updates into prompt JSON while preserving existing properties/text
 */
export function serializeWorkspaceMetadata(
  existingPrompt: string | null | undefined,
  updates: Partial<WorkspaceMetadata>
): string {
  const current = parseWorkspaceMetadata(existingPrompt);
  const merged: WorkspaceMetadata = {
    ...current,
    ...updates,
  };
  return JSON.stringify(merged);
}

/**
 * Get the isolated Developer workspace display name.
 * Priority:
 * 1. Authoritative: project.name (canonical developer project name)
 * 2. Fallback
 */
export function getDeveloperWorkspaceName(project: Project | null | undefined): string {
  if (!project) return 'Untitled Project';
  return project.name || 'Untitled Project';
}

/**
 * Get the isolated Product Manager workspace display name.
 * Independence rule:
 * 1. ProductPlan vision.workspaceName (authoritative database value)
 * 2. localStorage cached product name for this project ID
 * 3. Fallback prompt metadata if previously migrated
 * 4. One-time initial copy from project.name (immediately cached so future developer renames never affect it)
 */
export function getProductWorkspaceName(
  project: Project | null | undefined,
  productPlan?: ProductPlan | null | undefined
): string {
  // 1. Check ProductPlan vision or root property
  if (productPlan) {
    const vision = productPlan.vision as (ProductPlan['vision'] & { workspaceName?: string }) | undefined;
    if (vision?.workspaceName && typeof vision.workspaceName === 'string' && vision.workspaceName.trim()) {
      const trimmed = vision.workspaceName.trim();
      if (trimmed.toLowerCase() !== 'netflix') {
        return trimmed;
      }
    }
    const rootName = (productPlan as unknown as { workspaceName?: string }).workspaceName;
    if (rootName && typeof rootName === 'string' && rootName.trim()) {
      const trimmed = rootName.trim();
      if (trimmed.toLowerCase() !== 'netflix') {
        return trimmed;
      }
    }
  }

  // 2. Check localStorage client cache for this specific project ID
  if (project?.id && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(`codatron_product_name_${project.id}`);
      if (cached && typeof cached === 'string' && cached.trim()) {
        const trimmed = cached.trim();
        if (trimmed.toLowerCase() === 'netflix') {
          localStorage.removeItem(`codatron_product_name_${project.id}`);
        } else {
          return trimmed;
        }
      }
    } catch { }
  }

  // 3. Check project prompt metadata if previously stored
  if (project?.prompt) {
    const meta = parseWorkspaceMetadata(project.prompt);
    if (meta.productName && typeof meta.productName === 'string' && meta.productName.trim()) {
      const trimmed = meta.productName.trim();
      if (trimmed.toLowerCase() !== 'netflix') {
        return trimmed;
      }
    }
  }

  // 4. Default to neutral presentation label: NEVER inherit project.name from Developer IDE
  return 'Untitled Product Plan';
}

/**
 * Rename Developer Workspace:
 * Updates ONLY developer workspace / project name without modifying Product Manager workspace.
 */
export async function renameDeveloperWorkspace(
  supabase: SupabaseClient<Database>,
  project: Project,
  newName: string
): Promise<{ success: boolean; updatedProject?: Project; error?: Error }> {
  const trimmed = newName.trim();
  if (!trimmed) return { success: false, error: new Error('Workspace name cannot be empty') };

  if (project.id === 'local-project') {
    return {
      success: true,
      updatedProject: {
        ...project,
        name: trimmed,
      },
    };
  }

  const res = await updateProject(supabase, project.id, { name: trimmed });
  if (res.error) {
    return { success: false, error: res.error };
  }

  return {
    success: true,
    updatedProject: res.data || { ...project, name: trimmed },
  };
}

/**
 * Rename Product Workspace:
 * Updates ONLY product plan vision.workspaceName without modifying Developer project.name.
 */
export async function renameProductWorkspace(
  supabase: SupabaseClient<Database>,
  project: Project,
  productPlan: ProductPlan | null | undefined,
  newName: string
): Promise<{ success: boolean; updatedProject?: Project; updatedPlan?: ProductPlan; error?: Error }> {
  const trimmed = newName.trim();
  if (!trimmed) return { success: false, error: new Error('Workspace name cannot be empty') };

  // 1. Immediately cache in localStorage so renders are instant
  if (typeof window !== 'undefined' && project.id) {
    try {
      localStorage.setItem(`codatron_product_name_${project.id}`, trimmed);
    } catch { }
  }

  // 2. Build updated ProductPlan with new workspaceName
  const currentPlan: ProductPlan = productPlan || {
    overview: { summary: '', targetAudience: '', keyDifferentiator: '' },
    vision: { purpose: '', valueProposition: '', targetOutcome: '', workspaceName: trimmed },
    personas: [],
    mvp: { mustHave: [], exclusions: [] },
    features: [],
    userStories: [],
    acceptanceCriteria: [],
    roadmap: [],
    developmentTasks: [],
    requirements: { functional: [], nonFunctional: [] },
    research: { marketAnalysis: '', competitiveBenchmarks: [], userInsights: [] },
  };

  const updatedPlan: ProductPlan = {
    ...currentPlan,
    vision: {
      ...currentPlan.vision,
      workspaceName: trimmed,
    },
  };

  // 3. Persist to Supabase product_plans (completely independent from projects.name)
  if (project.id !== 'local-project') {
    await saveProductPlanToDb(supabase, project.id, updatedPlan);
  } else {
    try {
      localStorage.setItem(`codatron_plan_${project.id}`, JSON.stringify(updatedPlan));
    } catch { }
  }

  return {
    success: true,
    updatedProject: project, // Developer project is completely unchanged!
    updatedPlan,
  };
}
