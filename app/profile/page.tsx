'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Mail,
  Calendar,
  Shield,
  Trash2,
  ArrowLeft,
  Loader2,
  Zap,
  Layers,
  Code2,
  Compass,
  AlertTriangle,
  Coins,
  CheckCircle2,
  CreditCard,
  Activity,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { useCredits } from '@/components/credit-provider';
import { WorkspaceSwitcher } from '@/components/layout/workspace-switcher';
import { GlobalUserMenu } from '@/components/layout/global-user-menu';
import { AdminProviderConfig } from '@/components/admin/admin-provider-config';
import type { UserUsageSummary } from '@/lib/ai/usage';

interface ProfileAccountData {
  createdAt: string | null;
  status: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();
  const {
    creditsRemaining,
    creditLimit,
    creditsUsed,
    currentPlan,
    refreshCredits,
  } = useCredits();

  // Authoritative server-verified admin state
  const [serverIsAdmin, setServerIsAdmin] = useState<boolean | null>(null);
  const effectiveIsAdmin = serverIsAdmin === true;

  // Profile data states
  const [usage, setUsage] = useState<UserUsageSummary | null>(null);
  const [accountData, setAccountData] = useState<ProfileAccountData>({
    createdAt: null,
    status: 'Active Account',
  });
  const [refreshKey, setRefreshKey] = useState(0);

  // Danger Zone / Account Deletion state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    let ignore = false;

    if (!authLoading && !user) {
      router.replace('/login?next=/profile');
      return;
    }

    const fetchData = async () => {
      try {
        const [usageRes, creditsRes, adminRes] = await Promise.all([
          fetch('/api/profile/usage', { cache: 'no-store' }),
          fetch('/api/profile/credits', { cache: 'no-store' }),
          fetch('/api/admin/me', { cache: 'no-store' }).catch(() => null),
        ]);

        if (ignore) return;

        if (adminRes && adminRes.ok) {
          const adminData = await adminRes.json();
          if (!ignore) {
            setServerIsAdmin(Boolean(adminData?.isAdmin));
          }
        }

        if (usageRes.ok) {
          const usageJson = await usageRes.json();
          if (!ignore) {
            setUsage(usageJson.summary);
          }
        }

        if (creditsRes.ok) {
          const creditsJson = await creditsRes.json();
          if (!ignore) {
            if (serverIsAdmin === null && typeof creditsJson.isAdmin === 'boolean') {
              setServerIsAdmin(creditsJson.isAdmin);
            }
            setAccountData({
              createdAt: creditsJson.createdAt || null,
              status: 'Active Account',
            });
          }
        }

        await refreshCredits();
      } catch (err) {
        console.error('Failed to load profile data:', err);
        if (!ignore) {
          toast.error('Could not load AI profile configuration');
        }
      }
    };

    if (user) {
      void fetchData();
    }

    return () => {
      ignore = true;
    };
  }, [authLoading, user, router, refreshKey, refreshCredits, serverIsAdmin]);

  const handleExecuteAccountDeletion = async () => {
    if (deleteConfirmationText.trim() !== 'DELETE') {
      toast.error('Please type DELETE to confirm account deletion.');
      return;
    }

    setIsDeletingAccount(true);
    try {
      const res = await fetch('/api/profile/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || 'Failed to delete account');
      }

      toast.success('Your Codatron.ai account and all data have been deleted.');
      setIsDeleteDialogOpen(false);
      await logout();
      router.replace('/');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Account deletion failed');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const formatNumber = (num?: number) => {
    if (!num) return '0';
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const formatAccountDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Active Member';
    try {
      const d = new Date(dateStr);
      return `Member since ${d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
    } catch {
      return 'Active Member';
    }
  };

  const creditPercentage = Math.min(
    100,
    Math.max(0, Math.round((creditsRemaining / Math.max(1, creditLimit)) * 100))
  );

  const getPlanBadgeLabel = () => {
    if (effectiveIsAdmin) return 'Administrator Unlimited';
    if (currentPlan === 'pro') return 'Developer Pro';
    if (currentPlan === 'premium' || currentPlan === 'business') return 'Team Premium';
    return 'Free Tier';
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-black text-white selection:bg-white/20 select-none overflow-x-hidden">
      {/* Background ambient atmosphere */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-indigo-500/10 via-purple-500/5 to-transparent blur-[120px] rounded-full" />
      </div>

      {/* ========================================================================= */}
      {/* TOP NAVBAR */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/12 bg-black/60 px-4 sm:px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#28282a] px-3 py-1 text-xs font-medium text-white hover:bg-[#323236] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Projects</span>
          </Link>

          <div className="h-4 w-px bg-white/12" />

          <Link href="/" className="flex items-center gap-2.5 font-bold text-white text-sm hover:opacity-85 transition">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm overflow-hidden p-0.5">
              <img src="/assets/logo.webp" alt="Codatron.ai" className="h-full w-full object-contain" />
            </span>
            <span className="tracking-tight">Codatron.ai</span>
          </Link>

          <span className="text-white/30">/</span>
          <span className="text-xs font-semibold text-slate-300">
            {effectiveIsAdmin ? 'Administrator Profile' : 'AI Usage & Plan'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Header Credit Indicator */}
          {effectiveIsAdmin ? (
            <div
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-xs font-semibold text-amber-300"
              title="Administrator: Unlimited Application Credits"
            >
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>∞ Unlimited Credits</span>
            </div>
          ) : (
            <Link
              href="#usage-plan"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/12 bg-[#28282a] text-xs font-medium text-slate-300 hover:text-white hover:border-white/20 transition cursor-pointer"
              title="Remaining Application Credits"
            >
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span>{creditsRemaining} / {creditLimit} credits</span>
            </Link>
          )}

          <WorkspaceSwitcher className="hidden sm:inline-flex" />
          <div className="h-4 w-px bg-white/12 hidden sm:block" />
          <GlobalUserMenu showTriggerLabel={true} />
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN PROFILE DASHBOARD */}
      {/* ========================================================================= */}
      <main className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8">
        {/* ======================================================================= */}
        {/* SECTION 1: PROFILE INFORMATION */}
        {/* ======================================================================= */}
        <section id="profile-info" className="space-y-4">
          <div className={`relative overflow-hidden rounded-[28px] border ${effectiveIsAdmin ? 'border-emerald-500/30 shadow-emerald-950/20' : 'border-white/12'} bg-black/40 backdrop-blur-xl p-6 sm:p-8 shadow-2xl`}>
            {/* Top specular highlight line */}
            <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${effectiveIsAdmin ? 'via-emerald-500/40' : 'via-white/20'} to-transparent pointer-events-none`} />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-4 sm:gap-5">
                <Avatar className={`h-16 w-16 sm:h-20 sm:w-20 border-2 ${effectiveIsAdmin ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/20 bg-white/10'} shadow-2xl rounded-full`}>
                  <AvatarFallback className={`text-xl sm:text-2xl font-bold ${effectiveIsAdmin ? 'text-emerald-300' : 'text-white'} bg-transparent`}>
                    {effectiveIsAdmin ? 'AD' : user?.name ? user.name.slice(0, 2).toUpperCase() : 'ME'}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      {effectiveIsAdmin ? 'Administrator' : user?.name || 'Developer'}
                    </h1>
                    <Badge
                      variant="outline"
                      className="rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-mono flex items-center gap-1 px-2.5 py-0.5"
                    >
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      <span>{accountData.status}</span>
                    </Badge>
                    {effectiveIsAdmin && (
                      <Badge
                        variant="outline"
                        className="rounded-full border-indigo-500/40 bg-indigo-500/15 text-indigo-300 text-[10px] font-mono flex items-center gap-1 px-2.5 py-0.5"
                      >
                        <Shield className="h-3 w-3 text-indigo-400" />
                        <span>Control Plane</span>
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-300">
                    {effectiveIsAdmin
                      ? 'Administrator Control Center • Codatron Platform Administration'
                      : 'Developer Workspace & Account'}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                    <Mail className="h-3 w-3 text-slate-500" />
                    <span>{user?.email || 'user@codatron.ai'}</span>
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-0.5">
                    <Calendar className="h-3 w-3 text-slate-600" />
                    <span>{formatAccountDate(accountData.createdAt)}</span>
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {effectiveIsAdmin && (
                  <Link href="/admin">
                    <Button
                      size="sm"
                      className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-4 py-2 gap-1.5 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                    >
                      <Shield className="h-3.5 w-3.5 text-black" />
                      <span>Open Admin Portal</span>
                    </Button>
                  </Link>
                )}
                <Link href="/editor?view=developer">
                  <Button
                    size="sm"
                    className="rounded-full bg-white text-black font-semibold hover:bg-slate-200 text-xs px-4 py-2 gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    <span>Open IDE</span>
                  </Button>
                </Link>
                <Link href="/editor?view=product">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-white/12 bg-[#28282a] hover:bg-[#323236] text-white text-xs font-medium px-4 py-2 gap-1.5 transition cursor-pointer"
                  >
                    <Compass className="h-3.5 w-3.5 text-purple-400" />
                    <span>Product Manager</span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* SECTION 2: AI CREDITS & USAGE / AI USAGE & PLAN */}
        {/* ======================================================================= */}
        {effectiveIsAdmin ? (
          /* ===================================================================== */
          /* ADMINISTRATOR CREDIT & PROVIDER CONSUMPTION EXPERIENCE                */
          /* ===================================================================== */
          <section id="credits" className="space-y-6">
            <div className="flex items-center justify-between border-b border-white/12 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span>Platform AI Administration</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Platform administrator accounts have unlimited execution capacity and manage infrastructure routing.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/admin/providers">
                  <Button size="sm" className="h-7 px-3 text-xs font-semibold rounded-full bg-emerald-600 hover:bg-emerald-500 text-white gap-1 transition">
                    <Server className="h-3 w-3" />
                    <span>AI Providers</span>
                  </Button>
                </Link>
                <Badge
                  variant="outline"
                  className="rounded-full border-amber-500/40 bg-amber-500/15 text-amber-300 text-xs px-3 py-1 font-mono flex items-center gap-1.5"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  <span>∞ Unlimited Application Credits</span>
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Infrastructure Status
                  </span>
                  <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-[10px]">
                    Operational
                  </Badge>
                </div>
                <div className="text-xl font-bold text-white">Centralized AI Router</div>
                <p className="text-xs text-slate-400">
                  Platform routing and automated provider failover are managed in the Admin Portal.
                </p>
                <div className="pt-2">
                  <Link href="/admin/providers" className="text-xs text-emerald-400 hover:underline flex items-center gap-1 font-medium">
                    <span>Manage Providers in Admin Portal</span>
                    <span>&rarr;</span>
                  </Link>
                </div>
              </Card>

              <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Platform Telemetry
                  </span>
                  <Activity className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="text-xl font-bold text-white">System Diagnostics</div>
                <p className="text-xs text-slate-400">
                  Inspect latency, error categories, and model health metrics across all tenant operations.
                </p>
                <div className="pt-2">
                  <Link href="/admin/system-health" className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-medium">
                    <span>View System Health</span>
                    <span>&rarr;</span>
                  </Link>
                </div>
              </Card>

              <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Plan Management
                  </span>
                  <CreditCard className="h-4 w-4 text-purple-400" />
                </div>
                <div className="text-xl font-bold text-white">Pricing & Credits</div>
                <p className="text-xs text-slate-400">
                  Configure subscription tiers, credit allowances, and coupon promotions.
                </p>
                <div className="pt-2">
                  <Link href="/admin/plans" className="text-xs text-purple-400 hover:underline flex items-center gap-1 font-medium">
                    <span>Manage Plans & Quotas</span>
                    <span>&rarr;</span>
                  </Link>
                </div>
              </Card>
            </div>

            {/* ======================================================================= */}
            {/* SECTION: AI PROVIDER & BYOK (ADMINISTRATOR ONLY) */}
            {/* ======================================================================= */}
            <div id="ai-config" className="scroll-mt-20">
              <AdminProviderConfig onConfigUpdated={refreshCredits} />
            </div>
          </section>
        ) : (
          /* ===================================================================== */
          /* NORMAL USER: AI USAGE & PLAN DASHBOARD                               */
          /* ===================================================================== */
          <section id="usage-plan" className="space-y-6 scroll-mt-20">
            {/* Heading and Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/12 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  <span>Your AI Workspace</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Use Codatron AI to build, edit, and improve your projects with unified platform intelligence.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] text-xs">
                  <span className="text-slate-400">Current Plan:</span>
                  <span className="font-semibold text-white capitalize">{getPlanBadgeLabel()}</span>
                </div>

                <Link href="/upgrade">
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs font-semibold rounded-full bg-white text-black hover:bg-slate-200 transition gap-1.5 cursor-pointer"
                  >
                    <CreditCard className="h-3 w-3" />
                    <span>Upgrade Plan</span>
                  </Button>
                </Link>

                <Badge
                  variant="outline"
                  className={
                    creditsRemaining > 10
                      ? 'rounded-full border-white/15 bg-white/10 text-white text-[10px] px-3 py-0.5'
                      : creditsRemaining > 0
                        ? 'rounded-full border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] px-3 py-0.5'
                        : 'rounded-full border-red-500/30 bg-red-500/10 text-red-300 text-[10px] px-3 py-0.5'
                  }
                >
                  {creditsRemaining > 0
                    ? `${creditsRemaining} credits left`
                    : 'Credits Exhausted'}
                </Badge>
              </div>
            </div>

            {/* Credit Allowance Card */}
            <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 shadow-xl relative overflow-hidden space-y-5">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Codatron AI Credits
                  </span>
                  <div className="flex items-baseline gap-2 pt-1">
                    <span className="text-3xl font-extrabold text-white tracking-tight">
                      {creditsRemaining} / {creditLimit}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      remaining
                    </span>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-xs text-slate-400">Credits Consumed:</span>
                  <span className="ml-1.5 text-xs font-bold text-white">
                    {creditsUsed} {creditsUsed === 1 ? 'credit' : 'credits'}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="w-full bg-white/5 border border-white/10 rounded-full h-3 overflow-hidden p-0.5 shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${creditsRemaining > 25
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 shadow-sm shadow-indigo-500/50'
                      : creditsRemaining > 10
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-sm shadow-amber-500/50'
                        : 'bg-red-500/70 shadow-sm shadow-red-500/50'
                      }`}
                    style={{ width: `${creditPercentage}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                  <span>0 Credits</span>
                  <span>{creditPercentage}% Available</span>
                  <span>{creditLimit} Max Allowance</span>
                </div>
              </div>

              {creditsRemaining === 0 && (
                <div className="rounded-2xl bg-red-950/30 border border-red-500/20 p-3.5 flex items-center justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-200 leading-relaxed">
                      <strong>AI credit limit reached.</strong> Upgrade your plan to continue building with AI.
                    </p>
                  </div>
                  <Link href="/upgrade">
                    <Button size="sm" className="rounded-full bg-white text-black hover:bg-slate-200 text-xs font-semibold px-3 py-1 shrink-0">
                      Upgrade Plan
                    </Button>
                  </Link>
                </div>
              )}
            </Card>

            {/* Generation Usage Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Card className="rounded-2xl border border-white/12 bg-black/40 backdrop-blur-xl p-5 space-y-1 shadow-lg">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Total Operations
                </span>
                <div className="text-2xl font-bold text-white tracking-tight">
                  {usage?.totalRequests.toLocaleString() ?? 0}
                </div>
                <div className="text-[10px] text-slate-400 pt-1">
                  Autonomous build & edit requests
                </div>
              </Card>

              <Card className="rounded-2xl border border-white/12 bg-black/40 backdrop-blur-xl p-5 space-y-1 shadow-lg">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Total Tokens
                </span>
                <div className="text-2xl font-bold text-white tracking-tight">
                  {formatNumber(usage?.totalTokens)}
                </div>
                <div className="text-[10px] text-slate-400 pt-1">
                  Unified AI intelligence tokens
                </div>
              </Card>

              <Card className="rounded-2xl border border-white/12 bg-black/40 backdrop-blur-xl p-5 space-y-1 shadow-lg">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Input Tokens
                </span>
                <div className="text-2xl font-bold text-slate-200 tracking-tight">
                  {formatNumber(usage?.inputTokens)}
                </div>
                <div className="text-[10px] text-slate-400 pt-1">
                  Prompts & workspace context
                </div>
              </Card>

              <Card className="rounded-2xl border border-white/12 bg-black/40 backdrop-blur-xl p-5 space-y-1 shadow-lg">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Output Tokens
                </span>
                <div className="text-2xl font-bold text-emerald-400 tracking-tight">
                  {formatNumber(usage?.outputTokens)}
                </div>
                <div className="text-[10px] text-slate-400 pt-1">
                  Generated code & specifications
                </div>
              </Card>
            </div>

            {/* Operations Breakdown */}
            <div className="rounded-2xl border border-white/12 bg-black/40 backdrop-blur-xl p-6 space-y-4 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Usage by Operation</span>
                </h3>
                <span className="text-[11px] text-slate-500 font-mono">
                  {usage?.totalRequests ? `${usage.totalRequests} operations recorded` : 'No operations'}
                </span>
              </div>

              {!usage || usage.totalRequests === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <Zap className="h-6 w-6 text-slate-500" />
                  <p className="font-medium text-slate-300">No AI operations executed yet.</p>
                  <p className="text-[11px] text-slate-500 max-w-sm">
                    Run builds, product plans, or code modifications in the IDE to track real token metrics and credit consumption.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
                  {['PLAN', 'GENERATE', 'DEBUG', 'FIX', 'REFACTOR', 'ANALYZE'].map((op) => {
                    const data = usage.byOperation[op as keyof typeof usage.byOperation] || { count: 0, tokens: 0 };
                    return (
                      <div
                        key={op}
                        className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-1 hover:border-white/20 transition"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-slate-400 font-mono">
                            {op}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {data.count} reqs
                          </span>
                        </div>
                        <div className="text-sm font-bold text-white">
                          {formatNumber(data.tokens)}{' '}
                          <span className="text-[10px] font-normal text-slate-500">tokens</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ======================================================================= */}
        {/* DANGER ZONE (ACCOUNT DELETION) */}
        {/* ======================================================================= */}
        <section id="danger-zone" className="space-y-4 pt-4">
          <div className="border-b border-red-500/20 pb-3">
            <h2 className="text-base sm:text-lg font-bold text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span>Danger Zone</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Irreversible destructive actions regarding your account and stored data.
            </p>
          </div>

          <Card className="rounded-[24px] border border-red-500/20 bg-red-950/10 backdrop-blur-xl p-6 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">Delete Account</h3>
                <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                  Permanently delete your Codatron.ai account and all data associated with it. This action is irreversible. All your projects, files, generation history, AI usage records, and workspace configurations will be removed.
                </p>
              </div>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDeleteConfirmationText('');
                  setIsDeleteDialogOpen(true);
                }}
                className="rounded-full bg-red-600 hover:bg-red-500 text-white font-semibold text-xs px-4 py-2 shrink-0 cursor-pointer shadow-md shadow-red-600/30 transition"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                <span>Delete Account</span>
              </Button>
            </div>
          </Card>
        </section>
      </main>

      {/* ========================================================================= */}
      {/* DELETE ACCOUNT CONFIRMATION DIALOG */}
      {/* ========================================================================= */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="rounded-3xl border border-red-500/30 bg-[#18181a]/95 backdrop-blur-2xl shadow-2xl p-6 text-white max-w-md overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent pointer-events-none" />

          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2.5 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="text-base font-bold text-white">
                Delete Codatron.ai Account?
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-300 leading-relaxed">
              This action is <strong className="text-red-400">permanent and cannot be undone</strong>.
              The following resources will be permanently erased:
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl bg-black/50 border border-white/10 p-4 space-y-2 text-xs text-slate-300">
            <p className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              <span>User Profile and authentication account</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              <span>All Projects, code files, and folders</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              <span>AI generation history and product specifications</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              <span>AI token usage logs and credit balances</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              <span>Workspace configurations and preferences</span>
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <label className="text-xs text-slate-300">
              To confirm, type <strong className="text-red-400 font-mono">DELETE</strong> in the box below:
            </label>
            <Input
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="rounded-xl bg-white/[0.05] border-white/12 font-mono text-xs text-white focus:border-white/30"
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeletingAccount}
              className="rounded-full border-white/12 bg-[#28282a] hover:bg-[#323236] text-white text-xs px-4 py-2 cursor-pointer transition"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleExecuteAccountDeletion()}
              disabled={deleteConfirmationText.trim() !== 'DELETE' || isDeletingAccount}
              className="rounded-full bg-red-600 hover:bg-red-500 text-white font-semibold text-xs px-4 py-2 gap-1.5 cursor-pointer disabled:opacity-50 transition"
            >
              {isDeletingAccount ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Deleting Everything…</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Permanently Delete Account</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}