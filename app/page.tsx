'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
      {/* 1. Interactive Glass Navbar with Auth Integration */}
      <Navbar />

      {/* 3. Hero Section */}
      <section className="relative z-10 pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto flex flex-col items-center text-center">
        <motion.div
          initial="initial"
          animate="animate"
          variants={staggerContainer}
          className="flex flex-col items-center max-w-3xl mx-auto"
        >
          {/* Badge */}
          <motion.div variants={fadeInUp} className="mb-5">
            <span
              className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-medium text-indigo-300 border border-indigo-400/25 shadow-[0_0_16px_rgba(99,102,241,0.2)]"
              style={{
                background:
                  'linear-gradient(180deg, rgba(99, 102, 241, 0.15) 0%, rgba(79, 70, 229, 0.05) 100%), rgba(10, 16, 30, 0.6)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              AI Product Studio
            </span>
          </motion.div>

          {/* Main Title — Proportionate, modern scale */}
          <motion.h1
            variants={fadeInUp}
            className="text-[1.5rem] sm:text-[2rem] md:text-[2.5rem] lg:text-[3rem] font-bold tracking-tight mb-4 leading-[1.02] max-w-3xl"
          >
            Turn ideas into{' '}
            <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              working software
            </span>
            <br />
            faster.
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeInUp}
            className="text-sm sm:text-base text-slate-300/85 max-w-xl mx-auto mb-8 leading-relaxed font-normal"
          >
            Describe a feature, app, or workflow in plain English. Codatron turns it into product plans,
            interactive UI, backend logic, and deployable code in one collaborative workspace.
          </motion.p>

          {/* Primary CTA Button */}
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-center gap-3">
            <Link
              href="/editor"
              className="relative group inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-full text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] shadow-2xl"
              style={{
                background:
                  'linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.05) 100%), rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.24)',
                boxShadow:
                  '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 0 24px rgba(99, 102, 241, 0.35)',
              }}
            >
              <span>Start building today</span>
              <svg
                className="w-3.5 h-3 text-white transition-transform duration-300 group-hover:translate-x-1"
                viewBox="0 0 16 11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M0 5.5 H14.6 M10.3 1.2 L14.9 5.5 L10.3 9.8" />
              </svg>
            </Link>
          </motion.div>

          {/* Prompt Feature Badges */}
          <motion.div
            variants={fadeInUp}
            className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 mt-10 max-w-2xl mx-auto"
          >
            {[
              'AI Product Planning',
              'Full-Stack Delivery',
              'Live Preview',
              'Ship Faster',
            ].map((feat, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-md text-xs text-slate-300 font-medium hover:border-white/20 hover:text-white transition-all duration-200"
              >
                <svg
                  className="w-2.5 h-2.5 text-indigo-400"
                  viewBox="0 0 11 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1.15 1.15 L9.6 10 L1.15 18.85" />
                </svg>
                <span>{feat}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* 4. Choose Your Role Section */}
      <section id="roles" className="py-20 px-4 sm:px-6 lg:px-8 relative z-10 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 tracking-tight">
              Choose your workflow
            </h2>
            <p className="text-slate-400 text-sm max-w-lg mx-auto">
              Go from strategy to shipping code with the workflow built for your role.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Product Manager */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.3 }}
            >
              <Link href="/product" className="block h-full group">
                <Card className="relative overflow-hidden p-7 h-full bg-gradient-to-br from-white/[0.06] to-white/[0.01] backdrop-blur-2xl border border-white/10 hover:border-blue-500/50 transition-all duration-300">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                  <div className="relative z-10 flex flex-col h-full justify-between">
                    <div>
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-5 shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform duration-300">
                        <Briefcase className="w-6 h-6 text-white" />
                      </div>

                      <h3 className="text-xl font-bold mb-2 text-white">Product Manager</h3>
                      <p className="text-slate-400 text-xs sm:text-sm leading-relaxed mb-6 max-w-[28rem]">
                        Turn ideas into product direction, structured requirements, user stories, and a clear
                        roadmap before a single line of code is written.
                      </p>
                    </div>

                    <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 text-sm rounded-xl transition-all duration-200">
                      Start as Product Manager
                      <ArrowRight className="ml-2 w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Button>
                  </div>
                </Card>
              </Link>
            </motion.div>

            {/* Developer */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.3 }}
            >
              <Link href="/developer" className="block h-full group">
                <Card className="relative overflow-hidden p-7 h-full bg-gradient-to-br from-white/[0.06] to-white/[0.01] backdrop-blur-2xl border border-white/10 hover:border-purple-500/50 transition-all duration-300">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                  <div className="relative z-10 flex flex-col h-full justify-between">
                    <div>
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mb-5 shadow-md shadow-purple-500/20 group-hover:scale-105 transition-transform duration-300">
                        <Code className="w-6 h-6 text-white" />
                      </div>

                      <h3 className="text-xl font-bold mb-2 text-white">Developer</h3>
                      <p className="text-slate-400 text-xs sm:text-sm leading-relaxed mb-6 max-w-[28rem]">
                        Build frontend, backend, and full-stack features from a single prompt. Iterate faster
                        with AI-generated code, live preview, and a real coding workspace.
                      </p>
                    </div>

                    <Button className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 text-sm rounded-xl transition-all duration-200">
                      Start as Developer
                      <ArrowRight className="ml-2 w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Button>
                  </div>
                </Card>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 5. Powerful Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 relative z-10 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 tracking-tight">
              Built for modern product teams
            </h2>
            <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto">
              A single workspace for planning, building, and shipping software with less friction.
            </p>
          </motion.div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {features.map((feature, index) => (
              <motion.div key={index} variants={fadeInUp}>
                <Card className="p-5 sm:p-6 bg-gradient-to-br from-white/[0.05] to-white/[0.01] backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all duration-300 group hover:scale-[1.01] h-full">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                    <feature.icon className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold mb-1.5 text-white">{feature.title}</h3>
                  <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">{feature.description}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* 6. How It Works Section */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 relative z-10 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 tracking-tight">
              From concept to launch
            </h2>
            <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto">
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
                {index < steps.length - 1 && (
                  <div className="hidden sm:block absolute left-10 top-20 w-0.5 h-14 bg-gradient-to-b from-indigo-500 to-purple-500/20" />
                )}

                <Card className="p-5 sm:p-7 bg-gradient-to-br from-white/[0.05] to-white/[0.01] backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-blue-500/20 via-indigo-500/30 to-purple-500/20 border border-white/15 flex items-center justify-center text-lg sm:text-xl font-bold text-white shadow-inner">
                      {step.number}
                    </div>

                    <div className="flex-1">
                      <h3 className="text-base sm:text-lg font-bold mb-1 text-white">
                        {step.title}
                      </h3>
                      <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 text-center"
          >
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/25 transition-all duration-300 hover:scale-105 text-sm sm:text-base px-7 py-5 rounded-full"
            >
              <Link href="/editor">
                <Rocket className="mr-2 w-4 h-4" />
                Start building
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* 7. Footer */}
      <Footer />
    </div>
  );
}