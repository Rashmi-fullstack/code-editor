'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, Menu, X } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';

const NAV_LINKS = [
  { label: 'Roles', href: '#roles' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
] as const;

const LOGIN_HREF = '/login';
const GET_STARTED_HREF = '/signup';

export default function Navbar() {
  const { user, isLoading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const navRef = useRef<HTMLElement>(null);

  // Scroll spy to highlight active section in view
  useEffect(() => {
    const ids = NAV_LINKS.map((l) => l.href.replace('#', ''));
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(`#${visible.target.id}`);
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.2, 0.5, 0.8] }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Close mobile menu on Escape key or outside click
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const pillTarget = hoveredLink ?? activeSection;

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 sm:pt-6 pointer-events-none"
    >
      <nav
        ref={navRef}
        aria-label="Primary"
        className="pointer-events-auto relative flex items-center justify-between w-full max-w-5xl h-14 px-4 sm:px-5 rounded-full border transition-all duration-300"
        style={{
          background: 'rgba(6, 10, 18, 0.72)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          boxShadow:
            '0 12px 36px -10px rgba(0, 0, 0, 0.65), 0 0 24px -6px rgba(99, 102, 241, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
        }}
      >
        {/* Subtle top edge specular reflection */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
        />

        {/* Brand Logo */}
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/20 via-indigo-500/30 to-blue-600/30 border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_0_12px_rgba(99,102,241,0.4)] transition-transform duration-300 group-hover:scale-105">
            <Sparkles className="h-3.5 w-3.5 text-indigo-300 group-hover:text-white transition-colors" />
          </div>
          <span className="text-[15px] font-semibold tracking-wide text-white flex items-center">
            Codatron<span className="text-indigo-400 font-normal text-xs ml-0.5">.ai</span>
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <ul
          className="hidden md:flex items-center gap-1 relative"
          onMouseLeave={() => setHoveredLink(null)}
        >
          {NAV_LINKS.map((link) => {
            const isHovered = hoveredLink === link.href;
            const isActive = activeSection === link.href;

            return (
              <li key={link.href} className="relative">
                <a
                  href={link.href}
                  onMouseEnter={() => setHoveredLink(link.href)}
                  className="relative z-10 block rounded-full px-3.5 py-1.5 text-[13px] font-medium tracking-tight text-slate-300 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  {link.label}
                </a>

                {pillTarget === link.href && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 z-0 rounded-full bg-white/[0.08] ring-1 ring-inset ring-white/10"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}

                {isActive && !isHovered && (
                  <motion.span
                    layoutId="nav-active-dot"
                    className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.9)]"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </li>
            );
          })}
        </ul>

        {/* Desktop Auth & Primary Action */}
        <div className="hidden md:flex items-center gap-2.5">
          {!isLoading && user ? (
            <>
              <Link
                href="/projects"
                className="rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors border border-white/5"
              >
                My Projects
              </Link>
              <Link
                href="/profile"
                className="max-w-[130px] truncate text-xs text-slate-300 hover:text-white font-medium px-2.5 py-1.5 rounded-full hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-colors"
                title="View Profile & AI Settings"
              >
                {user.name}
              </Link>
              <button
                onClick={() => void logout()}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Log out
              </button>
              <Link
                href="/editor"
                className="relative inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium text-white transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] shadow-md shadow-indigo-500/20"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(99, 102, 241, 0.95) 0%, rgba(79, 70, 229, 0.95) 100%)',
                  boxShadow:
                    'inset 0 1px 0 0 rgba(255, 255, 255, 0.3), 0 4px 14px rgba(79, 70, 229, 0.4)',
                }}
              >
                Open Editor
                <ArrowRight className="h-3 w-3" />
              </Link>
            </>
          ) : (
            <>
              <Link
                href={LOGIN_HREF}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-slate-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Login
              </Link>
              <Link
                href={GET_STARTED_HREF}
                className="relative group inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium text-white transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%), linear-gradient(90deg, rgba(255, 226, 178, 0.14) 0%, rgba(150, 196, 244, 0.14) 100%), rgba(15, 23, 42, 0.8)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow:
                    '0 0 16px -2px rgba(168, 204, 252, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.35)',
                }}
              >
                Get Started
                <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile Hamburger Trigger (Accessible >= 44px tap target) */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-panel"
          className="md:hidden relative flex items-center justify-center w-10 h-10 -mr-1 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile Menu Dropdown Panel */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Scrim / Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden pointer-events-auto"
            />

            {/* Panel */}
            <motion.div
              id="mobile-nav-panel"
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto absolute top-16 inset-x-4 max-w-md mx-auto z-50 p-4 rounded-2xl border border-white/10 bg-[#070b14]/95 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl md:hidden"
            >
              <ul className="flex flex-col space-y-1">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                        activeSection === link.href
                          ? 'bg-white/[0.08] text-white'
                          : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                      }`}
                    >
                      {link.label}
                      {activeSection === link.href && (
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                      )}
                    </a>
                  </li>
                ))}
              </ul>

              <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-2">
                {!isLoading && user ? (
                  <>
                    <Link
                      href="/profile"
                      onClick={() => setMobileOpen(false)}
                      className="px-3 py-2 rounded-xl text-xs text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] transition flex items-center justify-between"
                    >
                      <span>Signed in as <span className="text-white font-medium">{user.name}</span></span>
                      <span className="text-[11px] text-indigo-400 font-medium">Profile & Settings →</span>
                    </Link>
                    <Link
                      href="/projects"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-center h-11 rounded-xl text-sm font-medium text-slate-200 bg-white/[0.05] hover:bg-white/[0.09] transition-colors"
                    >
                      My Projects
                    </Link>
                    <Link
                      href="/editor"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/30"
                    >
                      Open Editor
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => {
                        setMobileOpen(false);
                        void logout();
                      }}
                      className="h-10 text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href={LOGIN_HREF}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-center h-11 rounded-xl text-sm font-medium text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                    >
                      Login
                    </Link>
                    <Link
                      href={GET_STARTED_HREF}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/30"
                    >
                      Get Started
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
