'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  FolderKanban,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Cpu,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Clock,
  Sparkles,
  Server,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface OverviewData {
  metrics: {
    totalUsers: number;
    activeUsers: number;
    totalProjects: number;
    requestsToday: number;
    requestsMonth: number;
    totalRequests: number;
    successfulGenerations: number;
    failedGenerations: number;
    successRate: string;
    openErrors: number;
  };
  providers: Array<{
    name: string;
    id: string;
    model: string;
    status: 'operational' | 'degraded' | 'unavailable' | 'configuration_error';
    configured: boolean;
  }>;
  systemHealth: {
    database: string;
    authentication: string;
    aiGateway: string;
    previewRuntime: string;
  };
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOverview() {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/overview');
        if (!res.ok) {
          throw new Error(`Failed to load overview data (${res.status})`);
        }
        const json = await res.json();
        setData(json);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error fetching admin overview');
      } finally {
        setLoading(false);
      }
    }

    void fetchOverview();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-white/5 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/5 border border-white/8" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 rounded-2xl bg-white/5 border border-white/8" />
          <div className="h-64 rounded-2xl bg-white/5 border border-white/8" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 rounded-2xl border border-red-500/20 bg-red-950/10 text-center">
        <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-white">Telemetry Error</h2>
        <p className="text-xs text-zinc-400 mt-1">{error || 'Could not load overview metrics.'}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
          className="mt-4 border-white/10 text-xs"
        >
          Retry
        </Button>
      </div>
    );
  }

  const { metrics, providers, systemHealth } = data;

  return (
    <div className="space-y-8">
      {/* Page Title & Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            Admin Overview
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
              System Operational
            </Badge>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time monitoring and administrative control center for Codatron.ai
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shadow-lg shadow-emerald-600/20">
            <Link href="/admin/users">
              <Users className="h-3.5 w-3.5" />
              Manage Users
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 text-xs gap-1.5">
            <Link href="/admin/errors">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              Open Errors ({metrics.openErrors})
            </Link>
          </Button>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-400">Total Users</CardTitle>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white font-mono">{metrics.totalUsers.toLocaleString()}</div>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
              <span className="text-emerald-400 font-medium">{metrics.activeUsers} active</span>
              <span>accounts</span>
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-400">Projects Created</CardTitle>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <FolderKanban className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white font-mono">{metrics.totalProjects.toLocaleString()}</div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Active full-stack workspaces
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-400">AI Requests (Today)</CardTitle>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Sparkles className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white font-mono">{metrics.requestsToday.toLocaleString()}</div>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span>{metrics.requestsMonth.toLocaleString()} this month</span>
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-400">AI Success Rate</CardTitle>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Zap className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white font-mono">{metrics.successRate}</div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {metrics.successfulGenerations} passed / {metrics.failedGenerations} failed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Mid Section: AI Providers Status & Live System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Providers Card */}
        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Cpu className="h-4 w-4 text-emerald-400" />
                AI Provider Health
              </CardTitle>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Primary model and automated fallback pipeline
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs text-zinc-400 hover:text-white p-0 h-auto">
              <Link href="/admin/providers" className="flex items-center gap-1">
                Details <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {providers.map((p) => {
              const isOk = p.status === 'operational';
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-white/6 bg-white/[0.02]"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-2.5 w-2.5 rounded-full ${isOk ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse' : 'bg-amber-400'}`} />
                    <div>
                      <p className="text-xs font-semibold text-white">{p.name}</p>
                      <p className="text-[10px] text-zinc-400 font-mono">{p.model}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono capitalize ${
                      isOk
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {p.status.replace('_', ' ')}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Live System Health Card */}
        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-teal-400" />
                Service Health Checks
              </CardTitle>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Core infrastructure status checks
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs text-zinc-400 hover:text-white p-0 h-auto">
              <Link href="/admin/system-health" className="flex items-center gap-1">
                Full View <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border border-white/6 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium text-zinc-200">Database</span>
              </div>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[9px] font-mono uppercase">
                {systemHealth.database}
              </Badge>
            </div>

            <div className="p-3 rounded-xl border border-white/6 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium text-zinc-200">Authentication</span>
              </div>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[9px] font-mono uppercase">
                {systemHealth.authentication}
              </Badge>
            </div>

            <div className="p-3 rounded-xl border border-white/6 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium text-zinc-200">AI Gateway</span>
              </div>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[9px] font-mono uppercase">
                {systemHealth.aiGateway}
              </Badge>
            </div>

            <div className="p-3 rounded-xl border border-white/6 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium text-zinc-200">Preview Runtime</span>
              </div>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[9px] font-mono uppercase">
                {systemHealth.previewRuntime}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Administration Hub */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/admin/users"
          className="p-5 rounded-2xl border border-white/8 bg-[#15151c]/70 hover:bg-[#1a1a24] hover:border-emerald-500/30 transition group flex flex-col justify-between"
        >
          <div className="space-y-1.5">
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
              <Users className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">User & Account Control</h3>
            <p className="text-xs text-zinc-400">
              Inspect user profiles, suspend abusive accounts, and audit activity.
            </p>
          </div>
          <div className="pt-4 flex items-center text-xs font-medium text-blue-400 group-hover:translate-x-1 transition">
            Manage Users <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </div>
        </Link>

        <Link
          href="/admin/credits"
          className="p-5 rounded-2xl border border-white/8 bg-[#15151c]/70 hover:bg-[#1a1a24] hover:border-amber-500/30 transition group flex flex-col justify-between"
        >
          <div className="space-y-1.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">Credit Allocations</h3>
            <p className="text-xs text-zinc-400">
              Add, reset, or adjust user generation credits with full audit logs.
            </p>
          </div>
          <div className="pt-4 flex items-center text-xs font-medium text-amber-400 group-hover:translate-x-1 transition">
            Adjust Credits <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </div>
        </Link>

        <Link
          href="/admin/errors"
          className="p-5 rounded-2xl border border-white/8 bg-[#15151c]/70 hover:bg-[#1a1a24] hover:border-red-500/30 transition group flex flex-col justify-between"
        >
          <div className="space-y-1.5">
            <div className="h-9 w-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">Error & Rate Limits Center</h3>
            <p className="text-xs text-zinc-400">
              Track 429 rate limits, 503 provider outages, and compilation crashes.
            </p>
          </div>
          <div className="pt-4 flex items-center text-xs font-medium text-red-400 group-hover:translate-x-1 transition">
            View Error Center <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </div>
        </Link>
      </div>
    </div>
  );
}
