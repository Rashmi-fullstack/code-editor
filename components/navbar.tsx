'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
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
        if (visible) {
          setActiveSection(`#${visible.target.id}`);
        } else if (window.scrollY < 200) {
          setActiveSection(null);
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.1, 0.3, 0.5] }
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

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-5 sm:pt-7 pointer-events-none">
      <div className="w-full max-w-[980px] flex items-center justify-between gap-3 sm:gap-6 flex-shrink-0 animate-[slideDown_0.7s_cubic-bezier(0.22,1,0.36,1)_both]">
        {/* =========================================================================
            1. Left: Circular Logo Button (Increased size, Prompt UI style)
            ========================================================================= */}
        <Link
          href="/"
          className="pointer-events-auto group flex items-center gap-3 focus-visible:outline-none"
          aria-label="Codatron.ai Home"
        >
          <div className="w-[48px] h-[48px] sm:w-[52px] sm:h-[52px] rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.18)] flex items-center justify-center flex-shrink-0 transition-transform duration-250 group-hover:scale-105">
            <img
              src="/assets/logo.webp"
              alt="Codatron Logo"
              width={38}
              height={38}
              className="w-[72%] h-[72%] object-contain"
            />
          </div>
          <span className="hidden sm:inline-flex items-center text-[15px] font-semibold tracking-tight text-white drop-shadow-md">
            Codatron<span className="text-indigo-400 font-normal text-xs ml-0.5">.ai</span>
          </span>
        </Link>

        {/* =========================================================================
            2. Center: Desktop White Navigation Pill (Spacious, Perfectly Aligned)
            ========================================================================= */}
        <nav
          ref={navRef}
          aria-label="Main Navigation"
          className="pointer-events-auto hidden md:flex items-center justify-around h-[50px] sm:h-[54px] min-w-[440px] max-w-[500px] flex-1 px-4 sm:px-6 rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.18)] transition-all"
        >
          {NAV_LINKS.map((link) => {
            const isActive = activeSection === link.href;

            return (
              <a
                key={link.href}
                href={link.href}
                className={`relative px-4 py-2 inline-flex items-center justify-center font-sans font-medium text-[14.5px] sm:text-[15.5px] text-[#2e2e2e] tracking-[-0.01em] whitespace-nowrap transition-opacity duration-200 select-none ${
                  isActive ? 'opacity-100 font-semibold' : 'opacity-55 hover:opacity-85'
                }`}
              >
                {link.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-[6px] left-1/2 -translate-x-1/2 w-[3.5px] h-[3.5px] bg-black rounded-full shadow-[-6px_0_0_#000,6px_0_0_#000]"
                  />
                )}
              </a>
            );
          })}
        </nav>

        {/* =========================================================================
            3. Right: Desktop Dark Pill Sign In / User Auth Actions
            ========================================================================= */}
        <div className="pointer-events-auto hidden md:flex items-center gap-2.5 flex-shrink-0">
          {!isLoading && user ? (
            <div className="h-[50px] sm:h-[54px] rounded-full bg-[#28282a] text-[#c8c8c8] shadow-[0_4px_16px_rgba(0,0,0,0.18)] px-5 flex items-center gap-3.5 text-[13.5px] font-sans font-medium border border-white/10">
              <Link
                href="/projects"
                className="text-[#c8c8c8] hover:text-white transition-colors whitespace-nowrap"
              >
                My Projects
              </Link>
              <span className="w-px h-4 bg-white/15" />
              <Link
                href="/profile"
                className="max-w-[130px] truncate text-[#c8c8c8] hover:text-white transition-colors"
                title="View Profile & Settings"
              >
                {user.name || 'Profile'}
              </Link>
              <span className="w-px h-4 bg-white/15" />
              <button
                onClick={() => void logout()}
                className="text-[#8e8e8e] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                Log out
              </button>
              <Link
                href="/editor?view=developer"
                className="h-[36px] px-4 rounded-full bg-white text-black hover:bg-slate-200 transition-all font-semibold text-xs inline-flex items-center gap-1.5 shadow-sm hover:scale-[1.02] whitespace-nowrap"
              >
                Open Editor
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <Link
                href={LOGIN_HREF}
                className="h-[50px] sm:h-[54px] rounded-full bg-[#28282a] text-[#c8c8c8] hover:text-white hover:bg-[#323234] shadow-[0_4px_16px_rgba(0,0,0,0.18)] px-6 flex items-center justify-center font-sans font-medium text-[14.5px] transition-all hover:-translate-y-0.5 border border-white/10"
              >
                Sign in
              </Link>
              <Link
                href={GET_STARTED_HREF}
                className="h-[50px] sm:h-[54px] rounded-full bg-white text-black hover:bg-slate-200 shadow-[0_4px_16px_rgba(0,0,0,0.18)] px-6 flex items-center justify-center font-sans font-semibold text-[14.5px] transition-all hover:-translate-y-0.5"
              >
                Get Started
              </Link>
            </div>
          )}
        </div>

        {/* =========================================================================
            4. Mobile Hamburger Button (Prompt UI style)
            ========================================================================= */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-menu"
          className="pointer-events-auto md:hidden w-[48px] h-[48px] rounded-full bg-[#28282a] border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.18)] flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          <span
            className={`w-[20px] h-[1.5px] bg-white rounded-full transition-transform duration-250 ${
              mobileOpen ? 'translate-y-[6px] rotate-45' : ''
            }`}
          />
          <span
            className={`w-[20px] h-[1.5px] bg-white rounded-full transition-opacity duration-200 ${
              mobileOpen ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <span
            className={`w-[20px] h-[1.5px] bg-white rounded-full transition-transform duration-250 ${
              mobileOpen ? '-translate-y-[6px] -rotate-45' : ''
            }`}
          />
        </button>
      </div>

      {/* =========================================================================
          5. Mobile Menu Overlay & Sheet
          ========================================================================= */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="pointer-events-auto fixed inset-0 bg-black/70 backdrop-blur-md z-40 md:hidden"
            />

            <motion.div
              id="mobile-nav-menu"
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.96 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto absolute top-20 inset-x-4 max-w-sm mx-auto z-50 p-6 rounded-3xl border border-white/15 bg-[#18181a]/95 shadow-[0_24px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl md:hidden"
            >
              <div className="flex items-center gap-2.5 pb-4 mb-3 border-b border-white/10">
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center p-1">
                  <img src="/assets/logo.webp" alt="Codatron" className="w-full h-full object-contain" />
                </div>
                <span className="font-semibold text-white text-base">Codatron.ai</span>
              </div>

              <div className="flex flex-col space-y-1.5 mb-5">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center justify-between px-4 py-3 rounded-full text-[15px] font-medium transition-colors ${
                      activeSection === link.href
                        ? 'bg-white text-black font-semibold'
                        : 'text-[#c8c8c8] hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    {link.label}
                    {activeSection === link.href && (
                      <span className="w-2 h-2 rounded-full bg-black" />
                    )}
                  </a>
                ))}
              </div>

              <div className="pt-3 border-t border-white/10 flex flex-col gap-2.5">
                {!isLoading && user ? (
                  <>
                    <div className="px-3 py-1 text-xs text-[#a1a1aa]">
                      Signed in as <span className="text-white font-medium">{user.name}</span>
                    </div>
                    <Link
                      href="/projects"
                      onClick={() => setMobileOpen(false)}
                      className="w-full py-3 text-center text-sm font-medium text-white rounded-full bg-white/[0.08] hover:bg-white/[0.14] transition-colors"
                    >
                      My Projects
                    </Link>
                    <Link
                      href="/editor?view=developer"
                      onClick={() => setMobileOpen(false)}
                      className="w-full py-3 text-center text-sm font-semibold text-black rounded-full bg-white hover:bg-slate-200 transition-colors shadow-md"
                    >
                      Open Editor
                    </Link>
                    <button
                      onClick={() => {
                        setMobileOpen(false);
                        void logout();
                      }}
                      className="w-full py-2.5 text-center text-xs text-[#8e8e8e] hover:text-white transition-colors"
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href={LOGIN_HREF}
                      onClick={() => setMobileOpen(false)}
                      className="w-full py-3 text-center text-sm font-medium text-white rounded-full bg-[#28282a] border border-white/10 hover:bg-[#323234] transition-colors"
                    >
                      Sign in
                    </Link>
                    <Link
                      href={GET_STARTED_HREF}
                      onClick={() => setMobileOpen(false)}
                      className="w-full py-3 text-center text-sm font-semibold text-black rounded-full bg-white hover:bg-slate-200 transition-colors shadow-md"
                    >
                      Get Started
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
