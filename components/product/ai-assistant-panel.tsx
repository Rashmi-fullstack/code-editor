'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  ArrowRight,
  Lightbulb,
  CheckCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isGeneratingPlan: boolean;
  onSendPrompt: (prompt: string) => void | Promise<void>;
}

export function AiAssistantPanel({
  isOpen,
  onClose,
  isGeneratingPlan,
  onSendPrompt,
}: AiAssistantPanelProps) {
  const [input, setInput] = useState('');

  if (!isOpen) return null;

  const suggestions = [
    { label: 'Find missing features', prompt: 'Audit our current features and identify missing industry-standard features for this product.' },
    { label: 'Prioritize MVP scope', prompt: 'Analyze our current backlog and prioritize features into strict Must-Have MVP versus Post-MVP exclusions.' },
    { label: 'Improve user stories', prompt: 'Refine and expand user stories with detailed Given-When-Then acceptance criteria.' },
    { label: 'Generate 3-month roadmap', prompt: 'Create a structured 3-month implementation roadmap with milestones and key deliverables.' },
    { label: 'Audit security & non-functionals', prompt: 'Identify missing non-functional, security, and performance requirements for production launch.' },
  ];

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = input.trim();
    if (!clean || isGeneratingPlan) return;
    void onSendPrompt(clean);
    setInput('');
  };

  const handleSuggestionClick = (prompt: string) => {
    if (isGeneratingPlan) return;
    void onSendPrompt(prompt);
  };

  return (
    <aside className="w-80 shrink-0 border-l border-white/10 bg-[#0c0d18]/95 backdrop-blur-2xl flex flex-col justify-between relative z-20 shadow-2xl">
      {/* Header */}
      <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wide">
              Codatron AI Strategist
            </h3>
            <p className="text-[10px] text-slate-400">Real-time Product Evolution</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 w-7 p-0 rounded-full text-slate-400 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Close Assistant</span>
        </Button>
      </div>

      {/* Body: Guidance & Suggestions */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 text-xs">
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3.5 space-y-1.5 text-slate-300">
            <p className="font-semibold text-white flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-indigo-400" />
              <span>How I can assist:</span>
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              I analyze your product specification and evolve features, user journeys, MVP scope, and development tasks to prepare them for the Coding Agent.
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Smart Suggestions
            </span>
            <div className="space-y-1.5">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSuggestionClick(s.prompt)}
                  disabled={isGeneratingPlan}
                  className="w-full text-left p-2.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15 transition text-slate-300 hover:text-white group flex items-center justify-between text-xs cursor-pointer disabled:opacity-40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-indigo-400 font-bold shrink-0">✦</span>
                    <span className="truncate">{s.label}</span>
                  </div>
                  <ArrowRight className="h-3 w-3 text-slate-500 group-hover:text-slate-300 opacity-0 group-hover:opacity-100 transition shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Footer / Input */}
      <div className="p-3 border-t border-white/10 bg-black/40 space-y-2">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ask anything or request plan evolution…"
            rows={2}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-2.5 pr-10 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-500 transition"
          />
          <button
            type="submit"
            disabled={isGeneratingPlan || !input.trim()}
            className="absolute right-2 bottom-2.5 p-1 rounded-lg bg-white hover:bg-slate-200 text-black transition cursor-pointer disabled:opacity-40"
          >
            {isGeneratingPlan ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </form>

        <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-amber-400" />
            <span>10 credits per AI evolution</span>
          </span>
          <span>Shift+Enter for newline</span>
        </div>
      </div>
    </aside>
  );
}
