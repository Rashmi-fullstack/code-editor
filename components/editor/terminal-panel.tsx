'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Server,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ProjectFile } from '@/lib/types/database';
import {
  webcontainerManager,
  type WebContainerRuntimeSnapshot,
} from '@/lib/runtime/webcontainer-manager';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalPanelProps {
  files: ProjectFile[];
  onServerReady?: (url: string) => void;
  onErrorDetected?: (error: string) => void;
  onClose?: () => void;
  className?: string;
}

export function TerminalPanel({
  files,
  onServerReady,
  onErrorDetected,
  onClose,
  className = '',
}: TerminalPanelProps) {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<WebContainerRuntimeSnapshot>(
    webcontainerManager.getSnapshot()
  );

  const serverTerminalRef = useRef<HTMLDivElement>(null);
  const serverXterm = useRef<Terminal | null>(null);
  const serverFitAddon = useRef<FitAddon | null>(null);

  // Subscribe to WebContainer snapshot updates
  useEffect(() => {
    const unsub = webcontainerManager.subscribeSnapshot((snap) => {
      setRuntimeSnapshot(snap);
      if (snap.previewUrl) {
        onServerReady?.(snap.previewUrl);
      }
      if (snap.lastError) {
        onErrorDetected?.(snap.lastError.message);
      }
    });
    return unsub;
  }, [onServerReady, onErrorDetected]);

  // Initialize Server Logs XTerm instance
  useEffect(() => {
    let term: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let disposed = false;

    async function initServerLogs() {
      try {
        if (!serverTerminalRef.current || disposed) return;

        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ]);

        if (disposed || !serverTerminalRef.current) return;

        const targetEl = serverTerminalRef.current;
        targetEl.innerHTML = '';

        term = new Terminal({
          convertEol: true,
          cursorBlink: false,
          disableStdin: true,
          fontSize: 12,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: {
            background: '#0a0b16',
            foreground: '#e2e8f0',
            selectionBackground: '#4338ca',
            black: '#0f172a',
            red: '#f87171',
            green: '#4ade80',
            yellow: '#facc15',
            blue: '#60a5fa',
            magenta: '#c084fc',
            cyan: '#38bdf8',
            white: '#f8fafc',
          },
        });

        fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        if (disposed || !serverTerminalRef.current) {
          term.dispose();
          return;
        }

        term.open(targetEl);
        try {
          fitAddon.fit();
        } catch {}

        serverXterm.current = term;
        serverFitAddon.current = fitAddon;

        term.writeln('\x1b[1;36m=== Codatron.ai Dev Server & Build Output ===\x1b[0m');

        // Preload recent logs from WebContainer
        const existingLogs = webcontainerManager.getLogs();
        if (existingLogs.length > 0) {
          for (const line of existingLogs.slice(-100)) {
            term.writeln(line);
          }
        }

        // Subscribe to live dev output
        const unsubDev = webcontainerManager.subscribeDevOutput((chunk) => {
          if (!disposed && term) {
            term.write(chunk);
          }
        });

        return () => {
          unsubDev();
        };
      } catch (err) {
        console.warn('[TerminalPanel] Failed to initialize server logs terminal:', err);
      }
    }

    const cleanupPromise = initServerLogs();

    return () => {
      disposed = true;
      void cleanupPromise.then((cleanup) => cleanup?.());
      try {
        term?.dispose();
      } catch {}
      serverXterm.current = null;
      serverFitAddon.current = null;
    };
  }, []);

  // Handle window and panel resizing
  useEffect(() => {
    const handleResize = () => {
      try {
        serverFitAddon.current?.fit();
      } catch {}
    };

    window.addEventListener('resize', handleResize);
    const timer = setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, []);

  const handleClear = () => {
    serverXterm.current?.clear();
  };

  const handleRestart = () => {
    void webcontainerManager.restartDevServer(files);
  };

  // Compute status badge styling
  const statusConfig = {
    idle: { label: 'Idle', color: 'border-slate-500/30 bg-slate-500/10 text-slate-400' },
    initializing: { label: 'Initializing', color: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
    ready: { label: 'Ready', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
    mounting: { label: 'Mounting', color: 'border-purple-500/30 bg-purple-500/10 text-purple-300' },
    installing: { label: 'Installing', color: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
    starting: { label: 'Starting', color: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' },
    running: { label: 'Ready', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
    error: { label: 'Error', color: 'border-red-500/30 bg-red-500/10 text-red-300' },
    stopped: { label: 'Stopped', color: 'border-slate-600/30 bg-slate-600/10 text-slate-400' },
  }[runtimeSnapshot.state] || { label: 'Idle', color: 'border-slate-500/30 bg-slate-500/10 text-slate-400' };

  return (
    <div className={`flex flex-col h-full bg-[#0a0b16] min-w-0 min-h-0 overflow-hidden ${className}`}>
      {/* Title Bar */}
      <div className="h-9 px-3 border-b border-white/10 bg-[#0d0f20] flex items-center justify-between shrink-0 select-none">
        {/* Left: Dev Server label & Status badge */}
        <div className="flex items-center gap-2 min-w-0">
          <Server className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          <span className="text-xs font-semibold text-white">Dev Server & Build Logs</span>

          <Badge variant="outline" className={`text-[9px] uppercase px-1.5 py-0 ${statusConfig.color}`}>
            {statusConfig.label}
          </Badge>

          {runtimeSnapshot.framework !== 'unknown' && (
            <span className="text-[10px] text-slate-500 hidden sm:inline">
              • {runtimeSnapshot.framework.toUpperCase()} ({runtimeSnapshot.packageManager})
            </span>
          )}
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-6 px-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 gap-1"
            title="Clear logs"
          >
            <Trash2 className="h-3 w-3" />
            <span className="hidden sm:inline">Clear</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRestart}
            className="h-6 px-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 gap-1"
            title="Restart development server"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="hidden sm:inline">Restart</span>
          </Button>

          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-white/5"
              title="Close panel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Server Logs Output */}
      <div className="flex-1 min-h-0 min-w-0 relative bg-[#0a0b16] p-1 overflow-hidden">
        <div ref={serverTerminalRef} className="h-full w-full overflow-hidden" />
      </div>
    </div>
  );
}
