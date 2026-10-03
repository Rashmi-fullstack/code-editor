'use client';

import React, { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/client';
import { useAuth } from '@/components/auth-provider';
import { createProjectWithMode, type StartingMode } from '@/lib/db/projects';
import { Compass, Code2, FileCode, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export interface NewProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated?: (projectId: string, mode: StartingMode) => void;
  defaultMode?: StartingMode;
}

export function NewProjectModal({
  open,
  onOpenChange,
  onProjectCreated,
  defaultMode = 'blank',
}: NewProjectModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<StartingMode>(defaultMode);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Please enter a project name.');
      return;
    }

    if (!user) {
      toast.error('Please sign in to create and save persistent projects.');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: project, error } = await createProjectWithMode(supabase, user.id, {
        name: cleanName,
        description: description.trim() || undefined,
        mode,
        framework: 'nextjs',
      });

      if (error || !project) {
        throw error || new Error('Failed to create project');
      }

      toast.success(`Project "${project.name}" created!`);
      onOpenChange(false);
      setName('');
      setDescription('');

      const viewParam = mode === 'product' ? 'product' : 'developer';
      if (onProjectCreated) {
        onProjectCreated(project.id, mode);
      } else {
        router.push(`/editor?project=${project.id}&view=${viewParam}`);
      }
    } catch (err: unknown) {
      console.error('Error creating project:', err);
      toast.error(err instanceof Error ? err.message : 'Could not create project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] bg-[#0c0e1e] border-white/10 text-white shadow-2xl p-6">
        <DialogHeader className="space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="h-4 w-4" />
            </span>
            <DialogTitle className="text-lg font-bold text-white tracking-tight">
              Create New Project
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            Set up a persistent workspace backed by Supabase with full PM & Developer IDE sync.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Project Name */}
          <div className="space-y-1.5">
            <Label htmlFor="project-name" className="text-xs font-semibold text-slate-300">
              Project Name <span className="text-indigo-400">*</span>
            </Label>
            <Input
              id="project-name"
              placeholder="e.g. AI Resume Builder"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 bg-black/40 border-white/10 text-xs text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
              autoFocus
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="project-desc" className="text-xs font-semibold text-slate-300">
              Description <span className="text-slate-500 font-normal">(Optional)</span>
            </Label>
            <Textarea
              id="project-desc"
              placeholder="e.g. Build an AI-powered resume builder with interactive styling and preview"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-none bg-black/40 border-white/10 text-xs text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
            />
          </div>

          {/* Start With */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">
              Start With
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Product Manager */}
              <button
                type="button"
                onClick={() => setMode('product')}
                className={`flex flex-col text-left p-3 rounded-xl border transition cursor-pointer ${
                  mode === 'product'
                    ? 'border-indigo-500 bg-indigo-950/40 shadow-sm shadow-indigo-500/20'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Compass className={`h-4 w-4 ${mode === 'product' ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span className="text-xs font-semibold text-white">Product Manager</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  PRD, features, user stories & roadmap first.
                </p>
              </button>

              {/* Developer IDE */}
              <button
                type="button"
                onClick={() => setMode('developer')}
                className={`flex flex-col text-left p-3 rounded-xl border transition cursor-pointer ${
                  mode === 'developer'
                    ? 'border-indigo-500 bg-indigo-950/40 shadow-sm shadow-indigo-500/20'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Code2 className={`h-4 w-4 ${mode === 'developer' ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span className="text-xs font-semibold text-white">Developer IDE</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Next.js starter with Monaco & live preview.
                </p>
              </button>

              {/* Blank Project */}
              <button
                type="button"
                onClick={() => setMode('blank')}
                className={`flex flex-col text-left p-3 rounded-xl border transition cursor-pointer ${
                  mode === 'blank'
                    ? 'border-indigo-500 bg-indigo-950/40 shadow-sm shadow-indigo-500/20'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <FileCode className={`h-4 w-4 ${mode === 'blank' ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span className="text-xs font-semibold text-white">Blank Project</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Clean empty canvas without template files.
                </p>
              </button>
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-xs text-slate-400 hover:text-white hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !name.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 shadow-sm shadow-indigo-600/30 gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Creating…</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Create Project</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
