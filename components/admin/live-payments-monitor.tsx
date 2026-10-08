'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Zap,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Copy,
  Check,
  TrendingUp,
  Tag,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  WalletCards,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export interface PaymentItem {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    currentPlan: string;
  };
  plan: {
    id: string;
    name: string;
    price: number;
    interval: string;
  };
  amount: number;
  amountPaise: number;
  originalAmount: number;
  discountAmount: number;
  currency: string;
  couponCode: string | null;
  status: 'created' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  paymentMethod: string;
  createdAt: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  subscription: {
    id: string;
    status: 'active' | 'expiring_soon' | 'expired' | 'cancelled' | 'none';
    rawStatus: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    daysRemaining: number | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}

interface Metrics {
  activeSubscriptions: number;
  paymentsToday: number;
  activeProUsers: number;
  activeTeamUsers: number;
  expiringSoon: number;
  failedPayments: number;
}

interface ApiResponse {
  metrics: Metrics;
  payments: PaymentItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function LivePaymentsMonitor() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Modal inspection
  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Track latest payment IDs for live toast notification
  const knownPaymentIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const fetchPayments = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setRefreshing(true);
    }
    try {
      const query = new URLSearchParams();
      query.set('page', page.toString());
      query.set('limit', '10');
      if (search.trim()) query.set('search', search.trim());
      if (planFilter !== 'all') query.set('plan', planFilter);
      if (paymentStatusFilter !== 'all') query.set('paymentStatus', paymentStatusFilter);
      if (subscriptionStatusFilter !== 'all') query.set('subscriptionStatus', subscriptionStatusFilter);

      const res = await fetch(`/api/admin/payments/live?${query.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch live payments (${res.status})`);
      }
      const json: ApiResponse = await res.json();

      // Check for incoming new payments to trigger non-intrusive toast
      if (!isFirstLoadRef.current && json.payments?.length > 0) {
        const newPaidItems = json.payments.filter(
          (p) => p.status === 'paid' && !knownPaymentIdsRef.current.has(p.id)
        );
        for (const item of newPaidItems) {
          toast.success(
            `New Payment Verified: ${item.user.name} upgraded to ${item.plan.name} (₹${item.amount})`
          );
        }
      }

      // Update known payment IDs
      if (json.payments) {
        const idSet = new Set<string>();
        for (const p of json.payments) {
          idSet.add(p.id);
        }
        knownPaymentIdsRef.current = idSet;
      }
      isFirstLoadRef.current = false;

      setData(json);
      setError(null);
    } catch (err: unknown) {
      console.error('[Live Payments Fetch Error]:', err);
      if (!isBackground) {
        setError(err instanceof Error ? err.message : 'Unable to load payment activity.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search, planFilter, paymentStatusFilter, subscriptionStatusFilter]);

  // Initial fetch and dependency trigger
  useEffect(() => {
    fetchPayments(false);
  }, [fetchPayments]);

  // Real-time polling interval: every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      fetchPayments(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchPayments]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const renderPaymentBadge = (status: PaymentItem['status']) => {
    switch (status) {
      case 'paid':
        return (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 gap-1.5 py-0.5 px-2 text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Paid
          </Badge>
        );
      case 'pending':
      case 'created':
        return (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300 gap-1.5 py-0.5 px-2 text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {status === 'created' ? 'Created' : 'Pending'}
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-300 gap-1.5 py-0.5 px-2 text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            Failed
          </Badge>
        );
      case 'refunded':
        return (
          <Badge variant="outline" className="border-slate-500/30 bg-slate-500/10 text-slate-300 gap-1.5 py-0.5 px-2 text-[11px] font-medium">
            Refunded
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="outline" className="border-zinc-500/30 bg-zinc-500/10 text-zinc-400 gap-1.5 py-0.5 px-2 text-[11px] font-medium">
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline" className="text-zinc-400 text-[11px]">{status}</Badge>;
    }
  };

  const renderSubscriptionBadge = (sub: PaymentItem['subscription']) => {
    if (!sub) {
      return <span className="text-zinc-500 text-xs">—</span>;
    }

    switch (sub.status) {
      case 'active':
        return (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 py-0.5 px-2 text-[11px]">
            Active
          </Badge>
        );
      case 'expiring_soon':
        return (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300 py-0.5 px-2 text-[11px] gap-1">
            <AlertTriangle className="h-3 w-3" />
            Expiring Soon
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400 py-0.5 px-2 text-[11px]">
            Expired
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="outline" className="border-zinc-500/30 bg-zinc-500/10 text-zinc-400 py-0.5 px-2 text-[11px]">
            Cancelled
          </Badge>
        );
      default:
        return <span className="text-zinc-400 text-xs">—</span>;
    }
  };

  const renderRemainingDays = (sub: PaymentItem['subscription']) => {
    if (!sub || sub.daysRemaining === null) return <span className="text-zinc-500 text-xs">—</span>;
    if (sub.status === 'expired') {
      return <span className="text-rose-400 text-xs font-semibold">Expired</span>;
    }
    if (sub.status === 'expiring_soon') {
      return (
        <span className="text-amber-400 text-xs font-medium flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 inline" />
          {sub.daysRemaining} days left
        </span>
      );
    }
    return <span className="text-zinc-300 text-xs font-medium">{sub.daysRemaining} days</span>;
  };

  const renderPlanBadge = (plan: PaymentItem['plan']) => {
    if (plan.id === 'pro') {
      return (
        <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-[11px] font-medium">
          {plan.name}
        </Badge>
      );
    }
    if (plan.id === 'premium' || plan.id === 'business' || plan.id === 'team') {
      return (
        <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-300 text-[11px] font-medium">
          {plan.name}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-zinc-500/30 bg-zinc-500/10 text-zinc-400 text-[11px] font-medium">
        {plan.name}
      </Badge>
    );
  };

  const metrics = data?.metrics || {
    activeSubscriptions: 0,
    paymentsToday: 0,
    activeProUsers: 0,
    activeTeamUsers: 0,
    expiringSoon: 0,
    failedPayments: 0,
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <WalletCards className="h-6 w-6 text-emerald-400" />
              <span>Payments & Subscriptions</span>
            </h1>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-[10px] gap-1 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Telemetry
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Monitor payments, active plans, subscriptions, and expiration.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPayments(false)}
            disabled={refreshing}
            className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white gap-1.5 text-xs h-9 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-emerald-400' : 'text-zinc-400'}`} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* 6 Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md p-3.5 space-y-1">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Active Subscriptions</p>
          <p className="text-xl font-extrabold text-white font-mono">{loading ? '…' : metrics.activeSubscriptions}</p>
          <p className="text-[10px] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Real-time active
          </p>
        </Card>

        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md p-3.5 space-y-1">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Payments Today</p>
          <p className="text-xl font-extrabold text-emerald-400 font-mono">
            {loading ? '…' : `₹${metrics.paymentsToday.toLocaleString('en-IN')}`}
          </p>
          <p className="text-[10px] text-zinc-400 flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-emerald-400" /> Settled revenue
          </p>
        </Card>

        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md p-3.5 space-y-1">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Active Pro Users</p>
          <p className="text-xl font-extrabold text-indigo-300 font-mono">{loading ? '…' : metrics.activeProUsers}</p>
          <p className="text-[10px] text-indigo-400/80">Developer Pro tier</p>
        </Card>

        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md p-3.5 space-y-1">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Active Team Users</p>
          <p className="text-xl font-extrabold text-purple-300 font-mono">{loading ? '…' : metrics.activeTeamUsers}</p>
          <p className="text-[10px] text-purple-400/80">Team Premium tier</p>
        </Card>

        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md p-3.5 space-y-1">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Expiring Soon</p>
          <p className="text-xl font-extrabold text-amber-400 font-mono">{loading ? '…' : metrics.expiringSoon}</p>
          <p className="text-[10px] text-amber-400/80">≤ 7 days left</p>
        </Card>

        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md p-3.5 space-y-1">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Failed Payments</p>
          <p className="text-xl font-extrabold text-rose-400 font-mono">{loading ? '…' : metrics.failedPayments}</p>
          <p className="text-[10px] text-rose-400/80">Requires audit</p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-2xl border border-white/8 bg-[#15151c]/60">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by user, email, Razorpay order/payment ID, or coupon..."
            className="pl-9 bg-black/40 border-white/8 text-xs h-9 rounded-xl placeholder:text-zinc-500 text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Plan Filter */}
          <select
            value={planFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value);
              setPage(1);
            }}
            className="bg-black/40 border border-white/8 text-zinc-300 text-xs rounded-xl px-3 h-9 focus:outline-none focus:border-indigo-500/50"
          >
            <option value="all">All Plans</option>
            <option value="pro">Developer Pro</option>
            <option value="premium">Team Premium</option>
            <option value="free">Starter Free</option>
          </select>

          {/* Payment Status Filter */}
          <select
            value={paymentStatusFilter}
            onChange={(e) => {
              setPaymentStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-black/40 border border-white/8 text-zinc-300 text-xs rounded-xl px-3 h-9 focus:outline-none focus:border-indigo-500/50"
          >
            <option value="all">All Payment States</option>
            <option value="paid">Paid</option>
            <option value="created">Created</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>

          {/* Subscription Status Filter */}
          <select
            value={subscriptionStatusFilter}
            onChange={(e) => {
              setSubscriptionStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-black/40 border border-white/8 text-zinc-300 text-xs rounded-xl px-3 h-9 focus:outline-none focus:border-indigo-500/50"
          >
            <option value="all">All Subscription States</option>
            <option value="active">Active</option>
            <option value="expiring_soon">Expiring Soon (≤ 7d)</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Main Table Card */}
      <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md overflow-hidden">
        {error ? (
          <div className="p-8 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto" />
            <h3 className="text-sm font-semibold text-white">Unable to load payment activity</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchPayments(false)}
              className="text-xs border-white/10 rounded-xl"
            >
              Retry Connection
            </Button>
          </div>
        ) : loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-400 mx-auto" />
            <p className="text-xs text-zinc-400">Loading live payments & subscription records…</p>
          </div>
        ) : !data || data.payments.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <CreditCard className="h-8 w-8 text-zinc-500 mx-auto" />
            <h3 className="text-sm font-semibold text-white">No payment transactions found</h3>
            <p className="text-xs text-zinc-400">
              {search || planFilter !== 'all' || paymentStatusFilter !== 'all' || subscriptionStatusFilter !== 'all'
                ? 'Try adjusting your search query or filters.'
                : 'Transactions will appear here as users complete checkout.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/8 bg-black/40 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Started</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4">Remaining</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6 text-zinc-200">
                {data.payments.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition">
                    {/* User */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center font-bold text-white text-[10px] shrink-0">
                          {item.user.avatarUrl ? (
                            <img src={item.user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                          ) : (
                            item.user.name.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/users?q=${encodeURIComponent(item.user.email)}`}
                            className="font-medium text-white hover:text-indigo-400 transition truncate block"
                            title={item.user.name}
                          >
                            {item.user.name}
                          </Link>
                          <p className="text-[10px] text-zinc-400 truncate max-w-[150px]">{item.user.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Plan */}
                    <td className="py-3 px-4">{renderPlanBadge(item.plan)}</td>

                    {/* Amount */}
                    <td className="py-3 px-4">
                      <div>
                        <span className="font-mono font-bold text-white">₹{item.amount.toLocaleString('en-IN')}</span>
                        {item.couponCode && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Tag className="h-2.5 w-2.5 text-amber-400" />
                            <span className="text-[10px] font-mono text-amber-400" title={`Coupon: ${item.couponCode}`}>
                              {item.couponCode}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Payment Status */}
                    <td className="py-3 px-4">{renderPaymentBadge(item.status)}</td>

                    {/* Payment Method */}
                    <td className="py-3 px-4">
                      <span className="font-mono text-zinc-300 text-xs">{item.paymentMethod}</span>
                    </td>

                    {/* Started */}
                    <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                      {item.subscription?.currentPeriodStart
                        ? formatDate(item.subscription.currentPeriodStart)
                        : formatDate(item.createdAt)}
                    </td>

                    {/* Expires */}
                    <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                      {item.subscription?.currentPeriodEnd ? formatDate(item.subscription.currentPeriodEnd) : '—'}
                    </td>

                    {/* Remaining */}
                    <td className="py-3 px-4">{renderRemainingDays(item.subscription)}</td>

                    {/* Subscription Status */}
                    <td className="py-3 px-4">{renderSubscriptionBadge(item.subscription)}</td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedPayment(item)}
                        className="h-7 px-2.5 rounded-lg text-xs hover:bg-white/10 hover:text-white text-zinc-300 gap-1"
                      >
                        <Eye className="h-3.5 w-3.5 text-indigo-400" />
                        <span>View</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/8 px-4 py-3 bg-black/20 text-xs text-zinc-400">
            <span>
              Showing {data.payments.length} of {data.pagination.total} records (Page {data.pagination.page} of{' '}
              {data.pagination.totalPages})
            </span>

            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 px-2 border-white/10 text-xs rounded-lg"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2 font-mono text-white text-xs">{page}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 px-2 border-white/10 text-xs rounded-lg"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Payment Details Modal */}
      <Dialog open={Boolean(selectedPayment)} onOpenChange={(open) => !open && setSelectedPayment(null)}>
        <DialogContent className="sm:max-w-xl bg-[#13131a] border border-white/12 text-white p-6 rounded-2xl shadow-2xl backdrop-blur-2xl">
          <DialogHeader className="space-y-1 pb-3 border-b border-white/10">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-indigo-400" />
                Payment & Subscription Details
              </DialogTitle>
              {selectedPayment && renderPaymentBadge(selectedPayment.status)}
            </div>
            <DialogDescription className="text-xs text-zinc-400">
              Verified cryptographic transaction ledger from database & Razorpay gateway.
            </DialogDescription>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-5 text-xs pt-2">
              {/* Customer & Plan Overview */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border border-white/8 bg-black/40">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-zinc-400">Customer</p>
                  <p className="text-sm font-bold text-white mt-0.5">{selectedPayment.user.name}</p>
                  <p className="text-[11px] text-zinc-400">{selectedPayment.user.email}</p>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">ID: {selectedPayment.user.id}</p>
                </div>

                <div>
                  <p className="text-[10px] uppercase font-semibold text-zinc-400">Selected Plan</p>
                  <div className="mt-1">{renderPlanBadge(selectedPayment.plan)}</div>
                  <p className="text-[11px] text-zinc-300 mt-1">
                    Base: ₹{selectedPayment.plan.price} / {selectedPayment.plan.interval}
                  </p>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="space-y-2 p-3.5 rounded-xl border border-white/8 bg-black/40">
                <p className="text-[10px] uppercase font-semibold text-zinc-400">Payment Breakdown</p>
                <div className="grid grid-cols-3 gap-2 pt-1 font-mono">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Original Price</span>
                    <span className="text-white font-bold">₹{selectedPayment.originalAmount}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Discount</span>
                    <span className="text-emerald-400 font-bold">-₹{selectedPayment.discountAmount}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Final Paid Amount</span>
                    <span className="text-indigo-400 font-extrabold text-sm">
                      ₹{selectedPayment.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/6 text-[11px]">
                  <span className="text-zinc-400">Payment Method:</span>
                  <span className="font-semibold text-white font-mono">{selectedPayment.paymentMethod}</span>
                </div>

                {selectedPayment.couponCode && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Applied Promo Coupon:</span>
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300 font-mono text-[10px]">
                      {selectedPayment.couponCode}
                    </Badge>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Payment Timestamp:</span>
                  <span className="text-zinc-300">{formatDateTime(selectedPayment.createdAt)}</span>
                </div>
              </div>

              {/* Subscription Validity */}
              <div className="space-y-2 p-3.5 rounded-xl border border-white/8 bg-black/40">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase font-semibold text-zinc-400">Subscription Status</p>
                  {renderSubscriptionBadge(selectedPayment.subscription)}
                </div>

                {selectedPayment.subscription ? (
                  <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                    <div>
                      <span className="text-[10px] text-zinc-400 block">Billing Period Start</span>
                      <span className="text-zinc-200 font-mono">
                        {formatDate(selectedPayment.subscription.currentPeriodStart)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 block">Billing Expiry Date</span>
                      <span className="text-zinc-200 font-mono">
                        {formatDate(selectedPayment.subscription.currentPeriodEnd)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 block">Remaining Time</span>
                      <span>{renderRemainingDays(selectedPayment.subscription)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-500 text-[11px] pt-1">No active subscription record associated.</p>
                )}
              </div>

              {/* Gateway References */}
              <div className="space-y-2 p-3.5 rounded-xl border border-white/8 bg-black/40">
                <p className="text-[10px] uppercase font-semibold text-zinc-400">Razorpay Gateway References</p>

                <div className="flex items-center justify-between gap-2 bg-white/[0.02] p-2 rounded-lg border border-white/6">
                  <span className="text-[11px] text-zinc-400">Razorpay Order ID:</span>
                  <div className="flex items-center gap-1.5 font-mono text-zinc-200 text-xs">
                    <span>{selectedPayment.razorpayOrderId}</span>
                    <button
                      onClick={() => copyToClipboard(selectedPayment.razorpayOrderId, 'orderId')}
                      className="text-zinc-400 hover:text-white p-1 rounded"
                    >
                      {copiedKey === 'orderId' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 bg-white/[0.02] p-2 rounded-lg border border-white/6">
                  <span className="text-[11px] text-zinc-400">Razorpay Payment ID:</span>
                  <div className="flex items-center gap-1.5 font-mono text-zinc-200 text-xs">
                    <span>{selectedPayment.razorpayPaymentId || '— (Pending)'}</span>
                    {selectedPayment.razorpayPaymentId && (
                      <button
                        onClick={() => copyToClipboard(selectedPayment.razorpayPaymentId!, 'paymentId')}
                        className="text-zinc-400 hover:text-white p-1 rounded"
                      >
                        {copiedKey === 'paymentId' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
