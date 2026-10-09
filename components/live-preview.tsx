"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
} from '@codesandbox/sandpack-react';
import {
  AlertTriangle,
  Sparkles,
  X,
  RotateCcw,
  ExternalLink,
  Loader2,
  Play,
  Terminal,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProjectFile } from '@/lib/types/database';
import { buildSandpackBundle } from '@/lib/preview/sandpack-adapter';
import {
  webcontainerManager,
  stripAnsi,
  type WebContainerRuntimeSnapshot,
} from '@/lib/runtime/webcontainer-manager';

export type ViewportMode = 'desktop' | 'tablet' | 'mobile';

export interface LivePreviewProps {
  files: ProjectFile[];
  dependencies?: Array<{ name: string; version: string }>;
  mobile?: boolean;
  controlledViewport?: ViewportMode;
  onPreviewError?: (error: string) => void;
  onFixWithAI?: (error: string) => void;
  webcontainerUrl?: string | null;
  onSwitchToTerminal?: () => void;
  onOpenDiagnostics?: () => void;
  onPromptSelect?: (prompt: string) => void;
  isGenerating?: boolean;
  internalBuildState?: string;
  isAutoFixing?: boolean;
  projectId?: string;
}

/**
 * Polished Animated Application Skeleton / Shimmer
 * Mimics a real modern application being actively composed.
 */
function PreviewSkeleton() {
  return (
    <div className="w-full h-full bg-[#0a0b16] rounded-md border border-white/5 p-4 sm:p-6 flex flex-col justify-between overflow-hidden relative select-none">
      {/* Background ambient lighting */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Floating Center Notification Badge */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#121429]/95 border border-indigo-500/30 text-indigo-200 shadow-2xl backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
          <span className="text-xs font-medium tracking-wide">Codatron is preparing your preview…</span>
        </div>
      </div>

      <div className="space-y-6 pt-8 animate-pulse">
        {/* 1. Navbar Skeleton */}
        <div className="h-12 w-full rounded-xl bg-white/[0.03] border border-white/5 px-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="h-5 w-24 rounded-lg bg-indigo-500/20" />
            <div className="hidden sm:flex items-center gap-3">
              <div className="h-3 w-14 rounded bg-white/10" />
              <div className="h-3 w-16 rounded bg-white/10" />
              <div className="h-3 w-12 rounded bg-white/10" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-16 rounded-full bg-white/10" />
            <div className="h-7 w-20 rounded-full bg-indigo-600/30" />
          </div>
        </div>

        {/* 2. Hero Section Skeleton */}
        <div className="w-full rounded-2xl bg-gradient-to-br from-indigo-950/30 via-white/[0.02] to-purple-950/20 border border-white/5 p-6 sm:p-8 space-y-4 relative overflow-hidden">
          <div className="h-4 w-28 rounded-full bg-indigo-500/20" />
          <div className="space-y-2">
            <div className="h-7 sm:h-9 w-3/4 rounded-lg bg-white/15" />
            <div className="h-7 sm:h-9 w-1/2 rounded-lg bg-white/10" />
          </div>
          <div className="space-y-1.5 max-w-lg">
            <div className="h-3 w-full rounded bg-white/5" />
            <div className="h-3 w-4/5 rounded bg-white/5" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <div className="h-9 w-28 rounded-xl bg-indigo-600/40" />
            <div className="h-9 w-24 rounded-xl bg-white/5 border border-white/10" />
          </div>
        </div>

        {/* 3. Cards Grid Skeleton */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 rounded bg-white/10" />
            <div className="h-3 w-16 rounded bg-white/5" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 space-y-2.5">
                <div className="aspect-[4/3] rounded-lg bg-white/5 overflow-hidden" />
                <div className="h-3 w-3/4 rounded bg-white/10" />
                <div className="h-2.5 w-1/2 rounded bg-white/5" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Subtle bottom shimmer bar */}
      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-4">
        <div className="h-full bg-gradient-to-r from-transparent via-indigo-500 to-transparent w-1/2 animate-[shimmer_2s_infinite]" />
      </div>
    </div>
  );
}

export default function LivePreview({
  files,
  dependencies = [],
  mobile = false,
  controlledViewport,
  onPreviewError,
  onFixWithAI,
  webcontainerUrl,
  onSwitchToTerminal,
  onOpenDiagnostics,
  onPromptSelect,
  isGenerating = false,
  internalBuildState = 'IDLE',
  isAutoFixing = false,
  projectId,
}: LivePreviewProps) {
  const [internalViewport] = useState<ViewportMode>(
    mobile ? 'mobile' : 'desktop'
  );
  const [activeError, setActiveError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [hasLoadedBefore, setHasLoadedBefore] = useState(false);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<WebContainerRuntimeSnapshot>(
    webcontainerManager.getSnapshot()
  );

  const viewport = controlledViewport || internalViewport;

  // Subscribe to WebContainer state changes
  useEffect(() => {
    const unsub = webcontainerManager.subscribeSnapshot((snap) => {
      setRuntimeSnapshot(snap);
      if (snap.lastError) {
        const cleanMsg = stripAnsi(snap.lastError.message);
        setActiveError(cleanMsg);
        onPreviewError?.(cleanMsg);
      } else if (snap.state === 'running') {
        setActiveError(null);
      }
    });
    return unsub;
  }, [onPreviewError]);

  const effectiveUrl = runtimeSnapshot.previewUrl || webcontainerManager.getPreviewUrl() || webcontainerUrl || null;

  // Reset iframeLoaded if the effective URL completely changes to a different domain/port
  const currentUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (effectiveUrl && effectiveUrl !== currentUrlRef.current) {
      currentUrlRef.current = effectiveUrl;
      setIframeLoaded(false);
    }
  }, [effectiveUrl]);

  // Check if project is Next.js
  const isNextJs = files.some(
    (f) =>
      (f.path === 'package.json' && f.content.includes('"next"')) ||
      f.path.startsWith('app/') ||
      f.path.includes('next.config')
  );

  // Build sandpack bundle only for genuine compatible non-Next.js projects
  const bundle = useMemo(() => {
    if (isNextJs || files.length === 0) return null;
    return buildSandpackBundle(files, dependencies);
  }, [files, dependencies, isNextJs]);

  const handleRefresh = () => {
    setIframeLoaded(false);
    setIframeKey((prev) => prev + 1);
  };

  const viewportWidthStyle = {
    desktop: 'w-full h-full',
    tablet: 'w-[768px] max-w-full h-full shadow-2xl rounded-t-xl border-x border-t border-white/10 overflow-hidden',
    mobile: 'w-[390px] max-w-full h-full shadow-2xl rounded-t-xl border-x border-t border-white/10 overflow-hidden',
  }[viewport];

  // Final Success Condition (Part H): "Preview ready" ONLY when verified & loaded
  const isPreviewReady = Boolean(
    effectiveUrl &&
    iframeLoaded &&
    runtimeSnapshot.state === 'running' &&
    !isGenerating &&
    !isAutoFixing &&
    !activeError
  );

  const statusLabel = isPreviewReady
    ? 'Preview ready'
    : hasLoadedBefore && isGenerating
      ? 'Updating preview…'
      : isAutoFixing
        ? 'Making adjustments…'
        : effectiveUrl
          ? 'Preview is still starting…'
          : 'Preparing your preview…';

  // Empty Project state
  if (files.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#0a0b16] select-none">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 mx-auto shadow-xl">
            <Sparkles className="h-7 w-7 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              AI Application Builder
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Describe what you want to build. Codatron generates files, configures dependencies, and starts your live preview automatically.
            </p>
          </div>

          <div className="pt-2 space-y-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-0.5">
              Quick Start Templates
            </p>
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  title: '🎬 Streaming Media App',
                  prompt: 'Build a streaming media web app with dark theme, hero banner, movie rows, search and responsive design.',
                },
                {
                  title: '📊 SaaS Analytics Dashboard',
                  prompt: 'Build a SaaS analytics dashboard with chart widgets, KPI metric cards, and dark mode.',
                },
                {
                  title: '🛍️ E-commerce Store',
                  prompt: 'Build an e-commerce storefront with cart drawer, product grid, and category filters.',
                },
              ].map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => onPromptSelect?.(item.prompt)}
                  className="w-full text-left p-2.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-indigo-500/30 transition text-xs text-slate-300 group flex items-center justify-between"
                >
                  <span className="font-medium text-slate-200">{item.title}</span>
                  <span className="text-[10px] text-indigo-400 opacity-0 group-hover:opacity-100 transition">
                    Use Prompt →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#090a14] overflow-hidden select-none">
      {/* Top Preview Control Bar */}
      <div className="h-9 px-3 border-b border-white/10 bg-[#0c0e1c] flex items-center justify-between shrink-0 text-xs">
        {/* Left: Professional Status */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`flex h-2 w-2 rounded-full ${isPreviewReady
              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
              : hasLoadedBefore && isGenerating
                ? 'bg-indigo-400 animate-spin'
                : 'bg-indigo-400 animate-pulse'
              }`}
          />
          <span className="text-[11px] font-medium text-slate-200 truncate">
            {statusLabel}
          </span>

          {isPreviewReady && (
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              • Updated just now
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {(onOpenDiagnostics || onSwitchToTerminal) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenDiagnostics || onSwitchToTerminal}
              className="h-6 px-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 gap-1"
              title="Open Diagnostics & Logs"
            >
              <Terminal className="h-3 w-3" />
              <span className="hidden sm:inline">Diagnostics</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-white/5"
            title="Reload Preview"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>

          {(() => {
            const isStandalone = typeof window !== 'undefined' && window.location.pathname.startsWith('/preview');
            if (isStandalone) return null;
            return (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    const pid =
                      projectId ||
                      new URLSearchParams(window.location.search).get('project') ||
                      'local-project';
                    window.open(`/preview?project=${encodeURIComponent(pid)}`, '_blank');
                  }
                }}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
                title="Open live preview in new window"
              >
                <ExternalLink className="h-3 w-3" />
              </button>
            );
          })()}
        </div>
      </div>

      {/* Main Preview Frame */}
      <div className="flex-1 flex justify-center items-stretch overflow-hidden bg-[#070810] p-2 sm:p-3 relative">
        <div className={`transition-all duration-300 flex flex-col relative ${viewportWidthStyle}`}>
          {/* A. WebContainer Live Application with Skeleton Crossfade & Non-blanking update */}
          {effectiveUrl ? (
            <div className="relative w-full h-full rounded-md overflow-hidden bg-white shadow-2xl">
              {/* The Live iframe */}
              <iframe
                key={iframeKey}
                src={effectiveUrl}
                onLoad={() => {
                  setIframeLoaded(true);
                  setHasLoadedBefore(true);
                  webcontainerManager.logInternal('PREVIEW', 'iframe loaded successfully');
                }}
                className={`w-full h-full border-0 transition-opacity duration-500 ${iframeLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                title="Codatron Live Application Preview"
                allow="cross-origin-isolated; autoplay; camera; microphone"
              />

              {/* Initial Build Skeleton: crossfades out smoothly on first load */}
              {!hasLoadedBefore && (
                <div
                  className={`absolute inset-0 z-10 transition-opacity duration-500 ${iframeLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
                    }`}
                >
                  <PreviewSkeleton />
                </div>
              )}

              {/* Iterative Update Overlay: Never blanks the working preview during edits! */}
              {hasLoadedBefore && (isGenerating || isAutoFixing) && (
                <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-[1.5px] flex items-center justify-center pointer-events-none transition-opacity duration-300">
                  <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#0d0f22]/95 border border-indigo-500/30 text-indigo-200 shadow-2xl">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                    <span className="text-xs font-medium">Updating preview…</span>
                  </div>
                </div>
              )}
            </div>
          ) : runtimeSnapshot.state === 'stopped' && !isGenerating && !isAutoFixing ? (
            /* Dedicated Stopped State with Start Dev Server */
            <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#0a0c18] rounded-md border border-white/5 select-none">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-400 border border-slate-700 mb-3">
                <Server className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-semibold text-white mb-1">Development Server Stopped</h4>
              <p className="max-w-sm text-xs text-slate-400 mb-4 leading-relaxed">
                The development server process inside WebContainer is stopped. Click Start to launch the project.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void webcontainerManager.runProject(files, 'active-project')}
                  className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium gap-1.5"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Start Dev Server</span>
                </Button>
                {onSwitchToTerminal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSwitchToTerminal}
                    className="h-8 text-xs border-white/10 text-slate-300 hover:bg-white/10 gap-1.5"
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    <span>View Logs</span>
                  </Button>
                )}
              </div>
            </div>
          ) : runtimeSnapshot.state === 'error' && (!runtimeSnapshot.isIsolated || activeError?.includes('Cross-Origin Isolation') || runtimeSnapshot.lastError?.message.includes('Cross-Origin Isolation')) && bundle && !bundle.adapterError ? (
            /* Graceful Sandpack Fallback when WebContainer isolation is unavailable */
            <div className="w-full h-full rounded-md overflow-hidden bg-[#0d0f1e] relative">
              <SandpackProvider
                template="react-ts"
                theme="dark"
                files={bundle.sandpackFiles}
                customSetup={{
                  dependencies: bundle.dependencies,
                  entry: bundle.entryPath,
                }}
                options={{
                  autoReload: true,
                }}
              >
                <SandpackLayout className="h-full border-0 rounded-none bg-transparent">
                  <SandpackPreview
                    showOpenInCodeSandbox={false}
                    showRefreshButton={true}
                    className="h-full w-full border-0 bg-transparent"
                  />
                </SandpackLayout>
              </SandpackProvider>
            </div>
          ) : runtimeSnapshot.state === 'error' && (!runtimeSnapshot.isIsolated || activeError?.includes('Cross-Origin Isolation') || runtimeSnapshot.lastError?.message.includes('Cross-Origin Isolation')) ? (
            /* Dedicated Isolation Prompt with Reload Button */
            <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#0e0f1e] rounded-md border border-indigo-500/20">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/30 mb-3">
                <RotateCcw className="h-6 w-6 text-indigo-400" />
              </div>
              <h4 className="text-sm font-semibold text-white mb-1">Cross-Origin Isolation Required</h4>
              <p className="max-w-md text-xs text-slate-400 mb-4 leading-relaxed">
                WebContainers use SharedArrayBuffer to run Node.js in the browser. Click below to reload the workspace with Cross-Origin headers active.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reload Workspace</span>
                </Button>
                {onSwitchToTerminal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSwitchToTerminal}
                    className="h-8 text-xs border-white/10 text-slate-300 hover:bg-white/10 gap-1.5"
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    <span>View Logs</span>
                  </Button>
                )}
              </div>
            </div>
          ) : runtimeSnapshot.state === 'error' && !isGenerating && !isAutoFixing ? (
            /* Persistent Runtime Error Card only shown if auto-fix is not actively working */
            <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#100808] rounded-md border border-red-500/20">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600/10 text-red-400 border border-red-500/30 mb-3">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <h4 className="text-sm font-semibold text-red-200 mb-1">Application Startup Issue</h4>
              <p className="max-w-md text-xs text-red-400/80 mb-4 font-mono bg-red-950/40 p-2.5 rounded border border-red-500/20 text-left overflow-auto max-h-36 whitespace-pre-wrap">
                {activeError || runtimeSnapshot.lastError?.message || 'Application encountered an error.'}
              </p>
              <div className="flex items-center gap-2">
                {onFixWithAI && (
                  <Button
                    size="sm"
                    onClick={() => onFixWithAI(activeError || runtimeSnapshot.lastError?.message || 'Runtime error')}
                    className="h-8 text-xs bg-red-600 hover:bg-red-500 text-white font-medium gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Fix with AI Debug Agent</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void webcontainerManager.runProject(files, 'active-project')}
                  className="h-8 text-xs border-white/10 text-slate-200 hover:bg-white/10 gap-1.5"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Retry</span>
                </Button>
                {onSwitchToTerminal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSwitchToTerminal}
                    className="h-8 text-xs border-white/10 text-slate-300 hover:bg-white/10 gap-1.5"
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    <span>View Logs</span>
                  </Button>
                )}
              </div>
            </div>
          ) : bundle && !bundle.adapterError ? (
            /* Sandpack Live Preview strictly for simple non-Next.js projects */
            <div className="w-full h-full rounded-md overflow-hidden bg-[#0d0f1e] relative">
              <SandpackProvider
                template="react-ts"
                theme="dark"
                files={bundle.sandpackFiles}
                customSetup={{
                  dependencies: bundle.dependencies,
                  entry: bundle.entryPath,
                }}
                options={{
                  recompileMode: 'delayed',
                  recompileDelay: 300,
                }}
              >
                <SandpackLayout className="!border-0 !h-full !w-full !rounded-none">
                  <SandpackPreview
                    className="!h-full !w-full"
                    showNavigator={false}
                    showOpenInCodeSandbox={false}
                    showRefreshButton={false}
                  />
                </SandpackLayout>
              </SandpackProvider>
            </div>
          ) : (
            /* Initial Building / Standby State before URL is available: Animated Skeleton */
            <div className="w-full h-full relative">
              <PreviewSkeleton />
            </div>
          )}
        </div>
      </div>

      {/* Floating Error Bar ONLY when not actively building or auto-fixing */}
      {activeError && !isGenerating && !isAutoFixing && (
        <div className="p-3 border-t border-red-500/30 bg-red-950/40 flex items-center justify-between text-xs text-red-300">
          <div className="flex items-center gap-2 truncate mr-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span className="truncate font-mono text-[11px]">{stripAnsi(activeError)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onFixWithAI && (
              <Button
                size="sm"
                onClick={() => onFixWithAI(activeError)}
                className="h-6 text-xs bg-red-600 hover:bg-red-500 text-white font-medium"
              >
                Fix with AI Debug Agent
              </Button>
            )}
            <button
              type="button"
              onClick={() => setActiveError(null)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}