'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Zap, ArrowRight, ShieldCheck } from 'lucide-react';

interface CreditExhaustionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remainingCredits?: number;
  requiredCredits?: number;
  projectId?: string;
}

export function CreditExhaustionDialog({
  open,
  onOpenChange,
  remainingCredits = 0,
  requiredCredits = 10,
  projectId,
}: CreditExhaustionDialogProps) {
  const router = useRouter();

  const handleNavigateUpgrade = () => {
    onOpenChange(false);
    const target = projectId ? `/upgrade?projectId=${projectId}` : '/upgrade?from=editor';
    router.push(target);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#0d0f18] border border-white/12 text-white rounded-[28px] p-6 shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="space-y-3 items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-amber-500/10 border border-indigo-500/30 text-indigo-300 shadow-inner">
            <Sparkles className="h-7 w-7 text-indigo-400" />
          </div>

          <DialogTitle className="text-xl font-bold tracking-tight text-white">
            You've used your Codatron AI credits.
          </DialogTitle>

          <DialogDescription className="text-xs text-slate-300 leading-relaxed max-w-sm">
            You've reached the limit for your current plan. Upgrade to continue building with AI.
          </DialogDescription>
        </DialogHeader>

        {/* Balance vs Requirement metric pill */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 my-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-slate-400">Available:</span>
            <span className="font-bold text-white">{remainingCredits} credits</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Required:</span>
            <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-[11px] font-mono">
              {requiredCredits} credits
            </Badge>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 space-y-2 text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>Your project files, history, and workspace remain completely safe.</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>Manual code editing and in-browser preview remain 100% free.</span>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto rounded-full text-slate-400 hover:text-white hover:bg-white/5 text-xs order-2 sm:order-1"
          >
            Maybe Later
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleNavigateUpgrade}
            className="w-full sm:w-auto rounded-full border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs order-1 sm:order-2"
          >
            View Plans
          </Button>

          <Button
            type="button"
            onClick={handleNavigateUpgrade}
            className="w-full sm:w-auto rounded-full bg-white hover:bg-slate-200 text-black text-xs font-bold gap-1 order-0 sm:order-3 shadow-md"
          >
            <span>Upgrade</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
