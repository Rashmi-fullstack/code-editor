'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Search,
  Shield,
  ShieldAlert,
  Ban,
  RotateCcw,
  Zap,
  FolderKanban,
  Sparkles,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface UserRecord {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  creditLimit: number;
  creditsUsed: number;
  creditsRemaining: number;
  projectCount: number;
  aiRequestCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Suspension Modal State
  const [suspendModalUser, setSuspendModalUser] = useState<UserRecord | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);

  // Credit Adjustment Modal State
  const [creditModalUser, setCreditModalUser] = useState<UserRecord | null>(null);
  const [creditAction, setCreditAction] = useState<'add' | 'remove' | 'set'>('add');
  const [creditAmount, setCreditAmount] = useState<number>(20);
  const [creditReason, setCreditReason] = useState('');

  const fetchUsers = useCallback(
    async (pageToLoad = 1, searchQuery = search) => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          page: String(pageToLoad),
          limit: '20',
        });
        if (searchQuery.trim()) {
          params.set('q', searchQuery.trim());
        }

        const res = await fetch(`/api/admin/users?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || `Failed to fetch users (${res.status})`);
        }
        const data = await res.json();
        setUsers(data.users || []);
        if (data.pagination) setPagination(data.pagination);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error loading users';
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [search]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchUsers(1, search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchUsers]);

  const handleToggleSuspend = async () => {
    if (!suspendModalUser) return;
    try {
      setActionInProgress(true);
      const nextStatus = suspendModalUser.status === 'suspended' ? 'active' : 'suspended';
      const res = await fetch(`/api/admin/users/${suspendModalUser.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          reason: suspendReason || 'Administrative decision',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Status change failed');

      toast.success(data.message || 'User status updated');
      setSuspendModalUser(null);
      setSuspendReason('');
      void fetchUsers(pagination.page);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleAdjustCredits = async () => {
    if (!creditModalUser) return;
    try {
      setActionInProgress(true);
      const res = await fetch('/api/admin/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: creditModalUser.id,
          action: creditAction,
          amount: creditAmount,
          reason: creditReason || 'Manual adjustment',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update credits');

      toast.success(data.message || 'Credits updated');
      setCreditModalUser(null);
      setCreditReason('');
      void fetchUsers(pagination.page);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error updating credits');
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            User Management
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Search, inspect activity, manage status, and adjust application credits.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="pl-9 h-9 text-xs bg-white/5 border-white/10 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-white/8 bg-[#15151c]/90 overflow-hidden shadow-xl backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="border-b border-white/8 bg-white/[0.02] text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">User</th>
                <th className="py-3.5 px-3">Role</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 px-3">Credits</th>
                <th className="py-3.5 px-3">Projects</th>
                <th className="py-3.5 px-3">AI Requests</th>
                <th className="py-3.5 px-3">Created</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
                      <span>Loading registered users...</span>
                    </div>
                  </td>
                </tr>
              ) : error && users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <AlertTriangle className="h-7 w-7 text-amber-400" />
                      <p className="text-sm font-semibold text-white">Unable to load users</p>
                      <p className="text-xs text-zinc-400 font-mono">{error}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void fetchUsers(pagination.page, search)}
                        className="mt-2 text-xs border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl"
                      >
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500">
                    {search ? `No users matching "${search}".` : 'No registered users found.'}
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const initials = user.email.slice(0, 2).toUpperCase();
                  const isSuspended = user.status === 'suspended';
                  const isAdmin = user.role === 'admin';

                  return (
                    <tr key={user.id} className="hover:bg-white/[0.02] transition">
                      {/* User Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 rounded-xl border border-white/10 bg-white/5">
                            <AvatarFallback className="text-[10px] font-bold text-zinc-300 bg-transparent">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate max-w-[180px]">
                              {user.fullName || user.email.split('@')[0]}
                            </p>
                            <p className="text-[11px] text-zinc-400 font-mono truncate max-w-[180px]">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono capitalize ${isAdmin
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-zinc-700 bg-zinc-800/50 text-zinc-300'
                            }`}
                        >
                          {user.role}
                        </Badge>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono capitalize ${isSuspended
                            ? 'border-red-500/30 bg-red-500/10 text-red-400'
                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            }`}
                        >
                          {user.status}
                        </Badge>
                      </td>

                      {/* Credits */}
                      <td className="py-3.5 px-3 font-mono">
                        {isAdmin ? (
                          <span className="text-emerald-400 text-[11px] font-semibold">Unlimited (Admin)</span>
                        ) : (
                          <span className="text-white">
                            {user.creditsRemaining}{' '}
                            <span className="text-zinc-500 text-[10px]">/ {user.creditLimit}</span>
                          </span>
                        )}
                      </td>

                      {/* Projects */}
                      <td className="py-3.5 px-3 font-mono text-zinc-300">
                        {user.projectCount}
                      </td>

                      {/* AI Requests */}
                      <td className="py-3.5 px-3 font-mono text-zinc-300">
                        {user.aiRequestCount}
                      </td>

                      {/* Created */}
                      <td className="py-3.5 px-3 text-[11px] text-zinc-400 font-mono">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions Dropdown */}
                      <td className="py-3.5 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-48 bg-[#181822] border-white/10 text-xs text-zinc-300 rounded-xl"
                          >
                            <DropdownMenuItem
                              onClick={() => {
                                setCreditModalUser(user);
                                setCreditAmount(20);
                                setCreditAction('add');
                              }}
                              className="gap-2 cursor-pointer text-amber-400 hover:text-amber-300 focus:bg-white/5"
                            >
                              <Zap className="h-3.5 w-3.5" />
                              Adjust Credits
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuItem
                              onClick={() => setSuspendModalUser(user)}
                              className={`gap-2 cursor-pointer focus:bg-white/5 ${isSuspended
                                ? 'text-emerald-400 hover:text-emerald-300'
                                : 'text-red-400 hover:text-red-300'
                                }`}
                            >
                              {isSuspended ? (
                                <>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  Restore Account
                                </>
                              ) : (
                                <>
                                  <Ban className="h-3.5 w-3.5" />
                                  Suspend Account
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
            Total <span className="font-mono text-white">{pagination.total}</span> users
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void fetchUsers(pagination.page - 1)}
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
              onClick={() => void fetchUsers(pagination.page + 1)}
              className="h-7 text-xs border-white/10 bg-white/5"
            >
              Next <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog: Suspend / Restore */}
      <Dialog open={Boolean(suspendModalUser)} onOpenChange={() => setSuspendModalUser(null)}>
        <DialogContent className="sm:max-w-md bg-[#181822] border-white/12 text-zinc-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
              {suspendModalUser?.status === 'suspended' ? (
                <>
                  <RotateCcw className="h-5 w-5 text-emerald-400" />
                  Restore User Account
                </>
              ) : (
                <>
                  <Ban className="h-5 w-5 text-red-400" />
                  Suspend User Account
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 pt-1">
              {suspendModalUser?.status === 'suspended'
                ? `Restoring ${suspendModalUser?.email} will re-enable their access to AI generation and workspaces.`
                : `Suspending ${suspendModalUser?.email} will block all AI requests and protected routes immediately.`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Reason / Administrative Justification
            </label>
            <Input
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Terms of service violation, automated abuse..."
              className="bg-white/5 border-white/10 text-xs text-white"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSuspendModalUser(null)}
              className="border-white/10 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={actionInProgress}
              onClick={handleToggleSuspend}
              className={
                suspendModalUser?.status === 'suspended'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }
            >
              {actionInProgress ? 'Processing...' : suspendModalUser?.status === 'suspended' ? 'Restore User' : 'Suspend User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Adjustment Dialog */}
      <Dialog open={Boolean(creditModalUser)} onOpenChange={() => setCreditModalUser(null)}>
        <DialogContent className="sm:max-w-md bg-[#181822] border-white/12 text-zinc-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-400" />
              Adjust Application Credits
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 pt-1">
              Modifying credits for <span className="text-white font-mono">{creditModalUser?.email}</span>.
              Current remaining: <span className="text-emerald-400 font-mono">{creditModalUser?.creditsRemaining}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Action Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['add', 'remove', 'set'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCreditAction(type)}
                    className={`py-1.5 px-3 rounded-xl border text-xs font-semibold uppercase tracking-wider transition ${creditAction === type
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                      : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'
                      }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Amount (Credits)
              </label>
              <Input
                type="number"
                min={0}
                value={creditAmount}
                onChange={(e) => setCreditAmount(parseInt(e.target.value, 10) || 0)}
                className="bg-white/5 border-white/10 text-xs text-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Reason / Note
              </label>
              <Input
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                placeholder="e.g. Promotional grant, tier compensation..."
                className="bg-white/5 border-white/10 text-xs text-white"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreditModalUser(null)}
              className="border-white/10 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={actionInProgress}
              onClick={handleAdjustCredits}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {actionInProgress ? 'Saving...' : 'Confirm Adjustment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
