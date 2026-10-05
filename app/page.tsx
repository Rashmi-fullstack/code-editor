'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase,
  Code,
  Zap,
  GitBranch,
  Eye,
  Sparkles,
  Rocket,
  ArrowRight,
  Terminal,
  Cpu,
} from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';

const fadeInUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const features = [
  {
    icon: Sparkles,
    title: 'Prompt-to-product workflows',
    description:
      'Turn a rough idea into structured product requirements, technical plans, and implementation-ready outputs in minutes.',
  },
  {
    icon: GitBranch,
    title: 'Context-aware system design',
    description:
      'Break complex projects into clean architecture, components, routes, and tasks that stay aligned with the product goal.',
  },
  {
    icon: Eye,
    title: 'Live app preview',
    description:
      'Inspect changes instantly with live rendering, quick iteration, and fast feedback across frontend and backend work.',
  },
  {
    icon: Zap,
    title: 'Fast AI iteration',
    description:
      'Refine prompts, code, and product requirements in the same flow without losing momentum or context.',
  },
  {
    icon: Terminal,
    title: 'Full-stack generation',
    description:
      'Generate production-ready TypeScript, React, Next.js, API routes, and data models without starting from scratch.',
  },
  {
    icon: Cpu,
    title: 'Execution that keeps moving',
    description:
      'Build, validate, and refine features with an assistant designed to move from concept to working output quickly.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Describe the outcome',
    description:
      'Tell Codatron what you want to build, improve, or launch in plain English — no handoff docs required.',
  },
  {
    number: '02',
    title: 'AI plans and builds',
    description:
      'Generate the product structure, UI flow, backend logic, and engineering tasks in one connected workflow.',
  },
  {
    number: '03',
    title: 'Review, refine, and ship',
    description:
      'Edit in real time, test with live preview, and move from prototype to production-ready software with confidence.',
  },
];

export default function Home() {
  return (
    <div className="relative min-h-screen text-white bg-transparent selection:bg-indigo-500/30 selection:text-white overflow-x-hidden">
      {/* 1. Prompt UI Floating Navbar */}
      <Navbar />

      {/* =========================================================================
          HERO SECTION — CLEAN, IMPACTFUL, SINGLE VIEWPORT FEEL
          ========================================================================= */}
      <section className="relative w-full min-h-[90vh] sm:min-h-screen flex flex-col items-center justify-center overflow-hidden px-[clamp(16px,3vw,32px)] pt-32 pb-20 z-10 box-border">
        {/* Hero Center */}
        <main className="flex flex-col items-center justify-center text-center max-w-[900px] w-full my-auto">
          {/* Subtle Pill Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#28282a] border border-white/20 text-xs font-medium text-white mb-6 shadow-[0_4px_14px_rgba(0,0,0,0.3)] backdrop-blur-md animate-[reveal_0.85s_cubic-bezier(0.22,1,0.36,1)_0.05s_both]">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            AI Product Studio & Code Workspace
          </div>

          {/* Headline — Retro dot-matrix display font */}
          <h1 className="m-0 flex flex-col items-center justify-center text-center mb-2">
            <span
              className="block text-white text-[clamp(34px,7vw,88px)] tracking-[-0.04em] max-[720px]:tracking-[-0.07em] leading-[1.1] max-[720px]:leading-[1.04] whitespace-nowrap overflow-hidden opacity-0 translate-y-[14px] animate-[headlineFade_0.85s_cubic-bezier(0.22,1,0.36,1)_0.12s_forwards]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Turn Ideas
            </span>
            <span
              className="block text-white text-[clamp(34px,7vw,88px)] tracking-[-0.04em] max-[720px]:tracking-[-0.07em] leading-[1.1] max-[720px]:leading-[1.04] whitespace-nowrap overflow-hidden opacity-0 translate-y-[14px] animate-[headlineFade_0.85s_cubic-bezier(0.22,1,0.36,1)_0.3s_forwards]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Into Software
            </span>
          </h1>

          {/* Subhead — High contrast, fully readable */}
          <p className="max-w-[min(560px,94%)] text-[clamp(15px,1.8vw,18px)] text-white/95 leading-[1.6] font-normal my-[clamp(16px,2.2vh,24px)] mx-auto mb-[clamp(26px,3.5vh,38px)] drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] animate-[reveal_0.85s_cubic-bezier(0.22,1,0.36,1)_0.28s_both]">
            Describe a feature, app, or workflow in plain English. Codatron turns it into
            product requirements, full-stack code, and live previews in one collaborative workspace.
          </p>

          {/* CTA — Prompt UI Signature White Pill */}
          <Link
            href="/editor?view=developer"
            className="font-sans font-semibold text-[clamp(14px,1.5vw,15.5px)] text-black bg-white px-[clamp(28px,3.5vw,36px)] py-[clamp(13px,1.8vh,16px)] rounded-full inline-flex items-center justify-center gap-2 shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_24px_rgba(255,255,255,0.35),0_0_48px_rgba(255,255,255,0.15)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.3),0_0_32px_rgba(255,255,255,0.5),0_0_64px_rgba(255,255,255,0.25)] hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-250 animate-[revealPulse_0.85s_cubic-bezier(0.22,1,0.36,1)_0.4s_both]"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </main>
      </section>

      {/* =========================================================================
          2. CHOOSE YOUR WORKFLOW SECTION (HIGH CONTRAST & UI STYLE MATCHED)
          ========================================================================= */}
      <section id="roles" className="py-24 px-4 sm:px-6 lg:px-8 relative z-10 scroll-mt-24 bg-transparent">
        <div className="max-w-5xl mx-auto">
          {/* Section Header with High Contrast Pill Badge & Typography */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#28282a] border border-white/20 text-xs font-medium text-white mb-4 shadow-[0_4px_14px_rgba(0,0,0,0.3)] backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Tailored Workspaces
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mb-3 drop-shadow-md">
              Choose your workflow
            </h2>
            <p className="text-white text-base sm:text-lg max-w-xl mx-auto leading-relaxed font-medium drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
              Go from strategy to shipping code with the workflow built for your role.
            </p>
          </motion.div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
            {/* Product Manager Card */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.3 }}
            >
              <Link href="/product" className="block h-full group focus-visible:outline-none">
                <div className="relative overflow-hidden p-8 sm:p-10 rounded-[32px] bg-black/40 border border-white/20 backdrop-blur-2xl transition-all duration-300 hover:border-white/35 hover:bg-black/55 shadow-[0_24px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.2)] flex flex-col justify-between h-full">
                  {/* Top Specular Line */}
                  <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

                  <div>
                    {/* Icon Container */}
                    <div className="w-13 h-13 rounded-2xl bg-white/[0.08] border border-white/20 flex items-center justify-center mb-6 shadow-inner text-white group-hover:scale-105 transition-transform duration-300">
                      <Briefcase className="w-6 h-6 text-white" />
                    </div>

                    <h3 className="text-2xl sm:text-3xl font-bold mb-3 text-white tracking-tight drop-shadow-sm">
                      Product Manager
                    </h3>
                    <p className="text-slate-100 text-sm sm:text-[15px] leading-relaxed mb-6 font-normal drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
                      Turn ideas into product direction, structured requirements, user stories, and a clear
                      roadmap before a single line of code is written.
                    </p>

                    {/* Feature Pills — Crisp & Legible */}
                    <div className="flex flex-wrap gap-2 mb-8">
                      <span className="px-3.5 py-1.5 rounded-full bg-white/[0.12] border border-white/20 text-xs text-white font-medium backdrop-blur-md">
                        PRD Generator
                      </span>
                      <span className="px-3.5 py-1.5 rounded-full bg-white/[0.12] border border-white/20 text-xs text-white font-medium backdrop-blur-md">
                        User Stories
                      </span>
                      <span className="px-3.5 py-1.5 rounded-full bg-white/[0.12] border border-white/20 text-xs text-white font-medium backdrop-blur-md">
                        Roadmap Planning
                      </span>
                    </div>
                  </div>

                  {/* UI Style Matched White Pill Button */}
                  <div className="w-full h-12 rounded-full bg-white hover:bg-slate-200 text-black font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(255,255,255,0.25)] group-hover:scale-[1.01]">
                    Start as Product Manager
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            </motion.div>

            {/* Developer Card */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.3 }}
            >
              <Link href="/editor?view=developer" className="block h-full group focus-visible:outline-none">
                <div className="relative overflow-hidden p-8 sm:p-10 rounded-[32px] bg-black/40 border border-white/20 backdrop-blur-2xl transition-all duration-300 hover:border-white/35 hover:bg-black/55 shadow-[0_24px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.2)] flex flex-col justify-between h-full">
                  {/* Top Specular Line */}
                  <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

                  <div>
                    {/* Icon Container */}
                    <div className="w-13 h-13 rounded-2xl bg-white/[0.08] border border-white/20 flex items-center justify-center mb-6 shadow-inner text-white group-hover:scale-105 transition-transform duration-300">
                      <Code className="w-6 h-6 text-white" />
                    </div>

                    <h3 className="text-2xl sm:text-3xl font-bold mb-3 text-white tracking-tight drop-shadow-sm">
                      Developer
                    </h3>
                    <p className="text-slate-100 text-sm sm:text-[15px] leading-relaxed mb-6 font-normal drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
                      Build frontend, backend, and full-stack features from a single prompt. Iterate faster
                      with AI-generated code, live preview, and a real coding workspace.
                    </p>

                    {/* Feature Pills — Crisp & Legible */}
                    <div className="flex flex-wrap gap-2 mb-8">
                      <span className="px-3.5 py-1.5 rounded-full bg-white/[0.12] border border-white/20 text-xs text-white font-medium backdrop-blur-md">
                        Full-Stack Code
                      </span>
                      <span className="px-3.5 py-1.5 rounded-full bg-white/[0.12] border border-white/20 text-xs text-white font-medium backdrop-blur-md">
                        Live Preview
                      </span>
                      <span className="px-3.5 py-1.5 rounded-full bg-white/[0.12] border border-white/20 text-xs text-white font-medium backdrop-blur-md">
                        WebContainer Runtime
                      </span>
                    </div>
                  </div>

                  {/* UI Style Matched White Pill Button */}
                  <div className="w-full h-12 rounded-full bg-white hover:bg-slate-200 text-black font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(255,255,255,0.25)] group-hover:scale-[1.01]">
                    Start as Developer
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. POWERFUL FEATURES SECTION
          ========================================================================= */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 relative z-10 scroll-mt-24 bg-transparent">
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#28282a] border border-white/20 text-xs font-medium text-white mb-4 shadow-[0_4px_14px_rgba(0,0,0,0.3)] backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Platform Capabilities
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mb-3 drop-shadow-md">
              Built for modern product teams
            </h2>
            <p className="text-white text-base sm:text-lg max-w-xl mx-auto leading-relaxed font-medium drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
              A single workspace for planning, building, and shipping software with less friction.
            </p>
          </motion.div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {features.map((feature, index) => (
              <motion.div key={index} variants={fadeInUp}>
                <div className="p-7 rounded-2xl bg-black/40 border border-white/15 backdrop-blur-xl hover:border-white/30 hover:bg-black/55 transition-all duration-300 shadow-[0_16px_40px_rgba(0,0,0,0.4)] group h-full flex flex-col justify-between">
                  <div>
                    <div className="w-11 h-11 rounded-xl bg-white/[0.08] border border-white/20 flex items-center justify-center mb-5 text-white group-hover:scale-105 transition-transform duration-300">
                      <feature.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold mb-2 text-white drop-shadow-sm">{feature.title}</h3>
                    <p className="text-slate-200 text-sm leading-relaxed drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* =========================================================================
          4. HOW IT WORKS SECTION
          ========================================================================= */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8 relative z-10 scroll-mt-24 bg-transparent">
        <div className="max-w-4xl mx-auto">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#28282a] border border-white/20 text-xs font-medium text-white mb-4 shadow-[0_4px_14px_rgba(0,0,0,0.3)] backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Execution Process
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mb-3 drop-shadow-md">
              From concept to launch
            </h2>
            <p className="text-white text-base sm:text-lg max-w-xl mx-auto leading-relaxed font-medium drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
              Three streamlined steps to turn an idea into a product-ready application.
            </p>
          </motion.div>

          <div className="space-y-6">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.12, duration: 0.45 }}
                className="relative"
              >
                <div className="p-7 rounded-2xl bg-black/40 border border-white/15 backdrop-blur-xl hover:border-white/30 hover:bg-black/55 transition-all duration-300 shadow-[0_16px_40px_rgba(0,0,0,0.4)] relative overflow-hidden group">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    {/* Retro Dot-Matrix Step Number */}
                    <div
                      className="flex-shrink-0 w-13 h-13 rounded-xl bg-white/[0.08] border border-white/20 flex items-center justify-center text-2xl font-bold text-white select-none shadow-inner"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {step.number}
                    </div>

                    <div className="flex-1">
                      <h3 className="text-lg font-bold mb-1.5 text-white drop-shadow-sm">
                        {step.title}
                      </h3>
                      <p className="text-slate-200 text-sm leading-relaxed drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bottom White Pill CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-14 text-center"
          >
            <Link
              href="/editor?view=developer"
              className="font-sans font-semibold text-sm text-black bg-white px-9 py-4 rounded-full inline-flex items-center justify-center gap-2 shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_24px_rgba(255,255,255,0.35)] hover:scale-105 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.3),0_0_36px_rgba(255,255,255,0.5)] transition-all duration-200"
            >
              <Rocket className="w-4 h-4" />
              Start Building Now
            </Link>
          </motion.div>
        </div>
      </section>

      {/* 5. Footer with High Contrast & UI Design Tokens */}
      <Footer />
    </div>
  );
}