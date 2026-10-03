import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Project } from '../types/database';
import { getProjectFiles, batchUpsertFiles, type FileInput } from './files';
import { getProductPlanFromDb, saveProductPlanToDb } from './product';
import { getDefaultProjectFiles } from './starter-template';

export type StartingMode = 'product' | 'developer' | 'blank';

export type CreateProjectInput = {
  name: string;
  description?: string;
  prompt?: string;
  framework?: string;
  isPublic?: boolean;
};

export type UpdateProjectInput = Partial<{
  name: string;
  description: string | null;
  prompt: string | null;
  framework: string;
  is_public: boolean;
}>;

/**
 * Fetch all projects accessible to the authenticated user.
 */
export async function getProjects(
  supabase: SupabaseClient<Database>,
  userId?: string
): Promise<{ data: Project[] | null; error: Error | null }> {
  try {
    let query = supabase.from('projects').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (err: unknown) {
    console.error('Unexpected error in getProjects:', err);
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Fetch a single project by ID.
 */
export async function getProjectById(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<{ data: Project | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();

    if (error) {
      console.error(`Error fetching project ${projectId}:`, error);
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (err: unknown) {
    console.error(`Unexpected error in getProjectById (${projectId}):`, err);
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Create a new project and initialize its starter files.
 */
export async function createProject(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreateProjectInput
): Promise<{ data: Project | null; error: Error | null }> {
  try {
    const { data: project, error: createError } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name: input.name.trim() || 'Untitled Project',
        description: input.description?.trim() || null,
        prompt: input.prompt?.trim() || null,
        framework: input.framework || 'nextjs',
        is_public: input.isPublic ?? false,
      })
      .select('*')
      .single();

    if (createError || !project) {
      console.error('Error creating project:', createError);
      return { data: null, error: new Error(createError?.message || 'Failed to create project') };
    }

    return { data: project, error: null };
  } catch (err: unknown) {
    console.error('Unexpected error in createProject:', err);
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Create a new project with a selected starting mode ('product' | 'developer' | 'blank').
 */
export async function createProjectWithMode(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    name: string;
    description?: string;
    mode: StartingMode;
    framework?: string;
  }
): Promise<{ data: Project | null; error: Error | null }> {
  try {
    const { data: project, error: createErr } = await createProject(supabase, userId, {
      name: input.name,
      description: input.description,
      framework: input.framework || 'nextjs',
      isPublic: false,
    });

    if (createErr || !project) {
      return { data: null, error: createErr };
    }

    // User projects must start EMPTY for Developer IDE.
    // Do NOT automatically generate starter files (e.g. app/page.tsx, package.json).
    // Files should only be created when the user enters an AI prompt and clicks "Build App" or creates files manually.

    // If starting in Product Manager mode, initialize an empty product plan record
    if (input.mode === 'product') {
      try {
        await supabase.from('product_plans').insert({
          project_id: project.id,
          vision: { purpose: '', valueProposition: '', targetOutcome: '' },
          personas: [],
          mvp: { mustHave: [], exclusions: [] },
          features: [],
          roadmap: [],
        });
      } catch (pmInitErr) {
        console.warn('Note: product_plans initial record creation:', pmInitErr);
      }
    }

    return { data: project, error: null };
  } catch (err: unknown) {
    console.error('Unexpected error in createProjectWithMode:', err);
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}


/**
 * Update project metadata.
 */
export async function updateProject(
  supabase: SupabaseClient<Database>,
  projectId: string,
  updates: UpdateProjectInput
): Promise<{ data: Project | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select('*')
      .single();

    if (error) {
      console.error(`Error updating project ${projectId}:`, error);
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (err: unknown) {
    console.error(`Unexpected error in updateProject (${projectId}):`, err);
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Delete a project and its associated files.
 */
export async function deleteProject(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase.from('projects').delete().eq('id', projectId);

    if (error) {
      console.error(`Error deleting project ${projectId}:`, error);
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    console.error(`Unexpected error in deleteProject (${projectId}):`, err);
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Duplicate an existing project, including its files and product plan.
 */
export async function duplicateProject(
  supabase: SupabaseClient<Database>,
  sourceProjectId: string,
  userId: string,
  customName?: string
): Promise<{ data: Project | null; error: Error | null }> {
  try {
    const { data: source, error: srcErr } = await getProjectById(supabase, sourceProjectId);
    if (srcErr || !source) {
      return { data: null, error: new Error(srcErr?.message || 'Source project not found') };
    }

    const newProjectName = customName || `${source.name} (Copy)`;
    const { data: newProject, error: createErr } = await createProject(supabase, userId, {
      name: newProjectName,
      description: source.description || undefined,
      prompt: source.prompt || undefined,
      framework: source.framework || 'nextjs',
      isPublic: false,
    });

    if (createErr || !newProject) {
      return { data: null, error: createErr };
    }

    // Duplicate files
    const { data: files } = await getProjectFiles(supabase, sourceProjectId);
    if (files && files.length > 0) {
      const fileInputs: FileInput[] = files.map((f) => ({
        path: f.path,
        name: f.name,
        content: f.content,
        language: f.language,
        isFolder: f.is_folder,
      }));
      await batchUpsertFiles(supabase, newProject.id, fileInputs);
    }

    // Duplicate product plan & tasks if present
    const { plan } = await getProductPlanFromDb(supabase, sourceProjectId);
    if (plan) {
      await saveProductPlanToDb(supabase, newProject.id, plan);
    }

    return { data: newProject, error: null };
  } catch (err: unknown) {
    console.error(`Unexpected error in duplicateProject (${sourceProjectId}):`, err);
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

