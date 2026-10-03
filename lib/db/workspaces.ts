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
 * 1. developerName in project metadata
 * 2. global project.name
 * 3. Default fallback
 */
export function getDeveloperWorkspaceName(project: Project | null | undefined): string {
  if (!project) return 'Untitled Project';
  const meta = parseWorkspaceMetadata(project.prompt);
  if (meta.developerName && typeof meta.developerName === 'string' && meta.developerName.trim()) {
    return meta.developerName.trim();
  }
  return project.name || 'Untitled Project';
}

/**
 * Get the isolated Product Manager workspace display name.
 * Priority:
 * 1. productPlan.vision.workspaceName or productPlan.workspaceName
 * 2. productName in project metadata
 * 3. global project.name
 * 4. Default fallback
 */
export function getProductWorkspaceName(
  project: Project | null | undefined,
  productPlan?: ProductPlan | null | undefined
): string {
  // Check ProductPlan vision or root property first
  if (productPlan) {
    const vision = productPlan.vision as (ProductPlan['vision'] & { workspaceName?: string }) | undefined;
    if (vision?.workspaceName && typeof vision.workspaceName === 'string' && vision.workspaceName.trim()) {
      return vision.workspaceName.trim();
    }
    const rootName = (productPlan as unknown as { workspaceName?: string }).workspaceName;
    if (rootName && typeof rootName === 'string' && rootName.trim()) {
      return rootName.trim();
    }
  }

  // Check project prompt metadata
  if (project) {
    const meta = parseWorkspaceMetadata(project.prompt);
    if (meta.productName && typeof meta.productName === 'string' && meta.productName.trim()) {
      return meta.productName.trim();
    }
    return project.name || 'Product Strategy';
  }

  return 'Product Strategy';
}

/**
 * Rename Developer Workspace:
 * Updates ONLY developer workspace metadata without modifying project.name or Product Manager workspace.
 */
export async function renameDeveloperWorkspace(
  supabase: SupabaseClient<Database>,
  project: Project,
  newName: string
): Promise<{ success: boolean; updatedProject?: Project; error?: Error }> {
  const trimmed = newName.trim();
  if (!trimmed) return { success: false, error: new Error('Workspace name cannot be empty') };

  const newPrompt = serializeWorkspaceMetadata(project.prompt, { developerName: trimmed });

  if (project.id === 'local-project') {
    return {
      success: true,
      updatedProject: {
        ...project,
        prompt: newPrompt,
      },
    };
  }

  const res = await updateProject(supabase, project.id, { prompt: newPrompt });
  if (res.error) {
    return { success: false, error: res.error };
  }

  return {
    success: true,
    updatedProject: res.data || { ...project, prompt: newPrompt },
  };
}

/**
 * Rename Product Workspace:
 * Updates product plan vision.workspaceName AND project metadata productName without modifying developer workspace or project.name.
 */
export async function renameProductWorkspace(
  supabase: SupabaseClient<Database>,
  project: Project,
  productPlan: ProductPlan | null | undefined,
  newName: string
): Promise<{ success: boolean; updatedProject?: Project; updatedPlan?: ProductPlan; error?: Error }> {
  const trimmed = newName.trim();
  if (!trimmed) return { success: false, error: new Error('Workspace name cannot be empty') };

  // 1. Update project prompt metadata
  const newPrompt = serializeWorkspaceMetadata(project.prompt, { productName: trimmed });
  let updatedProject: Project = { ...project, prompt: newPrompt };

  if (project.id !== 'local-project') {
    const projRes = await updateProject(supabase, project.id, { prompt: newPrompt });
    if (projRes.data) {
      updatedProject = projRes.data;
    }
  }

  // 2. Update ProductPlan if it exists
  let updatedPlan: ProductPlan | undefined;
  if (productPlan) {
    updatedPlan = {
      ...productPlan,
      vision: {
        ...productPlan.vision,
        workspaceName: trimmed,
      } as ProductPlan['vision'],
    };

    if (project.id !== 'local-project') {
      await saveProductPlanToDb(supabase, project.id, updatedPlan);
    }
  }

  return {
    success: true,
    updatedProject,
    updatedPlan,
  };
}
