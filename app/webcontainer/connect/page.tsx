'use client';

import { useEffect, useState } from 'react';
import { setupConnect } from '@webcontainer/api/connect';
import { Loader2, ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function WebContainerConnectIndexPage() {
  const [hasOpener, setHasOpener] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returnUrl, setReturnUrl] = useState('/editor?project=local-project&view=developer');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const lastPid = localStorage.getItem('codatron_last_active_project');
    if (lastPid) {
      setReturnUrl(`/editor?project=${lastPid}&view=developer`);
    }

    if (!window.opener) {
      setHasOpener(false);
      return;
    }

    setHasOpener(true);
    try {
      setupConnect();
    } catch (err) {
      console.warn('[WebContainer Connect Warning]', err);
      setError(err instanceof Error ? err.message : 'Connection handshake notice.');
    }
  }, []);

  if (hasOpener === false) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#070810] text-slate-200 font-sans p-6 select-none">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[#0d0e1c] p-6 text-center space-y-5 shadow-2xl">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 mx-auto">
            <ExternalLink className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-white">Live Preview Workspace</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your application preview runs directly inside the Codatron Developer IDE tab.
            </p>
          </div>
          <div className="rounded-lg bg-black/40 border border-white/5 p-3 text-[11px] text-slate-400 font-mono">
            In-browser WebContainer servers are hosted inside your main IDE window. Click below to return to your workspace and live preview.
          </div>
          <div className="pt-2 flex items-center justify-center gap-3">
            <Link
              href={returnUrl}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Developer IDE</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#070810] text-slate-300 font-sans p-4 select-none">
      {error ? (
        <div className="max-w-md text-center space-y-3">
          <p className="text-sm font-semibold text-amber-400">Preview Handshake Notice</p>
          <p className="text-xs text-slate-400">{error}</p>
          <div className="pt-2">
            <Link
              href={returnUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Editor</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <p className="text-xs text-slate-400 font-mono">Connecting to live preview…</p>
        </div>
      )}
    </div>
  );
}
