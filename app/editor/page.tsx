'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
import { useCredits } from '@/components/credit-provider';
import { CreditExhaustionDialog } from '@/components/credits/credit-exhaustion-dialog';
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
  createProjectWithMode,
  updateProject,
  saveProjectFile,
  batchUpsertFiles,
  renameProjectFile,
  getDeveloperWorkspaceName,
  getProductWorkspaceName,
  renameDeveloperWorkspace,
  renameProductWorkspace,
  isValidUuid,
} from '@/lib/db';
import { getProductPlanFromDb, saveProductPlanToDb, isRealPlan } from '@/lib/db/product';
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

export type ProjectStatus = 'loading' | 'empty' | 'ready' | 'error' | 'not_found' | 'no_project';

export type EditorLifecycleState =
  | 'ROUTE_LOADING'
  | 'AUTH_READY'
  | 'PROJECT_LOADING'
  | 'PROJECT_HYDRATED'
  | 'EDITOR_READY'
  | 'RUNTIME_STARTING'
  | 'PREVIEW_LOADING'
  | 'PREVIEW_READY'
  | 'FAILED';

export type InternalBuildState =
  | 'IDLE'
  | 'BUILDING'
  | 'ANALYZING'
  | 'GENERATING'
  | 'SYNCING_FILES'
  | 'STARTING_PREVIEW'
  | 'COMPILING'
  | 'VERIFYING'
  | 'AUTO_FIXING'
  | 'REBUILDING'
  | 'READY'
  | 'FAILED';

import { isApplicationFatalError } from '@/lib/runtime/error-classifier';
export { isApplicationFatalError };

function EditorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryPid = searchParams?.get('project') || searchParams?.get('id') || null;
  const rawView = searchParams?.get('view') || searchParams?.get('role') || null;
  const queryView = rawView === 'product' || rawView === 'product-manager' ? 'product' : rawView === 'developer' ? 'developer' : null;
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

  // Credit quota and upgrade state
  const { refreshCredits, creditsRemaining, isAdmin: isUserAdmin } = useCredits();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // AI Conversation & Stage state
  const [conversation, setConversation] = useState<AiMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [generationStage, setGenerationStage] = useState<string | undefined>(undefined);
  const [keySource, setKeySource] = useState<'platform' | 'byok'>('platform');

  // Command palette
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // AI & Editor working states
  const [prompt, setPrompt] = useState('');
  const [activeAiDisplayName, setActiveAiDisplayName] = useState<string>('Codatron AI');
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
  const loadSeqRef = useRef<number>(0);
  const activeRunSignatureRef = useRef<string | null>(null);
  const selfHealAttemptsRef = useRef<number>(0);
  const [internalBuildState, setInternalBuildState] = useState<InternalBuildState>('IDLE');
  const internalBuildStateRef = useRef<InternalBuildState>('IDLE');
  const [editorLifecycleState, setEditorLifecycleState] = useState<EditorLifecycleState>('ROUTE_LOADING');
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const perfTimersRef = useRef<{
    routeStart: number;
    shellRender: number;
    authReady?: number;
    projectFetchStart?: number;
    projectFetchEnd?: number;
    filesFetchEnd?: number;
    editorReady?: number;
    runtimeStart?: number;
    runtimeReady?: number;
    previewReady?: number;
  }>({
    routeStart: Date.now(),
    shellRender: Date.now(),
  });

  const transitionLifecycle = useCallback((nextState: EditorLifecycleState, detail?: string) => {
    setEditorLifecycleState(nextState);
    webcontainerManager.logInternal('EDITOR', detail ? `${nextState} — ${detail}` : nextState);
  }, []);

  const retryHydration = useCallback(() => {
    webcontainerManager.logInternal('PROJECT', 'retry requested');
    setProjectStatus('loading');
    hydratedTargetRef.current = null;
    loadSeqRef.current += 1;
    setReloadTrigger((prev) => prev + 1);
  }, []);

  const perfMetricsRef = useRef<{
    startTime: number;
    generationMs?: number;
    fileSyncMs?: number;
    runtimeReadyMs?: number;
  }>({ startTime: 0 });

  const transitionBuildState = useCallback((nextState: InternalBuildState, detail?: string) => {
    internalBuildStateRef.current = nextState;
    setInternalBuildState(nextState);
    webcontainerManager.logInternal('BUILD', detail ? `${nextState} — ${detail}` : nextState);
  }, []);

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
  const [isProductDirty, setIsProductDirty] = useState(false);
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
      // Determine the authoritative Product Manager workspace name to preserve
      const currentPmName =
        productPlan?.vision?.workspaceName ||
        (project?.id && typeof window !== 'undefined'
          ? localStorage.getItem(`codatron_product_name_${project.id}`)
          : null) ||
        project?.name ||
        'Product Strategy';

      const planWithPreservedName: ProductPlan = {
        ...plan,
        vision: {
          ...plan.vision,
          workspaceName: currentPmName,
        },
      };

      setProductPlan(planWithPreservedName);
      setIsProductDirty(false);
      setLastSavedAt(new Date());
      if (project) {
        void saveProductPlanToDb(supabase, project.id, planWithPreservedName);
        try {
          localStorage.setItem(`codatron_plan_${project.id}`, JSON.stringify(planWithPreservedName));
          localStorage.setItem(`codatron_product_name_${project.id}`, currentPmName);
        } catch { }
      }
    },
    [project, supabase, productPlan]
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
      if (project) {
        router.replace(`/editor?project=${project.id}&view=${newWs}`, { scroll: false });
      }
    },
    [project, router]
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

  // Load project on mount: Hydrate from Supabase and URL query (Guarded with request sequencing)
  useEffect(() => {
    webcontainerManager.logInternal('EDITOR', 'route opened');

    if (!isLoading && !user && process.env.NODE_ENV === 'production') {
      router.replace('/login?next=/editor');
      return;
    }
    if (isLoading) return;

    perfTimersRef.current.authReady = Date.now();
    transitionLifecycle('AUTH_READY');
    webcontainerManager.logInternal('AUTH', 'authentication verified');

    const currentSeq = ++loadSeqRef.current;
    let active = true;

    const targetKey = `${user ? user.id : 'anon'}_${queryPid || 'default'}`;

    if (queryView && workspace !== queryView) {
      setWorkspace(queryView);
    }

    if (hydratedTargetRef.current === targetKey && project !== null) {
      return;
    }

    // Safety timeout: 10 seconds per Section 7 (Never leave user stuck on infinite spinner)
    const timeoutId = setTimeout(() => {
      if (active && currentSeq === loadSeqRef.current && projectStatus === 'loading') {
        const cachedFilesStr = queryPid ? localStorage.getItem(`codatron_files_${queryPid}`) : null;
        if (cachedFilesStr) {
          try {
            const parsed = JSON.parse(cachedFilesStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setFiles(parsed);
              setProjectStatus('ready');
              transitionLifecycle('EDITOR_READY', 'Restored from local cache on timeout');
              toast.info('Loaded cached project version.', { id: 'cache-fallback' });
              return;
            }
          } catch { }
        }
        setProjectStatus('error');
        transitionLifecycle('FAILED', 'Project hydration timed out after 10s');
        webcontainerManager.logInternal('PROJECT', 'hydration failed (timeout after 10s)');
      }
    }, 10000);

    async function loadInitialProject() {
      perfTimersRef.current.projectFetchStart = Date.now();
      transitionLifecycle('PROJECT_LOADING', `Project ${queryPid || 'local'}`);
      webcontainerManager.logInternal('PROJECT', `loading project: ${queryPid || 'local'}`);

      // 1. Optimistic Hydration: If cached data exists for this project, restore in 0ms!
      if (queryPid) {
        try {
          const cachedFiles = localStorage.getItem(`codatron_files_${queryPid}`);
          const cachedProject = localStorage.getItem(`codatron_project_${queryPid}`);
          const cachedChat = localStorage.getItem(`codatron_chat_${queryPid}`);
          if (cachedFiles) {
            const parsed = JSON.parse(cachedFiles);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setFiles(parsed);
              setProjectStatus('ready');
              transitionLifecycle('EDITOR_READY', 'Optimistic cache hit');
              const initial =
                parsed.find((file: ProjectFile) => file.path === 'app/page.tsx' || file.path === 'main.py' || file.path === 'index.html') ??
                parsed.find((file: ProjectFile) => !file.is_folder);
              if (initial) {
                setOpenTabs((prev) => (prev.length > 0 ? prev : [initial.path]));
                setActivePath((prev) => prev || initial.path);
                setDrafts((prev) => (initial.path in prev ? prev : { ...prev, [initial.path]: initial.content }));
                setSavedContents((prev) => (initial.path in prev ? prev : { ...prev, [initial.path]: initial.content }));
              }
            }
          }
          if (cachedProject) {
            const parsedProj = JSON.parse(cachedProject);
            if (parsedProj && parsedProj.id === queryPid) {
              setProject(parsedProj);
            }
          }
          if (cachedChat) {
            const parsedChat = JSON.parse(cachedChat);
            if (Array.isArray(parsedChat) && parsedChat.length > 0) {
              setConversation(parsedChat);
            }
          }
        } catch { }
      }

      if (!project) {
        setProjectStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
      }

      if (!user || queryPid === 'local-project' || (queryPid && !isValidUuid(queryPid))) {
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
          if (savedPlan) {
            const parsed = JSON.parse(savedPlan);
            if (isRealPlan(parsed)) {
              setProductPlan(parsed);
            } else {
              localStorage.removeItem(`codatron_plan_${localPid}`);
            }
          }
        } catch { }

        try {
          const cachedChat = localStorage.getItem(`codatron_chat_${localPid}`);
          if (cachedChat) {
            const parsed = JSON.parse(cachedChat);
            if (Array.isArray(parsed) && parsed.length > 0) setConversation(parsed);
          }
        } catch { }

        setProject({
          id: localPid,
          user_id: user ? user.id : 'local-user',
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
        transitionLifecycle('PROJECT_HYDRATED', 'Local project');
        transitionLifecycle('EDITOR_READY', 'Local files loaded');

        if (initialFiles.length > 0) {
          const initial =
            initialFiles.find((file) => file.path === 'app/page.tsx' || file.path === 'main.py' || file.path === 'index.html') ??
            initialFiles.find((file) => !file.is_folder);
          if (initial) {
            setOpenTabs([initial.path]);
            setActivePath(initial.path);
            setDrafts({ [initial.path]: initial.content });
            setSavedContents({ [initial.path]: initial.content });
          }
        }
        hydratedTargetRef.current = targetKey;
        return;
      }

      // Authenticated User: Fetch Project & Files in parallel
      try {
        let current: Project | null = null;
        let projectFiles: ProjectFile[] = [];

        if (queryPid && isValidUuid(queryPid)) {
          const [fetchedProject, fetchedFiles] = await Promise.all([
            getProjectById(supabase, queryPid),
            getProjectFiles(supabase, queryPid),
          ]);
          if (!active || currentSeq !== loadSeqRef.current) return;
          if (fetchedProject.data) {
            current = fetchedProject.data;
            perfTimersRef.current.projectFetchEnd = Date.now();
            webcontainerManager.logInternal('PROJECT', 'project metadata loaded');
            if (fetchedFiles.data) {
              projectFiles = fetchedFiles.data;
              perfTimersRef.current.filesFetchEnd = Date.now();
              webcontainerManager.logInternal('PROJECT', `files loaded: ${projectFiles.length} files`);
            }
          } else {
            // Explicit PROJECT_NOT_FOUND state for non-existent requested project
            setProject(null);
            setFiles([]);
            setOpenTabs([]);
            setActivePath('');
            setProjectStatus('not_found');
            transitionLifecycle('FAILED', `Project ${queryPid} not found`);
            webcontainerManager.logInternal('PROJECT', `project not found: ${queryPid}`);
            return;
          }
        } else {
          // No project ID in URL: Check the user's project list
          const projects = await getProjects(supabase, user.id);
          if (!active || currentSeq !== loadSeqRef.current) return;
          if (!projects.data || projects.data.length === 0) {
            // User has 0 projects: First-time user empty state (NO_PROJECT)
            setProject(null);
            setFiles([]);
            setOpenTabs([]);
            setActivePath('');
            setConversation([]);
            setProjectStatus('no_project');
            transitionLifecycle('EDITOR_READY', 'First-time user (no projects)');
            webcontainerManager.logInternal('PROJECT', 'no projects found (empty state)');
            return;
          }

          current = projects.data[0];
          const fetchedFiles = await getProjectFiles(supabase, current.id);
          if (!active || currentSeq !== loadSeqRef.current) return;
          projectFiles = fetchedFiles.data ?? [];
        }

        if (!current) {
          setProject(null);
          setFiles([]);
          setProjectStatus('no_project');
          transitionLifecycle('EDITOR_READY', 'No project loaded');
          return;
        }

        // Synchronize URL and workspace view mode
        const activeView = (queryView === 'product' || queryView === 'developer') ? queryView : 'developer';
        setWorkspace(activeView);
        if (queryPid !== current.id || queryView !== activeView) {
          router.replace(`/editor?project=${current.id}&view=${activeView}`, { scroll: false });
        }

        setProject(current);
        setProductPlan(null);
        hydratedTargetRef.current = `${user ? user.id : 'anon'}_${current.id}`;
        try {
          localStorage.setItem(`codatron_project_${current.id}`, JSON.stringify(current));
        } catch { }

        setFiles(projectFiles);
        persistFilesToCache(current.id, projectFiles);

        transitionLifecycle('PROJECT_HYDRATED', `Project ${current.id}`);
        webcontainerManager.logInternal('PROJECT', 'hydration complete');

        if (projectFiles.length === 0) {
          setProjectStatus('empty');
          setOpenTabs([]);
          setActivePath('');
          transitionLifecycle('EDITOR_READY', 'Empty project');
        } else {
          setProjectStatus('ready');
          transitionLifecycle('EDITOR_READY', `${projectFiles.length} files ready`);
          webcontainerManager.logInternal('EDITOR', 'editor ready');

          const initial =
            projectFiles.find((file) => file.path === 'app/page.tsx' || file.path === 'main.py' || file.path === 'index.html') ??
            projectFiles.find((file) => !file.is_folder);

          if (initial) {
            setOpenTabs((prev) => (prev.length > 0 ? prev : [initial.path]));
            setActivePath((prev) => prev || initial.path);
            setDrafts((prev) => (initial.path in prev ? prev : { ...prev, [initial.path]: initial.content }));
            setSavedContents((prev) => (initial.path in prev ? prev : { ...prev, [initial.path]: initial.content }));
          }
        }

        perfTimersRef.current.editorReady = Date.now();
        const p = perfTimersRef.current;
        webcontainerManager.logInternal(
          'PERF',
          `route → shell: ${p.shellRender - p.routeStart}ms | auth: ${(p.authReady || p.routeStart) - p.routeStart}ms | project: ${(p.projectFetchEnd || 0) - (p.projectFetchStart || 0)}ms | files: ${(p.filesFetchEnd || 0) - (p.projectFetchStart || 0)}ms | editor ready: ${(p.editorReady || p.routeStart) - p.routeStart}ms`
        );

        // Non-blocking background loads for ancillary data
        void Promise.allSettled([
          getProductPlanFromDb(supabase, current.id).then((planRes) => {
            if (active && currentSeq === loadSeqRef.current) {
              setProductPlan(planRes.plan || null);
            }
          }),
          supabase
            .from('project_dependencies')
            .select('name,version')
            .eq('project_id', current.id)
            .then((depsRes) => {
              if (active && currentSeq === loadSeqRef.current && !depsRes.error && depsRes.data) {
                setDependencies(depsRes.data);
              }
            }),
          getProjectGenerations(supabase, current.id)
            .then((historyRes) => {
              if (active && currentSeq === loadSeqRef.current) {
                setIsChatLoading(false);
                if (historyRes.data && historyRes.data.length > 0) {
                  const existingCache = localStorage.getItem(`codatron_chat_${current.id}`);
                  if (!existingCache) {
                    const loadedHistory: AiMessage[] = [];
                    const reversedGenerations = [...historyRes.data.slice(0, 10)].reverse();
                    for (const gen of reversedGenerations) {
                      loadedHistory.push({
                        id: `user-${gen.id}`,
                        role: 'user',
                        content: gen.prompt,
                        timestamp: new Date(gen.created_at),
                      });
                      loadedHistory.push({
                        id: `asst-${gen.id}`,
                        role: 'assistant',
                        content: 'Done — I updated your project and the preview is ready.',
                        timestamp: new Date(new Date(gen.created_at).getTime() + 1000),
                        status: 'success',
                      });
                    }
                    if (loadedHistory.length > 0) {
                      setConversation(loadedHistory);
                      try {
                        localStorage.setItem(`codatron_chat_${current.id}`, JSON.stringify(loadedHistory));
                      } catch { }
                    }
                  }
                }
              }
            })
            .catch(() => {
              if (active) setIsChatLoading(false);
            }),
          fetch('/api/profile/ai-config')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (active && currentSeq === loadSeqRef.current && (data?.keySource === 'byok' || data?.keyConfigured)) {
                setKeySource('byok');
              }
            })
            .catch(() => { }),
        ]);

        hydratedTargetRef.current = targetKey;
      } catch (err) {
        if (!active || currentSeq !== loadSeqRef.current) return;
        setProjectStatus('error');
        transitionLifecycle('FAILED', err instanceof Error ? err.message : 'Hydration error');
        webcontainerManager.logInternal('PROJECT', 'hydration failed');
        console.error('Project hydration error:', err);
        toast.error("We're taking a little longer to load your project.", { id: 'project-load-err' });
      }
    }

    void loadInitialProject();
    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [isLoading, user?.id, queryPid, queryView, reloadTrigger, router, supabase, persistFilesToCache, transitionLifecycle]);

  // Synchronize WebContainer runtime snapshot (previewUrl, errors)
  useEffect(() => {
    const unsub = webcontainerManager.subscribeSnapshot((snap) => {
      setWebcontainerUrl(snap.previewUrl);
      if (snap.previewUrl) {
        transitionLifecycle('PREVIEW_READY', snap.previewUrl);
        webcontainerManager.logInternal('PREVIEW', 'ready');
      }
      if (snap.lastError) {
        setPreviewError(stripAnsi(snap.lastError.message));
      } else if (snap.state === 'running' || snap.state === 'ready') {
        setPreviewError('');
      }
    });
    return unsub;
  }, [transitionLifecycle]);

  // Automatic Silent Self-Healing Engine (up to 3 retries per user prompt cycle)
  useEffect(() => {
    if (!previewError || isWorking || selfHealAttemptsRef.current >= 3) return;
    if (!isApplicationFatalError(previewError)) return;

    // Settle delay: wait 1800ms before auto-fixing to avoid transient recompilations
    const timer = setTimeout(() => {
      if (selfHealAttemptsRef.current >= 3 || isWorking) return;
      selfHealAttemptsRef.current += 1;
      const cleanErr = stripAnsi(previewError);
      webcontainerManager.logInternal('VERIFY', `${cleanErr.slice(0, 100)} detected`);
      webcontainerManager.logInternal('DEBUG', `attempt ${selfHealAttemptsRef.current}/3`);
      transitionBuildState('AUTO_FIXING', `Attempt ${selfHealAttemptsRef.current}/3`);

      void generate(
        `Diagnose and repair this runtime/compilation error automatically: ${cleanErr}`,
        'debug',
        undefined,
        { isSilentSelfHeal: true, errorText: cleanErr }
      );
    }, 1800);

    return () => clearTimeout(timer);
  }, [previewError, isWorking, transitionBuildState]);

  // Handle Exhausted Auto-Fix Retries (after 3 attempts fail)
  useEffect(() => {
    if (selfHealAttemptsRef.current >= 3 && previewError && !isWorking && internalBuildStateRef.current !== 'FAILED') {
      transitionBuildState('FAILED', 'Auto-fix repair attempts exhausted (3/3)');
      setConversation((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          return prev.map((m) =>
            m.id === lastMsg.id
              ? {
                ...m,
                status: 'error' as const,
                error: previewError,
                content: "I couldn't finish this change automatically. You can ask me to try again or open Diagnostics for details.",
                isExhaustedRetry: true,
              }
              : m
          );
        }
        return prev;
      });
    }
  }, [previewError, isWorking, transitionBuildState]);

  // Auto-start the real WebContainer runtime in background (Independent of Editor Ready)
  useEffect(() => {
    if (!project || projectStatus !== 'ready' || files.length === 0 || isWorking) return;
    const signature = files
      .filter((file) => !file.is_folder)
      .map((file) => `${file.path}:${file.content?.length ?? 0}:${file.updated_at ?? ''}`)
      .join('|');

    if (activeRunSignatureRef.current === `${project.id}:${signature}`) return;
    activeRunSignatureRef.current = `${project.id}:${signature}`;

    transitionLifecycle('RUNTIME_STARTING', `Project ${project.id}`);
    if (webcontainerManager.isDevServerRunning() && webcontainerManager.getSnapshot().previewUrl) {
      webcontainerManager.logInternal('RUNTIME', `reused existing runtime on port ${webcontainerManager.getSnapshot().serverPort}`);
      transitionLifecycle('PREVIEW_READY', 'Existing server active');
    } else {
      webcontainerManager.logInternal('RUNTIME', 'boot started');
      transitionLifecycle('PREVIEW_LOADING', 'Dev server initializing');
      webcontainerManager.logInternal('PREVIEW', 'initialization started');
    }

    void webcontainerManager.runProject(files, project.id);
  }, [project?.id, projectStatus, files, isWorking, transitionLifecycle]);

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

      if (productPlan && project.id !== 'local-project' && (isProductDirty || workspace === 'product')) {
        await saveProductPlanToDb(supabase, project.id, productPlan);
      }

      if (project.id !== 'local-project') {
        await updateProject(supabase, project.id, {
          updated_at: new Date().toISOString(),
        });
      }

      setLastSavedAt(new Date());
      setIsProductDirty(false);
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
  }, [project, dirtyPaths, files, drafts, persistFilesToCache, productPlan, supabase, workspace, isProductDirty]);

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
    options?: {
      isSilentSelfHeal?: boolean;
      errorText?: string;
      conversationHistoryOverride?: AiMessage[];
      skipUserMessageAppend?: boolean;
    }
  ) => {
    const effectivePrompt = overridePrompt || prompt;
    if (!effectivePrompt.trim()) return;

    let targetProject = project;
    if (!targetProject) {
      setIsWorking(true);
      setGenerationStage('Creating your first project…');
      const derivedName = effectivePrompt.slice(0, 32).trim() || 'My First Project';
      const createRes = await createProjectWithMode(supabase, user ? user.id : 'anon', {
        name: derivedName,
        mode: 'developer',
        framework: 'nextjs',
      });
      if (createRes.error || !createRes.data) {
        toast.error(createRes.error?.message || 'Could not create project');
        setIsWorking(false);
        setGenerationStage(undefined);
        return;
      }
      targetProject = createRes.data;
      setProject(targetProject);
      setProjectStatus('empty');
      router.replace(`/editor?project=${targetProject.id}&view=${workspace}`, { scroll: false });
    }

    const modeToUse = targetAiMode || aiMode;
    const isSilent = Boolean(options?.isSilentSelfHeal);

    if (modeToUse !== 'debug') {
      selfHealAttemptsRef.current = 0;
    }

    if (isCurrentFileDirty) {
      await save();
    }

    setIsWorking(true);
    perfMetricsRef.current = { startTime: performance.now() };
    transitionBuildState('BUILDING', 'started');

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;
    const baseConversation = options?.conversationHistoryOverride || conversation;

    // For silent auto-fix: do NOT inject a technical instruction user bubble
    let newMessages: AiMessage[];

    if (isSilent) {
      transitionBuildState('AUTO_FIXING', `Attempt ${selfHealAttemptsRef.current}/3`);
      setGenerationStage('Making a few final adjustments…');
      newMessages = [
        ...baseConversation,
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
    } else if (options?.skipUserMessageAppend) {
      setGenerationStage('Understanding your request…');
      newMessages = [
        ...baseConversation,
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
    } else {
      setGenerationStage('Understanding your request…');
      newMessages = [
        ...baseConversation,
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
      localStorage.setItem(`codatron_chat_${targetProject.id}`, JSON.stringify(newMessages));
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
            localStorage.setItem(`codatron_chat_${targetProject.id}`, JSON.stringify(next));
          } catch { }
          return next;
        });
      }

      const response = await fetch(`/api/projects/${targetProject.id}/generate`, {
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
          conversationHistory: baseConversation.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          isInternalRepair: Boolean(options?.isSilentSelfHeal),
        }),
      });

      const body = (await response.json()) as AgentResponse & {
        message?: string;
        plan?: string[];
        cleanupReport?: { removedFiles: string[]; removedDeps: string[] };
        code?: string;
        upgradeRequired?: boolean;
      };
      if (!response.ok) {
        if (body.code === 'INSUFFICIENT_CREDITS' || body.upgradeRequired) {
          const creditErr = new Error(body.message || "You've used your Codatron AI credits. Upgrade your plan to continue building with AI.");
          (creditErr as unknown as { isCreditExhausted: boolean }).isCreditExhausted = true;
          throw creditErr;
        }
        throw new Error(body.message || 'Generation failed.');
      }

      // Re-synchronize authoritative credit balance on successful generation
      void refreshCredits();

      const genMs = performance.now() - perfMetricsRef.current.startTime;
      perfMetricsRef.current.generationMs = genMs;
      transitionBuildState('SYNCING_FILES', `${body.operations.length} operations`);
      const syncStartTime = performance.now();

      // Real file activity stages derived from actual operations (Parts V & W)
      const realStages: string[] = [];
      for (const op of body.operations.slice(0, 5)) {
        const cleanName = op.path.split('/').pop() || op.path;
        if (op.path.includes('page')) {
          realStages.push(`Creating page (${cleanName})`);
        } else if (/nav|header/i.test(cleanName)) {
          realStages.push(`Creating navigation (${cleanName})`);
        } else if (/hero/i.test(cleanName)) {
          realStages.push(`Creating hero section (${cleanName})`);
        } else if (/search/i.test(cleanName)) {
          realStages.push(`Adding search (${cleanName})`);
        } else {
          realStages.push(`${op.type === 'create' ? 'Creating' : 'Updating'} ${cleanName}`);
        }
      }
      if (realStages.length === 0) {
        realStages.push('Updating application components');
      }
      realStages.push('Preparing visual assets');
      realStages.push('Preparing your preview');

      if (isSilent) {
        setGenerationStage('Preparing your preview…');
      } else {
        setGenerationStage('Adding visual assets…');
        setConversation((prev) => {
          const next = prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                ...msg,
                stages: realStages,
                currentStage: realStages[realStages.length - 2] || 'Adding visual assets',
              }
              : msg
          );
          try {
            localStorage.setItem(`codatron_chat_${targetProject.id}`, JSON.stringify(next));
          } catch { }
          return next;
        });
      }

      const nextFiles = body.files ?? [];
      setFiles(nextFiles);
      setProjectStatus(nextFiles.length > 0 ? 'ready' : 'empty');
      persistFilesToCache(targetProject.id, nextFiles);
      setDependencies(body.dependencies ?? []);

      // Keep clean user-facing Codatron AI identity
      setActiveAiDisplayName('Codatron AI');

      // If a project name was derived from first build, update project state
      if (body.projectName && body.projectName !== targetProject.name) {
        setProject((prev) => (prev ? { ...prev, name: body.projectName! } : prev));
      }

      // Reset drafts & saved contents to newly returned source files
      const newSaved: Record<string, string> = {};
      for (const f of nextFiles) {
        if (!f.is_folder) newSaved[f.path] = f.content;
      }
      setSavedContents(newSaved);
      setDrafts(newSaved);

      const fileSyncMs = performance.now() - syncStartTime;
      perfMetricsRef.current.fileSyncMs = fileSyncMs;
      webcontainerManager.logInternal('AI', `generation complete in ${(genMs / 1000).toFixed(1)}s`);
      webcontainerManager.logInternal(
        'FILES',
        `${body.operations.length} operations synchronized in ${(fileSyncMs / 1000).toFixed(1)}s`
      );

      setPrompt('');
      if (previewError && modeToUse === 'debug') {
        setPreviewError('');
      }

      // Live Preview is primary: default after generation is PREVIEW
      if (nextFiles.length > 0) {
        setViewMode('preview');
      }

      // Start or Update Runtime incrementally (Parts P, Q, R)
      if (nextFiles.length > 0) {
        setGenerationStage('Preparing your preview…');
        const isDevRunning = webcontainerManager.isDevServerRunning();

        if (isDevRunning) {
          transitionBuildState('REBUILDING', 'incremental HMR update');
          webcontainerManager.logInternal('RUNTIME', 'already running');
          webcontainerManager.logInternal('HMR', 'update requested');
        } else {
          transitionBuildState('STARTING_PREVIEW', 'booting dev server');
          webcontainerManager.logInternal('RUNTIME', 'booting dev server');
        }

        await webcontainerManager.runProject(nextFiles, targetProject.id);
        transitionBuildState('COMPILING', 'compiling application');
      }

      // Verification & Stabilization Step (Parts G & H)
      transitionBuildState('VERIFYING', 'verifying application and preview');
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const snap = webcontainerManager.getSnapshot();
      const hasFatalError = snap.lastError && isApplicationFatalError(snap.lastError.message);

      if (!hasFatalError) {
        const totalMs = performance.now() - perfMetricsRef.current.startTime;
        webcontainerManager.logInternal('VERIFY', 'route / -> success');
        webcontainerManager.logInternal('BUILD', 'complete');
        webcontainerManager.logInternal(
          'PERF',
          `generation: ${(genMs / 1000).toFixed(1)}s, file-sync: ${(fileSyncMs / 1000).toFixed(1)}s, total: ${(totalMs / 1000).toFixed(1)}s`
        );
        transitionBuildState('READY', 'preview verified and ready');
        selfHealAttemptsRef.current = 0;
      } else {
        webcontainerManager.logInternal('VERIFY', `${snap.lastError?.message.slice(0, 80)} detected`);
        setGenerationStage('Making a few final adjustments…');
      }

      // Complete generation stage
      setGenerationStage(undefined);
      setConversation((prev) => {
        const next = prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
              ...msg,
              content: isSilent
                ? 'I found a small issue in the generated code and fixed it. The preview is working now.'
                : (body.summary ? (body.summary.startsWith('Done') ? body.summary : `Done — ${body.summary}`) : 'Done — I updated your project and the preview is ready.'),
              status: 'success' as const,
              operations: body.operations,
              filesCount: nextFiles.length,
              plan: body.plan,
              stages: realStages,
              currentStage: isSilent ? 'Everything is ready' : realStages[realStages.length - 1],
              isFixed: isSilent || modeToUse === 'debug',
            }
            : msg
        );
        try {
          localStorage.setItem(`codatron_chat_${targetProject.id}`, JSON.stringify(next));
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
      // Log full technical error details for developer root-cause diagnosis without triggering Turbopack red modal
      console.log('[AI Generation Debug]', {
        error: errMsg,
        cause,
        projectId: targetProject?.id,
        timestamp: new Date().toISOString(),
      });

      const lower = errMsg.toLowerCase();
      const isCreditError =
        (cause && typeof cause === 'object' && 'isCreditExhausted' in cause) ||
        lower.includes('credit') ||
        lower.includes('insufficient_credits') ||
        lower.includes('credit limit') ||
        lower.includes('no ai credits');

      let userFriendlyMsg = 'Generation could not be completed. Please try again or refine your prompt.';
      if (isCreditError) {
        userFriendlyMsg = "You've used your Codatron AI credits. Upgrade your plan to continue building with AI.";
        if (!isSilent) {
          setShowUpgradeModal(true);
        }
        void refreshCredits();
      } else if (lower.includes('quota') || lower.includes('429') || lower.includes('billing')) {
        userFriendlyMsg = 'AI service is currently at quota limit. Please try again shortly or add a personal API key.';
      } else if (lower.includes('auth') || lower.includes('permission') || lower.includes('api key') || lower.includes('401') || lower.includes('403')) {
        userFriendlyMsg = 'AI provider authentication issue. Please check your API key in Profile or try again.';
      } else if (lower.includes('unavailable') || lower.includes('503') || lower.includes('500') || lower.includes('network') || lower.includes('fetch failed')) {
        userFriendlyMsg = 'AI service is temporarily busy. Please try again in a few moments.';
      } else if (errMsg.length < 100) {
        userFriendlyMsg = errMsg;
      }

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
                : userFriendlyMsg,
              isExhaustedRetry: isSilent,
            }
            : msg
        );
        try {
          if (targetProject) {
            localStorage.setItem(`codatron_chat_${targetProject.id}`, JSON.stringify(next));
          }
        } catch { }
        return next;
      });

      if (!isSilent) {
        toast.error(userFriendlyMsg);
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

  // Handle editing a previous user message (ChatGPT-style)
  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const idx = conversation.findIndex((m) => m.id === messageId);
      if (idx === -1 || !newContent.trim()) return;

      const targetMsg = conversation[idx];
      const updatedUserMsg: AiMessage = {
        ...targetMsg,
        content: newContent.trim(),
        timestamp: new Date(),
      };

      // Keep conversation strictly up to this edited user message
      const truncatedHistory = [...conversation.slice(0, idx), updatedUserMsg];
      setPrompt('');
      await generate(newContent.trim(), aiMode, targetMsg.attachedImage, {
        conversationHistoryOverride: truncatedHistory,
        skipUserMessageAppend: true,
      });
    },
    [conversation, aiMode, generate]
  );

  // Handle regenerating an assistant response
  const handleRegenerateMessage = useCallback(
    async (assistantMsgId: string) => {
      const idx = conversation.findIndex((m) => m.id === assistantMsgId);
      if (idx === -1) return;

      // Find the user message directly preceding this assistant response
      const userMsg = conversation.slice(0, idx).reverse().find((m) => m.role === 'user');
      if (!userMsg) return;

      // Truncate conversation to right before this assistant message
      const truncatedHistory = conversation.slice(0, idx);
      await generate(userMsg.content, aiMode, userMsg.attachedImage, {
        conversationHistoryOverride: truncatedHistory,
        skipUserMessageAppend: true,
      });
    },
    [conversation, aiMode, generate]
  );

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

  const displayProject: Project = useMemo(() => {
    if (project) return project;
    return {
      id: queryPid || 'local-project',
      user_id: user?.id || 'anonymous',
      name: projectStatus === 'no_project' ? 'New Project' : queryPid ? 'Project Workspace' : 'Local Project',
      description: '',
      prompt: null,
      framework: 'nextjs',
      is_public: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }, [project, projectStatus, queryPid, user?.id]);

  return (
    <main className="flex h-screen flex-col bg-[#02060f] text-slate-100 overflow-hidden select-none">
      <Script src="/coi-serviceworker.js" strategy="afterInteractive" />
      {/* Workspace Header */}
      <WorkspaceHeader
        project={displayProject}
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
        projectStatus === 'loading' && !project ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#070913] text-slate-400 gap-4 select-none">
            <div className="relative flex items-center justify-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_25px_rgba(99,102,241,0.2)]">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-slate-200">Loading your project...</p>
              <p className="text-xs text-slate-400">Loading your workspace...</p>
            </div>
          </div>
        ) : projectStatus === 'not_found' && !project ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#070913] text-slate-400 gap-4 select-none">
            <div className="flex flex-col items-center gap-3 text-center px-4 max-w-sm">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <FileQuestion className="h-5 w-5" />
              </div>
              <p className="text-sm text-slate-200 font-semibold">We couldn&apos;t find this project.</p>
              <p className="text-xs text-slate-400">This project does not exist or may have been deleted.</p>
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => router.push('/projects')}>
                  Back to Projects
                </Button>
              </div>
            </div>
          </div>
        ) : projectStatus === 'error' && !project ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#070913] text-slate-400 gap-4 select-none">
            <div className="flex flex-col items-center gap-3 text-center px-4 max-w-sm">
              <div className="h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <FileQuestion className="h-5 w-5" />
              </div>
              <p className="text-sm text-slate-200 font-semibold">We couldn&apos;t load this project right now.</p>
              <p className="text-xs text-slate-400">We&apos;re taking a little longer to load your project. You can try again or return to your projects hub.</p>
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => retryHydration()}>
                  Try again
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-slate-400 hover:text-white" onClick={() => router.push('/projects')}>
                  Back to Projects
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <ProductWorkspace
            project={project}
            files={files}
            productPlan={productPlan}
            workspaceName={productWorkspaceName}
            isDirty={isProductDirty}
            onDirtyChange={setIsProductDirty}
            lastSavedAt={lastSavedAt}
            onPlanGenerated={handlePlanGenerated}
            onFilesUpdated={handleFilesUpdatedFromPM}
            onSwitchToDeveloper={handleSwitchToDeveloper}
            onRenameWorkspace={handleRenameWorkspace}
          />
        )
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
                  onEditMessage={handleEditMessage}
                  onRegenerateMessage={handleRegenerateMessage}
                  isChatLoading={isChatLoading}
                  isNoProject={projectStatus === 'no_project'}
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
                {/* PROJECT LOADING (Non-blocking in-editor status) */}
                {projectStatus === 'loading' && files.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#070913] select-none">
                    <div className="max-w-md mx-auto space-y-4">
                      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 shadow-[0_0_25px_rgba(99,102,241,0.25)]">
                        <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold text-slate-100">Loading your project...</h3>
                        <p className="text-xs text-slate-400">Loading your workspace...</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* PROJECT NOT FOUND */}
                {projectStatus === 'not_found' && files.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#070913] select-none">
                    <div className="max-w-md mx-auto space-y-4">
                      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        <FileQuestion className="h-7 w-7" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold text-slate-100">We couldn&apos;t find this project.</h3>
                        <p className="text-xs text-slate-400">This project does not exist or may have been deleted.</p>
                      </div>
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => router.push('/projects')}>
                          Back to Projects
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* PROJECT ERROR / TIMEOUT (Graceful non-blocking recovery) */}
                {projectStatus === 'error' && files.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#070913] select-none">
                    <div className="max-w-md mx-auto space-y-4">
                      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                        <FileQuestion className="h-7 w-7" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold text-slate-100">We couldn&apos;t load this project right now.</h3>
                        <p className="text-xs text-slate-400">We&apos;re taking a little longer to load your project. You can try again or return to your projects hub.</p>
                      </div>
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => retryHydration()}>
                          Try again
                        </Button>
                        <Button size="sm" variant="ghost" className="text-xs text-slate-400 hover:text-white" onClick={() => router.push('/projects')}>
                          Back to Projects
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* FIRST-TIME USER EMPTY STATE (When user has no projects yet) */}
                {projectStatus === 'no_project' && files.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#090a14] select-none">
                    <div className="max-w-md mx-auto space-y-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 mx-auto shadow-2xl">
                        <Sparkles className="h-7 w-7 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">Start building with AI</h3>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                          You don&apos;t have a project yet. Describe what you&apos;d like to build in the AI Workspace on the left, and Codatron will create your first project and live preview automatically.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* PREVIEW EMPTY CANVAS (For existing project with 0 files) */}
                {projectStatus !== 'loading' && projectStatus !== 'error' && projectStatus !== 'not_found' && projectStatus !== 'no_project' && viewMode === 'preview' && files.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#090a14] select-none">
                    <div className="max-w-md mx-auto space-y-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 mx-auto shadow-2xl">
                        <Sparkles className="h-7 w-7 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">
                          AI Application Builder
                        </h3>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                          Your live application preview will appear here automatically. Describe the application you want to build in the AI Workspace on the left.
                        </p>
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
                          Empty Project: {displayProject.name}
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
                    isGenerating={isWorking}
                    internalBuildState={internalBuildState}
                    isAutoFixing={internalBuildState === 'AUTO_FIXING'}
                    projectId={project?.id || queryPid || 'local-project'}
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
                        isGenerating={isWorking}
                        internalBuildState={internalBuildState}
                        isAutoFixing={internalBuildState === 'AUTO_FIXING'}
                        projectId={project?.id || queryPid || 'local-project'}
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
        projectId={project?.id || queryPid || 'local-project'}
      />

      {/* Credit Exhaustion & Upgrade Modal */}
      <CreditExhaustionDialog
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        remainingCredits={creditsRemaining}
        requiredCredits={10}
        projectId={project?.id || queryPid || undefined}
      />
    </main>
  );
}

function EditorLoadingFallback() {
  return (
    <div className="flex h-screen flex-col bg-[#02060f] text-slate-100 overflow-hidden select-none">
      <Script src="/coi-serviceworker.js" strategy="afterInteractive" />
      {/* Header Skeleton */}
      <div className="flex h-12 shrink-0 items-center justify-between bg-[#060a12]/95 border-b border-white/10 px-4">
        <div className="flex items-center gap-3">
          <div className="h-6 w-16 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-4 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-20 bg-white/5 rounded animate-pulse" />
        </div>
      </div>
      {/* Workspace Loading Canvas */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#070913] text-slate-400 gap-4 select-none">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_25px_rgba(99,102,241,0.2)]">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-slate-200">Opening your project...</p>
          <p className="text-xs text-slate-400">Loading your workspace...</p>
        </div>
      </div>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<EditorLoadingFallback />}>
      <EditorPageContent />
    </Suspense>
  );
}