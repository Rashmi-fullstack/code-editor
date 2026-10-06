
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ProjectFile } from '../types/database';

export type FileInput = {
  path: string;
  name: string;
  content?: string;
  language?: string;
  isFolder?: boolean;
};

function getLocalFiles(projectId: string): ProjectFile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`codatron_files_${projectId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalFiles(projectId: string, files: ProjectFile[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`codatron_files_${projectId}`, JSON.stringify(files));
  } catch {}
}

/**
 * Fetch all files and directories for a given project.
 */
export async function getProjectFiles(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<{ data: ProjectFile[] | null; error: Error | null }> {
  if (!projectId) {
    return { data: [], error: null };
  }
  try {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      const { data, error } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('is_folder', { ascending: false })
        .order('path', { ascending: true });

      if (!error && data && data.length > 0) {
        saveLocalFiles(projectId, data);
        return { data, error: null };
      }
    }

    const local = getLocalFiles(projectId);
    return { data: local, error: null };
  } catch (err: unknown) {
    console.error(`Unexpected error in getProjectFiles (${projectId}):`, err);
    const local = getLocalFiles(projectId);
    return { data: local, error: null };
  }
}

/**
 * Save or update a single project file.
 */
export async function saveProjectFile(
  supabase: SupabaseClient<Database>,
  projectId: string,
  file: FileInput
): Promise<{ data: ProjectFile | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('project_files')
      .upsert(
        {
          project_id: projectId,
          path: file.path,
          name: file.name,
          content: file.content ?? '',
          language: file.language ?? 'typescript',
          is_folder: file.isFolder ?? false,
        },
        { onConflict: 'project_id,path' }
      )
      .select('*')
      .single();

    if (!error && data) {
      const current = getLocalFiles(projectId).filter((f) => f.path !== file.path);
      current.push(data);
      saveLocalFiles(projectId, current);
      return { data, error: null };
    }

    // Local fallback
    const now = new Date().toISOString();
    const fallbackFile: ProjectFile = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'file-' + Math.random().toString(36).substring(2, 10),
      project_id: projectId,
      path: file.path,
      name: file.name,
      content: file.content ?? '',
      language: file.language ?? 'typescript',
      is_folder: file.isFolder ?? false,
      created_at: now,
      updated_at: now,
    };

    const current = getLocalFiles(projectId).filter((f) => f.path !== file.path);
    current.push(fallbackFile);
    saveLocalFiles(projectId, current);

    return { data: fallbackFile, error: null };
  } catch (err: unknown) {
    console.error(`Unexpected error in saveProjectFile (${file.path}):`, err);
    const now = new Date().toISOString();
    const fallbackFile: ProjectFile = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'file-' + Math.random().toString(36).substring(2, 10),
      project_id: projectId,
      path: file.path,
      name: file.name,
      content: file.content ?? '',
      language: file.language ?? 'typescript',
      is_folder: file.isFolder ?? false,
      created_at: now,
      updated_at: now,
    };

    const current = getLocalFiles(projectId).filter((f) => f.path !== file.path);
    current.push(fallbackFile);
    saveLocalFiles(projectId, current);

    return { data: fallbackFile, error: null };
  }
}

/**
 * Batch insert or update multiple files in a project.
 */
export async function batchUpsertFiles(
  supabase: SupabaseClient<Database>,
  projectId: string,
  files: FileInput[]
): Promise<{ success: boolean; error: Error | null }> {
  try {
    if (files.length === 0) return { success: true, error: null };

    const payload = files.map((f) => ({
      project_id: projectId,
      path: f.path,
      name: f.name,
      content: f.content ?? '',
      language: f.language ?? 'typescript',
      is_folder: f.isFolder ?? false,
    }));

    const { error } = await supabase
      .from('project_files')
      .upsert(payload, { onConflict: 'project_id,path' });

    // Always update local cache
    const currentMap = new Map<string, ProjectFile>();
    for (const f of getLocalFiles(projectId)) {
      currentMap.set(f.path, f);
    }
    const now = new Date().toISOString();
    for (const f of payload) {
      currentMap.set(f.path, {
        id: currentMap.get(f.path)?.id || ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'f-' + Math.random().toString(36).substring(2, 10)),
        created_at: currentMap.get(f.path)?.created_at || now,
        updated_at: now,
        ...f,
      });
    }
    saveLocalFiles(projectId, Array.from(currentMap.values()));

    return { success: true, error: null };
  } catch (err: unknown) {
    console.error(`Unexpected error in batchUpsertFiles (${projectId}):`, err);
    return { success: true, error: null };
  }
}

/**
 * Delete a file or directory recursively by its path in a project.
 */
export async function deleteProjectFile(
  supabase: SupabaseClient<Database>,
  projectId: string,
  filePath: string,
  isFolder: boolean = false
): Promise<{ success: boolean; error: Error | null }> {
  try {
    if (isFolder) {
      // Delete the folder record itself and all files prefixed with filePath/
      const { error: childError } = await supabase
        .from('project_files')
        .delete()
        .eq('project_id', projectId)
        .like('path', `${filePath}/%`);

      if (childError) {
        console.error(`Error deleting folder children for ${filePath}:`, childError);
      }

      const { error } = await supabase
        .from('project_files')
        .delete()
        .eq('project_id', projectId)
        .eq('path', filePath);

      if (error) {
        console.error(`Error deleting folder ${filePath}:`, error);
        return { success: false, error: new Error(error.message) };
      }
      return { success: true, error: null };
    }

    const { error } = await supabase
      .from('project_files')
      .delete()
      .eq('project_id', projectId)
      .eq('path', filePath);

    if (error) {
      console.error(`Error deleting file ${filePath}:`, error);
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    console.error(`Unexpected error in deleteProjectFile (${filePath}):`, err);
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/** Rename is deliberately implemented as a copy + delete only after the copy succeeds. */
export async function renameProjectFile(
  supabase: SupabaseClient<Database>,
  projectId: string,
  file: ProjectFile,
  nextPath: string
): Promise<{ data: ProjectFile | null; error: Error | null }> {
  const name = nextPath.split('/').pop() || nextPath;

  if (file.is_folder) {
    // 1. Fetch all children
    const { data: children, error: fetchErr } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .like('path', `${file.path}/%`);

    if (fetchErr) return { data: null, error: new Error(fetchErr.message) };

    // 2. Insert new folder
    const savedFolder = await saveProjectFile(supabase, projectId, {
      path: nextPath,
      name,
      content: '',
      language: 'folder',
      isFolder: true,
    });
    if (savedFolder.error) return savedFolder;

    // 3. Upsert children with rewritten paths
    if (children && children.length > 0) {
      const updatedChildren = children.map((c) => {
        const sub = c.path.slice(file.path.length + 1);
        const childNewPath = `${nextPath}/${sub}`;
        const childName = childNewPath.split('/').pop() || childNewPath;
        return {
          path: childNewPath,
          name: childName,
          content: c.content,
          language: c.language,
          isFolder: c.is_folder,
        };
      });
      const batchRes = await batchUpsertFiles(supabase, projectId, updatedChildren);
      if (!batchRes.success) return { data: null, error: batchRes.error };
    }

    // 4. Delete old folder and old children
    await deleteProjectFile(supabase, projectId, file.path, true);
    return savedFolder;
  }

  const saved = await saveProjectFile(supabase, projectId, {
    path: nextPath,
    name,
    content: file.content,
    language: file.language,
    isFolder: file.is_folder,
  });
  if (saved.error) return saved;
  const removed = await deleteProjectFile(supabase, projectId, file.path, false);
  return removed.error ? { data: null, error: removed.error } : saved;
}
