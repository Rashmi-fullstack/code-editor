'use client';

import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Zap,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Server,
  Layers,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ProviderTelemetry {
  id: string;
  name: string;
  model: string;
  role: string;
  status: 'Operational' | 'Degraded' | 'Unavailable' | 'Configuration Error';
  configured: boolean;
  totalRequests: number;
  successfulRequests: number;
  errorCount: number;
  successRate: string;
  averageLatencyMs: number;
  rateLimitCount: number;
  lastError: string | null;
  lastSuccessfulRequest: string | null;
}

interface ProviderResponse {
  providers: ProviderTelemetry[];
  fallbackEvents: Array<{
    id: string;
    provider: string;
    status: string;
    message: string;
    createdAt: string;
  }>;
  recentEvents: Array<{
    id: string;
    provider: string;
    event_type: string;
    status_code: number | null;
    latency_ms: number | null;
    message: string | null;
    created_at: string;
  }>;
}

export default function AdminProvidersPage() {
  const [data, setData] = useState<ProviderResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProviders() {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/providers');
        if (!res.ok) throw new Error('Failed to load providers');
        const json = await res.json();
        setData(json);
      } catch (err: unknown) {
        console.error('Error fetching providers:', err);
      } finally {
        setLoading(false);
      }
    }

    void loadProviders();
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-white/5 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 rounded-2xl bg-white/5 border border-white/8" />
          <div className="h-64 rounded-2xl bg-white/5 border border-white/8" />
        </div>
      </div>
    );
  }

  const { providers, fallbackEvents, recentEvents } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Cpu className="h-5 w-5 text-emerald-400" />
          AI Provider Monitoring & Rate Limits
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Health telemetry, latency benchmarks, external quotas, and automated fallback tracking.
        </p>
      </div>

      {/* Provider Status Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {providers.map((p) => {
          const isOperational = p.status === 'Operational';
          const isDegraded = p.status === 'Degraded';

          return (
            <Card key={p.id} className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md overflow-hidden">
              <CardHeader className="border-b border-white/8 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white">
                      <Cpu className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-white">{p.name}</CardTitle>
                      <p className="text-[11px] text-zinc-400 font-mono">{p.role}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono capitalize ${
                      isOperational
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : isDegraded
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                        : 'border-red-500/30 bg-red-500/10 text-red-400'
                    }`}
                  >
                    {p.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-4 space-y-4 text-xs">
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/6">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Success Rate</span>
                    <span className="text-base font-bold font-mono text-emerald-400">{p.successRate}</span>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">{p.successfulRequests} / {p.totalRequests} reqs</span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/6">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Average Latency</span>
                    <span className="text-base font-bold font-mono text-white">
                      {p.averageLatencyMs ? `${p.averageLatencyMs}ms` : '—'}
                    </span>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">Roundtrip</span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/6">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">429 Rate Limits</span>
                    <span className={`text-base font-bold font-mono ${p.rateLimitCount > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                      {p.rateLimitCount}
                    </span>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">Last 24 hours</span>
                  </div>
                </div>

                {/* Model & Config Information */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/6 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Deployed Model</span>
                    <span className="font-mono text-white text-[11px]">{p.model}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Server Authentication Key</span>
                    <Badge variant="outline" className={`text-[9px] font-mono ${p.configured ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'}`}>
                      {p.configured ? 'Configured (Server)' : 'Missing from Environment'}
                    </Badge>
                  </div>
                  {p.lastSuccessfulRequest && (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Last Success</span>
                      <span className="font-mono text-zinc-300 text-[11px]">
                        {new Date(p.lastSuccessfulRequest).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                  {p.lastError && (
                    <div className="pt-1 border-t border-white/6">
                      <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider block mb-0.5">
                        Latest Error
                      </span>
                      <p className="text-[11px] text-red-300 font-mono truncate">{p.lastError}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Fallback Events & Rate-Limiting Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Automated Fallback Feed */}
        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-purple-400" />
              Automated Fallback Events
            </CardTitle>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Live log of automatic failovers from Hugging Face to Gemini
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {fallbackEvents.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                No fallback events triggered. Primary provider operating stably.
              </p>
            ) : (
              fallbackEvents.map((f) => (
                <div key={f.id} className="p-3 rounded-xl border border-purple-500/20 bg-purple-950/10 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-300 font-mono text-[9px]">
                      FALLBACK TRIGGERED
                    </Badge>
                    <span className="text-[10px] font-mono text-zinc-400">
                      {new Date(f.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-zinc-200 text-[11px] mt-1">{f.message}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Telemetry Events */}
        <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-400" />
              Recent Health Events
            </CardTitle>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Status codes and telemetry heartbeats
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentEvents.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">No recent health events recorded.</p>
            ) : (
              recentEvents.slice(0, 5).map((e) => (
                <div key={e.id} className="flex items-center justify-between p-2.5 rounded-xl border border-white/6 bg-white/[0.02] text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-white capitalize mr-2">{e.provider}</span>
                    <span className="text-zinc-400 font-mono text-[10px]">{e.event_type}</span>
                    {e.message && (
                      <p className="text-[10px] text-zinc-400 truncate max-w-[280px] mt-0.5">{e.message}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    {e.status_code && (
                      <Badge variant="outline" className="font-mono text-[9px] border-white/10 text-zinc-300">
                        {e.status_code}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
