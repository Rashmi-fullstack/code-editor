"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-16 selection:bg-indigo-500/30 selection:text-white">
      {/* Background Ambient Radial Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-b from-indigo-500/10 via-purple-500/5 to-transparent blur-3xl"
      />

      <section className="relative w-full max-w-md rounded-[32px] border border-white/15 bg-black/60 p-8 sm:p-10 shadow-[0_24px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl text-white">
        {/* Top Specular Line */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
        />

        {/* Brand Header with Circular White Logo Button */}
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="group flex items-center gap-2.5 focus-visible:outline-none"
            aria-label="Codatron Home"
          >
            <div className="w-10 h-10 rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] flex items-center justify-center transition-transform duration-250 group-hover:scale-105">
              <img
                src="/assets/logo.webp"
                alt="Codatron"
                width={26}
                height={26}
                className="w-[70%] h-[70%] object-contain"
              />
            </div>
            <span className="text-base font-semibold tracking-tight text-white">
              Codatron<span className="text-indigo-400 font-normal text-xs ml-0.5">.ai</span>
            </span>
          </Link>

          <Link
            href="/"
            className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
          {title}
        </h1>
        <p className="mb-7 text-sm text-slate-300 leading-relaxed font-normal">
          {subtitle}
        </p>
        {children}
      </section>
    </main>
  );
}

export function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-200">
        {label}
      </span>
      <div className="relative">
        <input
          required
          minLength={isPassword ? 8 : undefined}
          type={effectiveType}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 backdrop-blur-sm transition-all duration-200 outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10 ${
            isPassword ? "pr-11" : ""
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowPassword((prev) => !prev);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition cursor-pointer p-1 rounded-md focus:outline-none focus:ring-1 focus:ring-white/20"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-slate-300" />
            ) : (
              <Eye className="h-4 w-4 text-slate-300" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
      <span className="h-px flex-1 bg-white/10" />
      <span className="px-2 py-0.5 rounded-full bg-white/[0.05] text-[10px] font-mono uppercase tracking-wider text-slate-400">
        OR
      </span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
