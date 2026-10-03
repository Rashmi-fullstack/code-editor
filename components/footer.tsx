import Link from 'next/link';
import { Sparkles, Code, MessageCircle } from 'lucide-react';

export default function Footer() {
  const staticYear = 2025;

  return (
    <footer className="relative border-t border-white/[0.08] bg-[#03060c] pt-16 pb-12 overflow-hidden">
      {/* Subtle top edge glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-center">
          {/* Brand & Mission */}
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5 group mb-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-600/30 border border-white/20 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
                <Sparkles className="w-3.5 h-3.5 text-indigo-300 group-hover:text-white transition-colors" />
              </div>
              <span className="text-lg font-semibold tracking-wide text-white">
                Codatron<span className="text-indigo-400 text-xs ml-0.5">.ai</span>
              </span>
            </Link>
            <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
              Turn ideas into production-ready software with AI. Structured workflows, full-stack generation, and instant preview.
            </p>
          </div>

          {/* Nav Links */}
          <div className="flex flex-wrap gap-x-8 gap-y-3 md:justify-center">
            <Link
              href="#"
              className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
            >
              Documentation
            </Link>
            <Link
              href="#"
              className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
            >
              GitHub
            </Link>
            <Link
              href="#"
              className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="#"
              className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
            >
              Terms
            </Link>
          </div>

          {/* Social & Status */}
          <div className="flex flex-col md:items-end gap-3">
            <div className="flex items-center gap-3">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter"
                className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 hover:border-white/20 hover:bg-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 hover:border-white/20 hover:bg-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200"
              >
                <Code className="w-4 h-4" />
              </a>
            </div>
            <div className="inline-flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Operational
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>© {staticYear} Codatron.ai. All rights reserved.</div>
          <div className="text-slate-600">Built for high-velocity software engineering.</div>
        </div>
      </div>
    </footer>
  );
}
