
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Zap,
  Search,
  Plus,
  Minus,
  RotateCcw,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Shield,
  Coins,
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

interface CreditRecord {
  id: string;
  email: string;
  fullName: string | null;
  role: 'user' | 'admin';
  creditLimit: number;
  creditsUsed: number;
  creditsReserved: number;
  creditsRemaining: number;
  updatedAt: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminCreditsPage() {
  const [credits, setCredits] = useState<CreditRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal State
  const [selectedUser, setSelectedUser] = useState<CreditRecord | null>(null);
  const [action, setAction] = useState<'add' | 'remove' | 'set' | 'reset'>('add');
  const [amount, setAmount] = useState<number>(20);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchCredits = useCallback(
    async (pageToLoad = 1, searchQuery = search) => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          page: String(pageToLoad),
          limit: '25',
        });
        if (searchQuery.trim()) params.set('q', searchQuery.trim());

        const res = await fetch(`/api/admin/credits?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch credit records');
        const data = await res.json();
        setCredits(data.credits || []);
        setPagination(data.pagination);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Error loading credits');
      } finally {
        setLoading(false);
      }
    },
    [search]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchCredits(1, search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchCredits]);

  const handleAdjustCredits = async () => {
    if (!selectedUser) return;
    try {
      setSubmitting(true);
      const res = await fetch('/api/admin/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          action,
          amount,
          reason: reason || 'Administrative modification',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Credit adjustment failed');

      toast.success(data.message || 'Credits successfully adjusted');
      setSelectedUser(null);
      setReason('');
      void fetchCredits(pagination.page);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error adjusting credits');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            Credit Balances & Grant Management
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Audit user credit consumption, grant allowances, and track administrative adjustments.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user email..."
            className="pl-9 h-9 text-xs bg-white/5 border-white/10 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>
      </div>

      {/* Credits Table */}
      <div className="rounded-2xl border border-white/8 bg-[#15151c]/90 overflow-hidden shadow-xl backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="border-b border-white/8 bg-white/[0.02] text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">User</th>
                <th className="py-3.5 px-3">Role</th>
                <th className="py-3.5 px-3">Limit</th>
                <th className="py-3.5 px-3">Used</th>
                <th className="py-3.5 px-3">Reserved</th>
                <th className="py-3.5 px-3">Remaining Balance</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {loading && credits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    Loading credits...
                  </td>
                </tr>
              ) : credits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    No users found matching query.
                  </td>
                </tr>
              ) : (
                credits.map((item) => {
                  const isAdmin = item.role === 'admin';
                  return (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <span className="text-white font-medium">{item.email}</span>
                        {item.fullName && (
                          <span className="text-zinc-400 block text-[10px]">{item.fullName}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-mono capitalize ${isAdmin
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : 'border-zinc-700 bg-zinc-800/50 text-zinc-300'
                            }`}
                        >
                          {item.role}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-3 font-mono">{item.creditLimit}</td>
                      <td className="py-3.5 px-3 font-mono text-zinc-400">{item.creditsUsed}</td>
                      <td className="py-3.5 px-3 font-mono text-zinc-500">{item.creditsReserved}</td>
                      <td className="py-3.5 px-3 font-mono">
                        {isAdmin ? (
                          <span className="text-emerald-400 font-semibold">Unlimited (Admin)</span>
                        ) : (
                          <span className="text-amber-300 font-bold">{item.creditsRemaining}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(item);
                            setAmount(20);
                            setAction('add');
                          }}
                          className="h-7 text-xs border border-white/8 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg"
                        >
                          <Sliders className="h-3.5 w-3.5 mr-1" /> Adjust
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
            Total <span className="font-mono text-white">{pagination.total}</span> records
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => void fetchCredits(pagination.page - 1)}
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
              onClick={() => void fetchCredits(pagination.page + 1)}
              className="h-7 text-xs border-white/10 bg-white/5"
            >
              Next <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Credit Modal */}
      <Dialog open={Boolean(selectedUser)} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="sm:max-w-md bg-[#181822] border-white/12 text-zinc-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-400" />
              Modify Credits for User
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 pt-0.5">
              Target account: <span className="font-mono text-white">{selectedUser?.email}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div>
              <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Operation Type
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['add', 'remove', 'set', 'reset'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAction(t)}
                    className={`py-1.5 px-2 rounded-xl border text-[11px] font-semibold uppercase tracking-wider transition ${action === t
                        ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                        : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'
                      }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {action !== 'reset' && (
              <div>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                  Credit Amount
                </label>
                <Input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
                  className="bg-white/5 border-white/10 text-xs text-white"
                />
              </div>
            )}

            <div>
              <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Reason (Logged in Audit Trail)
              </label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Promotional grant, tier compensation..."
                className="bg-white/5 border-white/10 text-xs text-white"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedUser(null)}
              className="border-white/10 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={submitting}
              onClick={handleAdjustCredits}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {submitting ? 'Applying...' : 'Apply Adjustment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
