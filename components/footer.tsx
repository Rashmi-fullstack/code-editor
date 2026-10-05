import Link from 'next/link';
import { MessageCircle, Code } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-white/10 bg-transparent pt-16 pb-12 overflow-hidden backdrop-blur-md z-10">
      {/* Subtle top edge specular reflection line */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-center">
          {/* Brand & Mission */}
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5 group mb-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center p-1 shadow-sm transition-transform duration-200 group-hover:scale-105">
                <img
                  src="/assets/logo.webp"
                  alt="Codatron"
                  width={24}
                  height={24}
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="text-lg font-semibold tracking-tight text-white">
                Codatron<span className="text-indigo-400 text-xs ml-0.5 font-normal">.ai</span>
              </span>
            </Link>
            <p className="text-slate-300 text-sm max-w-sm leading-relaxed drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
              Turn ideas into production-ready software with AI. Structured workflows, full-stack generation, and instant preview.
            </p>
          </div>

          {/* Nav Links */}
          <div className="flex flex-wrap gap-x-8 gap-y-3 md:justify-center">
            <Link
              href="#roles"
              className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
            >
              Roles
            </Link>
            <Link
              href="#features"
              className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
            >
              How It Works
            </Link>
            <Link
              href="/editor?view=developer"
              className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
            >
              Editor
            </Link>
          </div>

          {/* Social & Status Badge */}
          <div className="flex flex-col md:items-end gap-3.5">
            <div className="flex items-center gap-2.5">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter / X"
                className="w-9 h-9 rounded-full bg-[#28282a] border border-white/10 hover:border-white/25 hover:bg-[#323234] flex items-center justify-center text-[#c8c8c8] hover:text-white transition-all duration-200"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="w-9 h-9 rounded-full bg-[#28282a] border border-white/10 hover:border-white/25 hover:bg-[#323234] flex items-center justify-center text-[#c8c8c8] hover:text-white transition-all duration-200"
              >
                <Code className="w-4 h-4" />
              </a>
            </div>

            {/* Pill Status Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#28282a] border border-white/15 text-xs font-mono text-[#c4c2c3]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Systems Operational
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>© {currentYear} Codatron.ai. All rights reserved.</div>
          <div className="text-slate-500">Built for high-velocity software engineering.</div>
        </div>
      </div>
    </footer>
  );
}
