'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import {
  RotateCcw,
  Smartphone,
  Tablet,
  Monitor,
  Code2,
  Loader2,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import LivePreview, { ViewportMode } from '@/components/live-preview';
import { webcontainerManager } from '@/lib/runtime/webcontainer-manager';
import { createClient } from '@/lib/client';
import { getProjectById, getProjectFiles, isValidUuid } from '@/lib/db';
import type { Project, ProjectFile } from '@/lib/types/database';

function PreviewPageContent() {
  const searchParams = useSearchParams();
  const queryPid = searchParams?.get('project') || searchParams?.get('id') || 'local-project';

  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [dependencies, setDependencies] = useState<Array<{ name: string; version: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [refreshKey, setRefreshKey] = useState(0);
  const [webcontainerUrl, setWebcontainerUrl] = useState<string | null>(
    webcontainerManager.getPreviewUrl()
  );

  const supabase = useMemo(() => createClient(), []);

  // Hydrate files from cache or database
  useEffect(() => {
    let active = true;

    async function loadPreview() {
      setIsLoading(true);
      const pid = queryPid || 'local-project';

      // 1. Optimistic Cache Hit (0ms)
      try {
        const cachedFiles = localStorage.getItem(`codatron_files_${pid}`);
        const cachedProject = localStorage.getItem(`codatron_project_${pid}`);
        if (cachedFiles) {
          const parsed = JSON.parse(cachedFiles);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFiles(parsed);

            // Parse dependencies from package.json if present
            const pkg = parsed.find((f: ProjectFile) => f.path === 'package.json');
            if (pkg?.content) {
              try {
                const pkgJson = JSON.parse(pkg.content);
                const deps = Object.entries(pkgJson.dependencies || {}).map(([name, version]) => ({
                  name,
                  version: String(version),
                }));
                setDependencies(deps);
              } catch {}
            }
          }
        }
        if (cachedProject) {
          const parsedProj = JSON.parse(cachedProject);
          if (parsedProj) setProject(parsedProj);
        }
      } catch {}

      // 2. Local project fallback
      if (pid === 'local-project' || !isValidUuid(pid)) {
        if (!project) {
          setProject({
            id: 'local-project',
            user_id: 'local-user',
            name: 'Local Project Preview',
            description: 'Live application preview',
            prompt: null,
            framework: 'nextjs',
            is_public: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        setIsLoading(false);
        return;
      }

      // 3. Supabase Database Fetch if not local
      try {
        const [projRes, filesRes] = await Promise.all([
          getProjectById(supabase, pid),
          getProjectFiles(supabase, pid),
        ]);
        if (!active) return;
        if (projRes.data) setProject(projRes.data);
        if (filesRes.data && filesRes.data.length > 0) {
          setFiles(filesRes.data);
          const pkg = filesRes.data.find((f: ProjectFile) => f.path === 'package.json');
          if (pkg?.content) {
            try {
              const pkgJson = JSON.parse(pkg.content);
              const deps = Object.entries(pkgJson.dependencies || {}).map(([name, version]) => ({
                name,
                version: String(version),
              }));
              setDependencies(deps);
            } catch {}
          }
        }
      } catch (err) {
        console.error('Failed to load project for preview:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadPreview();
    return () => {
      active = false;
    };
  }, [queryPid, supabase]);

  // Subscribe to WebContainer server URL
  useEffect(() => {
    const unsub = webcontainerManager.subscribeSnapshot((snap) => {
      if (snap.previewUrl) {
        setWebcontainerUrl(snap.previewUrl);
      }
    });
    return unsub;
  }, []);

  // Ensure WebContainer runtime is running for this project if not already running
  useEffect(() => {
    if (files.length === 0) return;
    const pid = queryPid || 'local-project';
    if (!webcontainerManager.isDevServerRunning() || !webcontainerManager.getPreviewUrl()) {
      void webcontainerManager.runProject(files, pid);
    }
  }, [files, queryPid]);

  const projectName = project?.name || 'Live Application Preview';

  // Set document title
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = `${projectName} — Codatron Preview`;
    }
  }, [projectName]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#070810] text-slate-200 overflow-hidden font-sans">
      <Script src="/coi-serviceworker.js" strategy="afterInteractive" />

      {/* Sleek Minimal Deployment Header Bar */}
      <header className="h-12 border-b border-white/10 bg-[#090b17] px-4 flex items-center justify-between shrink-0 select-none z-30">
        <div className="flex items-center gap-3">
          <Link
            href={`/editor?project=${encodeURIComponent(queryPid)}&view=developer`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-medium border border-white/10 transition"
            title="Return to Developer IDE"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Editor</span>
          </Link>

          <div className="h-4 w-[1px] bg-white/10" />

          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-white tracking-wide truncate max-w-[200px] sm:max-w-xs">
              {projectName}
            </span>
            <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-wider text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              Live
            </span>
          </div>
        </div>

        {/* Viewport Mode Switcher (Desktop / Tablet / Mobile) */}
        <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`p-1.5 rounded transition ${
              viewport === 'desktop' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
            title="Desktop view"
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewport('tablet')}
            className={`p-1.5 rounded transition ${
              viewport === 'tablet' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
            title="Tablet view (768px)"
          >
            <Tablet className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`p-1.5 rounded transition ${
              viewport === 'mobile' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
            title="Mobile view (390px)"
          >
            <Smartphone className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((prev) => prev + 1)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
            title="Refresh preview"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <Link
            href={`/editor?project=${encodeURIComponent(queryPid)}&view=developer`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-sm"
          >
            <Code2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open in IDE</span>
          </Link>
        </div>
      </header>

      {/* Main Full-Screen Preview Area */}
      <main className="flex-1 min-h-0 min-w-0 relative overflow-hidden bg-[#070810]">
        {isLoading && files.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
              <p className="text-xs text-slate-400 font-mono">Loading live preview…</p>
            </div>
          </div>
        ) : (
          <LivePreview
            key={refreshKey}
            files={files}
            dependencies={dependencies}
            controlledViewport={viewport}
            webcontainerUrl={webcontainerUrl}
            projectId={queryPid}
          />
        )}
      </main>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-[#070810] text-slate-400 font-mono text-xs">
          Loading preview…
        </div>
      }
    >
      <PreviewPageContent />
    </Suspense>
  );
}
