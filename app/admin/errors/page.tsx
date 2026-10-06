'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  ShieldAlert,
  Server,
  Terminal,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface SystemErrorItem {
  id: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  category: string;
  provider: string | null;
  status_code: number | null;
  message: string;
  project_id: string | null;
  user_id: string | null;
  user_email: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const CATEGORIES = ['ALL', 'AI_PROVIDER', 'RATE_LIMIT', 'AUTH', 'RUNTIME', 'PREVIEW', 'DATABASE', 'COMPILATION'];

export default function AdminErrorsPage() {
  const [errors, setErrors] = useState<SystemErrorItem[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedError, setSelectedError] = useState<SystemErrorItem | null>(null);
  const [resolving, setResolving] = useState(false);

  const fetchErrors = useCallback(
    async (pageToLoad = 1, cat = selectedCategory, searchQuery = search) => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          page: String(pageToLoad),
          limit: '25',
        });
        if (cat !== 'ALL') params.set('category', cat);
        if (searchQuery.trim()) params.set('q', searchQuery.trim());

        const res = await fetch(`/api/admin/errors?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load error events');
        const data = await res.json();
        setErrors(data.errors || []);
        setPagination(data.pagination);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Error fetching errors');
      } finally {
        setLoading(false);
      }
    },
    [selectedCategory, search]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchErrors(1, selectedCategory, search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedCategory, fetchErrors]);

  const handleResolve = async () => {
    if (!selectedError) return;
    try {
      setResolving(true);
      const res = await fetch(`/api/admin/errors/${selectedError.id}/resolve`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to resolve error');

      toast.success('Error marked as resolved');
      setSelectedError(null);
      void fetchErrors(pagination.page);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error resolving error');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            API Error & Failure Center
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Structured error deduplication, 429 rate-limit alerts, 503 provider outages, and preview faults.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search error messages..."
            className="pl-9 h-9 text-xs bg-white/5 border-white/10 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold tracking-wider whitespace-nowrap transition ${
              selectedCategory === cat
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                : 'border-white/8 bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {cat.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Errors Table */}
      <div className="rounded-2xl border border-white/8 bg-[#15151c]/90 overflow-hidden shadow-xl backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="border-b border-white/8 bg-white/[0.02] text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Severity</th>
                <th className="py-3.5 px-3">Category</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 px-3">Message</th>
                <th className="py-3.5 px-3">Occurrences</th>
                <th className="py-3.5 px-3">Last Seen</th>
                <th className="py-3.5 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {loading && errors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    Loading errors...
                  </td>
                </tr>
              ) : errors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    No errors matching the filter criteria.
                  </td>
                </tr>
              ) : (
                errors.map((err) => {
                  const isResolved = Boolean(err.resolved_at);
                  const isCrit = err.severity === 'CRITICAL';
                  const isErr = err.severity === 'ERROR';
                  const isWarn = err.severity === 'WARNING';

                  return (
                    <tr key={err.id} className="hover:bg-white/[0.02] transition">
                      {/* Severity */}
                      <td className="py-3.5 px-4">
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-mono uppercase ${
                            isCrit
                              ? 'border-red-500/50 bg-red-500/20 text-red-300'
                              : isErr
                              ? 'border-red-500/30 bg-red-500/10 text-red-400'
                              : isWarn
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                              : 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                          }`}
                        >
                          {err.severity}
                        </Badge>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-3">
                        <span className="text-[11px] font-mono text-zinc-300">
                          {err.category}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3">
                        <Badge variant="outline" className="text-[10px] font-mono border-white/10 bg-white/5 text-white">
                          {err.status_code || 'N/A'}
                        </Badge>
                      </td>

                      {/* Message */}
                      <td className="py-3.5 px-3">
                        <p className="font-mono text-[11px] text-zinc-200 truncate max-w-[280px]">
                          {err.message}
                        </p>
                      </td>

                      {/* Occurrences */}
                      <td className="py-3.5 px-3 font-mono">
                        <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white text-[11px]">
                          {err.occurrence_count}×
                        </span>
                      </td>

                      {/* Last Seen */}
                      <td className="py-3.5 px-3 text-[11px] text-zinc-400 font-mono">
                        {new Date(err.last_seen_at).toLocaleTimeString()}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedError(err)}
                          className="h-7 text-xs border border-white/8 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/8 bg-white/[0.01] text-xs text-zinc-400">
          <div>
            Total <span className="font-mono text-white">{pagination.total}</span> events
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void fetchErrors(pagination.page - 1)}
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
              onClick={() => void fetchErrors(pagination.page + 1)}
              className="h-7 text-xs border-white/10 bg-white/5"
            >
              Next <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Error Details Modal */}
      <Dialog open={Boolean(selectedError)} onOpenChange={() => setSelectedError(null)}>
        <DialogContent className="sm:max-w-xl bg-[#181822] border-white/12 text-zinc-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-400" />
              Error Details
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 pt-0.5">
              Event fingerprint <span className="font-mono text-zinc-300">{selectedError?.id}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/6">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Status Code</span>
                <span className="font-mono font-bold text-white text-sm">
                  {selectedError?.status_code || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Category</span>
                <span className="font-mono text-white">{selectedError?.category}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Occurrences</span>
                <span className="font-mono text-amber-400 font-bold">{selectedError?.occurrence_count} times</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Provider</span>
                <span className="font-mono text-white capitalize">{selectedError?.provider || 'System'}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">First Seen</span>
                <span className="font-mono text-zinc-300">
                  {selectedError ? new Date(selectedError.first_seen_at).toLocaleString() : ''}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Last Seen</span>
                <span className="font-mono text-zinc-300">
                  {selectedError ? new Date(selectedError.last_seen_at).toLocaleString() : ''}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Sanitized Error Message
              </label>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 font-mono text-[11px] text-red-300 max-h-36 overflow-y-auto leading-relaxed">
                {selectedError?.message}
              </div>
            </div>

            {selectedError?.project_id && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/6 font-mono text-[11px]">
                <span className="text-zinc-400">Associated Project ID:</span>
                <span className="text-white">{selectedError.project_id}</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedError(null)}
              className="border-white/10 text-zinc-300"
            >
              Close
            </Button>
            {!selectedError?.resolved_at && (
              <Button
                size="sm"
                disabled={resolving}
                onClick={handleResolve}
                className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                {resolving ? 'Resolving...' : 'Mark as Resolved'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
