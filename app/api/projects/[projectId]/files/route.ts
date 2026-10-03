import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';

export const runtime = 'nodejs';

const PATH_PATTERN = /^[a-zA-Z0-9_\-./@]+$/;
const BLOCKED_SEGMENTS = new Set(['..', '.', 'node_modules', '.git']);

function sanitizePath(rawPath: string): string {
  const clean = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = clean.split('/');
  if (!PATH_PATTERN.test(clean) || segments.some((s) => BLOCKED_SEGMENTS.has(s))) {
    throw new Error(`Invalid or unsafe path: ${rawPath}`);
  }
  return clean;
}

function inferLanguage(path: string): string {
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

/**
 * POST /api/projects/[projectId]/files
 * Create or initialize a project file / folder in Supabase project_files.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      path?: string;
      name?: string;
      content?: string;
      language?: string;
      isFolder?: boolean;
    };

    if (!body.path || typeof body.path !== 'string') {
      return NextResponse.json({ message: 'A valid file path is required.' }, { status: 400 });
    }

    const cleanPath = sanitizePath(body.path);
    if (!cleanPath) {
      return NextResponse.json({ message: 'File path cannot be empty.' }, { status: 400 });
    }

    const name = body.name || cleanPath.split('/').pop() || cleanPath;
    const isFolder = Boolean(body.isFolder);
    const content = body.content ?? '';
    const language = body.language || (isFolder ? 'folder' : inferLanguage(cleanPath));

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { message: 'Authentication required to modify project files.' },
        { status: 401 }
      );
    }

    // Verify project ownership
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (projErr || !project) {
      return NextResponse.json(
        { message: 'Project not found or you do not have permission to modify it.' },
        { status: 403 }
      );
    }

    // Upsert to project_files table
    const { data: file, error: insertError } = await supabase
      .from('project_files')
      .upsert(
        {
          project_id: projectId,
          path: cleanPath,
          name,
          content,
          language,
          is_folder: isFolder,
        },
        { onConflict: 'project_id,path' }
      )
      .select('*')
      .single();

    if (insertError) {
      return NextResponse.json({ message: insertError.message }, { status: 500 });
    }

    // Update project timestamp
    await supabase
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId);

    return NextResponse.json({ success: true, file });
  } catch (err: unknown) {
    console.error('[API Create File Error]:', err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Could not create file.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[projectId]/files
 * Securely deletes a project file or folder from Supabase project_files.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    let filePath = '';
    let isFolder = false;

    // Support payload in body or query param
    const url = new URL(request.url);
    const queryPath = url.searchParams.get('path');
    const queryFolder = url.searchParams.get('isFolder');

    if (queryPath) {
      filePath = queryPath;
      isFolder = queryFolder === 'true';
    } else {
      try {
        const body = (await request.json()) as { path?: string; isFolder?: boolean };
        if (body.path) {
          filePath = body.path;
          isFolder = Boolean(body.isFolder);
        }
      } catch {
        // No body provided
      }
    }

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ message: 'A valid file path is required.' }, { status: 400 });
    }

    const cleanPath = sanitizePath(filePath);
    if (!cleanPath) {
      return NextResponse.json({ message: 'File path cannot be empty.' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { message: 'Authentication required to delete project files.' },
        { status: 401 }
      );
    }

    // Verify project ownership
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (projErr || !project) {
      return NextResponse.json(
        { message: 'Project not found or you do not have permission to delete this file.' },
        { status: 403 }
      );
    }

    // Delete from project_files table
    if (isFolder) {
      const { error: delFolderErr } = await supabase
        .from('project_files')
        .delete()
        .eq('project_id', projectId)
        .eq('path', cleanPath);

      if (delFolderErr) {
        return NextResponse.json({ message: delFolderErr.message }, { status: 500 });
      }

      const { error: delChildrenErr } = await supabase
        .from('project_files')
        .delete()
        .eq('project_id', projectId)
        .like('path', `${cleanPath}/%`);

      if (delChildrenErr) {
        return NextResponse.json({ message: delChildrenErr.message }, { status: 500 });
      }
    } else {
      const { error: delErr } = await supabase
        .from('project_files')
        .delete()
        .eq('project_id', projectId)
        .eq('path', cleanPath);

      if (delErr) {
        return NextResponse.json({ message: delErr.message }, { status: 500 });
      }
    }

    // Update project timestamp
    await supabase
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId);

    return NextResponse.json({ success: true, deletedPath: cleanPath });
  } catch (err: unknown) {
    console.error('[API Delete File Error]:', err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Could not delete file.' },
      { status: 500 }
    );
  }
}