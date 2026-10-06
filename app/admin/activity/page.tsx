'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  History,
  Search,
  Shield,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  User,
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

interface AuditLogRecord {
  id: string;
  admin_user_id: string | null;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminActivityPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  const fetchLogs = useCallback(
    async (pageToLoad = 1, searchQuery = search) => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          page: String(pageToLoad),
          limit: '25',
        });
        if (searchQuery.trim()) params.set('q', searchQuery.trim());

        const res = await fetch(`/api/admin/activity?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch activity logs');
        const data = await res.json();
        setLogs(data.logs || []);
        setPagination(data.pagination);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Error fetching audit logs');
      } finally {
        setLoading(false);
      }
    },
    [search]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchLogs(1, search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchLogs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <History className="h-5 w-5 text-emerald-400" />
            Administrative Activity Audit Trail
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Cryptographically sealed and immutable audit record of administrative operations.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action or admin..."
            className="pl-9 h-9 text-xs bg-white/5 border-white/10 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-2xl border border-white/8 bg-[#15151c]/90 overflow-hidden shadow-xl backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="border-b border-white/8 bg-white/[0.02] text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-3">Admin</th>
                <th className="py-3.5 px-3">Target Type</th>
                <th className="py-3.5 px-3">Target ID</th>
                <th className="py-3.5 px-3">Timestamp</th>
                <th className="py-3.5 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    Loading activity records...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    No activity logs recorded.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isCredit = log.action.includes('CREDIT');
                  const isSuspend = log.action.includes('SUSPEND');
                  const isRestore = log.action.includes('RESTORE');

                  return (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3.5 px-4">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono ${
                            isCredit
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                              : isSuspend
                              ? 'border-red-500/30 bg-red-500/10 text-red-400'
                              : isRestore
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : 'border-white/10 bg-white/5 text-zinc-200'
                          }`}
                        >
                          {log.action}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-3 font-mono text-[11px] text-zinc-200">
                        {log.admin_email}
                      </td>

                      <td className="py-3.5 px-3 font-mono text-[11px] text-zinc-400 capitalize">
                        {log.target_type.replace('_', ' ')}
                      </td>

                      <td className="py-3.5 px-3 font-mono text-[11px] text-zinc-400 truncate max-w-[150px]">
                        {log.target_id || '—'}
                      </td>

                      <td className="py-3.5 px-3 font-mono text-[11px] text-zinc-400">
                        {new Date(log.created_at).toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                          className="h-7 text-xs border border-white/8 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" /> Payload
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
            Total <span className="font-mono text-white">{pagination.total}</span> audit records
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void fetchLogs(pagination.page - 1)}
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
              onClick={() => void fetchLogs(pagination.page + 1)}
              className="h-7 text-xs border-white/10 bg-white/5"
            >
              Next <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      <Dialog open={Boolean(selectedLog)} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="sm:max-w-md bg-[#181822] border-white/12 text-zinc-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-400" />
              Audit Entry Payload
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 pt-0.5">
              Action <span className="font-mono text-white">{selectedLog?.action}</span> by{' '}
              <span className="font-mono text-emerald-300">{selectedLog?.admin_email}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/6 space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-500">Record ID:</span>
                <span className="text-zinc-300">{selectedLog?.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Target Type:</span>
                <span className="text-zinc-300">{selectedLog?.target_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Target ID:</span>
                <span className="text-zinc-300">{selectedLog?.target_id || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Time:</span>
                <span className="text-zinc-300">
                  {selectedLog ? new Date(selectedLog.created_at).toLocaleString() : ''}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Metadata
              </label>
              <pre className="p-3 rounded-xl bg-black/40 border border-white/8 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-48 leading-relaxed">
                {JSON.stringify(selectedLog?.details || {}, null, 2)}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
