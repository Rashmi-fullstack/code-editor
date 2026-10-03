'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import {
  Loader2,
  FileQuestion,
  Sparkles,
  Compass,
  FilePlus,
  FolderPlus,
  Code2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import CodeEditor from '@/components/code-editor';
import LivePreview, { ViewportMode } from '@/components/live-preview';
import { WorkspaceHeader, type SaveContextInfo } from '@/components/editor/workspace-header';
import { AIWorkspace, type AiMessage, type AiMode } from '@/components/editor/ai-workspace';
import { FileExplorer } from '@/components/editor/file-explorer';
import {
  EditorTabBar,
  WorkspaceViewMode,
} from '@/components/editor/editor-tab-bar';
import { TerminalPanel } from '@/components/editor/terminal-panel';
import { DiagnosticsModal } from '@/components/editor/diagnostics-modal';
import { webcontainerManager, stripAnsi } from '@/lib/runtime/webcontainer-manager';
import { StatusBar } from '@/components/editor/status-bar';
import { CommandPalette } from '@/components/editor/command-palette';
import { DEVELOPER_IDE_CONFIG } from '@/lib/ai/developer-ide-config';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth-provider';
import { createClient } from '@/lib/client';
import { getProjectGenerations } from '@/lib/db/history';
import {
  getProjectById,
  getProjectFiles,
  getProjects,
  updateProject,
  saveProjectFile,
  batchUpsertFiles,
  renameProjectFile,
  getDeveloperWorkspaceName,
  getProductWorkspaceName,
  renameDeveloperWorkspace,
  renameProductWorkspace,
} from '@/lib/db';
import { getProductPlanFromDb, saveProductPlanToDb } from '@/lib/db/product';
import { exportProjectToZip } from '@/lib/export/zip';
import { ProductWorkspace } from '@/components/product/product-workspace';
import { NewProjectModal } from '@/components/projects/new-project-modal';
import type { ProductPlan } from '@/lib/ai/product-planner';
import type { Project, ProjectFile } from '@/lib/types/database';

type AgentResponse = {
  summary: string;
  plan?: string[];
  files: ProjectFile[];
  operations: Array<{ type: string; path: string; newPath?: string }>;
  dependencies: Array<{ name: string; version: string }>;
  projectName?: string;
  provider?: string;
  model?: string;
  isFallback?: boolean;
};

export type ProjectStatus = 'loading' | 'empty' | 'ready' | 'error';

export default function EditorPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  // Project and files state
  const [project, setProject] = useState<Project | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('loading');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activePath, setActivePath] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedContents, setSavedContents] = useState<Record<string, string>>({});

  // View & responsive modes - Primary view is Live Preview
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('preview');
  const [viewport, setViewport] = useState<ViewportMode>('desktop');

  // WebContainer running server URL
  const [webcontainerUrl, setWebcontainerUrl] = useState<string | null>(null);

  // Panel visibility & sizing
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);

  // AI Workspace primary layout & tabs
  const [aiWorkspaceWidth, setAiWorkspaceWidth] = useState(420);
  const [showFiles, setShowFiles] = useState(true);
  const [splitPercent, setSplitPercent] = useState(50);
  const [terminalHeight, setTerminalHeight] = useState(200);
  const [isDragging, setIsDragging] = useState(false);

  // AI Conversation & Stage state
  const [conversation, setConversation] = useState<AiMessage[]>([]);
  const [generationStage, setGenerationStage] = useState<string | undefined>(undefined);
  const [keySource, setKeySource] = useState<'platform' | 'byok'>('platform');

  // Command palette
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // AI & Editor working states
  const [prompt, setPrompt] = useState('');
  const [activeAiDisplayName, setActiveAiDisplayName] = useState<string>('AI Assistant');
  const [selectedCode, setSelectedCode] = useState('');
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [isWorking, setIsWorking] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [aiMode, setAiMode] = useState<AiMode>('build');
  const [dependencies, setDependencies] = useState<
    Array<{ name: string; version: string }>
  >([]);

  // Dedicated Workspaces: 'developer' | 'product'
  const [workspace, setWorkspace] = useState<'developer' | 'product'>('developer');
  const [productPlan, setProductPlan] = useState<ProductPlan | null>(null);

  // Persistence & Save State Tracking
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isPaletteCreateDialogOpen, setIsPaletteCreateDialogOpen] = useState<'file' | 'folder' | null>(null);
  const [paletteCreateInput, setPaletteCreateInput] = useState('');
  const runtimeBootedProjectIdRef = useRef<string | null>(null);
  const hydratedTargetRef = useRef<string | null>(null);
  const isHydratingRef = useRef<boolean>(false);
  const activeRunSignatureRef = useRef<string | null>(null);
  const selfHealAttemptsRef = useRef<number>(0);

  // Active file derived from single source of truth: `files`
  const activeFile = useMemo(
    () => files.find((file) => file.path === activePath) ?? null,
    [files, activePath]
  );

  // Current draft content in active editor
  const currentDraft = useMemo(() => {
    if (!activePath) return '';
    if (activePath in drafts) return drafts[activePath];
    return activeFile?.content ?? '';
  }, [activePath, drafts, activeFile]);

  // Track dirty paths across all files
  const dirtyPaths = useMemo(() => {
    const dirties = new Set<string>();
    for (const [path, draftVal] of Object.entries(drafts)) {
      const original = savedContents[path] ?? files.find((f) => f.path === path)?.content ?? '';
      if (draftVal !== original) {
        dirties.add(path);
      }
    }
    return dirties;
  }, [drafts, savedContents, files]);

  const isCurrentFileDirty = Boolean(activePath && dirtyPaths.has(activePath));
  const isProductDirty = false;
  const saveState: 'saved' | 'saving' | 'unsaved' = isSaving
    ? 'saving'
    : isCurrentFileDirty
      ? 'unsaved'
      : 'saved';

  const saveContext: SaveContextInfo = useMemo(() => {
    if (workspace === 'product') {
      return {
        type: 'product',
        status: isSaving ? 'saving' : isProductDirty ? 'unsaved' : 'saved',
      };
    }
    if (activeFile && activePath) {
      return {
        type: 'file',
        status: isSaving ? 'saving' : isCurrentFileDirty ? 'unsaved' : 'saved',
        path: activePath,
      };
    }
    return {
      type: 'project',
      status: isSaving ? 'saving' : dirtyPaths.size > 0 ? 'unsaved' : 'saved',
    };
  }, [workspace, isSaving, isProductDirty, activeFile, activePath, isCurrentFileDirty, dirtyPaths.size]);

  // Open / switch active file
  const openFile = useCallback((file: ProjectFile) => {
    if (file.is_folder) return;
    setOpenTabs((prev) => (prev.includes(file.path) ? prev : [...prev, file.path]));
    setActivePath(file.path);

    setDrafts((prev) => {
      if (file.path in prev) return prev;
      return { ...prev, [file.path]: file.content };
    });
    setSavedContents((prev) => {
      if (file.path in prev) return prev;
      return { ...prev, [file.path]: file.content };
    });
  }, []);

  // Close tab
  const closeTab = useCallback(
    (path: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((p) => p !== path);
        if (activePath === path) {
          const nextActive = next[next.length - 1] || '';
          setActivePath(nextActive);
        }
        return next;
      });

      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[path];
        return copy;
      });
    },
    [activePath]
  );

  const persistFilesToCache = useCallback((projId: string, nextFiles: ProjectFile[]) => {
    try {
      localStorage.setItem(`codatron_files_${projId}`, JSON.stringify(nextFiles));
    } catch (e) {
      console.warn('localStorage cache failed', e);
    }
  }, []);

  const handlePlanGenerated = useCallback(
    (plan: ProductPlan) => {
      setProductPlan(plan);
      if (project) {
        void saveProductPlanToDb(supabase, project.id, plan);
        try {
          localStorage.setItem(`codatron_plan_${project.id}`, JSON.stringify(plan));
        } catch { }
      }
    },
    [project, supabase]
  );

  const handleFilesUpdatedFromPM = useCallback(
    (newFiles: ProjectFile[], newDeps?: Array<{ name: string; version: string }>) => {
      setFiles(newFiles);
      setProjectStatus(newFiles.length > 0 ? 'ready' : 'empty');
      const pid = project?.id || 'local-project';
      persistFilesToCache(pid, newFiles);
      if (newDeps) setDependencies(newDeps);
      const newSaved: Record<string, string> = {};
      for (const f of newFiles) {
        if (!f.is_folder) newSaved[f.path] = f.content;
      }
      setSavedContents(newSaved);
      setDrafts(newSaved);
    },
    [project?.id, persistFilesToCache]
  );

  const handleWorkspaceChange = useCallback(
    (newWs: 'developer' | 'product') => {
      setWorkspace(newWs);
      if (typeof window !== 'undefined' && project) {
        window.history.replaceState(null, '', `?project=${project.id}&view=${newWs}`);
      }
    },
    [project]
  );

  const handleSwitchToDeveloper = useCallback(
    (targetFilePath?: string) => {
      handleWorkspaceChange('developer');
      if (targetFilePath) {
        const target = files.find((f) => f.path === targetFilePath);
        if (target) {
          openFile(target);
        } else {
          setOpenTabs((prev) => (prev.includes(targetFilePath) ? prev : [...prev, targetFilePath]));
          setActivePath(targetFilePath);
        }
      }
    },
    [files, openFile, handleWorkspaceChange]
  );

  // Resize drag handlers
  const handleAiWorkspaceMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = aiWorkspaceWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(640, Math.max(320, startWidth + delta));
      setAiWorkspaceWidth(newWidth);
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('monaco-layout'));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('monaco-layout'));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [aiWorkspaceWidth]);

  const handleTerminalMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startY = e.clientY;
    const startHeight = terminalHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const maxHeight = Math.floor(window.innerHeight * 0.5);
      const newHeight = Math.min(maxHeight, Math.max(140, startHeight + delta));
      setTerminalHeight(newHeight);
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('monaco-layout'));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('monaco-layout'));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [terminalHeight]);

  const handleSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startPercent = splitPercent;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const containerWidth = window.innerWidth - (showAiPanel ? aiWorkspaceWidth : 0);
      const delta = moveEvent.clientX - startX;
      const deltaPercent = (delta / containerWidth) * 100;
      const newPercent = Math.min(80, Math.max(20, startPercent + deltaPercent));
      setSplitPercent(newPercent);
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('monaco-layout'));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('monaco-layout'));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [splitPercent, showAiPanel, aiWorkspaceWidth]);

  const gridTemplateColumns = useMemo(() => {
    if (showAiPanel) {
      return `${aiWorkspaceWidth}px 4px minmax(0, 1fr)`;
    }
    return 'minmax(0, 1fr)';
  }, [showAiPanel, aiWorkspaceWidth]);

  // Load project on mount: Hydrate from Supabase and URL query (One-time guarded)
  useEffect(() => {
    if (!isLoading && !user && process.env.NODE_ENV === 'production') {
      router.replace('/login?next=/editor');
      return;
    }
    if (isLoading) return;

    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const queryPid = params?.get('project') || params?.get('id');
    const rawView = params?.get('view') || params?.get('role');
    const queryView = rawView === 'product' || rawView === 'product-manager' ? 'product' : rawView === 'developer' ? 'developer' : null;

    const targetKey = `${user ? user.id : 'anon'}_${queryPid || 'default'}`;

    // Prevent hydration loop: If already hydrating, or already hydrated for this target, do not re-fetch
    if (isHydratingRef.current) return;
    if (hydratedTargetRef.current === targetKey && project !== null) {
      if (queryView && workspace !== queryView) {
        setWorkspace(queryView);
      }
      return;
    }

    let active = true;
    isHydratingRef.current = true;

    async function loadInitialProject() {
      // Only set loading if no project exists yet to avoid tearing down the IDE UI
      if (!project) {
        setProjectStatus('loading');
      }

      if (queryView) {
        setWorkspace(queryView);
      }

      if (!user) {
        // Local offline development mode
        const localPid = 'local-project';
        let initialFiles: ProjectFile[] = [];
        try {
          const cached = localStorage.getItem(`codatron_files_${localPid}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) initialFiles = parsed;
          }
        } catch { }

        try {
          const savedPlan = localStorage.getItem(`codatron_plan_${localPid}`);
          if (savedPlan) setProductPlan(JSON.parse(savedPlan));
        } catch { }

        setProject({
          id: localPid,
          user_id: 'local-user',
          name: 'Local Project',
          description: 'Local development workspace',
          prompt: null,
          framework: 'nextjs',
          is_public: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        setFiles(initialFiles);
        setProjectStatus(initialFiles.length > 0 ? 'ready' : 'empty');

        if (initialFiles.length > 0) {
          const initial =
            initialFiles.find((file) => file.path === 'app/page.tsx' || file.path === 'main.py') ??
            initialFiles.find((file) => !file.is_folder);
          if (initial) {
            setOpenTabs([initial.path]);
            setActivePath(initial.path);
            setDrafts({ [initial.path]: initial.content });
            setSavedContents({ [initial.path]: initial.content });
          }
        }
        hydratedTargetRef.current = targetKey;
        isHydratingRef.current = false;
        return;
      }

      // Authenticated User: Supabase is the sole source of truth
      try {
        let current: Project | null = null;

        if (queryPid) {
          const fetched = await getProjectById(supabase, queryPid);
          if (active && fetched.data) {
            current = fetched.data;
          }
        }

        if (!current) {
          const projects = await getProjects(supabase, user.id);
          if (!active) return;
          current = projects.data?.[0] ?? null;
        }

        if (!current) {
          // Do NOT automatically create phantom "New Project" in the database.
          // Redirect the user to the projects hub so they can create or choose a project manually.
          if (active) {
            router.push('/projects');
          }
          isHydratingRef.current = false;
          return;
        }

        // Ensure URL reflects active projectId and view mode, and synchronize workspace view
        const activeView = (queryView === 'product' || queryView === 'developer') ? queryView : 'developer';
        setWorkspace(activeView);
        if (typeof window !== 'undefined') {
          const targetSearch = `?project=${current.id}&view=${activeView}`;
          if (window.location.search !== targetSearch) {
            window.history.replaceState(null, '', targetSearch);
          }
        }

        setProject(current);

        // Fetch files from Supabase project_files table
        const loaded = await getProjectFiles(supabase, current.id);
        if (!active) return;
        const projectFiles = loaded.data ?? [];

        setFiles(projectFiles);
        persistFilesToCache(current.id, projectFiles);

        if (projectFiles.length === 0) {
          // Explicit EMPTY PROJECT state. Do NOT inject fake or demo files!
          setProjectStatus('empty');
          setOpenTabs([]);
          setActivePath('');
        } else {
          setProjectStatus('ready');
          const initial =
            projectFiles.find((file) => file.path === 'app/page.tsx' || file.path === 'main.py' || file.path === 'index.html') ??
            projectFiles.find((file) => !file.is_folder);

          if (initial) {
            setOpenTabs([initial.path]);
            setActivePath(initial.path);
            setDrafts({ [initial.path]: initial.content });
            setSavedContents({ [initial.path]: initial.content });
          }
        }

        // Load project plan from Supabase
        const planRes = await getProductPlanFromDb(supabase, current.id);
        if (active && planRes.plan) {
          setProductPlan(planRes.plan);
        }

        // Load dependencies
        const deps = await supabase
          .from('project_dependencies')
          .select('name,version')
          .eq('project_id', current.id);
        if (active && !deps.error) {
          setDependencies(deps.data ?? []);
        }

        // Load generation history or cached chat into AI conversation stream
        let hydratedChat: AiMessage[] = [];
        try {
          const cached = localStorage.getItem(`codatron_chat_${current.id}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              hydratedChat = parsed.map((item) => ({
                ...item,
                timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
              }));
            }
          }
        } catch { }

        if (active && hydratedChat.length > 0) {
          setConversation(hydratedChat);
        } else {
          const historyRes = await getProjectGenerations(supabase, current.id);
          if (active && historyRes.data && historyRes.data.length > 0) {
            const loadedHistory: AiMessage[] = historyRes.data.slice(0, 15).reverse().map((item) => ({
              id: item.id,
              role: 'user',
              content: item.prompt,
              timestamp: new Date(item.created_at),
              status: 'success',
            }));
            setConversation(loadedHistory);
          }
        }

        // Check AI key config for BYOK badge
        fetch('/api/profile/ai-config')
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (active && (data?.keySource === 'byok' || data?.keyConfigured)) {
              setKeySource('byok');
            }
          })
          .catch(() => { });

        hydratedTargetRef.current = targetKey;
      } catch (err) {
        if (!active) return;
        setProjectStatus('error');
        console.error('Project hydration error:', err);
        toast.error('Failed to load project from Supabase.');
      } finally {
        isHydratingRef.current = false;
      }
    }

    void loadInitialProject();
    return () => {
      active = false;
    };
  }, [isLoading, user?.id, router, supabase, persistFilesToCache]);

  // Synchronize WebContainer runtime snapshot (previewUrl, errors)
  useEffect(() => {
    const unsub = webcontainerManager.subscribeSnapshot((snap) => {
      setWebcontainerUrl(snap.previewUrl);
      if (snap.lastError) {
        setPreviewError(stripAnsi(snap.lastError.message));
      } else if (snap.state === 'running' || snap.state === 'ready') {
        setPreviewError('');
      }
    });
    return unsub;
  }, []);

  // Automatic Silent Self-Healing Engine (up to 3 retries per user prompt cycle)
  useEffect(() => {
    if (!previewError || isWorking || selfHealAttemptsRef.current >= 3) return;
    const isFatalError =
      /Module not found|Cannot find module|SyntaxError|ReferenceError|TypeError|Failed to compile|Export .* was not found/i.test(
        previewError
      );
    if (!isFatalError) return;

    const timer = setTimeout(() => {
      if (selfHealAttemptsRef.current >= 3 || isWorking) return;
      selfHealAttemptsRef.current += 1;
      const cleanErr = stripAnsi(previewError);
      console.log(`[Silent Auto-Fix] Attempt ${selfHealAttemptsRef.current}/3:`, cleanErr.slice(0, 100));
      void generate(
        `Diagnose and repair this runtime/compilation error automatically: ${cleanErr}`,
        'debug',
        undefined,
        { isSilentSelfHeal: true, errorText: cleanErr }
      );
    }, 1500);

    return () => clearTimeout(timer);
  }, [previewError, isWorking]);

  // Auto-start the real WebContainer runtime whenever a project is hydrated.
  useEffect(() => {
    if (!project || projectStatus !== 'ready' || files.length === 0) return;
    const signature = files
      .filter((file) => !file.is_folder)
      .map((file) => `${file.path}:${file.content?.length ?? 0}:${file.updated_at ?? ''}`)
      .join('|');

    if (activeRunSignatureRef.current === `${project.id}:${signature}`) return;
    activeRunSignatureRef.current = `${project.id}:${signature}`;

    void webcontainerManager.runProject(files, project.id);
  }, [project?.id, projectStatus, files]);

  // Isolated Workspace Names
  const developerWorkspaceName = useMemo(() => getDeveloperWorkspaceName(project), [project]);
  const productWorkspaceName = useMemo(() => getProductWorkspaceName(project, productPlan), [project, productPlan]);
  const currentWorkspaceName = workspace === 'product' ? productWorkspaceName : developerWorkspaceName;

  // Rename Workspace (Isolated between Developer IDE and Product Manager)
  const handleRenameWorkspace = async (newName: string) => {
    if (!project) return;
    if (workspace === 'product') {
      const res = await renameProductWorkspace(supabase, project, productPlan, newName);
      if (res.success) {
        if (res.updatedProject) setProject(res.updatedProject);
        if (res.updatedPlan) setProductPlan(res.updatedPlan);
        toast.success('Product Manager workspace renamed');
      } else {
        toast.error(res.error?.message || 'Could not rename Product Manager workspace');
      }
    } else {
      const res = await renameDeveloperWorkspace(supabase, project, newName);
      if (res.success) {
        if (res.updatedProject) setProject(res.updatedProject);
        toast.success('Developer workspace renamed');
      } else {
        toast.error(res.error?.message || 'Could not rename Developer workspace');
      }
    }
  };

  // Rename Project (Global Project)
  const handleRenameProject = async (newName: string) => {
    if (!project) return;
    if (project.id === 'local-project') {
      setProject((prev) => (prev ? { ...prev, name: newName } : prev));
      toast.success('Project renamed');
      return;
    }
    const res = await updateProject(supabase, project.id, { name: newName });
    if (res.data) {
      setProject(res.data);
      toast.success('Project renamed');
    } else {
      toast.error('Could not rename project');
    }
  };

  // Run / Preview shortcut
  const handleRunPreview = () => {
    if (viewMode === 'code') {
      setViewMode('split');
    } else {
      setViewMode('preview');
    }
  };

  // Persist entire project state (dirty files, product plan, timestamp)
  const saveProject = useCallback(async (): Promise<boolean> => {
    if (!project) return false;
    setIsSaving(true);

    try {
      if (dirtyPaths.size > 0) {
        const dirtyFilesList = Array.from(dirtyPaths);
        const filesToUpsert = dirtyFilesList.map((path) => {
          const file = files.find((f) => f.path === path);
          return {
            path,
            name: file?.name || path.split('/').pop() || path,
            content: drafts[path] ?? file?.content ?? '',
            language: file?.language ?? 'typescript',
            isFolder: false,
          };
        });

        if (project.id !== 'local-project') {
          const res = await batchUpsertFiles(supabase, project.id, filesToUpsert);
          if (res.error) throw res.error;
        }

        const nextFiles = files.map((f) => {
          if (drafts[f.path] !== undefined) {
            return { ...f, content: drafts[f.path] };
          }
          return f;
        });
        setFiles(nextFiles);
        persistFilesToCache(project.id, nextFiles);
        setSavedContents((prev) => ({ ...prev, ...drafts }));
        for (const fileToSync of filesToUpsert) {
          void webcontainerManager.syncFile(fileToSync.path, fileToSync.content);
        }
      }

      if (productPlan && project.id !== 'local-project') {
        await saveProductPlanToDb(supabase, project.id, productPlan);
      }

      if (project.id !== 'local-project') {
        await supabase
          .from('projects')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', project.id);
      }

      setLastSavedAt(new Date());
      if (workspace === 'product') {
        toast.success('Product saved successfully!');
      } else {
        toast.success('Project saved successfully!');
      }
      return true;
    } catch (err: unknown) {
      console.error('Save project failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save project.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [project, dirtyPaths, files, drafts, persistFilesToCache, productPlan, supabase, workspace]);

  // Save active file to Supabase & hot-sync to WebContainer virtual filesystem
  const save = useCallback(async (): Promise<boolean> => {
    if (!project || !activeFile || !activePath) return false;
    setIsSaving(true);
    const contentToSave = currentDraft;

    try {
      if (project.id === 'local-project') {
        const updated = files.map((file) =>
          file.path === activeFile.path ? { ...file, content: contentToSave } : file
        );
        setFiles(updated);
        persistFilesToCache('local-project', updated);
        setSavedContents((prev) => ({ ...prev, [activeFile.path]: contentToSave }));
        void webcontainerManager.syncFile(activeFile.path, contentToSave);
        setLastSavedAt(new Date());
        toast.success(`Saved ${activeFile.path}`);
        return true;
      }

      const saved = await saveProjectFile(supabase, project.id, {
        path: activeFile.path,
        name: activeFile.name,
        content: contentToSave,
        language: activeFile.language,
        isFolder: false,
      });

      if (saved.error) {
        toast.error(`Save failed: ${saved.error.message}`);
        return false;
      }

      const updated = files.map((file) =>
        file.path === activeFile.path ? { ...file, content: contentToSave } : file
      );
      setFiles(updated);
      persistFilesToCache(project.id, updated);
      setSavedContents((prev) => ({ ...prev, [activeFile.path]: contentToSave }));
      void webcontainerManager.syncFile(activeFile.path, contentToSave);
      setLastSavedAt(new Date());
      toast.success(`Saved ${activeFile.path}`);
      return true;
    } finally {
      setIsSaving(false);
    }
  }, [activeFile, activePath, currentDraft, files, persistFilesToCache, project, supabase]);

  // Safe Debounced Autosave (1500ms after last Monaco edit)
  useEffect(() => {
    if (!isCurrentFileDirty || !activePath || !activeFile) return;

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const contentToSave = drafts[activePath] ?? activeFile.content;

        if (project?.id === 'local-project') {
          const updated = files.map((file) =>
            file.path === activeFile.path ? { ...file, content: contentToSave } : file
          );
          setFiles(updated);
          persistFilesToCache('local-project', updated);
          setSavedContents((prev) => ({ ...prev, [activeFile.path]: contentToSave }));
          void webcontainerManager.syncFile(activeFile.path, contentToSave);
          setLastSavedAt(new Date());
          return;
        }

        if (project?.id) {
          const saved = await saveProjectFile(supabase, project.id, {
            path: activeFile.path,
            name: activeFile.name,
            content: contentToSave,
            language: activeFile.language,
            isFolder: false,
          });

          if (!saved.error) {
            const updated = files.map((file) =>
              file.path === activeFile.path ? { ...file, content: contentToSave } : file
            );
            setFiles(updated);
            persistFilesToCache(project.id, updated);
            setSavedContents((prev) => ({ ...prev, [activeFile.path]: contentToSave }));
            void webcontainerManager.syncFile(activeFile.path, contentToSave);
            setLastSavedAt(new Date());
          }
        }
      } finally {
        setIsSaving(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [drafts, activePath, isCurrentFileDirty, activeFile, project, supabase, files, persistFilesToCache]);

  // Global Keyboard Shortcuts (Ctrl+S, Ctrl+Shift+S, Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          void saveProject();
        } else if (isCurrentFileDirty) {
          void save();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCurrentFileDirty, save, saveProject]);

  // AI Generation Pipeline (Build / Code / Debug) with Autonomous AI Assistant
  const generate = async (
    overridePrompt?: string,
    targetAiMode?: AiMode,
    referenceImage?: string,
    options?: { isSilentSelfHeal?: boolean; errorText?: string }
  ) => {
    const effectivePrompt = overridePrompt || prompt;
    if (!project || !effectivePrompt.trim()) return;

    const modeToUse = targetAiMode || aiMode;
    const isSilent = Boolean(options?.isSilentSelfHeal);

    if (modeToUse !== 'debug') {
      selfHealAttemptsRef.current = 0;
    }

    if (isCurrentFileDirty) {
      await save();
    }

    setIsWorking(true);

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;

    // For silent auto-fix: do NOT inject a technical instruction user bubble
    let newMessages: AiMessage[];

    if (isSilent) {
      setGenerationStage('Making a few final adjustments…');
      newMessages = [
        ...conversation,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: 'Making a few final adjustments…',
          mode: modeToUse,
          timestamp: new Date(),
          status: 'pending',
          stages: [
            'Checking application experience',
            'Applying adjustments',
            'Preparing your preview',
            'Everything is ready',
          ],
          currentStage: 'Applying adjustments',
        },
      ];
    } else {
      setGenerationStage('Understanding your request…');
      newMessages = [
        ...conversation,
        {
          id: userMsgId,
          role: 'user',
          content: effectivePrompt,
          mode: modeToUse,
          timestamp: new Date(),
          attachedImage: referenceImage,
        },
        {
          id: assistantMsgId,
          role: 'assistant',
          content: files.length === 0 ? "Let's build that for you." : 'Updating your app…',
          mode: modeToUse,
          timestamp: new Date(),
          status: 'pending',
          stages: [
            'Understanding your request',
            'Creating the main layout',
            'Adding visual assets',
            'Preparing your preview',
            'Finalizing the experience',
          ],
          currentStage: 'Understanding your request',
        },
      ];
    }

    setConversation(newMessages);
    try {
      localStorage.setItem(`codatron_chat_${project.id}`, JSON.stringify(newMessages));
    } catch { }

    try {
      if (isSilent) {
        setGenerationStage('Making a few final adjustments…');
      } else {
        setGenerationStage('Creating the main layout…');
        setConversation((prev) => {
          const next = prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, currentStage: 'Creating the main layout' }
              : msg
          );
          try {
            localStorage.setItem(`codatron_chat_${project.id}`, JSON.stringify(next));
          } catch { }
          return next;
        });
      }

      const response = await fetch(`/api/projects/${project.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectivePrompt,
          mode: modeToUse,
          activePath,
          selectedCode: selectedCode || undefined,
          previewError: previewError || undefined,
          files,
          referenceImage,
        }),
      });

      const body = (await response.json()) as AgentResponse & {
        message?: string;
        plan?: string[];
        cleanupReport?: { removedFiles: string[]; removedDeps: string[] };
      };
      if (!response.ok) throw new Error(body.message || 'Generation failed.');

      if (isSilent) {
        setGenerationStage('Preparing your preview…');
      } else {
        setGenerationStage('Adding visual assets…');
        setConversation((prev) => {
          const next = prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, currentStage: 'Adding visual assets' }
              : msg
          );
          try {
            localStorage.setItem(`codatron_chat_${project.id}`, JSON.stringify(next));
          } catch { }
          return next;
        });
      }

      const nextFiles = body.files ?? [];
      setFiles(nextFiles);
      setProjectStatus(nextFiles.length > 0 ? 'ready' : 'empty');
      persistFilesToCache(project.id, nextFiles);
      setDependencies(body.dependencies ?? []);

      // Keep clean user-facing Codatron AI identity
      setActiveAiDisplayName('Codatron AI');

      // If a project name was derived from first build, update project state
      if (body.projectName && body.projectName !== project.name) {
        setProject((prev) => (prev ? { ...prev, name: body.projectName! } : prev));
      }

      // Reset drafts & saved contents to newly returned source files
      const newSaved: Record<string, string> = {};
      for (const f of nextFiles) {
        if (!f.is_folder) newSaved[f.path] = f.content;
      }
      setSavedContents(newSaved);
      setDrafts(newSaved);

      if (!isSilent) {
        toast.success(body.summary || 'Your app is ready', {
          description: `${body.operations.length} ${body.operations.length === 1 ? 'file' : 'files'} updated`,
        });
      }

      setPrompt('');
      if (previewError && modeToUse === 'debug') {
        setPreviewError('');
      }

      // Live Preview is primary: default after generation is PREVIEW
      if (nextFiles.length > 0) {
        setViewMode('preview');
      }

      // Automate WebContainer boot & dev server run
      if (nextFiles.length > 0) {
        setGenerationStage('Preparing your preview…');
        setConversation((prev) => {
          const next = prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, currentStage: 'Preparing your preview' }
              : msg
          );
          try {
            localStorage.setItem(`codatron_chat_${project.id}`, JSON.stringify(next));
          } catch { }
          return next;
        });
        void webcontainerManager.runProject(nextFiles, project.id);
      }

      // Complete generation stage
      setGenerationStage(undefined);
      setConversation((prev) => {
        const next = prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
              ...msg,
              content: isSilent ? 'Everything is ready — preview updated' : (body.summary || 'Your app is ready.'),
              status: 'success' as const,
              operations: body.operations,
              filesCount: nextFiles.length,
              plan: body.plan,
              currentStage: isSilent ? 'Everything is ready' : 'Finalizing the experience',
              isFixed: isSilent || modeToUse === 'debug',
            }
            : msg
        );
        try {
          localStorage.setItem(`codatron_chat_${project.id}`, JSON.stringify(next));
        } catch { }
        return next;
      });

      // Auto-open created or modified file in Monaco state
      const createdOp = body.operations.find((op) => op.type === 'create');
      const updatedOp = body.operations.find((op) => op.type === 'update');
      const targetOpPath = createdOp?.path || updatedOp?.path;

      if (targetOpPath) {
        const targetFile = nextFiles.find((f) => f.path === targetOpPath);
        if (targetFile) {
          setOpenTabs((prev) => (prev.includes(targetFile.path) ? prev : [...prev, targetFile.path]));
          setActivePath(targetFile.path);
        }
      }
    } catch (cause) {
      const errMsg = cause instanceof Error ? cause.message : 'Generation failed.';
      console.error('[AI Generation/Repair Error]', errMsg);
      setGenerationStage(undefined);
      setConversation((prev) => {
        const next = prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
              ...msg,
              status: 'error' as const,
              error: errMsg,
              content: isSilent
                ? "I couldn't finish this change automatically. You can ask me to try again or open Diagnostics for details."
                : `Generation failed: ${errMsg}`,
              isExhaustedRetry: isSilent,
            }
            : msg
        );
        try {
          localStorage.setItem(`codatron_chat_${project.id}`, JSON.stringify(next));
        } catch { }
        return next;
      });

      if (!isSilent) {
        toast.error(errMsg);
      }
    } finally {
      setIsWorking(false);
    }
  };

  // Fix with AI Debug
  const fixWithAI = async (errorText: string) => {
    const cleanErr = stripAnsi(errorText);
    setAiMode('debug');
    setShowAiPanel(true);
    setPreviewError(cleanErr);
    await generate(`Diagnose and fix this error: ${cleanErr}`, 'debug');
  };

  // File operations handlers
  const handleCreateFile = async (filePath: string) => {
    if (!project) return;
    const cleanPath = filePath.trim().replace(/^\//, '');
    if (!cleanPath) return;

    const name = cleanPath.split('/').pop() || cleanPath;

    if (project.id === 'local-project') {
      const newFile: ProjectFile = {
        id: `f-${Date.now()}`,
        project_id: project.id,
        name,
        path: cleanPath,
        content: '',
        language: cleanPath.endsWith('.py')
          ? 'python'
          : cleanPath.endsWith('.java')
            ? 'java'
            : cleanPath.endsWith('.cpp')
              ? 'cpp'
              : cleanPath.endsWith('.json')
                ? 'json'
                : cleanPath.endsWith('.css')
                  ? 'css'
                  : 'typescript',
        is_folder: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const updated = [...files.filter((f) => f.path !== cleanPath), newFile];
      setFiles(updated);
      setProjectStatus('ready');
      persistFilesToCache('local-project', updated);
      openFile(newFile);
      void webcontainerManager.syncFile(cleanPath, '');
      toast.success(`Created ${cleanPath}`);
      return;
    }

    try {
      const res = await fetch(`/api/projects/${project.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: cleanPath,
          name,
          content: '',
          isFolder: false,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to create file');
      }

      const { file: createdFile } = await res.json();
      const refreshed = await getProjectFiles(supabase, project.id);
      const newFiles = refreshed.data || [...files.filter((f) => f.path !== cleanPath), createdFile];
      setFiles(newFiles);
      setProjectStatus('ready');
      persistFilesToCache(project.id, newFiles);
      const target = newFiles.find((f) => f.path === cleanPath) || createdFile;
      if (target) openFile(target);
      void webcontainerManager.syncFile(cleanPath, '');
      toast.success(`Created ${cleanPath}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Create file failed');
    }
  };

  const handleCreateFolder = async (folderPath: string) => {
    if (!project) return;
    const cleanPath = folderPath.trim().replace(/^\//, '');
    if (!cleanPath) return;
    const name = cleanPath.split('/').pop() || cleanPath;

    if (project.id === 'local-project') {
      const folderPlaceholder: ProjectFile = {
        id: `folder-${Date.now()}`,
        project_id: project.id,
        name,
        path: cleanPath,
        content: '',
        language: 'plaintext',
        is_folder: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const updated = [...files, folderPlaceholder];
      setFiles(updated);
      setProjectStatus('ready');
      persistFilesToCache('local-project', updated);
      toast.success(`Created folder ${cleanPath}`);
      return;
    }

    try {
      const res = await fetch(`/api/projects/${project.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: cleanPath,
          name,
          content: '',
          isFolder: true,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to create folder');
      }

      const refreshed = await getProjectFiles(supabase, project.id);
      if (refreshed.data) {
        setFiles(refreshed.data);
        setProjectStatus('ready');
        persistFilesToCache(project.id, refreshed.data);
        toast.success(`Created folder ${cleanPath}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Create folder failed');
    }
  };

  const handleRenameFile = async (file: ProjectFile, newPath: string) => {
    if (!project) return;
    if (workspace !== 'developer') {
      toast.error('File operations are restricted to the Developer IDE');
      return;
    }
    if (project.id === 'local-project') {
      const updated = files.map((f) => (f.path === file.path ? { ...f, path: newPath } : f));
      setFiles(updated);
      persistFilesToCache('local-project', updated);
      setOpenTabs((prev) => prev.map((p) => (p === file.path ? newPath : p)));
      if (activePath === file.path) setActivePath(newPath);
      void webcontainerManager.renameFile(file.path, newPath);
      toast.success(`Renamed to ${newPath}`);
      return;
    }

    const res = await renameProjectFile(supabase, project.id, file, newPath);
    if (res.error) {
      toast.error(`Rename failed: ${res.error.message}`);
      return;
    }

    const refreshed = await getProjectFiles(supabase, project.id);
    if (refreshed.data) {
      setFiles(refreshed.data);
      persistFilesToCache(project.id, refreshed.data);
      setOpenTabs((prev) => prev.map((p) => (p === file.path ? newPath : p)));
      if (activePath === file.path) setActivePath(newPath);
      void webcontainerManager.renameFile(file.path, newPath);
      toast.success(`Renamed to ${newPath}`);
    }
  };

  const handleDeleteFile = async (file: ProjectFile) => {
    if (!project) return;

    const cleanupDeletedFile = (deletedPath: string, isFolder: boolean, updatedFiles: ProjectFile[]) => {
      const isAffected = (p: string) => p === deletedPath || (isFolder && p.startsWith(`${deletedPath}/`));

      setDrafts((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (isAffected(k)) delete next[k];
        }
        return next;
      });

      setSavedContents((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (isAffected(k)) delete next[k];
        }
        return next;
      });

      let nextTabs = openTabs.filter((p) => !isAffected(p));
      let nextActive = activePath;

      if (isAffected(activePath)) {
        if (nextTabs.length > 0) {
          nextActive = nextTabs[nextTabs.length - 1];
        } else {
          const nonFolderFiles = updatedFiles.filter((f) => !f.is_folder);
          if (nonFolderFiles.length > 0) {
            nextActive = nonFolderFiles[0].path;
            nextTabs = [nextActive];
          } else {
            nextActive = '';
          }
        }
        setActivePath(nextActive);
      }
      setOpenTabs(nextTabs);
    };

    if (project.id === 'local-project') {
      const updated = files.filter(
        (f) => f.path !== file.path && !f.path.startsWith(`${file.path}/`)
      );
      setFiles(updated);
      setProjectStatus(updated.length > 0 ? 'ready' : 'empty');
      persistFilesToCache('local-project', updated);
      cleanupDeletedFile(file.path, file.is_folder, updated);
      void webcontainerManager.removeFile(file.path);
      toast.success(`Deleted ${file.path}`);
      return;
    }

    try {
      const res = await fetch(`/api/projects/${project.id}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path, isFolder: file.is_folder }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to delete file');
      }

      const refreshed = await getProjectFiles(supabase, project.id);
      const nextFiles = refreshed.data || files.filter((f) => f.path !== file.path && !f.path.startsWith(`${file.path}/`));
      setFiles(nextFiles);
      setProjectStatus(nextFiles.length > 0 ? 'ready' : 'empty');
      persistFilesToCache(project.id, nextFiles);
      cleanupDeletedFile(file.path, file.is_folder, nextFiles);
      void webcontainerManager.removeFile(file.path);
      toast.success(`Deleted ${file.path}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleExportZip = async () => {
    if (!project || files.length === 0) return;
    try {
      toast.loading('Packaging project as ZIP…', { id: 'export-zip' });
      await exportProjectToZip(project.name, files);
      toast.success('Project exported successfully!', { id: 'export-zip' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ZIP export failed', { id: 'export-zip' });
    }
  };

  if (projectStatus === 'loading' || !project) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#02060f]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
          <p className="text-xs text-slate-400 font-medium">Hydrating project from Supabase…</p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-[#02060f] text-slate-100 overflow-hidden select-none">
      <Script src="/coi-serviceworker.js" strategy="afterInteractive" />
      {/* Workspace Header */}
      <WorkspaceHeader
        project={project}
        activePath={activePath}
        dirty={workspace === 'product' ? isProductDirty : isCurrentFileDirty}
        isWorking={isWorking}
        saveState={workspace === 'product' ? (isSaving ? 'saving' : isProductDirty ? 'unsaved' : 'saved') : saveState}
        saveContext={saveContext}
        hasFiles={files.length > 0}
        hasActiveFile={Boolean(activeFile && activePath)}
        lastSavedAt={lastSavedAt}
        workspace={workspace}
        workspaceName={currentWorkspaceName}
        onWorkspaceChange={handleWorkspaceChange}
        onSave={save}
        onSaveProject={saveProject}
        onNewProject={() => setIsNewModalOpen(true)}
        onExportZip={handleExportZip}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        showFiles={showFiles}
        onToggleFiles={() => setShowFiles((prev) => !prev)}
        showAiPanel={showAiPanel}
        onToggleAiPanel={() => setShowAiPanel((prev) => !prev)}
        onRenameProject={handleRenameProject}
        onRenameWorkspace={handleRenameWorkspace}
        onRunPreview={handleRunPreview}
      />

      {/* Main Workspace: Dedicated Product Manager Workspace OR Developer IDE */}
      {workspace === 'product' ? (
        <ProductWorkspace
          project={project}
          files={files}
          productPlan={productPlan}
          workspaceName={productWorkspaceName}
          onPlanGenerated={handlePlanGenerated}
          onFilesUpdated={handleFilesUpdatedFromPM}
          onSwitchToDeveloper={handleSwitchToDeveloper}
          onRenameWorkspace={handleRenameWorkspace}
        />
      ) : (
        <div className={`flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden relative ${isDragging ? 'select-none [&_iframe]:pointer-events-none' : ''}`}>
          {/* Upper Workspace: Explorer | Center | Assistant */}
          <div
            className="flex-1 min-h-0 min-w-0 grid overflow-hidden w-full"
            style={{
              gridTemplateColumns,
            }}
          >
            {/* Panel 1: Primary AI Workspace (Conversation + Real Generation + Model + Composer) */}
            {showAiPanel && (
              <div
                className="h-full min-h-0 min-w-0 overflow-hidden flex flex-col bg-[#0b0c16] border-r border-white/10"
                style={{ width: `${aiWorkspaceWidth}px`, minWidth: '320px', maxWidth: '640px' }}
              >
                <AIWorkspace
                  files={files}
                  activePath={activePath}
                  dirtyPaths={dirtyPaths}
                  onOpenFile={openFile}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  onRenameFile={handleRenameFile}
                  onDeleteFile={handleDeleteFile}
                  prompt={prompt}
                  setPrompt={setPrompt}
                  selectedCode={selectedCode}
                  onClearSelectedCode={() => setSelectedCode('')}
                  previewError={previewError}
                  onClearPreviewError={() => setPreviewError('')}
                  isWorking={isWorking}
                  onGenerate={generate}
                  onOpenDiagnostics={() => setShowDiagnosticsModal(true)}
                  projectId={project?.id}
                  currentMode={aiMode}
                  onModeChange={setAiMode}
                  conversation={conversation}
                  generationStage={generationStage}
                  onSelectGeneratedFile={(filePath) => {
                    const f = files.find((item) => item.path === filePath);
                    if (f) {
                      openFile(f);
                      setViewMode('code');
                    }
                  }}
                  keySource={keySource}
                  modelDisplayName={activeAiDisplayName}
                />
              </div>
            )}

            {/* Drag Handle: AI Workspace to Center */}
            {showAiPanel && (
              <div
                onMouseDown={handleAiWorkspaceMouseDown}
                className="w-1 h-full cursor-col-resize bg-white/5 hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors select-none z-10 flex items-center justify-center group"
                title="Drag to resize AI Workspace"
              >
                <div className="w-0.5 h-6 rounded bg-slate-600 group-hover:bg-indigo-300" />
              </div>
            )}

            {/* Panel 2: Center Workspace (Live Preview Center Stage | Optional Code Monaco | Split) */}
            <div className="h-full min-h-0 min-w-0 flex flex-col bg-[#090a12] overflow-hidden">
              {/* Editor Tab Bar */}
              <EditorTabBar
                files={files}
                openTabs={openTabs}
                activePath={activePath}
                dirtyPaths={dirtyPaths}
                onSelectTab={(path) => {
                  const f = files.find((item) => item.path === path);
                  if (f) openFile(f);
                }}
                onCloseTab={closeTab}
                viewMode={viewMode}
                setViewMode={setViewMode}
                viewport={viewport}
                setViewport={setViewport}
                showFiles={showFiles}
                onToggleFiles={() => setShowFiles((prev) => !prev)}
                showTerminal={showDiagnosticsModal}
                onToggleTerminal={() => setShowDiagnosticsModal((prev) => !prev)}
                onOpenDiagnostics={() => setShowDiagnosticsModal(true)}
              />

              {/* Center Content: Empty Canvas OR Code / Preview / Split */}
              <div className="flex-1 min-h-0 min-w-0 relative overflow-hidden">
                {/* PREVIEW EMPTY CANVAS (AI App Builder Placeholder when no files yet) */}
                {viewMode === 'preview' && files.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#090a14] select-none">
                    <div className="max-w-md mx-auto space-y-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 mx-auto shadow-2xl">
                        <Sparkles className="h-7 w-7 text-indigo-400 animate-pulse" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">
                          AI Application Builder
                        </h3>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                          Your live application preview will appear here automatically. Describe the application you want to build in the AI Workspace on the left.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPrompt('Build a Netflix clone with dark theme, hero banner, movie rows, search, and demo data');
                            setShowAiPanel(true);
                          }}
                          className="text-[11px] rounded-lg border border-indigo-500/30 bg-indigo-950/30 hover:bg-indigo-950/60 px-3 py-1.5 text-indigo-300 transition"
                        >
                          🎬 Netflix Clone
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPrompt('Build a SaaS analytics dashboard with chart widgets, KPI metric cards, and dark mode');
                            setShowAiPanel(true);
                          }}
                          className="text-[11px] rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] px-3 py-1.5 text-slate-300 transition"
                        >
                          📊 SaaS Analytics Dashboard
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPrompt('Build an e-commerce storefront with cart drawer, product grid, and category filters');
                            setShowAiPanel(true);
                          }}
                          className="text-[11px] rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] px-3 py-1.5 text-slate-300 transition"
                        >
                          🛍️ E-commerce Store
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* EMPTY PROJECT OVERVIEW (Code view when no files) */}
                {projectStatus === 'empty' && viewMode === 'code' && (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#090a14] select-none">
                    <div className="max-w-md mx-auto space-y-5">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 mx-auto shadow-2xl">
                        <Code2 className="h-7 w-7" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">
                          Empty Project: {project.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          No files created yet. Choose how you want to build this application:
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                        <button
                          type="button"
                          onClick={() => {
                            setAiMode('build');
                            setShowAiPanel(true);
                          }}
                          className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 hover:bg-indigo-950/40 p-3.5 transition group"
                        >
                          <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs mb-1">
                            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                            <span>AI Build Mode</span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Describe your app in the AI Workspace on the left.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setWorkspace('product')}
                          className="rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] p-3.5 transition group"
                        >
                          <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs mb-1">
                            <Compass className="h-3.5 w-3.5 text-purple-400" />
                            <span>Product Manager</span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Define Vision, Personas, MVP, Features, and Roadmap before building.
                          </p>
                        </button>
                      </div>

                      <div className="pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleCreateFile('app/page.tsx')}
                          className="text-xs text-slate-400 hover:text-white gap-1.5"
                        >
                          <FilePlus className="h-3.5 w-3.5" />
                          <span>Or create file manually</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 1. CODE ONLY VIEW */}
                {projectStatus === 'ready' && viewMode === 'code' && (
                  <div className="h-full w-full flex min-w-0 min-h-0 overflow-hidden">
                    {showFiles && (
                      <div className="w-56 shrink-0 h-full border-r border-white/10 bg-[#0b0c16] overflow-hidden">
                        <FileExplorer
                          files={files}
                          activePath={activePath}
                          dirtyPaths={dirtyPaths}
                          onOpenFile={openFile}
                          onCreateFile={handleCreateFile}
                          onCreateFolder={handleCreateFolder}
                          onRenameFile={handleRenameFile}
                          onDeleteFile={handleDeleteFile}
                        />
                      </div>
                    )}
                    <div className="flex-1 p-2.5 min-w-0 min-h-0 overflow-hidden">
                      {activeFile ? (
                        <CodeEditor
                          path={activeFile.path}
                          value={currentDraft}
                          language={activeFile.language}
                          onChange={(val) => {
                            setDrafts((prev) => ({ ...prev, [activeFile.path]: val }));
                          }}
                          onSelectionChange={setSelectedCode}
                          onCursorChange={(line, col) => setCursorPos({ line, col })}
                          onSave={save}
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-500">
                          <FileQuestion className="h-10 w-10 text-slate-600 mb-3" />
                          <h3 className="text-sm font-semibold text-slate-300 mb-1">
                            No File Selected
                          </h3>
                          <p className="text-xs max-w-sm text-slate-500">
                            Select a file from the file explorer or generated file list to start editing.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. PREVIEW ONLY VIEW (Center Stage Primary) */}
                {viewMode === 'preview' && files.length > 0 && (
                  <LivePreview
                    files={files}
                    dependencies={dependencies}
                    controlledViewport={viewport}
                    onPreviewError={setPreviewError}
                    onFixWithAI={fixWithAI}
                    webcontainerUrl={webcontainerUrl}
                    onOpenDiagnostics={() => setShowDiagnosticsModal(true)}
                    onPromptSelect={(selectedPrompt) => {
                      setPrompt(selectedPrompt);
                      void generate(selectedPrompt, 'build');
                    }}
                    onSwitchToTerminal={() => {
                      setShowDiagnosticsModal(true);
                    }}
                  />
                )}

                {/* 3. SPLIT VIEW (Code + Preview side-by-side) */}
                {viewMode === 'split' && (
                  <div className="h-full w-full flex overflow-hidden min-w-0 min-h-0">
                    <div
                      className="h-full flex min-w-0 min-h-0 overflow-hidden border-r border-white/10"
                      style={{ width: `${splitPercent}%` }}
                    >
                      {showFiles && (
                        <div className="w-52 shrink-0 h-full border-r border-white/10 bg-[#0b0c16] overflow-hidden">
                          <FileExplorer
                            files={files}
                            activePath={activePath}
                            dirtyPaths={dirtyPaths}
                            onOpenFile={openFile}
                            onCreateFile={handleCreateFile}
                            onCreateFolder={handleCreateFolder}
                            onRenameFile={handleRenameFile}
                            onDeleteFile={handleDeleteFile}
                          />
                        </div>
                      )}
                      <div className="flex-1 p-2 min-w-0 min-h-0 overflow-hidden">
                        {activeFile ? (
                          <CodeEditor
                            path={activeFile.path}
                            value={currentDraft}
                            language={activeFile.language}
                            onChange={(val) => {
                              setDrafts((prev) => ({ ...prev, [activeFile.path]: val }));
                            }}
                            onSelectionChange={setSelectedCode}
                            onCursorChange={(line, col) => setCursorPos({ line, col })}
                            onSave={save}
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-500">
                            <FileQuestion className="h-8 w-8 text-slate-600 mb-2" />
                            <p className="text-xs text-slate-500">Select a file to edit code</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Resizer Handle between Code and Preview */}
                    <div
                      onMouseDown={handleSplitMouseDown}
                      className="w-1 h-full cursor-col-resize bg-white/5 hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors select-none z-10 flex items-center justify-center group shrink-0"
                      title="Drag to resize split panels"
                    >
                      <div className="w-0.5 h-6 rounded bg-slate-600 group-hover:bg-indigo-300" />
                    </div>

                    <div className="flex-1 h-full min-w-0 min-h-0 overflow-hidden">
                      <LivePreview
                        files={files}
                        dependencies={dependencies}
                        controlledViewport={viewport}
                        onPreviewError={setPreviewError}
                        onFixWithAI={fixWithAI}
                        webcontainerUrl={webcontainerUrl}
                        onOpenDiagnostics={() => setShowDiagnosticsModal(true)}
                        onPromptSelect={(selectedPrompt) => {
                          setPrompt(selectedPrompt);
                          void generate(selectedPrompt, 'build');
                        }}
                        onSwitchToTerminal={() => {
                          setShowDiagnosticsModal(true);
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 4. TERMINAL ONLY VIEW IN CENTER (Fallback) */}
                {viewMode === 'terminal' && (
                  <TerminalPanel
                    files={files}
                    onServerReady={(url) => setWebcontainerUrl(url)}
                    onErrorDetected={(err) => setPreviewError(err)}
                    onClose={() => setViewMode('preview')}
                  />
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Bottom Status Bar */}
      <StatusBar
        dirty={isCurrentFileDirty}
        language={activeFile?.language ?? 'typescript'}
        cursorLine={cursorPos.line}
        cursorCol={cursorPos.col}
        previewError={previewError || null}
        isWorking={isWorking}
        model={activeAiDisplayName}
        onOpenPreviewError={() => {
          setAiMode('debug');
          setShowAiPanel(true);
        }}
      />

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        files={files}
        onOpenFile={openFile}
        onSave={save}
        onExportZip={handleExportZip}
        onSelectViewMode={setViewMode}
        onToggleTerminal={() => {
          setShowDiagnosticsModal((prev) => !prev);
        }}
        onSelectAiMode={(m) => {
          if (m === 'build' || m === 'code' || m === 'debug') {
            setAiMode(m);
            setShowAiPanel(true);
          }
        }}
        onNewFile={() => {
          setIsPaletteCreateDialogOpen('file');
          setPaletteCreateInput('');
        }}
        onNewFolder={() => {
          setIsPaletteCreateDialogOpen('folder');
          setPaletteCreateInput('');
        }}
      />

      {/* Palette Create File/Folder Dialog */}
      <Dialog
        open={isPaletteCreateDialogOpen !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsPaletteCreateDialogOpen(null);
            setPaletteCreateInput('');
          }
        }}
      >
        <DialogContent className="bg-[#121324] border-white/10 text-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              {isPaletteCreateDialogOpen === 'folder' ? (
                <FolderPlus className="h-4 w-4 text-indigo-400" />
              ) : (
                <FilePlus className="h-4 w-4 text-indigo-400" />
              )}
              <span>Create New {isPaletteCreateDialogOpen === 'folder' ? 'Folder' : 'File'}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={paletteCreateInput}
              onChange={(e) => setPaletteCreateInput(e.target.value)}
              placeholder={
                isPaletteCreateDialogOpen === 'folder'
                  ? 'e.g. components/ui'
                  : 'e.g. components/Header.tsx'
              }
              className="bg-black/30 border-white/10 text-xs font-mono"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = paletteCreateInput.trim();
                  if (val) {
                    if (isPaletteCreateDialogOpen === 'folder') {
                      void handleCreateFolder(val);
                    } else {
                      void handleCreateFile(val);
                    }
                  }
                  setIsPaletteCreateDialogOpen(null);
                  setPaletteCreateInput('');
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsPaletteCreateDialogOpen(null);
                setPaletteCreateInput('');
              }}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const val = paletteCreateInput.trim();
                if (val) {
                  if (isPaletteCreateDialogOpen === 'folder') {
                    void handleCreateFolder(val);
                  } else {
                    void handleCreateFile(val);
                  }
                }
                setIsPaletteCreateDialogOpen(null);
                setPaletteCreateInput('');
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Project Modal Dialog */}
      <NewProjectModal
        open={isNewModalOpen}
        onOpenChange={setIsNewModalOpen}
        onProjectCreated={(pid, createdMode) => {
          setIsNewModalOpen(false);
          const view = createdMode === 'product' ? 'product' : 'developer';
          setWorkspace(view);
          router.push(`/editor?project=${pid}&view=${view}`);
        }}
      />

      {/* Secondary Developer Diagnostics Modal (Logs, Runtime, Dependencies) */}
      <DiagnosticsModal
        open={showDiagnosticsModal}
        onOpenChange={setShowDiagnosticsModal}
        files={files}
        dependencies={dependencies}
        webcontainerUrl={webcontainerUrl}
        previewError={previewError}
        onServerReady={(url) => setWebcontainerUrl(url)}
        onErrorDetected={(err) => setPreviewError(err)}
        onFixWithAI={fixWithAI}
      />
    </main>
  );
}