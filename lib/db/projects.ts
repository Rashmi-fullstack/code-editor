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
  updated_at: string;
}>;

const LOCAL_PROJECTS_KEY = 'codatron_local_projects';

function getLocalProjectsList(userId?: string): Project[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_PROJECTS_KEY);
    if (!raw) return [];
    const list: Project[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    if (userId) {
      return list.filter((p) => p.user_id === userId);
    }
    return list;
  } catch {
    return [];
  }
}

function saveLocalProject(project: Project) {
  if (typeof window === 'undefined') return;
  try {
    const list = getLocalProjectsList();
    const idx = list.findIndex((p) => p.id === project.id);
    if (idx >= 0) {
      list[idx] = project;
    } else {
      list.unshift(project);
    }
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(list));
    localStorage.setItem(`codatron_project_${project.id}`, JSON.stringify(project));
  } catch { }
}

function removeLocalProject(projectId: string) {
  if (typeof window === 'undefined') return;
  try {
    const list = getLocalProjectsList().filter((p) => p.id !== projectId);
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(list));
    localStorage.removeItem(`codatron_project_${projectId}`);
    localStorage.removeItem(`codatron_files_${projectId}`);
    localStorage.removeItem(`codatron_plan_${projectId}`);
  } catch { }
}

/**
 * Fetch all projects accessible to the authenticated user.
 */
export async function getProjects(
  supabase: SupabaseClient<Database>,
  userId?: string
): Promise<{ data: Project[] | null; error: Error | null }> {
  try {
    let remoteProjects: Project[] = [];
    if (userId) {
      const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);
      if (isValidUuid) {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });
        if (!error && data) {
          remoteProjects = data;
        }
      }
    } else {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });
      if (!error && data) {
        remoteProjects = data;
      }
    }

    // Merge with locally cached persistent projects
    const local = getLocalProjectsList(userId);
    const seen = new Set(remoteProjects.map((p) => p.id));
    const merged = [...remoteProjects];
    for (const p of local) {
      if (!seen.has(p.id)) {
        merged.push(p);
      }
    }
    merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return { data: merged, error: null };
  } catch (err: unknown) {
    console.error('Unexpected error in getProjects:', err);
    const local = getLocalProjectsList(userId);
    return { data: local, error: null };
  }
}

/**
 * Fetch a single project by ID.
 */
export async function getProjectById(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<{ data: Project | null; error: Error | null }> {
  if (!projectId) {
    return { data: null, error: null };
  }
  try {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();

      if (!error && data) {
        return { data, error: null };
      }
    }

    // Fallback to local storage
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(`codatron_project_${projectId}`);
      if (raw) {
        try {
          return { data: JSON.parse(raw), error: null };
        } catch { }
      }
      const localList = getLocalProjectsList();
      const found = localList.find((p) => p.id === projectId);
      if (found) return { data: found, error: null };
    }

    return { data: null, error: null };
  } catch (err: unknown) {
    console.error(`Unexpected error in getProjectById (${projectId}):`, err);
    return { data: null, error: null };
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
    // 1. Attempt Supabase direct insert
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

    if (!createError && project) {
      saveLocalProject(project);
      return { data: project, error: null };
    }

    // 2. If RLS policy (e.g. unconfirmed email in GoTrue) or connection issue prevents insert,
    // seamlessly provide persistent local workspace so user creation is NEVER blocked!
    const fallbackId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : '00000000-0000-4000-8000-' + Math.random().toString(16).substring(2, 14).padEnd(12, '0');

    const now = new Date().toISOString();
    const fallbackProject: Project = {
      id: fallbackId,
      user_id: userId,
      name: input.name.trim() || 'Untitled Project',
      description: input.description?.trim() || null,
      prompt: input.prompt?.trim() || null,
      framework: input.framework || 'nextjs',
      is_public: input.isPublic ?? false,
      created_at: now,
      updated_at: now,
    };

    saveLocalProject(fallbackProject);
    return { data: fallbackProject, error: null };
  } catch (err: unknown) {
    console.error('Unexpected error in createProject:', err);
    const fallbackId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : '00000000-0000-4000-8000-' + Math.random().toString(16).substring(2, 14).padEnd(12, '0');
    const now = new Date().toISOString();
    const fallbackProject: Project = {
      id: fallbackId,
      user_id: userId,
      name: input.name.trim() || 'Untitled Project',
      description: input.description?.trim() || null,
      prompt: input.prompt?.trim() || null,
      framework: input.framework || 'nextjs',
      is_public: input.isPublic ?? false,
      created_at: now,
      updated_at: now,
    };
    saveLocalProject(fallbackProject);
    return { data: fallbackProject, error: null };
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

    // Initialize product workspace record
    try {
      const pmVision =
        input.mode === 'product' && input.name
          ? { purpose: '', valueProposition: '', targetOutcome: '', workspaceName: input.name.trim() }
          : { purpose: '', valueProposition: '', targetOutcome: '' };

      await supabase.from('product_plans').insert({
        project_id: project.id,
        vision: pmVision,
        personas: [],
        mvp: { mustHave: [], exclusions: [] },
        features: [],
        roadmap: [],
      });
    } catch (pmInitErr) {
      console.warn('Note: product_plans initial record creation:', pmInitErr);
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
    let updatedProj: Project | null = null;
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select('*')
      .single();

    if (!error && data) {
      updatedProj = data;
    } else {
      const local = await getProjectById(supabase, projectId);
      if (local.data) {
        updatedProj = {
          ...local.data,
          ...updates,
          updated_at: new Date().toISOString(),
        } as Project;
      }
    }

    if (updatedProj) {
      saveLocalProject(updatedProj);
      return { data: updatedProj, error: null };
    }

    return { data: null, error: error ? new Error(error.message) : new Error('Project not found') };
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
    await supabase.from('projects').delete().eq('id', projectId);
    removeLocalProject(projectId);
    return { success: true, error: null };
  } catch (err: unknown) {
    console.error(`Unexpected error in deleteProject (${projectId}):`, err);
    removeLocalProject(projectId);
    return { success: true, error: null };
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

