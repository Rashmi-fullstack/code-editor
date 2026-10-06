'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Lock,
  Cpu,
  Layers,
  RefreshCw,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface HealthResponse {
  overallStatus: 'healthy' | 'degraded' | 'unavailable';
  timestamp: string;
  services: Record<
    string,
    {
      status: 'healthy' | 'degraded' | 'unavailable';
      latencyMs?: number;
      message?: string;
    }
  >;
}

export default function AdminSystemHealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadHealth() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/system-health');
      if (!res.ok) throw new Error('Health check request failed');
      const json = await res.json();
      setHealth(json);
    } catch (err: unknown) {
      console.error('Error fetching system health:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHealth();
  }, []);

  if (loading && !health) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-white/5 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-white/5 border border-white/8" />
          ))}
        </div>
      </div>
    );
  }

  const services = health?.services || {};

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-400" />
            Infrastructure & Runtime Health Checks
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time latency diagnostics, connectivity verification, and WebContainer isolation checks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {health?.timestamp && (
            <span className="text-[11px] font-mono text-zinc-400 hidden sm:inline">
              Checked: {new Date(health.timestamp).toLocaleTimeString()}
            </span>
          )}
          <Button
            size="sm"
            onClick={loadHealth}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Run Diagnostics
          </Button>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(services).map(([key, svc]) => {
          const isHealthy = svc.status === 'healthy';
          const isDegraded = svc.status === 'degraded';

          const title =
            key === 'database'
              ? 'PostgreSQL Database'
              : key === 'authentication'
              ? 'Supabase GoTrue Auth'
              : key === 'aiGateway'
              ? 'AI Routing Gateway'
              : key === 'previewRuntime'
              ? 'WebContainer Runtime'
              : key === 'telemetry'
              ? 'Telemetry & Deduplication'
              : key;

          const Icon =
            key === 'database'
              ? Database
              : key === 'authentication'
              ? Lock
              : key === 'aiGateway'
              ? Cpu
              : Layers;

          return (
            <Card key={key} className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-white/5 border border-white/8 text-zinc-200">
                    <Icon className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-semibold text-white">{title}</CardTitle>
                    <span className="text-[10px] text-zinc-400 font-mono capitalize">{key}</span>
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={`text-[9px] font-mono uppercase ${
                    isHealthy
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : isDegraded
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                      : 'border-red-500/30 bg-red-500/10 text-red-400'
                  }`}
                >
                  {svc.status}
                </Badge>
              </CardHeader>
              <CardContent className="pt-2 space-y-2 text-xs">
                <p className="text-zinc-300 text-[11px] leading-relaxed">{svc.message}</p>
                {typeof svc.latencyMs === 'number' && (
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400 pt-1">
                    <Clock className="h-3 w-3 text-zinc-400" />
                    <span>Ping Latency:</span>
                    <span className="text-white font-bold">{svc.latencyMs}ms</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
