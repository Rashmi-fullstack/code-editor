'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
  Send,
  ArrowUp,
  RotateCcw,
  Trash2,
  Copy,
  Download,
  Check,
  CheckCircle2,
  AlertCircle,
  Edit2,
  X,
  Layers,
  Compass,
  Code2,
  Database,
  Server,
  Globe,
  Users,
  Calendar,
  ListTodo,
  Shield,
  Zap,
  Brain,
  FileText,
  RefreshCw,
  ArrowRight,
  Clock,
  Target,
  Cpu,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import type { Project } from '@/lib/types/database';
import { isRealPlan } from '@/lib/db/product';
import type {
  ProductPlan,
  PrioritizedFeature,
  TechStackItem,
  TimelinePhase,
} from '@/lib/ai/product-planner';
import type { PmSection } from './product-workspace';

export type GenerationStatus =
  | 'IDLE'
  | 'ANALYZING'
  | 'GENERATING'
  | 'SUCCESS'
  | 'FAILED'
  | 'RATE_LIMITED'
  | 'INVALID_RESPONSE'
  | 'PROVIDER_UNAVAILABLE';

export interface OverviewWorkspaceProps {
  project: Project | null;
  productPlan: ProductPlan | null;
  workspaceName?: string;
  lastSavedAt?: Date | null;
  filesCount?: number;
  generationStatus?: GenerationStatus;
  generationError?: {
    message: string;
    code?: string;
    status?: number;
    provider?: string;
  } | null;
  onNavigateSection?: (section: PmSection) => void;
  onExecuteAiCommand: (prompt: string) => Promise<ProductPlan | void> | void;
  onRetryGeneration?: () => void;
  onOpenIdeaModal?: () => void;
  onRenameWorkspace?: (newName: string) => Promise<void> | void;
}

export type PlanTabId =
  | 'overview'
  | 'features'
  | 'architecture'
  | 'tech-stack'
  | 'timeline'
  | 'team'
  | 'ai-plan';

export interface PmChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  status?: 'loading' | 'success' | 'error';
  error?: string;
  planSummary?: {
    title: string;
    summary: string;
    featuresCount: number;
    stackCount: number;
    phasesCount: number;
    teamCount: number;
  };
}

export function OverviewWorkspace({
  project,
  productPlan,
  workspaceName,
  lastSavedAt,
  generationStatus = 'IDLE',
  generationError = null,
  onNavigateSection,
  onExecuteAiCommand,
  onRetryGeneration,
  onRenameWorkspace,
}: OverviewWorkspaceProps) {
  // Mobile / Small Screen view toggle: 'planner' | 'plan'
  const [mobileActiveView, setMobileActiveView] = useState<'planner' | 'plan'>('planner');

  // Active Tab in Right Panel
  const [activePlanTab, setActivePlanTab] = useState<PlanTabId>('overview');

  // Conversational chat state
  const [messages, setMessages] = useState<PmChatMessage[]>(() => {
    if (typeof window !== 'undefined' && project?.id) {
      try {
        const cached = localStorage.getItem(`codatron_pm_chat_${project.id}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {}
    }
    return [];
  });

  const [promptInput, setPromptInput] = useState('');
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isGenerating =
    generationStatus === 'ANALYZING' || generationStatus === 'GENERATING';

  const hasPlan = Boolean(productPlan && isRealPlan(productPlan));

  const displayProductName = useMemo(() => {
    const raw =
      workspaceName || productPlan?.vision?.workspaceName || 'Untitled Product Plan';
    if (raw.toLowerCase() === 'netflix') return 'Untitled Product Plan';
    return raw;
  }, [workspaceName, productPlan]);

  // Persist conversation to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && project?.id) {
      try {
        if (messages.length > 0) {
          localStorage.setItem(
            `codatron_pm_chat_${project.id}`,
            JSON.stringify(messages)
          );
        } else {
          localStorage.removeItem(`codatron_pm_chat_${project.id}`);
        }
      } catch {}
    }
  }, [messages, project?.id]);

  // Scroll to bottom of message list on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPromptInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        180
      )}px`;
    }
  };

  const handleClearConversation = () => {
    setMessages([]);
    if (typeof window !== 'undefined' && project?.id) {
      try {
        localStorage.removeItem(`codatron_pm_chat_${project.id}`);
      } catch {}
    }
    toast.success('Conversation cleared');
  };

  const handleSubmitPrompt = async (textToSend?: string) => {
    const text = (textToSend || promptInput).trim();
    if (!text || isGenerating) return;

    setLastSubmittedPrompt(text);
    setPromptInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMsgId = `user-${Date.now()}`;
    const asstMsgId = `asst-${Date.now()}`;

    const userMessage: PmChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const loadingAssistantMessage: PmChatMessage = {
      id: asstMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'loading',
    };

    setMessages((prev) => [...prev, userMessage, loadingAssistantMessage]);

    try {
      const generated = await onExecuteAiCommand(text);

      const targetPlan = generated || productPlan;
      const summaryText =
        targetPlan?.overview?.summary ||
        targetPlan?.vision?.purpose ||
        'Your product plan has been generated with complete architecture, features, tech stack, and execution roadmap.';

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === asstMsgId) {
            return {
              ...msg,
              status: 'success',
              content: summaryText,
              planSummary: {
                title:
                  targetPlan?.vision?.workspaceName ||
                  workspaceName ||
                  'Product Blueprint',
                summary: summaryText,
                featuresCount: targetPlan?.features?.length || 0,
                stackCount: targetPlan?.recommendedStack?.length || 0,
                phasesCount:
                  targetPlan?.timeline?.phases?.length ||
                  targetPlan?.roadmap?.length ||
                  0,
                teamCount: targetPlan?.teamRequirement?.roles?.length || 0,
              },
            };
          }
          return msg;
        })
      );

      // On mobile switch to the newly generated plan view
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setMobileActiveView('plan');
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Unable to generate your product plan. Your existing saved data has been preserved. Check your AI provider settings and try again.';

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === asstMsgId) {
            return {
              ...msg,
              status: 'error',
              error: errorMsg,
              content: errorMsg,
            };
          }
          return msg;
        })
      );
    }
  };

  const handleRetryLast = () => {
    if (lastSubmittedPrompt) {
      void handleSubmitPrompt(lastSubmittedPrompt);
    } else if (onRetryGeneration) {
      onRetryGeneration();
    }
  };

  const handleExportPlanJson = () => {
    if (!productPlan) {
      toast.error('No product plan to export yet.');
      return;
    }
    const blob = new Blob([JSON.stringify(productPlan, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = displayProductName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    a.download = `${safeName || 'product'}-plan.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded product plan JSON');
  };

  const handleExportPlanMarkdown = () => {
    if (!productPlan) {
      toast.error('No product plan to export yet.');
      return;
    }
    let md = `# Product Plan: ${displayProductName}\n\n`;
    if (productPlan.overview?.summary) {
      md += `## Executive Summary\n${productPlan.overview.summary}\n\n`;
    }
    if (productPlan.vision?.purpose) {
      md += `## Vision & Purpose\n${productPlan.vision.purpose}\n\n`;
    }
    if (productPlan.vision?.valueProposition) {
      md += `### Value Proposition\n${productPlan.vision.valueProposition}\n\n`;
    }
    if (productPlan.features && productPlan.features.length > 0) {
      md += `## MVP & Features Backlog\n`;
      productPlan.features.forEach((f) => {
        md += `- **${f.title}** [${f.priority.toUpperCase()}]: ${f.description}\n`;
      });
      md += `\n`;
    }
    if (productPlan.technicalArchitecture?.overview) {
      md += `## Technical Architecture\n${productPlan.technicalArchitecture.overview}\n\n`;
    }
    if (productPlan.recommendedStack && productPlan.recommendedStack.length > 0) {
      md += `## Recommended Technology Stack\n`;
      productPlan.recommendedStack.forEach((s) => {
        md += `- **${s.category}: ${s.technology}**: ${s.why}\n`;
      });
      md += `\n`;
    }
    if (productPlan.timeline?.phases && productPlan.timeline.phases.length > 0) {
      md += `## Timeline & Phases\n`;
      productPlan.timeline.phases.forEach((p) => {
        md += `- **${p.phase}** (${p.duration}): ${p.focus}\n`;
      });
      md += `\n`;
    }
    if (productPlan.teamRequirement?.roles && productPlan.teamRequirement.roles.length > 0) {
      md += `## Team Requirements\n`;
      productPlan.teamRequirement.roles.forEach((r) => {
        md += `- ${r.role}: ${r.count}\n`;
      });
      md += `\n`;
    }
    if (productPlan.aiAssistance?.summary) {
      md += `## AI Strategy & Assistance\n${productPlan.aiAssistance.summary}\n\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = displayProductName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    a.download = `${safeName || 'product'}-plan.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded product plan Markdown');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0c] text-slate-100 overflow-hidden relative">
      {/* Mobile Top View Switcher */}
      <div className="lg:hidden flex items-center justify-between px-4 py-2 bg-black/60 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1.5 p-1 bg-white/[0.05] rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setMobileActiveView('planner')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              mobileActiveView === 'planner'
                ? 'bg-white text-black shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            💬 AI Planner
          </button>
          <button
            type="button"
            onClick={() => setMobileActiveView('plan')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              mobileActiveView === 'plan'
                ? 'bg-white text-black shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📋 Project Plan
          </button>
        </div>

        {hasPlan && (
          <Badge
            variant="outline"
            className="text-[10px] text-emerald-300 border-emerald-500/30 bg-emerald-500/10 font-mono"
          >
            Plan Ready
          </Badge>
        )}
      </div>

      {/* Main Two-Panel Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ========================================================================= */}
        {/* CENTER PANEL: Conversational AI Product Planner                           */}
        {/* ========================================================================= */}
        <section
          className={`flex-1 flex flex-col min-w-0 h-full border-r border-white/10 bg-[#0c0d12] relative ${
            mobileActiveView === 'planner' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Header */}
          <div className="h-14 px-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/40 backdrop-blur-md z-10">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-sm overflow-hidden shrink-0">
                <img
                  src="/assets/logo.webp"
                  alt="Codatron"
                  className="h-5 w-5 object-contain"
                />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white tracking-tight truncate">
                    AI Product Planner
                  </h2>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                    Codatron.ai
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  Turn your idea into a clear product plan.
                </p>
              </div>
            </div>

            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearConversation}
                className="h-8 px-2.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg gap-1.5"
                title="Clear current conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Clear Conversation</span>
              </Button>
            )}
          </div>

          {/* Conversation Stream */}
          <ScrollArea className="flex-1 p-4 sm:p-6 overflow-y-auto">
            <div className="max-w-2xl mx-auto space-y-5 pb-6">
              {/* Empty State / Welcome Screen */}
              {messages.length === 0 && (
                <div className="pt-6 sm:pt-10 text-center space-y-6">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-inner">
                    <Sparkles className="h-6 w-6" />
                  </div>

                  <div className="space-y-2 max-w-md mx-auto">
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      What are you planning to build?
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Describe your product idea, audience, or core requirements.
                      Codatron will interpret your request and generate a complete,
                      structured product blueprint.
                    </p>
                  </div>
                </div>
              )}

              {/* Chat Messages */}
              {messages.map((msg) => {
                const isUser = msg.role === 'user';

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 ${
                      isUser ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`h-7 w-7 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                        isUser
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-black shadow-sm'
                      }`}
                    >
                      {isUser ? (
                        <Users className="h-3.5 w-3.5" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                    </div>

                    {/* Bubble Content */}
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 text-xs space-y-2.5 ${
                        isUser
                          ? 'bg-indigo-600/90 text-white border border-indigo-500/40'
                          : 'bg-white/[0.04] text-slate-200 border border-white/10'
                      }`}
                    >
                      {/* User Text */}
                      {isUser && (
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </p>
                      )}

                      {/* AI Loading State */}
                      {!isUser && msg.status === 'loading' && (
                        <div className="space-y-2 py-1">
                          <div className="flex items-center gap-2 text-indigo-400 font-semibold">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>
                              {generationStatus === 'ANALYZING'
                                ? 'Analyzing product requirements…'
                                : 'Synthesizing architecture & roadmap…'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Evaluating features, technology stack, timeline phases, and team
                            structure tailored to your request.
                          </p>
                        </div>
                      )}

                      {/* AI Error State */}
                      {!isUser && msg.status === 'error' && (
                        <div className="space-y-3 py-1">
                          <div className="flex items-center gap-2 text-rose-400 font-bold">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>Could Not Generate Product Plan</span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            {msg.error ||
                              'Unable to generate your product plan. Your existing saved data has been preserved. Check your AI provider settings and try again.'}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleRetryLast}
                            className="h-7 text-xs border-rose-500/30 hover:bg-rose-500/20 text-rose-200 gap-1.5"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Retry
                          </Button>
                        </div>
                      )}

                      {/* AI Success Content & Plan Summary Card */}
                      {!isUser && msg.status !== 'loading' && msg.status !== 'error' && (
                        <div className="space-y-3">
                          <p className="leading-relaxed text-slate-200">
                            {msg.content}
                          </p>

                          {/* Result Card */}
                          {msg.planSummary && (
                            <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3.5 space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-white truncate text-xs flex items-center gap-1.5">
                                  <Compass className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                                  <span>{msg.planSummary.title}</span>
                                </span>
                                <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px] shrink-0 border-emerald-500/30">
                                  ✓ Blueprint Saved
                                </Badge>
                              </div>

                              {/* Metric Chips */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                                <div className="p-1.5 rounded-lg bg-black/40 border border-white/5 text-center">
                                  <span className="text-slate-400 block">Features</span>
                                  <span className="font-bold text-white">
                                    {msg.planSummary.featuresCount}
                                  </span>
                                </div>
                                <div className="p-1.5 rounded-lg bg-black/40 border border-white/5 text-center">
                                  <span className="text-slate-400 block">Tech Stack</span>
                                  <span className="font-bold text-white">
                                    {msg.planSummary.stackCount}
                                  </span>
                                </div>
                                <div className="p-1.5 rounded-lg bg-black/40 border border-white/5 text-center">
                                  <span className="text-slate-400 block">Phases</span>
                                  <span className="font-bold text-white">
                                    {msg.planSummary.phasesCount}
                                  </span>
                                </div>
                                <div className="p-1.5 rounded-lg bg-black/40 border border-white/5 text-center">
                                  <span className="text-slate-400 block">Team Roles</span>
                                  <span className="font-bold text-white">
                                    {msg.planSummary.teamCount}
                                  </span>
                                </div>
                              </div>

                              {/* Action Links to Inspect Sections */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActivePlanTab('overview');
                                    setMobileActiveView('plan');
                                  }}
                                  className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-white transition"
                                >
                                  View Overview
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActivePlanTab('features');
                                    setMobileActiveView('plan');
                                  }}
                                  className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-white transition"
                                >
                                  Inspect Features
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActivePlanTab('architecture');
                                    setMobileActiveView('plan');
                                  }}
                                  className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-white transition"
                                >
                                  View Architecture
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActivePlanTab('tech-stack');
                                    setMobileActiveView('plan');
                                  }}
                                  className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-white transition"
                                >
                                  Tech Stack
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActivePlanTab('timeline');
                                    setMobileActiveView('plan');
                                  }}
                                  className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-white transition"
                                >
                                  Timeline
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <span
                        className={`text-[9px] block text-right pt-0.5 ${
                          isUser ? 'text-indigo-200/80' : 'text-slate-500'
                        }`}
                      >
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Error Banner when generation fails */}
          {generationError && !isGenerating && (
            <div className="mx-4 mb-2 p-3 rounded-xl border border-rose-500/30 bg-rose-950/20 text-xs flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-rose-300 min-w-0">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <span className="truncate">
                  {generationError.message ||
                    'Generation failed. Your saved data is preserved.'}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetryLast}
                className="h-7 text-xs border-rose-500/30 hover:bg-rose-500/20 text-rose-200 shrink-0 gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            </div>
          )}

          {/* Anchored Bottom Composer */}
          <div className="p-3 sm:p-4 border-t border-white/10 bg-black/60 backdrop-blur-xl shrink-0">
            <div className="max-w-2xl mx-auto space-y-1.5">
              <div className="relative rounded-2xl border border-white/15 bg-white/[0.04] focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/30 transition shadow-lg overflow-hidden">
                <textarea
                  ref={textareaRef}
                  value={promptInput}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSubmitPrompt();
                    }
                  }}
                  disabled={isGenerating}
                  rows={2}
                  placeholder="Describe your product idea or refinement… (Press Enter to send, Shift+Enter for new line)"
                  className="w-full resize-none bg-transparent px-4 py-3 text-xs text-white placeholder:text-slate-500 focus:outline-none leading-relaxed"
                />

                <div className="flex items-center justify-between px-3 py-2 border-t border-white/5 bg-black/20">
                  <span className="text-[10px] text-slate-500 hidden sm:inline">
                    Shift + Enter for new line
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSubmitPrompt()}
                      disabled={!promptInput.trim() || isGenerating}
                      className="h-8 px-3.5 rounded-xl bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5 shadow-sm disabled:opacity-40"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Planning…</span>
                        </>
                      ) : (
                        <>
                          <span>Send</span>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* RIGHT PANEL: Structured Project Plan Summary & Tabs                       */}
        {/* ========================================================================= */}
        <section
          className={`flex-1 flex flex-col min-w-0 h-full bg-[#0a0a0f] relative ${
            mobileActiveView === 'plan' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Header */}
          <div className="h-14 px-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/40 backdrop-blur-md z-10">
            {/* Canonical Product Plan Title */}
            <div className="flex items-center gap-2.5 min-w-0">
              <h3 className="text-sm font-bold text-white tracking-tight truncate">
                {displayProductName}
              </h3>

              {/* Status Badge */}
              <Badge
                variant="outline"
                className={`text-[10px] shrink-0 font-medium ${
                  isGenerating
                    ? 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10'
                    : hasPlan
                    ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                    : 'border-white/10 text-slate-400 bg-white/5'
                }`}
              >
                {isGenerating
                  ? 'Generating…'
                  : hasPlan
                  ? 'Live Plan'
                  : 'No Plan Drafted'}
              </Badge>
            </div>

            {/* Export Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPlanMarkdown}
                disabled={!hasPlan}
                className="h-8 px-2.5 rounded-lg border-white/10 bg-white/5 hover:bg-white/10 text-xs text-slate-300 gap-1.5 disabled:opacity-40"
                title="Export as Markdown"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export Plan</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPlanJson}
                disabled={!hasPlan}
                className="h-8 px-2.5 rounded-lg border-white/10 bg-white/5 hover:bg-white/10 text-xs text-slate-300 gap-1 disabled:opacity-40"
                title="Export JSON"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">JSON</span>
              </Button>
            </div>
          </div>

          {/* Compact Tabs Bar */}
          <div className="px-4 py-2 border-b border-white/10 bg-black/20 shrink-0 overflow-x-auto">
            <div className="flex items-center gap-1 min-w-max">
              {[
                { id: 'overview', label: 'Overview', icon: Compass },
                {
                  id: 'features',
                  label: 'Features',
                  icon: Target,
                  badge: productPlan?.features?.length,
                },
                { id: 'architecture', label: 'Architecture', icon: Server },
                {
                  id: 'tech-stack',
                  label: 'Tech Stack',
                  icon: Code2,
                  badge: productPlan?.recommendedStack?.length,
                },
                {
                  id: 'timeline',
                  label: 'Timeline',
                  icon: Calendar,
                  badge:
                    productPlan?.timeline?.phases?.length ||
                    productPlan?.roadmap?.length,
                },
                {
                  id: 'team',
                  label: 'Team',
                  icon: Users,
                  badge: productPlan?.teamRequirement?.roles?.length,
                },
                { id: 'ai-plan', label: 'AI Plan', icon: Brain },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activePlanTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActivePlanTab(tab.id as PlanTabId)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isActive
                        ? 'bg-white text-black shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                          isActive
                            ? 'bg-black/10 text-black'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Tab Content */}
          <ScrollArea className="flex-1 p-5 sm:p-6 overflow-y-auto">
            <div className="max-w-3xl mx-auto space-y-6 pb-12">
              {/* If no plan drafted yet, show helpful empty state */}
              {!hasPlan || !productPlan ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center space-y-4 my-10">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-slate-400">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="space-y-1.5 max-w-sm mx-auto">
                    <h4 className="text-sm font-bold text-white">
                      Your product plan will appear here after you submit an idea.
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Enter your product idea in the AI Product Planner on the
                      left to generate your complete architecture and specification.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setMobileActiveView('planner');
                      textareaRef.current?.focus();
                    }}
                    className="bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Enter Your Product Idea</span>
                  </Button>
                </div>
              ) : (
                <>
                  {/* TAB 1: OVERVIEW */}
                  {activePlanTab === 'overview' && (
                    <div className="space-y-5">
                      {/* Executive Summary */}
                      <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                          Executive Product Summary
                        </span>
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {productPlan.overview?.summary ||
                            productPlan.vision?.purpose ||
                            'No executive summary specified.'}
                        </p>
                      </div>

                      {/* Problem & Solution Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-rose-500/20 bg-rose-950/10 p-4 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">
                            Problem Being Solved
                          </span>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {productPlan.overview?.problemSolved ||
                              productPlan.vision?.purpose ||
                              'None specified.'}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                            Proposed Solution
                          </span>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {productPlan.overview?.proposedSolution ||
                              productPlan.vision?.targetOutcome ||
                              'None specified.'}
                          </p>
                        </div>
                      </div>

                      {/* Target Audience & Value Prop */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-4 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 block">
                            Target Audience
                          </span>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {productPlan.overview?.targetAudience ||
                              'None specified.'}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-4 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                            Core Value Proposition
                          </span>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {productPlan.vision?.valueProposition ||
                              productPlan.overview?.keyDifferentiator ||
                              'None specified.'}
                          </p>
                        </div>
                      </div>

                      {/* Assumptions */}
                      {productPlan.assumptions && productPlan.assumptions.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Key Planning Assumptions
                          </span>
                          <div className="space-y-2">
                            {productPlan.assumptions.map((a, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-slate-300 space-y-1"
                              >
                                <span className="font-semibold text-white block">
                                  {a.userRequirement}
                                </span>
                                <span className="text-[11px] text-slate-400 block">
                                  AI interpretation: {a.aiInterpretation}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Key Risks & Mitigations */}
                      {productPlan.risks && productPlan.risks.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Key Risks & Mitigation Strategy
                          </span>
                          <div className="space-y-2">
                            {productPlan.risks.map((r, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-white">
                                    {r.risk}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] ${
                                      r.level === 'High'
                                        ? 'border-rose-500/40 text-rose-300 bg-rose-500/10'
                                        : r.level === 'Medium'
                                        ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                                        : 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                                    }`}
                                  >
                                    {r.level} Risk
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-slate-400">
                                  Mitigation: {r.mitigation}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: FEATURES */}
                  {activePlanTab === 'features' && (
                    <div className="space-y-5">
                      {/* MVP Boundaries Summary */}
                      {productPlan.mvp && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                              Must-Have for MVP ({productPlan.mvp.mustHave?.length || 0})
                            </span>
                            <ul className="space-y-1.5 text-xs text-slate-200">
                              {(productPlan.mvp.mustHave || []).map((item, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4 space-y-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                              Scope Exclusions ({productPlan.mvp.exclusions?.length || 0})
                            </span>
                            <ul className="space-y-1.5 text-xs text-slate-200">
                              {(productPlan.mvp.exclusions || []).map((item, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {/* Feature Cards Backlog */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Features Backlog ({productPlan.features?.length || 0})
                          </span>
                          {onNavigateSection && (
                            <button
                              type="button"
                              onClick={() => onNavigateSection('features')}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                            >
                              Manage Features in Full View →
                            </button>
                          )}
                        </div>

                        {productPlan.features && productPlan.features.length > 0 ? (
                          productPlan.features.map((feat) => (
                            <div
                              key={feat.id}
                              className="rounded-2xl border border-white/10 bg-[#0e101b] p-4 space-y-2 hover:border-white/20 transition"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="text-xs font-bold text-white">
                                  {feat.title}
                                </h4>
                                <div className="flex items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] uppercase font-mono ${
                                      feat.priority === 'high'
                                        ? 'border-rose-500/40 text-rose-300 bg-rose-500/10'
                                        : feat.priority === 'medium'
                                        ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                                        : 'border-slate-500/40 text-slate-300 bg-white/5'
                                    }`}
                                  >
                                    {feat.priority}
                                  </Badge>
                                  {feat.complexity && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] border-white/10 text-slate-400"
                                    >
                                      {feat.complexity}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-slate-300 leading-relaxed">
                                {feat.description}
                              </p>
                              {feat.acceptanceCriteria && feat.acceptanceCriteria.length > 0 && (
                                <div className="pt-1 border-t border-white/5 text-[11px] text-slate-400">
                                  <span className="font-semibold text-slate-300 block mb-1">
                                    Acceptance Criteria:
                                  </span>
                                  <ul className="list-disc list-inside space-y-0.5">
                                    {feat.acceptanceCriteria.map((ac, idx) => (
                                      <li key={idx}>{ac}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="p-6 rounded-2xl border border-white/10 bg-[#0e101b] text-center text-xs text-slate-400">
                            No features defined yet. Ask the planner to generate features.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: ARCHITECTURE */}
                  {activePlanTab === 'architecture' && (
                    <div className="space-y-5">
                      {/* Overview */}
                      <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                          Application Architecture Overview
                        </span>
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {productPlan.technicalArchitecture?.overview ||
                            'Proposed high-level architectural design for frontend, backend, database, and integrations.'}
                        </p>
                      </div>

                      {/* Architecture Flow Diagram */}
                      <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            System Flow & Communication Diagram
                          </span>
                          <span className="text-[10px] text-indigo-400 font-mono">
                            Interactive Flow
                          </span>
                        </div>

                        {/* Visual Node Flow */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="p-4 rounded-xl bg-black/40 border border-indigo-500/30 text-center space-y-1">
                            <span className="text-xs font-bold text-white block">
                              Client Layer
                            </span>
                            <span className="text-[11px] text-indigo-300 block">
                              Next.js 15 App Router · React · Tailwind
                            </span>
                          </div>
                          <div className="p-4 rounded-xl bg-black/40 border border-purple-500/30 text-center space-y-1">
                            <span className="text-xs font-bold text-white block">
                              API & Middleware
                            </span>
                            <span className="text-[11px] text-purple-300 block">
                              Route Handlers · Auth Verification · Webhooks
                            </span>
                          </div>
                          <div className="p-4 rounded-xl bg-black/40 border border-cyan-500/30 text-center space-y-1">
                            <span className="text-xs font-bold text-white block">
                              Data & Storage
                            </span>
                            <span className="text-[11px] text-cyan-300 block">
                              PostgreSQL / Supabase · Storage Buckets
                            </span>
                          </div>
                        </div>

                        {/* Specific flow connections */}
                        {productPlan.technicalArchitecture?.diagramFlow &&
                          productPlan.technicalArchitecture.diagramFlow.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                              {productPlan.technicalArchitecture.diagramFlow.map(
                                (flow, idx) => (
                                  <div
                                    key={idx}
                                    className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs"
                                  >
                                    <div className="flex items-center gap-2 text-slate-200">
                                      <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-semibold text-white">
                                        {flow.from}
                                      </span>
                                      <ArrowRight className="h-3 w-3 text-slate-500 shrink-0" />
                                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-[10px] font-semibold text-indigo-300">
                                        {flow.to}
                                      </span>
                                    </div>
                                    {flow.label && (
                                      <span className="text-[10px] text-slate-400 italic">
                                        {flow.label}
                                      </span>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          )}
                      </div>

                      {/* Layers Breakdown */}
                      {productPlan.technicalArchitecture?.layers &&
                        productPlan.technicalArchitecture.layers.length > 0 && (
                          <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              Component Layers & Boundaries
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {productPlan.technicalArchitecture.layers.map(
                                (layer, idx) => (
                                  <div
                                    key={idx}
                                    className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5"
                                  >
                                    <span className="text-xs font-bold text-white block">
                                      {layer.name}
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {layer.components.map((c, cIdx) => (
                                        <Badge
                                          key={cIdx}
                                          variant="outline"
                                          className="text-[10px] bg-white/5 border-white/10 text-slate-300"
                                        >
                                          {c}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  )}

                  {/* TAB 4: TECH STACK */}
                  {activePlanTab === 'tech-stack' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Recommended Stack ({productPlan.recommendedStack?.length || 0})
                        </span>
                      </div>

                      {productPlan.recommendedStack &&
                      productPlan.recommendedStack.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3">
                          {productPlan.recommendedStack.map((item, idx) => (
                            <div
                              key={idx}
                              className="rounded-2xl border border-white/10 bg-[#0e101b] p-4 space-y-2 hover:border-white/20 transition"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white">
                                    {item.technology}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] border-indigo-500/30 text-indigo-300 bg-indigo-500/10"
                                  >
                                    {item.category}
                                  </Badge>
                                </div>
                                {item.mvpEssential && (
                                  <Badge className="bg-emerald-500/20 text-emerald-300 text-[9px] border-emerald-500/30">
                                    MVP Essential
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-300 leading-relaxed">
                                <span className="font-semibold text-slate-400">Why: </span>
                                {item.why}
                              </p>
                              {(item.alternative || item.tradeoffs) && (
                                <div className="text-[11px] text-slate-400 pt-1 border-t border-white/5 space-y-0.5">
                                  {item.alternative && (
                                    <p>Alternative: {item.alternative}</p>
                                  )}
                                  {item.tradeoffs && (
                                    <p>Trade-offs: {item.tradeoffs}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 rounded-2xl border border-white/10 bg-[#0e101b] text-center text-xs text-slate-400">
                          No tech stack recommendations defined yet.
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 5: TIMELINE */}
                  {activePlanTab === 'timeline' && (
                    <div className="space-y-5">
                      {productPlan.timeline?.totalMvpWeeks && (
                        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-4 flex items-center justify-between">
                          <span className="text-xs font-bold text-white">
                            Estimated Total MVP Duration
                          </span>
                          <Badge className="bg-indigo-600 text-white font-mono text-xs">
                            {productPlan.timeline.totalMvpWeeks}
                          </Badge>
                        </div>
                      )}

                      {/* Phases */}
                      <div className="space-y-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Phased Implementation Schedule
                        </span>

                        {productPlan.timeline?.phases &&
                        productPlan.timeline.phases.length > 0 ? (
                          productPlan.timeline.phases.map((phase, idx) => (
                            <div
                              key={idx}
                              className="rounded-2xl border border-white/10 bg-[#0e101b] p-4 flex items-start gap-4"
                            >
                              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-bold text-xs border border-indigo-500/20 shrink-0">
                                {idx + 1}
                              </span>
                              <div className="space-y-1 flex-1 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className="font-bold text-white">
                                    {phase.phase}
                                  </h4>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono text-slate-300 border-white/10"
                                  >
                                    {phase.duration}
                                  </Badge>
                                </div>
                                <p className="text-slate-300 leading-relaxed">
                                  {phase.focus}
                                </p>
                              </div>
                            </div>
                          ))
                        ) : productPlan.roadmap && productPlan.roadmap.length > 0 ? (
                          productPlan.roadmap.map((m, idx) => (
                            <div
                              key={idx}
                              className="rounded-2xl border border-white/10 bg-[#0e101b] p-4 flex items-start gap-4"
                            >
                              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-bold text-xs border border-indigo-500/20 shrink-0">
                                {idx + 1}
                              </span>
                              <div className="space-y-1 flex-1 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className="font-bold text-white">
                                    {m.milestone}
                                  </h4>
                                  {m.targetWeek && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] font-mono text-slate-300 border-white/10"
                                    >
                                      {m.targetWeek}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-slate-300 leading-relaxed">
                                  {m.description}
                                </p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-6 rounded-2xl border border-white/10 bg-[#0e101b] text-center text-xs text-slate-400">
                            No timeline phases generated yet.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 6: TEAM */}
                  {activePlanTab === 'team' && (
                    <div className="space-y-5">
                      {productPlan.teamRequirement?.total !== undefined && (
                        <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-4 flex items-center justify-between">
                          <span className="text-xs font-bold text-white">
                            Suggested Team Size
                          </span>
                          <Badge className="bg-white text-black font-semibold text-xs">
                            {productPlan.teamRequirement.total} People
                          </Badge>
                        </div>
                      )}

                      {/* Roles */}
                      <div className="space-y-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Recommended Roles
                        </span>

                        {productPlan.teamRequirement?.roles &&
                        productPlan.teamRequirement.roles.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {productPlan.teamRequirement.roles.map((r, idx) => (
                              <div
                                key={idx}
                                className="p-3.5 rounded-xl border border-white/10 bg-[#0e101b] flex items-center justify-between text-xs"
                              >
                                <span className="font-semibold text-white">
                                  {r.role}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-mono border-indigo-500/30 text-indigo-300"
                                >
                                  {r.count} {r.count > 1 ? 'people' : 'person'}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-6 rounded-2xl border border-white/10 bg-[#0e101b] text-center text-xs text-slate-400">
                            No team roles recommended yet.
                          </div>
                        )}
                      </div>

                      {/* Composition Notes */}
                      {productPlan.teamRequirement?.mvpTeam && (
                        <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-4 space-y-1.5 text-xs">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            MVP Team Composition
                          </span>
                          <p className="text-slate-300 leading-relaxed">
                            {productPlan.teamRequirement.mvpTeam}
                          </p>
                        </div>
                      )}

                      {productPlan.teamRequirement?.soloNotes && (
                        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-4 space-y-1.5 text-xs">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                            Solo Founder / Small Team Advisory
                          </span>
                          <p className="text-slate-300 leading-relaxed">
                            {productPlan.teamRequirement.soloNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 7: AI PLAN */}
                  {activePlanTab === 'ai-plan' && (
                    <div className="space-y-5">
                      {/* Summary */}
                      <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                          AI Assistance Strategy
                        </span>
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {productPlan.aiAssistance?.summary ||
                            'How AI accelerators assist with planning, coding, QA, and deployment.'}
                        </p>
                      </div>

                      {/* Opportunities */}
                      {productPlan.aiAssistance?.opportunities &&
                        productPlan.aiAssistance.opportunities.length > 0 && (
                          <div className="space-y-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              AI Acceleration Opportunities
                            </span>
                            <div className="space-y-3">
                              {productPlan.aiAssistance.opportunities.map((opp, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-2xl border border-white/10 bg-[#0e101b] p-4 space-y-2 text-xs"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-white">
                                      {opp.area}
                                    </span>
                                    <Badge className="bg-indigo-500/20 text-indigo-300 text-[10px] border-indigo-500/30">
                                      {opp.efficiencyGain}
                                    </Badge>
                                  </div>
                                  <p className="text-slate-300 leading-relaxed">
                                    <span className="font-semibold text-slate-400">
                                      AI Role:{' '}
                                    </span>
                                    {opp.aiRole}
                                  </p>
                                  <p className="text-[11px] text-amber-300/90 pt-1 border-t border-white/5">
                                    <span className="font-semibold text-amber-400">
                                      Human Review Required:{' '}
                                    </span>
                                    {opp.humanReviewRequired}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Guidelines */}
                      {productPlan.aiAssistance?.guidelines &&
                        productPlan.aiAssistance.guidelines.length > 0 && (
                          <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-4 space-y-2 text-xs">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              AI Safety & Governance Guidelines
                            </span>
                            <ul className="space-y-1 text-slate-300 list-disc list-inside">
                              {productPlan.aiAssistance.guidelines.map((g, idx) => (
                                <li key={idx}>{g}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </section>
      </div>
    </div>
  );
}
