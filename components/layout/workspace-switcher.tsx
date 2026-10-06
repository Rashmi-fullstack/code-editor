'use client';

import React from 'react';
import { Code2, Compass } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface WorkspaceSwitcherProps {
  currentWorkspace?: 'developer' | 'product';
  onWorkspaceChange?: (workspace: 'developer' | 'product') => void;
  projectId?: string;
  className?: string;
  compact?: boolean;
}

export function WorkspaceSwitcher({
  currentWorkspace = 'developer',
  onWorkspaceChange,
  projectId,
  className = '',
  compact = false,
}: WorkspaceSwitcherProps) {
  const router = useRouter();

  const handleSelect = (ws: 'developer' | 'product') => {
    if (onWorkspaceChange) {
      onWorkspaceChange(ws);
      return;
    }
    const targetUrl = projectId
      ? `/editor?project=${projectId}&view=${ws}`
      : `/editor?view=${ws}`;
    router.push(targetUrl);
  };

  return (
    <div
      className={`inline-flex items-center rounded-full bg-[#28282a] border border-white/12 p-1 shadow-inner ${className}`}
      role="group"
      aria-label="Workspace Switcher"
    >
      <button
        type="button"
        onClick={() => handleSelect('developer')}
        className={`flex items-center gap-1.5 rounded-full font-medium transition cursor-pointer ${
          compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 sm:px-3.5 py-1 text-xs'
        } ${
          currentWorkspace === 'developer'
            ? 'bg-white text-black font-semibold shadow-md'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Switch to Developer IDE"
      >
        <Code2 className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        <span>Developer IDE</span>
      </button>

      <button
        type="button"
        onClick={() => handleSelect('product')}
        className={`flex items-center gap-1.5 rounded-full font-medium transition cursor-pointer ${
          compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 sm:px-3.5 py-1 text-xs'
        } ${
          currentWorkspace === 'product'
            ? 'bg-white text-black font-semibold shadow-md'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Switch to Product Manager"
      >
        <Compass className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        <span>Product Manager</span>
      </button>
    </div>
  );
}
