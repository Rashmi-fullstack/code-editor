'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FolderTree,
  MessageSquareCode,
  Save,
  Sparkles,
  Check,
  ChevronRight,
  Loader2,
  Download,
  Command,
  Play,
  Edit2,
  X,
  ArrowLeft,
  Plus,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WorkspaceSwitcher } from '@/components/layout/workspace-switcher';
import { GlobalUserMenu } from '@/components/layout/global-user-menu';
import { useCredits } from '@/components/credit-provider';
import type { Project } from '@/lib/types/database';

export type SaveContextInfo =
  | { type: 'product'; status: 'saved' | 'saving' | 'unsaved' }
  | { type: 'file'; status: 'saved' | 'saving' | 'unsaved'; path: string }
  | { type: 'project'; status: 'saved' | 'saving' | 'unsaved' };

export interface WorkspaceHeaderProps {
  project: Project | null;
  activePath: string;
  dirty: boolean;
  isWorking: boolean;
  saveState?: 'saved' | 'saving' | 'unsaved';
  saveContext?: SaveContextInfo;
  hasFiles?: boolean;
  hasActiveFile?: boolean;
  lastSavedAt?: Date | null;
  workspace?: 'developer' | 'product';
  workspaceName?: string;
  onWorkspaceChange?: (ws: 'developer' | 'product') => void;
  onSave: () => void | Promise<unknown>;
  onSaveProject?: () => void | Promise<unknown>;
  onNewProject?: () => void;
  onExportZip: () => void | Promise<unknown>;
  onOpenCommandPalette: () => void;
  showFiles: boolean;
  onToggleFiles: () => void;
  showAiPanel: boolean;
  onToggleAiPanel: () => void;
  onRenameProject?: (newName: string) => Promise<void> | void;
  onRenameWorkspace?: (newName: string) => Promise<void> | void;
  onRunPreview?: () => void;
}

function getRelativeText(date?: Date | null): string {
  if (!date) return 'Saved';
  const diffSecs = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSecs < 10) return 'Saved just now';
  if (diffSecs < 60) return `Saved ${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  return `Saved ${diffMins}m ago`;
}

export function WorkspaceHeader({
  project,
  dirty,
  isWorking,
  saveState = dirty ? 'unsaved' : 'saved',
  saveContext,
  hasFiles = true,
  hasActiveFile = true,
  lastSavedAt,
  workspace = 'developer',
  workspaceName,
  onWorkspaceChange,
  onSave,
  onSaveProject,
  onNewProject,
  onExportZip,
  onOpenCommandPalette,
  showFiles,
  onToggleFiles,
  showAiPanel,
  onToggleAiPanel,
  onRenameProject,
  onRenameWorkspace,
  onRunPreview,
}: WorkspaceHeaderProps) {
  const { creditsRemaining, creditLimit, isAdmin } = useCredits();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [relativeSavedText, setRelativeSavedText] = useState<string>(() => getRelativeText(lastSavedAt));

  const isProduct = workspace === 'product';
  const displayName = isProduct
    ? (workspaceName || 'Untitled Product Plan')
    : (workspaceName ?? project?.name ?? 'Untitled Project');

  const handleStartRename = () => {
    setNameInput(displayName === 'Untitled Product Plan' || displayName === 'Untitled Project' ? '' : displayName);
    setIsEditingName(true);
  };

  const handleConfirmRename = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setIsEditingName(false);
      return;
    }
    if (trimmed !== displayName) {
      if (onRenameWorkspace) {
        await onRenameWorkspace(trimmed);
      } else if (onRenameProject) {
        await onRenameProject(trimmed);
      }
    }
    setIsEditingName(false);
  };

  // Update relative "Saved X ago" ticker at interval
  useEffect(() => {
    const interval = setInterval(() => {
      setRelativeSavedText(getRelativeText(lastSavedAt));
    }, 5000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  let indicatorText = 'Saved';
  let indicatorStatus: 'saving' | 'unsaved' | 'saved' = 'saved';

  if (saveContext) {
    indicatorStatus = saveContext.status;
    if (saveContext.type === 'product') {
      if (saveContext.status === 'saving') indicatorText = 'Saving product…';
      else if (saveContext.status === 'unsaved') indicatorText = 'Product changes unsaved';
      else indicatorText = 'Product saved';
    } else if (saveContext.type === 'file') {
      const fileName = saveContext.path ? (saveContext.path.split('/').pop() || saveContext.path) : '';
      if (saveContext.status === 'saving') indicatorText = `Saving ${fileName || 'file'}…`;
      else if (saveContext.status === 'unsaved') indicatorText = 'File unsaved';
      else indicatorText = `Saved ${fileName || ''}`.trim() || 'Saved';
    } else {
      if (saveContext.status === 'saving') indicatorText = 'Saving project…';
      else if (saveContext.status === 'unsaved') indicatorText = 'Project unsaved';
      else indicatorText = 'Project saved';
    }
  } else {
    indicatorStatus = isWorking ? 'saving' : dirty ? 'unsaved' : saveState || 'saved';
    if (indicatorStatus === 'saving') indicatorText = 'Saving…';
    else if (indicatorStatus === 'unsaved') indicatorText = workspace === 'product' ? 'Product changes unsaved' : 'File unsaved';
    else indicatorText = relativeSavedText || 'Saved';
  }

  return (
    <header className="relative flex h-12 shrink-0 items-center justify-between bg-black/40 backdrop-blur-xl border-b border-white/10 px-3 sm:px-4 select-none z-10">
      {/* Bottom glowing line during active AI synthesis */}
      <div
        className={`absolute inset-x-0 bottom-0 h-[2px] transition-all duration-500 ${isWorking
            ? 'bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-90 shadow-[0_0_10px_rgba(255,255,255,0.8)]'
            : 'bg-transparent'
          }`}
      />

      {/* Left: [← Projects] + Brand + Breadcrumbs */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Back to Projects Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/projects"
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition border border-white/10 bg-white/[0.04]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Projects</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Back to My Projects Hub
          </TooltipContent>
        </Tooltip>

        <ChevronRight className="h-3 w-3 text-slate-600 hidden sm:block" />

        {/* Brand */}
        <Link
          href="/"
          className="group flex items-center gap-2 rounded-full py-1 text-xs font-semibold text-white transition hover:opacity-90"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md overflow-hidden shrink-0">
            <img src="/assets/logo.webp" alt="Codatron" className="h-4 w-4 object-contain" />
          </span>
          <span className="font-bold tracking-tight text-white hidden lg:inline">
            Codatron.ai
          </span>
        </Link>

        {workspace === 'product' && (
          <Badge
            variant="outline"
            className="hidden sm:inline-flex border-white/15 bg-white/[0.04] text-[10px] text-slate-300 font-semibold px-2 py-0.5 rounded-full"
          >
            Product Workspace
          </Badge>
        )}

        <ChevronRight className="h-3 w-3 text-slate-600 hidden sm:block" />

        {/* Project Name (Editable) */}
        <div className="flex items-center gap-1.5 min-w-0">
          {isEditingName ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleConfirmRename();
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
                autoFocus
                className="rounded border border-indigo-500/50 bg-black/60 px-2 py-0.5 text-xs text-white outline-none w-32 sm:w-44"
              />
              <button
                type="button"
                onClick={() => void handleConfirmRename()}
                className="rounded p-1 text-emerald-400 hover:bg-white/10"
                title="Save Name"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setIsEditingName(false)}
                className="rounded p-1 text-slate-400 hover:bg-white/10"
                title="Cancel"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="group flex items-center gap-1.5">
              <h1
                onClick={handleStartRename}
                className="truncate text-xs sm:text-[13px] font-semibold text-slate-100 max-w-[120px] sm:max-w-[180px] cursor-pointer hover:text-indigo-300 transition"
                title={workspace === 'product' ? 'Click to rename Product Manager workspace' : 'Click to rename Developer workspace'}
              >
                {displayName}
              </h1>
              <button
                type="button"
                onClick={handleStartRename}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-white transition"
                title={workspace === 'product' ? 'Rename Product Manager Workspace' : 'Rename Developer Workspace'}
              >
                <Edit2 className="h-2.5 w-2.5" />
              </button>
            </div>
          )}

          {/* New Project Quick Button */}
          {onNewProject && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onNewProject}
                  className="hidden sm:flex items-center justify-center h-6 w-6 rounded-md border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Create New Project
              </TooltipContent>
            </Tooltip>
          )}

          {/* Persistent Save Status Indicator */}
          <div className="hidden sm:flex items-center pl-2">
            {indicatorStatus === 'saving' ? (
              <span className="flex items-center gap-1.5 text-[11px] text-amber-300 font-medium">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving...</span>
              </span>
            ) : indicatorStatus === 'unsaved' ? (
              <span className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span>Unsaved changes</span>
              </span>
            ) : indicatorStatus as string === 'failed' || indicatorStatus as string === 'error' ? (
              <span className="flex items-center gap-1.5 text-[11px] text-rose-400 font-medium">
                <span className="text-[10px] font-bold">✕</span>
                <span>Save failed</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>{indicatorText}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center: Workspace Switcher & Command Palette */}
      <div className="flex items-center gap-2">
        {workspace === 'developer' && (
          <WorkspaceSwitcher
            currentWorkspace={workspace}
            onWorkspaceChange={onWorkspaceChange}
            projectId={project?.id}
          />
        )}

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/10 transition"
        >
          <Command className="h-3.5 w-3.5 text-slate-400" />
          <span>Commands</span>
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Preview, Save Actions, File Explorer Toggle, AI Panel Toggle, Export */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Run / Preview button (Developer IDE only) */}
        {workspace === 'developer' && onRunPreview && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onRunPreview}
                className="h-8 px-3 text-xs font-semibold rounded-full border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 gap-1.5"
              >
                <Play className="h-3 w-3 fill-emerald-400 text-emerald-400" />
                <span className="hidden sm:inline">Preview</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Run & Preview Application
            </TooltipContent>
          </Tooltip>
        )}

        {/* Toggle File Explorer (Developer IDE only) */}
        {workspace === 'developer' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleFiles}
                className={`h-8 w-8 rounded-full p-0 transition ${showFiles
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <FolderTree className="h-4 w-4" />
                <span className="sr-only">Toggle Files</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {showFiles ? 'Hide Files' : 'Show Files'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Toggle AI Panel (Developer IDE only) */}
        {workspace === 'developer' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleAiPanel}
                className={`h-8 w-8 rounded-full p-0 transition ${showAiPanel
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <MessageSquareCode className="h-4 w-4" />
                <span className="sr-only">Toggle AI Assistant</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {showAiPanel ? 'Hide AI Assistant' : 'Show AI Assistant'}
            </TooltipContent>
          </Tooltip>
        )}

        {workspace === 'developer' && (
          <div className="h-4 w-px bg-white/10 mx-0.5 hidden sm:block" />
        )}

        {/* Export ZIP / Export Plan */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={workspace === 'developer' && !hasFiles}
              onClick={() => void onExportZip()}
              className="h-8 px-3 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/10 text-xs text-slate-300 hover:text-white gap-1.5 hidden md:flex disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">{workspace === 'product' ? 'Export Plan' : 'Export'}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {workspace === 'product' ? 'Export Product Plan & Project' : hasFiles ? 'Download full project as ZIP' : 'No files to export'}
          </TooltipContent>
        </Tooltip>

        {/* Save Group: File Save & Project Save */}
        <div className="flex items-center">
          {workspace === 'product' ? (
            <Button
              size="sm"
              onClick={() => void onSaveProject?.()}
              disabled={(!dirty && saveState !== 'unsaved') || isWorking || saveState === 'saving'}
              className={`h-8 px-3.5 text-xs font-semibold gap-1.5 transition shadow-sm rounded-l-full rounded-r-none ${dirty || saveState === 'unsaved'
                  ? 'bg-white hover:bg-slate-200 text-black shadow-md'
                  : 'bg-white/10 text-slate-300 hover:bg-white/15 border-y border-l border-white/12'
                }`}
            >
              {isWorking || saveState === 'saving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Save Plan</span>
              <kbd className="hidden lg:inline text-[9px] font-mono opacity-60">⌘S</kbd>
            </Button>
          ) : !hasActiveFile ? (
            <Button
              size="sm"
              onClick={() => void onSaveProject?.()}
              disabled={(!dirty && saveState !== 'unsaved') || isWorking || saveState === 'saving'}
              className={`h-8 px-3.5 text-xs font-semibold gap-1.5 transition shadow-sm rounded-l-full rounded-r-none ${dirty || saveState === 'unsaved'
                  ? 'bg-white hover:bg-slate-200 text-black shadow-md'
                  : 'bg-white/10 text-slate-300 hover:bg-white/15 border-y border-l border-white/12'
                }`}
            >
              {isWorking || saveState === 'saving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Save Project</span>
              <kbd className="hidden lg:inline text-[9px] font-mono opacity-60">⌘⇧S</kbd>
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => void onSave()}
              disabled={(!dirty && saveState !== 'unsaved') || isWorking || saveState === 'saving'}
              className={`h-8 px-3.5 text-xs font-semibold gap-1.5 transition shadow-sm rounded-l-full rounded-r-none ${dirty || saveState === 'unsaved'
                  ? 'bg-white hover:bg-slate-200 text-black shadow-md'
                  : 'bg-white/10 text-slate-300 hover:bg-white/15 border-y border-l border-white/12'
                }`}
            >
              {isWorking || saveState === 'saving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Save</span>
              <kbd className="hidden lg:inline text-[9px] font-mono opacity-60">⌘S</kbd>
            </Button>
          )}

          {/* Dropdown for Save Project / Save Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className={`h-8 w-6 p-0 rounded-r-full rounded-l-none border-l transition ${dirty || saveState === 'unsaved'
                    ? 'bg-white hover:bg-slate-200 text-black border-black/10'
                    : 'bg-white/10 text-slate-300 hover:bg-white/15 border-y border-r border-white/12'
                  }`}
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-52 rounded-2xl border-white/15 bg-[#18181a]/95 backdrop-blur-xl text-slate-200 text-xs shadow-2xl"
            >
              {workspace === 'product' ? (
                <DropdownMenuItem
                  onClick={() => void onSaveProject?.()}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Save className="h-3.5 w-3.5 text-white" />
                    <span>Save Plan</span>
                  </div>
                  <kbd className="text-[10px] text-slate-400 font-mono">⌘S</kbd>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => void onSave()}
                  disabled={!hasActiveFile}
                  className="flex items-center justify-between cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-2">
                    <Save className="h-3.5 w-3.5 text-white" />
                    <span>{hasActiveFile ? 'Save Active File' : 'Save Active File (No file open)'}</span>
                  </div>
                  <kbd className="text-[10px] text-slate-400 font-mono">⌘S</kbd>
                </DropdownMenuItem>
              )}

              {onSaveProject && (
                <DropdownMenuItem
                  onClick={() => void onSaveProject()}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="pill" className="text-[9px] px-1.5 py-0 text-slate-200">
                      All
                    </Badge>
                    <span>Save Project</span>
                  </div>
                  <kbd className="text-[10px] text-slate-400 font-mono">⌘⇧S</kbd>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator className="bg-white/10" />

              <DropdownMenuItem
                onClick={() => void onExportZip()}
                disabled={!hasFiles}
                className="flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5 text-slate-400" />
                <span>Export Project ZIP</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Credit Indicator */}
        <Link
          href={isAdmin ? "/profile#credits" : "/upgrade"}
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/12 bg-white/[0.05] text-[11px] font-medium text-slate-200 hover:bg-white/10 hover:border-white/20 transition cursor-pointer"
          title={isAdmin ? "Unlimited AI Credits (Admin)" : `${creditsRemaining} of ${creditLimit} AI credits remaining`}
        >
          <Zap className="h-3 w-3 text-amber-400" />
          <span>{isAdmin ? '∞ Unlimited' : `${creditsRemaining} / ${creditLimit} credits`}</span>
        </Link>

        <div className="h-4 w-px bg-white/10 mx-0.5 hidden sm:block" />

        {/* Global User Menu */}
        <GlobalUserMenu />
      </div>
    </header>
  );
}
