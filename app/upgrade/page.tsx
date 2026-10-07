'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Coins,
  Cpu,
  Layers,
  Sparkles,
  Zap,
  Shield,
  ShieldCheck,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useCredits } from '@/components/credit-provider';
import { GlobalUserMenu } from '@/components/layout/global-user-menu';
import { CODATRON_PLANS, CREDIT_COSTS } from '@/lib/credits/config';
import type { SubscriptionPlan } from '@/lib/types/database';
import { toast } from 'sonner';

function UpgradeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const from = searchParams.get('from');
  const { creditsRemaining, creditLimit, isAdmin, currentPlan, refreshCredits } = useCredits();
  const [plans, setPlans] = React.useState<SubscriptionPlan[]>([]);

  React.useEffect(() => {
    fetch('/api/billing/plans')
      .then((r) => r.json())
      .then((d) => {
        if (d?.plans && Array.isArray(d.plans) && d.plans.length > 0) {
          setPlans(d.plans);
        }
      })
      .catch((err) => console.warn('Failed to fetch dynamic billing plans:', err));
  }, []);

  const freePlan = plans.find((p) => p.id === 'free') || {
    id: 'free',
    name: 'Starter',
    price_inr: 0,
    credits: 100,
    badge: 'Starter' as string | null,
    features: CODATRON_PLANS.free.features,
    description: '100 Codatron AI credits initial allowance. Great for prototyping and initial builds.',
  };

  const proPlan = plans.find((p) => p.id === 'pro') || {
    id: 'pro',
    name: 'Developer Pro',
    price_inr: 499,
    credits: 500,
    badge: 'Most Popular' as string | null,
    features: CODATRON_PLANS.pro.features,
    description: '500 Codatron AI credits / month. Built for power creators shipping web applications.',
  };

  const teamPlan = plans.find((p) => p.id === 'premium' || p.id === 'business') || {
    id: 'premium',
    name: 'Team Premium',
    price_inr: 999,
    credits: 1200,
    badge: 'Best Value' as string | null,
    features: CODATRON_PLANS.business.features,
    description: '1,200 Codatron AI credits / month. High throughput for engineering teams and digital studios.',
  };

  const backUrl = projectId
    ? `/editor?projectId=${projectId}`
    : from === 'editor'
      ? '/editor'
      : '/projects';

  const backLabel = projectId ? 'Back to IDE' : from === 'editor' ? 'Back to IDE' : 'Back to Projects';

  const handleSelectPlan = (planId: string) => {
    if (planId === 'free') {
      toast.info('You are already on the Starter Free Plan.');
      return;
    }
    const query = new URLSearchParams();
    query.set('plan', planId);
    if (projectId) {
      query.set('projectId', projectId);
    }
    router.push(`/checkout?${query.toString()}`);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-black text-white selection:bg-white/20 select-none overflow-x-hidden">
      {/* Background ambient gradient atmosphere */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[850px] h-[550px] bg-gradient-to-b from-indigo-500/15 via-purple-500/10 to-transparent blur-[140px] rounded-full" />
      </div>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/12 bg-black/60 px-4 sm:px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link
            href={backUrl}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#28282a] px-3 py-1 text-xs font-medium text-white hover:bg-[#323236] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{backLabel}</span>
          </Link>

          <div className="h-4 w-px bg-white/12" />

          <Link href="/" className="flex items-center gap-2.5 font-bold text-white text-sm hover:opacity-85 transition">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm overflow-hidden p-0.5">
              <img src="/assets/logo.webp" alt="Codatron.ai" className="h-full w-full object-contain" />
            </span>
            <span className="tracking-tight">Codatron.ai</span>
          </Link>

          <span className="text-white/30">/</span>
          <span className="text-xs font-semibold text-slate-300">Plans & Upgrades</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Credit pill */}
          <div
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/12 bg-[#28282a] text-xs font-medium text-slate-300"
            title="Current Application Credits"
          >
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span>{isAdmin ? '∞ Unlimited' : `${creditsRemaining} / ${creditLimit} credits`}</span>
          </div>

          <GlobalUserMenu />
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 md:p-10 max-w-6xl mx-auto w-full space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-2xl mx-auto pt-4">
          <Badge
            variant="outline"
            className="rounded-full border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs px-3.5 py-1 font-medium gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>Transparent Autonomous AI Usage</span>
          </Badge>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Build further with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">Codatron AI</span>
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Choose the plan that suits your development velocity. Application credits power autonomous code generation, multi-file refactoring, and AI roadmaps.
          </p>
        </div>

        {/* Administrator Notice or Normal User Balance Bar */}
        {isAdmin ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  Platform Administrator Control Plane
                </p>
                <p className="text-sm text-zinc-300">
                  Your account has <strong>∞ Unlimited Codatron Application Credits</strong>. As an administrator, you manage customer upgrade tiers rather than subscribing.
                </p>
              </div>
            </div>
            <Link href="/admin/plans">
              <Button size="sm" className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-4 h-9 shadow-lg shadow-emerald-500/20">
                Open Admin Plan Management →
              </Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/12 bg-black/40 backdrop-blur-xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20 text-amber-400">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Your Balance</p>
                <p className="text-xl font-bold text-white tracking-tight">
                  {creditsRemaining} of {creditLimit} credits remaining
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href={backUrl}>
                <Button variant="outline" size="sm" className="rounded-full border-white/15 bg-white/5 hover:bg-white/10 text-xs h-8 px-4 text-slate-200">
                  Return to Workspace
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Plan 1: Starter / Free */}
          <Card className="rounded-[28px] border border-white/12 bg-black/40 backdrop-blur-xl p-7 shadow-xl flex flex-col justify-between relative overflow-hidden space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{freePlan.name}</span>
                {!isAdmin && (!currentPlan || currentPlan === 'free') && (
                  <Badge variant="outline" className="rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-mono px-2.5 py-0.5">
                    Current Plan
                  </Badge>
                )}
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white tracking-tight">₹{freePlan.price_inr}</span>
                  <span className="text-xs text-slate-400 font-medium">/ forever</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {freePlan.description || `${freePlan.credits} Codatron AI credits initial allowance. Great for prototyping and initial builds.`}
                </p>
              </div>

              <div className="h-px bg-white/10" />

              <ul className="space-y-3 text-xs text-slate-300">
                {(Array.isArray(freePlan.features) ? (freePlan.features as string[]) : CODATRON_PLANS.free.features).map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {isAdmin ? (
              <Link href="/admin/plans">
                <Button
                  variant="outline"
                  className="w-full rounded-full border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 text-xs font-semibold h-10"
                >
                  Configure in Admin Portal
                </Button>
              </Link>
            ) : (
              <Button
                disabled
                variant="outline"
                className="w-full rounded-full border-white/10 bg-white/5 text-slate-400 text-xs font-semibold h-10 cursor-not-allowed"
              >
                Included Free
              </Button>
            )}
          </Card>

          {/* Plan 2: Developer Pro (Highlighted) */}
          <Card className="rounded-[28px] border border-indigo-500/40 bg-gradient-to-b from-indigo-950/30 via-black/50 to-black/60 backdrop-blur-xl p-7 shadow-2xl flex flex-col justify-between relative overflow-hidden space-y-6 ring-1 ring-indigo-500/30">
            {/* Top specular glow */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 pointer-events-none" />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-indigo-300 uppercase tracking-wider">{proPlan.name}</span>
                <div className="flex items-center gap-2">
                  {!isAdmin && currentPlan === 'pro' && (
                    <Badge variant="outline" className="rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-mono px-2.5 py-0.5">
                      Current Plan
                    </Badge>
                  )}
                  <Badge className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-0 text-[10px] font-medium px-2.5 py-0.5 shadow-sm">
                    {proPlan.badge || 'Most Popular'}
                  </Badge>
                </div>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white tracking-tight">₹{proPlan.price_inr}</span>
                  <span className="text-xs text-slate-400 font-medium">/ month</span>
                </div>
                <p className="text-xs text-indigo-200/80 mt-2">
                  {proPlan.description || `${proPlan.credits} Codatron AI credits / month. Built for power creators shipping web applications.`}
                </p>
              </div>

              <div className="h-px bg-white/10" />

              <ul className="space-y-3 text-xs text-slate-200">
                {(Array.isArray(proPlan.features) ? (proPlan.features as string[]) : CODATRON_PLANS.pro.features).map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {isAdmin ? (
              <Link href="/admin/plans">
                <Button
                  variant="outline"
                  className="w-full rounded-full border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold h-10 transition"
                >
                  Manage in Admin Portal →
                </Button>
              </Link>
            ) : currentPlan === 'pro' ? (
              <Button
                disabled
                variant="outline"
                className="w-full rounded-full border-white/10 bg-white/5 text-slate-400 text-xs font-semibold h-10 cursor-not-allowed"
              >
                Current Active Plan
              </Button>
            ) : (
              <Button
                onClick={() => handleSelectPlan('pro')}
                className="w-full rounded-full bg-white hover:bg-slate-200 text-black text-xs font-bold h-10 shadow-lg transition active:scale-95"
              >
                Upgrade to Pro
              </Button>
            )}
          </Card>

          {/* Plan 3: Team / Business */}
          <Card className="rounded-[28px] border border-white/12 bg-black/40 backdrop-blur-xl p-7 shadow-xl flex flex-col justify-between relative overflow-hidden space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{teamPlan.name}</span>
                <div className="flex items-center gap-2">
                  {!isAdmin && (currentPlan === 'premium' || currentPlan === 'business') && (
                    <Badge variant="outline" className="rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-mono px-2.5 py-0.5">
                      Current Plan
                    </Badge>
                  )}
                  <Badge variant="outline" className="rounded-full border-purple-500/30 bg-purple-500/10 text-purple-300 text-[10px] font-mono px-2.5 py-0.5">
                    {teamPlan.badge || 'Best Value'}
                  </Badge>
                </div>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white tracking-tight">₹{teamPlan.price_inr}</span>
                  <span className="text-xs text-slate-400 font-medium">/ month</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {teamPlan.description || `${teamPlan.credits} Codatron AI credits / month. High throughput for engineering teams and digital studios.`}
                </p>
              </div>

              <div className="h-px bg-white/10" />

              <ul className="space-y-3 text-xs text-slate-300">
                {(Array.isArray(teamPlan.features) ? (teamPlan.features as string[]) : CODATRON_PLANS.business.features).map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {isAdmin ? (
              <Link href="/admin/plans">
                <Button
                  variant="outline"
                  className="w-full rounded-full border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-semibold h-10 transition"
                >
                  Manage in Admin Portal →
                </Button>
              </Link>
            ) : (currentPlan === 'premium' || currentPlan === 'business') ? (
              <Button
                disabled
                variant="outline"
                className="w-full rounded-full border-white/10 bg-white/5 text-slate-400 text-xs font-semibold h-10 cursor-not-allowed"
              >
                Current Active Plan
              </Button>
            ) : (
              <Button
                onClick={() => handleSelectPlan('premium')}
                variant="outline"
                className="w-full rounded-full border-white/20 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold h-10 transition active:scale-95"
              >
                Upgrade to Team
              </Button>
            )}
          </Card>
        </div>

        {/* Credit Breakdown & Transparency Section */}
        <div className="rounded-[28px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 sm:p-8 space-y-6 shadow-2xl">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-400" />
              <span>Usage-Based Credit Cost Breakdown</span>
            </h2>
            <p className="text-xs text-slate-400">
              Codatron charges based on generation complexity. One user prompt equals one billable operation—internal compilation, previews, and automatic self-repairs are never charged separately.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Full Project Build</span>
                <Badge className="bg-indigo-600/30 text-indigo-300 border-indigo-500/30 text-xs">
                  {CREDIT_COSTS.FULL_GENERATION} credits
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Complete application generation from scratch with multi-file architecture, package dependencies, and styling.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Major Multi-File</span>
                <Badge className="bg-purple-600/30 text-purple-300 border-purple-500/30 text-xs">
                  {CREDIT_COSTS.MAJOR_CHANGE} credits
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Large cross-file changes, route integrations, data flows, or major UI redesigns across multiple components.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Standard Change</span>
                <Badge className="bg-blue-600/30 text-blue-300 border-blue-500/30 text-xs">
                  {CREDIT_COSTS.STANDARD_CHANGE} credits
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Adding a new section, creating a component, updating state logic, or Product Manager roadmaps.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Targeted Fix / Debug</span>
                <Badge className="bg-emerald-600/30 text-emerald-300 border-emerald-500/30 text-xs">
                  {CREDIT_COSTS.SMALL_CHANGE} credits
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Fixing a runtime error, adjusting colors, tweaking a specific code snippet, or small copy edits.
              </p>
            </div>
          </div>

          {/* Zero-Cost Operations Assurance */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-300 font-semibold text-xs">
              <Shield className="h-4 w-4 text-emerald-400" />
              <span>Zero-Cost Guaranteed Operations (Always Free)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-[11px] text-emerald-200/80">
              <div className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Monaco manual code editing</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>WebContainer preview & live HMR</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Automatic internal repair loops</span>
              </div>
            </div>
          </div>
        </div>

        {/* BYOK Note */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-indigo-400 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-white">Have your own Google Gemini or Hugging Face API key?</p>
              <p className="text-[11px] text-slate-400">
                You can configure your personal API key under Profile → AI Providers to build directly using personal provider quota with zero Codatron platform fees.
              </p>
            </div>
          </div>
          <Link href="/profile#ai-config">
            <Button variant="outline" size="sm" className="rounded-full border-white/15 bg-white/5 text-xs text-white hover:bg-white/10 shrink-0 gap-1.5">
              <span>Manage BYOK</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-white flex items-center justify-center">Loading plans…</div>}>
      <UpgradeContent />
    </Suspense>
  );
}