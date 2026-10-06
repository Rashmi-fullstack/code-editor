'use client';

import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Sparkles,
  Zap,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Cpu,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface UsageData {
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    errorRate: string;
    avgLatencyMs: number;
    totalTokens: number;
    fallbackCount: number;
    requestsToday: number;
    requestsThisWeek: number;
    requestsThisMonth: number;
  };
  providers: Array<{
    provider: string;
    total: number;
    success: number;
    failed: number;
    successRate: string;
  }>;
  models: Array<{
    model: string;
    count: number;
  }>;
  recentActivity: Array<{
    id: string;
    provider: string;
    model: string;
    success: boolean;
    latencyMs: number | null;
    totalTokens: number;
    createdAt: string;
  }>;
}

export default function AdminAiUsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUsage() {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/ai-usage');
        if (!res.ok) throw new Error('Failed to load usage data');
        const json = await res.json();
        setData(json);
      } catch (err: unknown) {
        console.error('Error fetching AI usage:', err);
      } finally {
        setLoading(false);
      }
    }

    void loadUsage();
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-white/5 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/5 border border-white/8" />
          ))}
        </div>
      </div>
    );
  }

  const { summary, providers, models, recentActivity } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-emerald-400" />
          AI Generation Telemetry & Analytics
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Request volumes, model distribution, latency benchmarks, and automatic fallback tracking.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-400">Total Generation Requests</CardTitle>
            <Sparkles className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white font-mono">{summary.totalRequests.toLocaleString()}</div>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span>{summary.requestsToday} today • {summary.requestsThisWeek} this week</span>
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-400">Average Latency</CardTitle>
            <Clock className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white font-mono">
              {(summary.avgLatencyMs / 1000).toFixed(2)}s
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {summary.avgLatencyMs}ms roundtrip response
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-400">Error Rate</CardTitle>
            <Zap className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white font-mono">{summary.errorRate}</div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {summary.successfulRequests} successes / {summary.failedRequests} errors
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-400">Provider Fallbacks</CardTitle>
            <RotateCcw className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white font-mono">{summary.fallbackCount}</div>
            <p className="text-[11px] text-zinc-400 mt-1">
              HF unavailable → Gemini fallback events
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Provider & Model Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Providers Breakdown */}
        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Cpu className="h-4 w-4 text-emerald-400" />
              Volume by Provider
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {providers.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">No provider traffic recorded yet.</p>
            ) : (
              providers.map((p) => (
                <div
                  key={p.provider}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-white/6 bg-white/[0.02]"
                >
                  <div>
                    <span className="text-xs font-semibold text-white capitalize">{p.provider}</span>
                    <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                      {p.total} requests ({p.success} passed, {p.failed} failed)
                    </p>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
                    {p.successRate} success
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Models Breakdown */}
        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-teal-400" />
              Volume by Model
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {models.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">No model usage recorded yet.</p>
            ) : (
              models.map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-white/6 bg-white/[0.02]"
                >
                  <span className="text-xs font-mono text-zinc-200 truncate max-w-[280px]">
                    {m.model}
                  </span>
                  <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-300 font-mono text-[10px]">
                    {m.count} calls
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Generations Feed */}
      <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md overflow-hidden">
        <CardHeader className="border-b border-white/8 pb-3">
          <CardTitle className="text-sm font-semibold text-white">Recent AI Telemetry Feed</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="border-b border-white/8 bg-white/[0.02] text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Provider / Model</th>
                  <th className="py-3 px-3">Result</th>
                  <th className="py-3 px-3">Latency</th>
                  <th className="py-3 px-3">Tokens</th>
                  <th className="py-3 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {recentActivity.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500 text-xs">
                      No generation events logged yet.
                    </td>
                  </tr>
                ) : (
                  recentActivity.map((r) => (
                    <tr key={r.id} className="hover:bg-white/[0.01]">
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <span className="text-white font-medium capitalize">{r.provider}</span>
                        <span className="text-zinc-500 block text-[10px] truncate max-w-[240px]">
                          {r.model}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {r.success ? (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[9px] font-mono">
                            SUCCESS
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-400 text-[9px] font-mono">
                            ERROR
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-zinc-400">
                        {r.latencyMs ? `${r.latencyMs}ms` : '—'}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-zinc-300">
                        {r.totalTokens ? r.totalTokens.toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[11px] text-zinc-400">
                        {new Date(r.createdAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
