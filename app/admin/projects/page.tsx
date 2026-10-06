'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  FolderKanban,
  Search,
  FileCode,
  Calendar,
  User,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  prompt: string | null;
  framework: string;
  userId: string;
  ownerEmail: string;
  ownerName: string | null;
  fileCount: number;
  recentError: { statusCode: number; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);

  const fetchProjects = useCallback(
    async (pageToLoad = 1, searchQuery = search) => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          page: String(pageToLoad),
          limit: '20',
        });
        if (searchQuery.trim()) {
          params.set('q', searchQuery.trim());
        }

        const res = await fetch(`/api/admin/projects?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch projects');
        const data = await res.json();
        setProjects(data.projects || []);
        setPagination(data.pagination);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Error loading projects');
      } finally {
        setLoading(false);
      }
    },
    [search]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchProjects(1, search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchProjects]);

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-purple-400" />
            Project Diagnostics
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Inspect workspaces, ownership, file trees, and error history for diagnostic support.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects or prompts..."
            className="pl-9 h-9 text-xs bg-white/5 border-white/10 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>
      </div>

      {/* Projects Table */}
      <div className="rounded-2xl border border-white/8 bg-[#15151c]/90 overflow-hidden shadow-xl backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="border-b border-white/8 bg-white/[0.02] text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Project</th>
                <th className="py-3.5 px-3">Owner</th>
                <th className="py-3.5 px-3">Framework</th>
                <th className="py-3.5 px-3">Files</th>
                <th className="py-3.5 px-3">Status / Errors</th>
                <th className="py-3.5 px-3">Updated</th>
                <th className="py-3.5 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {loading && projects.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    Loading projects...
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    No projects found.
                  </td>
                </tr>
              ) : (
                projects.map((proj) => (
                  <tr key={proj.id} className="hover:bg-white/[0.02] transition">
                    {/* Project Name */}
                    <td className="py-3.5 px-4">
                      <div>
                        <p className="font-semibold text-white">{proj.name}</p>
                        <p className="text-[10px] text-zinc-400 font-mono truncate max-w-[200px]">
                          {proj.id}
                        </p>
                      </div>
                    </td>

                    {/* Owner */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-1.5 text-zinc-300 font-mono text-[11px]">
                        <User className="h-3 w-3 text-zinc-400 flex-shrink-0" />
                        <span className="truncate max-w-[160px]">{proj.ownerEmail}</span>
                      </div>
                    </td>

                    {/* Framework */}
                    <td className="py-3.5 px-3">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono border-white/10 bg-white/5 text-zinc-300 capitalize"
                      >
                        {proj.framework}
                      </Badge>
                    </td>

                    {/* File Count */}
                    <td className="py-3.5 px-3 font-mono">
                      <div className="flex items-center gap-1 text-zinc-300">
                        <FileCode className="h-3.5 w-3.5 text-blue-400" />
                        <span>{proj.fileCount}</span>
                      </div>
                    </td>

                    {/* Status / Errors */}
                    <td className="py-3.5 px-3">
                      {proj.recentError ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono border-red-500/30 bg-red-500/10 text-red-400 flex items-center gap-1 max-w-[140px] truncate"
                        >
                          <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" />
                          <span>Err {proj.recentError.statusCode}</span>
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        >
                          Operational
                        </Badge>
                      )}
                    </td>

                    {/* Updated */}
                    <td className="py-3.5 px-3 text-[11px] text-zinc-400 font-mono">
                      {new Date(proj.updatedAt).toLocaleDateString()}
                    </td>

                    {/* Inspect Action */}
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedProject(proj)}
                        className="h-7 text-xs border border-white/8 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/8 bg-white/[0.01] text-xs text-zinc-400">
          <div>
            Total <span className="font-mono text-white">{pagination.total}</span> projects
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void fetchProjects(pagination.page - 1)}
              className="h-7 text-xs border-white/10 bg-white/5"
            >
              <ChevronLeft className="h-3 w-3 mr-1" /> Prev
            </Button>
            <span className="font-mono text-zinc-400 text-xs px-2">
              Page {pagination.page} / {Math.max(1, pagination.totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => void fetchProjects(pagination.page + 1)}
              className="h-7 text-xs border-white/10 bg-white/5"
            >
              Next <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Project Details Modal */}
      <Dialog open={Boolean(selectedProject)} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="sm:max-w-xl bg-[#181822] border-white/12 text-zinc-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-purple-400" />
              {selectedProject?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 pt-0.5">
              Diagnostic summary for project <span className="font-mono text-zinc-300">{selectedProject?.id}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/6">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Owner</span>
                <span className="font-mono text-white">{selectedProject?.ownerEmail}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Framework</span>
                <span className="font-mono text-emerald-400">{selectedProject?.framework}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Total Files</span>
                <span className="font-mono text-white">{selectedProject?.fileCount} files</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Created</span>
                <span className="font-mono text-zinc-300">
                  {selectedProject ? new Date(selectedProject.createdAt).toLocaleString() : ''}
                </span>
              </div>
            </div>

            {selectedProject?.prompt && (
              <div>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                  Original Project Prompt
                </label>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 font-mono text-[11px] text-zinc-300 max-h-36 overflow-y-auto leading-relaxed">
                  {selectedProject.prompt}
                </div>
              </div>
            )}

            {selectedProject?.recentError && (
              <div>
                <label className="text-[10px] font-semibold text-red-400 uppercase tracking-wider block mb-1">
                  Recent Telemetry Error
                </label>
                <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/20 text-red-300 text-xs">
                  <span className="font-mono font-bold">[{selectedProject.recentError.statusCode}]</span>{' '}
                  {selectedProject.recentError.message}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
