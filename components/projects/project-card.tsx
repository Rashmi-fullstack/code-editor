'use client';

import React from 'react';
import Link from 'next/link';
import {
  MoreVertical,
  Edit2,
  Copy,
  Trash2,
  ExternalLink,
  Code2,
  Compass,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Project } from '@/lib/types/database';

export interface ProjectCardProps {
  project: Project;
  onRename: (project: Project) => void;
  onDuplicate: (project: Project) => void;
  onDelete: (project: Project) => void;
}

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return 'Recently';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSecs < 60) return 'Just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

// Generate an algorithmic visual palette and mockup preview from project title
function getThumbnailStyle(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  const gradients = [
    'from-indigo-600/30 via-purple-600/20 to-blue-600/10',
    'from-blue-600/30 via-cyan-600/20 to-indigo-600/10',
    'from-purple-600/30 via-pink-600/20 to-rose-600/10',
    'from-emerald-600/30 via-teal-600/20 to-cyan-600/10',
    'from-amber-600/30 via-orange-600/20 to-rose-600/10',
  ];

  const primaryAccent = [
    'bg-indigo-500/20 border-indigo-500/40 text-indigo-300',
    'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
    'bg-pink-500/20 border-pink-500/40 text-pink-300',
    'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    'bg-amber-500/20 border-amber-500/40 text-amber-300',
  ];

  const index = Math.abs(hash) % gradients.length;
  return {
    gradient: gradients[index],
    accent: primaryAccent[index],
  };
}

export function ProjectCard({
  project,
  onRename,
  onDuplicate,
  onDelete,
}: ProjectCardProps) {
  const thumb = getThumbnailStyle(project.name);
  const relativeTime = formatRelativeTime(project.updated_at || project.created_at);

  return (
    <div className="group relative flex flex-col rounded-2xl border border-white/10 bg-[#0d0f22]/90 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 overflow-hidden">
      {/* Visual Preview Thumbnail Window */}
      <Link
        href={`/editor?project=${project.id}`}
        className="relative block h-40 w-full overflow-hidden bg-gradient-to-br border-b border-white/10 cursor-pointer select-none"
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${thumb.gradient}`} />

        {/* Micro Browser Shell */}
        <div className="absolute inset-x-3 top-3 bottom-0 rounded-t-xl border border-white/10 bg-[#080914]/90 p-2.5 shadow-2xl flex flex-col space-y-2 group-hover:translate-y-[-2px] transition duration-300">
          {/* Window dots + titlebar */}
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500/60" />
              <span className="h-2 w-2 rounded-full bg-amber-500/60" />
              <span className="h-2 w-2 rounded-full bg-emerald-500/60" />
            </div>
            <div className="h-2.5 w-24 rounded-full bg-white/10" />
            <Sparkles className="h-2.5 w-2.5 text-indigo-400 opacity-60" />
          </div>

          {/* Micro Wireframe UI Preview */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <div className="h-2 w-16 rounded bg-white/20" />
              <div className="flex gap-1">
                <div className="h-2 w-6 rounded bg-white/10" />
                <div className="h-2 w-6 rounded bg-white/10" />
              </div>
            </div>

            <div className="h-7 rounded-lg border border-white/10 bg-white/[0.02] flex items-center px-2 justify-between">
              <div className="space-y-1">
                <div className="h-1.5 w-20 rounded bg-indigo-400/50" />
                <div className="h-1 w-28 rounded bg-white/15" />
              </div>
              <div className="h-3.5 w-8 rounded bg-indigo-600/40" />
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              <div className="h-9 rounded-md border border-white/5 bg-white/[0.02] p-1 space-y-1">
                <div className="h-1 w-6 rounded bg-white/30" />
                <div className="h-1 w-10 rounded bg-white/10" />
              </div>
              <div className="h-9 rounded-md border border-white/5 bg-white/[0.02] p-1 space-y-1">
                <div className="h-1 w-6 rounded bg-white/30" />
                <div className="h-1 w-10 rounded bg-white/10" />
              </div>
              <div className="h-9 rounded-md border border-white/5 bg-white/[0.02] p-1 space-y-1">
                <div className="h-1 w-6 rounded bg-white/30" />
                <div className="h-1 w-10 rounded bg-white/10" />
              </div>
            </div>
          </div>
        </div>

        {/* Hover overlay hint */}
        <div className="absolute inset-0 bg-indigo-950/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur">
            <ExternalLink className="h-3 w-3" />
            Open Project
          </span>
        </div>
      </Link>

      {/* Card Body */}
      <div className="flex flex-1 flex-col p-4 justify-between">
        <div>
          {/* Header Row: Title & Dropdown */}
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/editor?project=${project.id}`}
              className="group/title block flex-1 min-w-0"
            >
              <h3 className="truncate text-sm font-bold text-white group-hover/title:text-indigo-300 transition">
                {project.name}
              </h3>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition"
                  title="More actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 bg-[#0e1022] border-white/10 text-slate-200 text-xs shadow-2xl"
              >
                <DropdownMenuItem asChild>
                  <Link
                    href={`/editor?project=${project.id}&view=developer`}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Code2 className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Open in Developer IDE</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    href={`/editor?project=${project.id}&view=product`}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Compass className="h-3.5 w-3.5 text-purple-400" />
                    <span>Open in Product Manager</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/10" />

                <DropdownMenuItem
                  onClick={() => onRename(project)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Edit2 className="h-3.5 w-3.5 text-slate-400" />
                  <span>Rename / Edit Info</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => onDuplicate(project)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5 text-slate-400" />
                  <span>Duplicate Project</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/10" />

                <DropdownMenuItem
                  onClick={() => onDelete(project)}
                  className="flex items-center gap-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                  <span>Delete Project</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Description */}
          <p className="mt-1 line-clamp-2 text-xs text-slate-400 leading-relaxed min-h-[32px]">
            {project.description || 'AI Studio workspace with full code editing and product management.'}
          </p>
        </div>

        {/* Footer Meta & Actions */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Calendar className="h-3 w-3 text-slate-500" />
            <span>{relativeTime}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className="border-white/10 bg-white/[0.03] text-[10px] text-slate-300 font-normal px-2 py-0.5"
            >
              <Layers className="h-2.5 w-2.5 mr-1 text-indigo-400" />
              {project.framework || 'Next.js'}
            </Badge>

            <Link href={`/editor?project=${project.id}`}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs text-indigo-300 hover:text-white hover:bg-indigo-600/30 gap-1 font-medium"
              >
                <span>Open</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}