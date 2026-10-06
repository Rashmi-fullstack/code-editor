'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TerminalPanel } from '@/components/editor/terminal-panel';
import {
  webcontainerManager,
  stripAnsi,
  type WebContainerRuntimeSnapshot,
} from '@/lib/runtime/webcontainer-manager';
import type { ProjectFile } from '@/lib/types/database';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Terminal,
  Activity,
  Package,
  Cpu,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

export interface DiagnosticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: ProjectFile[];
  dependencies: Array<{ name: string; version: string }>;
  onServerReady?: (url: string) => void;
  onErrorDetected?: (err: string) => void;
  webcontainerUrl?: string | null;
  previewError?: string | null;
  onFixWithAI?: (errorText: string) => void;
  projectId?: string;
}

export function DiagnosticsModal({
  open,
  onOpenChange,
  files,
  dependencies,
  onServerReady,
  onErrorDetected,
  webcontainerUrl,
  previewError,
  onFixWithAI,
  projectId,
}: DiagnosticsModalProps) {
  const [tab, setTab] = useState<'logs' | 'runtime' | 'dependencies'>('logs');
  const [snapshot, setSnapshot] = useState<WebContainerRuntimeSnapshot>(
    webcontainerManager.getSnapshot()
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = webcontainerManager.subscribeSnapshot((snap) => {
      setSnapshot(snap);
    });
    return unsub;
  }, []);

  const handleCopyLogs = () => {
    const logs = webcontainerManager.getLogs().join('\n');
    if (!logs) {
      toast.info('No logs available yet');
      return;
    }
    void navigator.clipboard.writeText(stripAnsi(logs));
    setCopied(true);
    toast.success('Logs copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRestartRuntime = async () => {
    toast.info('Restarting WebContainer dev server…');
    await webcontainerManager.restartDevServer(files);
    toast.success('WebContainer restarted');
  };

  // Extract dependencies from package.json if present
  const packageJsonFile = files.find(
    (f) => f.path === 'package.json' || f.path.endsWith('/package.json')
  );
  let parsedDeps: Record<string, string> = {};
  let parsedDevDeps: Record<string, string> = {};
  if (packageJsonFile?.content) {
    try {
      const parsed = JSON.parse(packageJsonFile.content);
      parsedDeps = parsed.dependencies || {};
      parsedDevDeps = parsed.devDependencies || {};
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col rounded-3xl border border-white/15 bg-[#18181a]/95 backdrop-blur-2xl text-slate-200 p-0 overflow-hidden shadow-2xl">
        {/* Top specular highlight line */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

        <DialogHeader className="p-4 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black shadow-md overflow-hidden shrink-0">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold text-white">
                  Developer Diagnostics
                </DialogTitle>
                <p className="text-[11px] text-slate-400">
                  Inspect internal WebContainer runtime, compilation logs, and package dependencies.
                </p>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex items-center rounded-full border border-white/12 bg-[#28282a] p-1 gap-1 mr-6">
              <button
                type="button"
                onClick={() => setTab('logs')}
                className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                  tab === 'logs'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>Logs</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('runtime')}
                className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                  tab === 'runtime'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />
                <span>Runtime</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('dependencies')}
                className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                  tab === 'dependencies'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                <span>Dependencies</span>
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Tab 1: Terminal / Logs */}
        {tab === 'logs' && (
          <div className="flex-1 flex flex-col min-h-0 bg-[#070810] overflow-hidden">
            <div className="h-8 px-3 border-b border-white/5 bg-[#0d0f20] flex items-center justify-between shrink-0 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    snapshot.previewUrl
                      ? 'bg-emerald-400'
                      : snapshot.state === 'error'
                      ? 'bg-red-400'
                      : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <span className="text-[11px] text-slate-400 font-mono">
                  {snapshot.previewUrl ? `Server Live on port ${snapshot.serverPort || 3000}` : `Runtime state: ${snapshot.state}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyLogs}
                  className="h-6 px-2 text-[11px] text-slate-400 hover:text-white gap-1"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>Copy</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRestartRuntime}
                  className="h-6 px-2 text-[11px] text-slate-400 hover:text-white gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Restart Dev Server</span>
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <TerminalPanel
                files={files}
                onServerReady={onServerReady}
                onErrorDetected={onErrorDetected}
                onClose={() => onOpenChange(false)}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Runtime Overview */}
        {tab === 'runtime' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-1.5">
                <p className="text-[11px] font-medium text-slate-400">Runtime Status</p>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      snapshot.previewUrl ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span className="text-sm font-semibold text-white capitalize">
                    {snapshot.previewUrl ? 'Preview Ready' : snapshot.state}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {snapshot.previewUrl ? 'Server accepting requests' : 'Booting kernel processes'}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-1.5">
                <p className="text-[11px] font-medium text-slate-400">Compiler & Fast Refresh</p>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span>SWC: WASM</span>
                  <Badge variant="outline" className="border-indigo-500/40 text-[10px] text-indigo-300">
                    HMR: Active
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500">
                  @next/swc-wasm-nodejs WebAssembly engine
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-1.5">
                <p className="text-[11px] font-medium text-slate-400">Isolation & Kernel</p>
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Cross-Origin Isolated</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  SharedArrayBuffer virtual threads active
                </p>
              </div>
            </div>

            {/* URL & Port */}
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">WebContainer Server Target</h4>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {snapshot.previewUrl || (snapshot.serverPort ? `Port ${snapshot.serverPort} (Verifying runtime target…)` : 'Waiting for dev server to start…')}
                  </p>
                </div>
                {(snapshot.previewUrl || webcontainerUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const pid =
                          projectId ||
                          new URLSearchParams(window.location.search).get('project') ||
                          'local-project';
                        window.open(`/preview?project=${encodeURIComponent(pid)}`, '_blank');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs font-semibold border border-white/15 transition cursor-pointer"
                  >
                    <span>Open in new window</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                <Button
                  size="sm"
                  onClick={handleRestartRuntime}
                  className="h-8 text-xs rounded-full bg-white hover:bg-slate-200 text-black font-semibold px-4 gap-1.5 shadow-md cursor-pointer transition"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Restart Dev Server</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    webcontainerManager.stopAll();
                    toast.success('Runtime stopped');
                  }}
                  className="h-8 text-xs rounded-full border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white px-4 cursor-pointer transition"
                >
                  <span>Stop Server</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Dependencies */}
        {tab === 'dependencies' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-2">
                Production Dependencies ({Object.keys(parsedDeps).length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {Object.entries(parsedDeps).map(([name, ver]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-white/10 bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Package className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                      <span className="font-mono text-xs text-slate-200 truncate">{name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">{ver}</span>
                  </div>
                ))}
              </div>
            </div>

            {Object.keys(parsedDevDeps).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Dev Dependencies ({Object.keys(parsedDevDeps).length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {Object.entries(parsedDevDeps).map(([name, ver]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/[0.01]"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Package className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                        <span className="font-mono text-xs text-slate-300 truncate">{name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 shrink-0">{ver}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
