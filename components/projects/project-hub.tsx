'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Plus,
  Search,
  FolderTree,
  Clock,
  Code2,
  Compass,
  ArrowUpDown,
  Layers,
  Trash2,
  Loader2,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GlobalUserMenu } from '@/components/layout/global-user-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/client';
import { useAuth } from '@/components/auth-provider';
import { getProjects, deleteProject, duplicateProject } from '@/lib/db/projects';
import type { Project } from '@/lib/types/database';
import { ProjectCard } from './project-card';
import { NewProjectModal } from './new-project-modal';
import { RenameProjectModal } from './rename-project-modal';
import { toast } from 'sonner';

type FilterTab = 'all' | 'recent' | 'nextjs';
type SortOption = 'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc';

export function ProjectHub() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated_desc');

  // Modal states
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [projectToRename, setProjectToRename] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch projects from Supabase
  const loadProjects = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const res = await getProjects(supabase, user.id);
      if (res.error) {
        console.error('Error fetching projects:', res.error);
        toast.error('Failed to load projects');
      } else {
        setProjects(res.data ?? []);
      }
    } catch (err) {
      console.error('Unexpected error loading projects:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    async function init() {
      if (!user) {
        if (active) setIsLoading(false);
        return;
      }
      const supabase = createClient();
      const res = await getProjects(supabase, user.id);
      if (active) {
        if (res.data) setProjects(res.data);
        setIsLoading(false);
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, [authLoading, user]);

  // Duplicate handler
  const handleDuplicateProject = async (project: Project) => {
    if (!user) return;
    const toastId = toast.loading(`Duplicating "${project.name}"…`);
    try {
      const supabase = createClient();
      const res = await duplicateProject(supabase, project.id, user.id);
      if (res.error || !res.data) {
        throw res.error || new Error('Duplication failed');
      }
      toast.success(`Duplicated as "${res.data.name}"`, { id: toastId });
      await loadProjects();
    } catch (err: unknown) {
      console.error('Failed to duplicate project:', err);
      toast.error(err instanceof Error ? err.message : 'Could not duplicate project', { id: toastId });
    }
  };

  // Delete handler
  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    const target = projectToDelete;
    const toastId = toast.loading(`Deleting "${target.name}"…`);
    try {
      const supabase = createClient();
      const res = await deleteProject(supabase, target.id);
      if (res.error) {
        throw res.error;
      }
      toast.success(`Project "${target.name}" deleted.`, { id: toastId });
      setProjects((prev) => prev.filter((p) => p.id !== target.id));
      setProjectToDelete(null);
    } catch (err: unknown) {
      console.error('Failed to delete project:', err);
      toast.error(err instanceof Error ? err.message : 'Could not delete project', { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    let list = [...projects];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Tab filter
    if (activeTab === 'recent') {
      const now = new Date().getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      list = list.filter((p) => {
        const time = new Date(p.updated_at || p.created_at || '').getTime();
        return now - time <= sevenDaysMs;
      });
    } else if (activeTab === 'nextjs') {
      list = list.filter((p) => (p.framework || 'nextjs').toLowerCase().includes('next'));
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'updated_desc') {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
        return timeB - timeA;
      }
      if (sortBy === 'updated_asc') {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
        return timeA - timeB;
      }
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'name_desc') {
        return b.name.localeCompare(a.name);
      }
      return 0;
    });

    return list;
  }, [projects, searchQuery, activeTab, sortBy]);

  return (
    <div className="flex h-screen w-full flex-col bg-[#000] text-slate-100 overflow-hidden select-none relative">
      {/* Subtle atmospheric glow background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(255,255,255,0))] z-0" />

      {/* ========================================================================= */}
      {/* TOP APPLICATION BAR */}
      {/* ========================================================================= */}
      <header className="h-14 shrink-0 border-b border-white/10 bg-black/40 backdrop-blur-xl px-5 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="group flex items-center gap-2.5 rounded-full py-1 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md overflow-hidden shrink-0">
              <img src="/assets/logo.webp" alt="Codatron" className="h-5 w-5 object-contain" />
            </span>
            <span className="font-bold tracking-tight text-white">Codatron.ai</span>
          </Link>

          <ChevronRight className="h-4 w-4 text-slate-600 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-semibold text-slate-300">
              My Projects
            </span>
            <Badge
              variant="pill"
              className="text-[11px] font-mono px-2.5 py-0.5"
            >
              {projects.length} Total
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => setIsNewModalOpen(true)}
            className="bg-white hover:bg-slate-200 text-black text-xs font-semibold px-4 h-9 rounded-full gap-1.5 shadow-md transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Project</span>
          </Button>

          {user && (
            <div className="pl-2 border-l border-white/10">
              <GlobalUserMenu showTriggerLabel={true} />
            </div>
          )}
        </div>
      </header>

      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* BODY WORKSPACE: LEFT SIDEBAR + MAIN CONTENT GRID */}
      {/* ========================================================================= */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative z-10">
        {/* LEFT SIDEBAR */}
        <aside className="w-64 shrink-0 bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col p-4 hidden md:flex h-full overflow-hidden select-none">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
            {/* Search Input in Sidebar */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <Input
                type="text"
                placeholder="Search projects…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 bg-white/[0.05] border-white/12 pl-8.5 text-xs text-white placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-white/20 rounded-full"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-[10px] text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Navigation Section */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 pb-0.5">
                Navigation
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`flex items-center justify-between w-full px-3.5 py-2 rounded-full text-xs font-medium transition cursor-pointer ${activeTab === 'all'
                  ? 'bg-white text-black font-semibold shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <FolderTree className={`h-4 w-4 ${activeTab === 'all' ? 'text-black' : 'text-slate-500'}`} />
                  <span>All Projects</span>
                </div>
                <Badge
                  variant="secondary"
                  className={`h-4 px-2 text-[10px] rounded-full ${
                    activeTab === 'all' ? 'bg-black/10 text-black' : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {projects.length}
                </Badge>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('recent')}
                className={`flex items-center justify-between w-full px-3.5 py-2 rounded-full text-xs font-medium transition cursor-pointer ${activeTab === 'recent'
                  ? 'bg-white text-black font-semibold shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Clock className={`h-4 w-4 ${activeTab === 'recent' ? 'text-black' : 'text-slate-500'}`} />
                  <span>Recent Projects</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('nextjs')}
                className={`flex items-center justify-between w-full px-3.5 py-2 rounded-full text-xs font-medium transition cursor-pointer ${activeTab === 'nextjs'
                  ? 'bg-white text-black font-semibold shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Layers className={`h-4 w-4 ${activeTab === 'nextjs' ? 'text-black' : 'text-slate-500'}`} />
                  <span>Next.js Projects</span>
                </div>
              </button>
            </div>

            {/* Workspace Switcher Navigation */}
            <div className="space-y-1.5 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 pb-0.5">
                Workspaces
              </p>
              <Link
                href="/editor?view=developer"
                className="flex items-center justify-between w-full px-3.5 py-2 rounded-full text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition"
              >
                <div className="flex items-center gap-2.5">
                  <Code2 className="h-4 w-4 text-indigo-400" />
                  <span>Developer IDE</span>
                </div>
                <ExternalLink className="h-3 w-3 opacity-40" />
              </Link>
              <Link
                href="/editor?view=product"
                className="flex items-center justify-between w-full px-3.5 py-2 rounded-full text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition"
              >
                <div className="flex items-center gap-2.5">
                  <Compass className="h-4 w-4 text-purple-400" />
                  <span>Product Manager</span>
                </div>
                <ExternalLink className="h-3 w-3 opacity-40" />
              </Link>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 flex flex-col min-w-0 bg-transparent overflow-y-auto">
          {/* Main Content Header Filter Row */}
          <div className="p-6 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5">
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                {activeTab === 'all' && 'All Projects'}
                {activeTab === 'recent' && 'Recent Projects (Past 7 Days)'}
                {activeTab === 'nextjs' && 'Next.js Applications'}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage, edit, duplicate, and continue working on your saved AI applications.
              </p>
            </div>

            {/* Controls: Search (Mobile), Sort Dropdown */}
            <div className="flex items-center gap-3">
              <div className="sm:hidden flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <Input
                  type="text"
                  placeholder="Search…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 bg-white/[0.05] border-white/12 pl-8.5 text-xs text-white rounded-full"
                />
              </div>

              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
                <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortOption)}>
                  <SelectTrigger className="h-9 w-36 bg-white/[0.05] border-white/12 text-xs text-slate-200 rounded-full px-3.5">
                    <SelectValue placeholder="Sort By" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#18181a]/95 border-white/15 backdrop-blur-xl text-xs text-slate-200 rounded-2xl shadow-2xl">
                    <SelectItem value="updated_desc">Last Edited</SelectItem>
                    <SelectItem value="updated_asc">Oldest Edited</SelectItem>
                    <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                    <SelectItem value="name_desc">Name (Z-A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Project Grid / State */}
          <div className="flex-1 p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 space-y-3">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
                <p className="text-xs text-slate-400">Loading your persistent projects…</p>
              </div>
            ) : filteredProjects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onRename={(p) => setProjectToRename(p)}
                    onDuplicate={(p) => void handleDuplicateProject(p)}
                    onDelete={(p) => setProjectToDelete(p)}
                  />
                ))}
              </div>
            ) : (
              /* Empty State */
              <div className="flex flex-col items-center justify-center h-80 rounded-[28px] border border-dashed border-white/15 bg-black/40 backdrop-blur-xl p-8 text-center space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] text-white border border-white/15">
                  <Code2 className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">
                    {searchQuery ? 'No matching projects found' : 'No projects saved yet'}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {searchQuery
                      ? `We couldn't find any projects matching "${searchQuery}". Try a different keyword.`
                      : 'Create your first AI Studio project to start building with Product Manager, Monaco editor, and live preview.'}
                  </p>
                </div>
                {!searchQuery && (
                  <Button
                    onClick={() => setIsNewModalOpen(true)}
                    className="bg-white hover:bg-slate-200 text-black text-xs font-semibold px-5 h-9 rounded-full shadow-md gap-2 cursor-pointer transition"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create Your First Project</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* MODALS */}
      {/* Create New Project Modal */}
      <NewProjectModal
        open={isNewModalOpen}
        onOpenChange={setIsNewModalOpen}
        onProjectCreated={(pid, createdMode) => {
          setIsNewModalOpen(false);
          const view = createdMode === 'product' ? 'product' : 'developer';
          router.push(`/editor?project=${pid}&view=${view}`);
        }}
      />

      {/* Rename Project Modal */}
      <RenameProjectModal
        open={Boolean(projectToRename)}
        onOpenChange={(open) => !open && setProjectToRename(null)}
        project={projectToRename}
        onProjectUpdated={(updated) => {
          setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        }}
      />

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={Boolean(projectToDelete)}
        onOpenChange={(open) => !open && !isDeleting && setProjectToDelete(null)}
      >
        <AlertDialogContent className="rounded-3xl border border-white/15 bg-[#18181a]/95 backdrop-blur-2xl text-white shadow-2xl p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-400" />
              Delete Project
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-400">
              Are you sure you want to delete{' '}
              <strong className="text-white">{projectToDelete?.name}</strong>? This action
              permanently deletes all project source files, product plans, and generation history from Supabase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 pt-2">
            <AlertDialogCancel
              disabled={isDeleting}
              className="text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border-white/15 rounded-full px-4 h-9"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-5 h-9 rounded-full gap-1.5 cursor-pointer shadow-md"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Deleting…</span>
                </>
              ) : (
                <span>Delete Project</span>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
