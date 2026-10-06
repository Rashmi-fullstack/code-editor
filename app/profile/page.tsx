'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Mail,
  Calendar,
  Key,
  Cpu,
  Shield,
  ShieldCheck,
  Eye,
  EyeOff,
  Trash2,
  Save,
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
  Tag,
  Activity,
  Users,
  BarChart3,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { DEVELOPER_IDE_CONFIG } from '@/lib/ai/developer-ide-config';
import type { UserUsageSummary } from '@/lib/ai/usage';

interface AiConfigState {
  provider: string;
  model: string;
  keyConfigured: boolean;
  maskedKey: string | null;
  keySource: 'platform' | 'byok';
  updatedAt: string | null;
}

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
    isAdmin: contextIsAdmin,
    refreshCredits,
  } = useCredits();

  // Authoritative server-verified admin state
  const [serverIsAdmin, setServerIsAdmin] = useState<boolean | null>(null);
  const effectiveIsAdmin = serverIsAdmin !== null ? serverIsAdmin : contextIsAdmin;

  // Profile data states
  const [aiConfig, setAiConfig] = useState<AiConfigState | null>(null);
  const [usage, setUsage] = useState<UserUsageSummary | null>(null);
  const [accountData, setAccountData] = useState<ProfileAccountData>({
    createdAt: null,
    status: 'Active Account',
  });
  const [refreshKey, setRefreshKey] = useState(0);

  // Key form states
  const [inputApiKey, setInputApiKey] = useState('');
  const [showKeyText, setShowKeyText] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('google-gemini');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isDeletingKey, setIsDeletingKey] = useState(false);

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
        const [configRes, usageRes, creditsRes, adminRes] = await Promise.all([
          fetch('/api/profile/ai-config', { cache: 'no-store' }),
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

        if (configRes.ok) {
          const configJson = (await configRes.json()) as AiConfigState;
          if (!ignore) {
            setAiConfig(configJson);
            setSelectedProvider(configJson.provider || 'google-gemini');
            setSelectedModel(configJson.model || 'gemini-2.5-flash');
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
            if (serverIsAdmin === null) {
              setServerIsAdmin(Boolean(creditsJson.isAdmin || creditsJson.isUnlimited));
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

  const handleSaveApiKey = async () => {
    if (!inputApiKey.trim()) {
      toast.error('Please enter an API key.');
      return;
    }

    setIsSavingKey(true);
    try {
      const res = await fetch('/api/profile/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: inputApiKey.trim(),
          provider: selectedProvider,
          model: selectedModel,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || 'Failed to save API key');
      }

      toast.success('API key saved and encrypted successfully!');
      setInputApiKey('');
      setShowKeyText(false);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleRemoveApiKey = async () => {
    setIsDeletingKey(true);
    try {
      const res = await fetch('/api/profile/ai-config', {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message || 'Failed to remove API key');
      }

      toast.success('Personal API key removed. Reverted to Platform Key.');
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove API key');
    } finally {
      setIsDeletingKey(false);
    }
  };

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
          <span className="text-xs font-semibold text-slate-300">Profile & AI Settings</span>
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
              href="#credits"
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
                      {effectiveIsAdmin ? 'Administrator' : user?.name || 'Local Developer'}
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
                    <span>{user?.email || 'admin@codatron.ai'}</span>
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
                      className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-4 py-2 gap-1.5 shadow-lg shadow-emerald-500/20 transition"
                    >
                      <Shield className="h-3.5 w-3.5 text-black" />
                      <span>Open Admin Portal</span>
                    </Button>
                  </Link>
                )}
                <Link href="/editor?view=developer">
                  <Button
                    size="sm"
                    className="rounded-full bg-white text-black font-semibold hover:bg-slate-200 text-xs px-4 py-2 gap-1.5 shadow-sm transition"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    <span>Open IDE</span>
                  </Button>
                </Link>
                <Link href="/editor?view=product">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-white/12 bg-[#28282a] hover:bg-[#323236] text-white text-xs font-medium px-4 py-2 gap-1.5 transition"
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
        {/* SECTION 2: AI CREDITS & USAGE (ADMIN VS NORMAL USER) */}
        {/* ======================================================================= */}
        {effectiveIsAdmin ? (
          /* ===================================================================== */
          /* ADMINISTRATOR CREDIT & PROVIDER CONSUMPTION EXPERIENCE                */
          /* ===================================================================== */
          <section id="credits" className="space-y-6">
            <div className="flex items-center justify-between border-b border-white/12 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Coins className="h-4 w-4 text-amber-400" />
                  <span>Codatron AI Allowance & Provider Tracking</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Application credits are unlimited for Administrator. External AI provider consumption is tracked separately below.
                </p>
              </div>
              <Badge
                variant="outline"
                className="rounded-full border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs px-3 py-1 font-bold"
              >
                ∞ Unlimited Credits
              </Badge>
            </div>

            {/* Allowance & Providers Split Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Codatron AI Allowance */}
              <Card className="rounded-[24px] border border-amber-500/20 bg-black/40 backdrop-blur-xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between space-y-4">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent pointer-events-none" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-amber-400/90 uppercase tracking-wider">
                      Codatron AI Allowance
                    </span>
                    <Badge className="border-amber-500/30 bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0">
                      Unrestricted
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-2 pt-1">
                    <span className="text-3xl font-extrabold text-white tracking-tight">
                      ∞ Unlimited
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pt-1">
                    Application credit restriction is <strong>Disabled for Administrator</strong>. Autonomous multi-file synthesis and repair execute without quota limits.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400 flex items-center justify-between">
                  <span>Application Credit Restriction:</span>
                  <span className="text-emerald-400 font-semibold font-mono">Bypassed</span>
                </div>
              </Card>

              {/* Card 2: Google Gemini Consumption */}
              <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Google Gemini Usage
                    </span>
                    <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-[10px]">
                      External API
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-2 pt-1">
                    <span className="text-3xl font-extrabold text-white tracking-tight">
                      {formatNumber(usage?.totalTokens)}
                    </span>
                    <span className="text-xs text-slate-400">tokens used</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed pt-1">
                    Direct token throughput to Google Gemini models. Upstream API rate limits and Google Cloud quotas apply.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400 flex items-center justify-between font-mono">
                  <span>Requests: {usage?.totalRequests ?? 0}</span>
                  <span className="text-indigo-400">Tokens: {formatNumber(usage?.totalTokens)}</span>
                </div>
              </Card>

              {/* Card 3: Hugging Face Fallback / Provider */}
              <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Hugging Face Provider
                    </span>
                    <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-300 text-[10px]">
                      Inference API
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-2 pt-1">
                    <span className="text-3xl font-extrabold text-white tracking-tight">
                      Operational
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed pt-1">
                    Hugging Face inference endpoints with automatic fallback routing. Telemetry logged to Admin Diagnostics.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400 flex items-center justify-between font-mono">
                  <span>Status: Connected</span>
                  <span className="text-purple-400">Telemetry Active</span>
                </div>
              </Card>
            </div>

            {/* =================================================================== */}
            {/* ADMINISTRATOR CONTROL CENTER HUB (STEP 3 REQUIREMENT)               */}
            {/* =================================================================== */}
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between border-b border-white/12 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                    <span>Administrator Control Center</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Codatron Platform Administration — select a control module to manage the platform.
                  </p>
                </div>
                <Link href="/admin">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs gap-1.5"
                  >
                    <span>Full Portal</span>
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. ADMIN OVERVIEW */}
                <Link href="/admin" className="group">
                  <Card className="rounded-2xl border border-white/10 bg-[#121215] p-5 h-full flex flex-col justify-between hover:border-emerald-500/30 hover:bg-[#16161a] transition cursor-pointer">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                          <Activity className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">Module</span>
                      </div>
                      <h4 className="font-bold text-sm text-white group-hover:text-emerald-300 transition">
                        ADMIN OVERVIEW
                      </h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Platform status, key metrics, and operational health.
                      </p>
                    </div>
                    <span className="text-xs text-emerald-400 font-medium pt-3 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                      Launch Overview →
                    </span>
                  </Card>
                </Link>

                {/* 2. AI PROVIDERS */}
                <Link href="/admin/providers" className="group">
                  <Card className="rounded-2xl border border-white/10 bg-[#121215] p-5 h-full flex flex-col justify-between hover:border-purple-500/30 hover:bg-[#16161a] transition cursor-pointer">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                          <Cpu className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">Module</span>
                      </div>
                      <h4 className="font-bold text-sm text-white group-hover:text-purple-300 transition">
                        AI PROVIDERS
                      </h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Provider configuration, Gemini & Hugging Face health.
                      </p>
                    </div>
                    <span className="text-xs text-purple-400 font-medium pt-3 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                      Configure Providers →
                    </span>
                  </Card>
                </Link>

                {/* 3. PLANS & BILLING */}
                <Link href="/admin/plans" className="group">
                  <Card className="rounded-2xl border border-white/10 bg-[#121215] p-5 h-full flex flex-col justify-between hover:border-indigo-500/30 hover:bg-[#16161a] transition cursor-pointer">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                          <CreditCard className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">Module</span>
                      </div>
                      <h4 className="font-bold text-sm text-white group-hover:text-indigo-300 transition">
                        PLANS & BILLING
                      </h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Plans, pricing in INR, and billing configuration.
                      </p>
                    </div>
                    <span className="text-xs text-indigo-400 font-medium pt-3 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                      Manage Plans →
                    </span>
                  </Card>
                </Link>

                {/* 4. COUPONS */}
                <Link href="/admin/coupons" className="group">
                  <Card className="rounded-2xl border border-white/10 bg-[#121215] p-5 h-full flex flex-col justify-between hover:border-amber-500/30 hover:bg-[#16161a] transition cursor-pointer">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                          <Tag className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">Module</span>
                      </div>
                      <h4 className="font-bold text-sm text-white group-hover:text-amber-300 transition">
                        COUPONS
                      </h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Promotional coupon codes and discount management.
                      </p>
                    </div>
                    <span className="text-xs text-amber-400 font-medium pt-3 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                      Manage Coupons →
                    </span>
                  </Card>
                </Link>

                {/* 5. USAGE & LIMITS */}
                <Link href="/admin/ai-usage" className="group">
                  <Card className="rounded-2xl border border-white/10 bg-[#121215] p-5 h-full flex flex-col justify-between hover:border-blue-500/30 hover:bg-[#16161a] transition cursor-pointer">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                          <BarChart3 className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">Module</span>
                      </div>
                      <h4 className="font-bold text-sm text-white group-hover:text-blue-300 transition">
                        USAGE & LIMITS
                      </h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Platform-wide generation usage and provider metrics.
                      </p>
                    </div>
                    <span className="text-xs text-blue-400 font-medium pt-3 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                      View Usage →
                    </span>
                  </Card>
                </Link>

                {/* 6. USER MANAGEMENT */}
                <Link href="/admin/users" className="group">
                  <Card className="rounded-2xl border border-white/10 bg-[#121215] p-5 h-full flex flex-col justify-between hover:border-emerald-500/30 hover:bg-[#16161a] transition cursor-pointer">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                          <Users className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">Module</span>
                      </div>
                      <h4 className="font-bold text-sm text-white group-hover:text-emerald-300 transition">
                        USER MANAGEMENT
                      </h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Users, accounts, credits and activity control.
                      </p>
                    </div>
                    <span className="text-xs text-emerald-400 font-medium pt-3 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                      Manage Users →
                    </span>
                  </Card>
                </Link>

                {/* 7. ERRORS & DIAGNOSTICS */}
                <Link href="/admin/errors" className="group">
                  <Card className="rounded-2xl border border-white/10 bg-[#121215] p-5 h-full flex flex-col justify-between hover:border-red-500/30 hover:bg-[#16161a] transition cursor-pointer">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-9 w-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">Module</span>
                      </div>
                      <h4 className="font-bold text-sm text-white group-hover:text-red-300 transition">
                        ERRORS & DIAGNOSTICS
                      </h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Application, provider errors and correlation IDs.
                      </p>
                    </div>
                    <span className="text-xs text-red-400 font-medium pt-3 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                      Inspect Diagnostics →
                    </span>
                  </Card>
                </Link>

                {/* 8. SECURITY */}
                <Link href="/admin/settings" className="group">
                  <Card className="rounded-2xl border border-white/10 bg-[#121215] p-5 h-full flex flex-col justify-between hover:border-zinc-400/30 hover:bg-[#16161a] transition cursor-pointer">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">Module</span>
                      </div>
                      <h4 className="font-bold text-sm text-white group-hover:text-white transition">
                        SECURITY & SETTINGS
                      </h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Admin settings, maintenance mode, and audit logs.
                      </p>
                    </div>
                    <span className="text-xs text-zinc-300 font-medium pt-3 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                      Admin Settings →
                    </span>
                  </Card>
                </Link>
              </div>
            </div>
          </section>
        ) : (
          /* ===================================================================== */
          /* NORMAL USER CREDIT ALLOWANCE & PROGRESS BAR PRESENTATION              */
          /* ===================================================================== */
          <section id="credits" className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/12 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Coins className="h-4 w-4 text-amber-400" />
                  <span>AI Credits & Usage</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Application-level allowance for autonomous code generation, planning, and debugging.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/upgrade">
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs font-semibold rounded-full bg-indigo-600 hover:bg-indigo-500 text-white gap-1 transition"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>View Plans</span>
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
                    Codatron AI Allowance
                  </span>
                  <div className="flex items-baseline gap-2 pt-1">
                    <span className="text-3xl font-extrabold text-white tracking-tight">
                      {creditsRemaining} / {creditLimit}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {creditsRemaining} {creditsRemaining === 1 ? 'credit' : 'credits'} remaining
                    </span>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-xs text-slate-400">Total Consumed:</span>
                  <span className="ml-1.5 text-xs font-bold text-white">
                    {creditsUsed} {creditsUsed === 1 ? 'credit' : 'credits'}
                  </span>
                </div>
              </div>

              {/* Custom Visual Progress Bar */}
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
                      <strong>No AI credits remaining.</strong> You have used your Codatron AI credits. Upgrade to continue building with AI.
                    </p>
                  </div>
                  <Link href="/upgrade">
                    <Button size="sm" className="rounded-full bg-white text-black hover:bg-slate-200 text-xs font-semibold px-3 py-1 shrink-0">
                      Upgrade
                    </Button>
                  </Link>
                </div>
              )}
            </Card>

            {/* Provider Tokens Stat Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Card className="rounded-2xl border border-white/12 bg-black/40 backdrop-blur-xl p-5 space-y-1 shadow-lg">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Total Requests
                </span>
                <div className="text-2xl font-bold text-white tracking-tight">
                  {usage?.totalRequests.toLocaleString() ?? 0}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 pt-1">
                  <span>Platform: {usage?.platformRequests ?? 0}</span>
                  <span>•</span>
                  <span className="text-indigo-400">BYOK: {usage?.byokRequests ?? 0}</span>
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
                  Actual Gemini provider usage
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
        {/* SECTION 3: AI PROVIDER & BYOK */}
        {/* ======================================================================= */}
        <section id="ai-config" className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/12 pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Cpu className="h-4 w-4 text-purple-400" />
                <span>AI Provider & BYOK</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Bring Your Own Key (BYOK) for personal Gemini quotas or use the default Platform Key.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Source:</span>
              <Badge
                className={`rounded-full text-[10px] font-semibold px-3 py-0.5 border ${aiConfig?.keySource === 'byok'
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : 'bg-white/10 text-white border-white/15'
                  }`}
              >
                {aiConfig?.keySource === 'byok' ? 'Personal Key (BYOK)' : 'Codatron Platform Key'}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Active Configuration Card */}
            <div className="lg:col-span-1 space-y-4">
              <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 space-y-4 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">Current AI Stack</h3>
                  <p className="text-xs text-slate-400">
                    Active engine powering autonomous generation & planning.
                  </p>
                </div>

                <div className="space-y-3 pt-2 text-xs">
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-slate-400">Provider</span>
                    <span className="font-semibold text-slate-200">
                      {aiConfig?.provider === 'huggingface'
                        ? 'Hugging Face (Inference Providers)'
                        : 'Google Gemini'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-slate-400">Model</span>
                    <span className="font-mono text-purple-300">
                      {aiConfig?.model || DEVELOPER_IDE_CONFIG.model}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-slate-400">Key Source</span>
                    <span className="font-medium text-slate-200">
                      {aiConfig?.keySource === 'byok' ? 'Personal API Key' : 'Platform Shared Key'}
                    </span>
                  </div>

                  {aiConfig?.keyConfigured && aiConfig.maskedKey && (
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-slate-400">Stored Key</span>
                      <span className="font-mono text-slate-300 text-[11px] bg-white/[0.05] px-2.5 py-0.5 rounded-full border border-white/10">
                        {aiConfig.maskedKey}
                      </span>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Personal keys are encrypted with AES-256-GCM server-side. They are never sent to the browser or stored in localStorage. Note: BYOK changes provider credentials; application credit limits still apply.
                  </p>
                </div>
              </Card>
            </div>

            {/* Right: Key Management Form */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 space-y-5 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Key className="h-4 w-4 text-amber-400" />
                    <span>Configure Personal API Key</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Configure your personal API key or token. Your key will be validated and encrypted securely server-side.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      AI Provider
                    </label>
                    <Select
                      value={selectedProvider}
                      onValueChange={(val) => {
                        setSelectedProvider(val);
                        if (val === 'huggingface') {
                          setSelectedModel(DEVELOPER_IDE_CONFIG.model);
                        } else if (val === 'google-gemini') {
                          setSelectedModel(DEVELOPER_IDE_CONFIG.fallbackModel);
                        }
                      }}
                    >
                      <SelectTrigger className="rounded-xl bg-white/[0.05] border-white/12 text-xs text-white hover:border-white/20 focus:border-white/30">
                        <SelectValue placeholder="Select Provider" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#18181a] border-white/12 text-slate-200 text-xs rounded-xl shadow-2xl">
                        <SelectItem value="huggingface">Hugging Face (Inference Providers)</SelectItem>
                        <SelectItem value="google-gemini">Google Gemini</SelectItem>
                        <SelectItem value="openai" disabled>OpenAI (Coming Soon)</SelectItem>
                        <SelectItem value="anthropic" disabled>Anthropic (Coming Soon)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      Target Model
                    </label>
                    <Select
                      value={selectedModel}
                      onValueChange={setSelectedModel}
                    >
                      <SelectTrigger className="rounded-xl bg-white/[0.05] border-white/12 text-xs text-white hover:border-white/20 focus:border-white/30">
                        <SelectValue placeholder="Select Model" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#18181a] border-white/12 text-slate-200 text-xs rounded-xl shadow-2xl">
                        {selectedProvider === 'huggingface' ? (
                          <SelectItem value="Qwen/Qwen3-Coder-480B-A35B-Instruct">
                            Qwen3-Coder-480B-A35B-Instruct (Primary)
                          </SelectItem>
                        ) : (
                          <>
                            <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</SelectItem>
                            <SelectItem value="gemini-3.6-flash">Gemini 3.6 Flash</SelectItem>
                            <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* API Key Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-300">
                      {selectedProvider === 'huggingface' ? 'Hugging Face Token' : 'Gemini API Key'}
                    </label>
                    {selectedProvider === 'huggingface' ? (
                      <a
                        href="https://huggingface.co/settings/tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-purple-400 hover:underline flex items-center gap-1"
                      >
                        <span>Get Hugging Face Token</span>
                        <span>&rarr;</span>
                      </a>
                    ) : (
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-purple-400 hover:underline flex items-center gap-1"
                      >
                        <span>Get Gemini API Key</span>
                        <span>&rarr;</span>
                      </a>
                    )}
                  </div>

                  <div className="relative">
                    <Input
                      type={showKeyText ? 'text' : 'password'}
                      placeholder={
                        aiConfig?.keyConfigured && aiConfig.maskedKey
                          ? `Currently set: ${aiConfig.maskedKey} (Enter new key to replace)`
                          : 'Paste your AI Studio API key (AIzaSy…)'
                      }
                      value={inputApiKey}
                      onChange={(e) => setInputApiKey(e.target.value)}
                      className="rounded-xl bg-white/[0.05] border-white/12 text-xs font-mono pr-10 text-white focus:border-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeyText((prev) => !prev)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white transition cursor-pointer"
                      title={showKeyText ? 'Hide API Key' : 'Show API Key'}
                    >
                      {showKeyText ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/5">
                  <div className="flex items-center gap-2.5">
                    <Button
                      size="sm"
                      onClick={() => void handleSaveApiKey()}
                      disabled={isSavingKey || !inputApiKey.trim()}
                      className="rounded-full bg-white text-black font-semibold hover:bg-slate-200 text-xs px-5 py-2 gap-1.5 shadow-sm cursor-pointer transition"
                    >
                      {isSavingKey ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      <span>Save & Encrypt Key</span>
                    </Button>

                    {aiConfig?.keyConfigured && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRemoveApiKey()}
                        disabled={isDeletingKey}
                        className="rounded-full border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-xs text-red-400 hover:text-red-300 px-4 py-2 gap-1.5 cursor-pointer transition"
                      >
                        {isDeletingKey ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        <span>Remove Key</span>
                      </Button>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-500 font-mono">
                    AES-256-GCM Encrypted
                  </span>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* SECTION 4: WORKSPACE ACCESS */}
        {/* ======================================================================= */}
        <section id="workspaces" className="space-y-4">
          <div className="border-b border-white/12 pb-3">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-400" />
              <span>Workspace Access</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Launch into your dual-mode development environments.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 flex flex-col justify-between shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-full bg-white/10 text-white border border-white/15">
                    <Code2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Developer IDE</h3>
                    <p className="text-[11px] text-slate-400">
                      Monaco editor, live runtime preview, file manager & terminal.
                    </p>
                  </div>
                </div>
              </div>
              <div className="pt-4 mt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-mono">Route: /editor?view=developer</span>
                <Link href="/editor?view=developer">
                  <Button
                    size="sm"
                    className="rounded-full bg-white text-black font-semibold hover:bg-slate-200 text-xs px-4 py-2 gap-1.5 shadow-sm cursor-pointer transition"
                  >
                    <span>Launch Developer IDE</span>
                    <span>&rarr;</span>
                  </Button>
                </Link>
              </div>
            </Card>

            <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 flex flex-col justify-between shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-full bg-white/10 text-purple-300 border border-white/15">
                    <Compass className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Product Manager</h3>
                    <p className="text-[11px] text-slate-400">
                      High-level architectural planning, user stories & task breakdowns.
                    </p>
                  </div>
                </div>
              </div>
              <div className="pt-4 mt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-mono">Route: /editor?view=product</span>
                <Link href="/editor?view=product">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-white/12 bg-[#28282a] hover:bg-[#323236] text-white text-xs font-semibold px-4 py-2 gap-1.5 cursor-pointer transition"
                  >
                    <span>Launch Product Manager</span>
                    <span>&rarr;</span>
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* SECTION 5: DANGER ZONE (ACCOUNT DELETION) */}
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
                  Permanently delete your Codatron.ai account and all data associated with it. This action is irreversible. All your projects, files, generation history, AI usage records, provider configurations, and credentials will be removed.
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
              <span>Encrypted BYOK credentials and provider settings</span>
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
