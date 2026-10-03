'use client';

import React, { useState } from 'react';
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
import { updateProject } from '@/lib/db/projects';
import { Edit3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@/lib/types/database';

export interface RenameProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onProjectUpdated: (updated: Project) => void;
}

function RenameForm({
  project,
  onOpenChange,
  onProjectUpdated,
}: {
  project: Project;
  onOpenChange: (open: boolean) => void;
  onProjectUpdated: (updated: Project) => void;
}) {
  const [name, setName] = useState(project.name || '');
  const [description, setDescription] = useState(project.description || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Project name cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: updated, error } = await updateProject(supabase, project.id, {
        name: cleanName,
        description: description.trim() || null,
      });

      if (error || !updated) {
        throw error || new Error('Failed to update project');
      }

      toast.success('Project details updated!');
      onProjectUpdated(updated);
      onOpenChange(false);
    } catch (err: unknown) {
      console.error('Error updating project:', err);
      toast.error(err instanceof Error ? err.message : 'Could not update project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="rename-name" className="text-xs font-semibold text-slate-300">
          Project Name
        </Label>
        <Input
          id="rename-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 bg-black/40 border-white/10 text-xs text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
          autoFocus
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rename-desc" className="text-xs font-semibold text-slate-300">
          Description <span className="text-slate-500 font-normal">(Optional)</span>
        </Label>
        <Textarea
          id="rename-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="resize-none bg-black/40 border-white/10 text-xs text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
        />
      </div>

      <DialogFooter className="pt-2 gap-2 sm:gap-0">
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
              <span>Saving…</span>
            </>
          ) : (
            <span>Save Changes</span>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RenameProjectModal({
  open,
  onOpenChange,
  project,
  onProjectUpdated,
}: RenameProjectModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] bg-[#0c0e1e] border-white/10 text-white shadow-2xl p-6">
        <DialogHeader className="space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
              <Edit3 className="h-4 w-4" />
            </span>
            <DialogTitle className="text-base font-bold text-white tracking-tight">
              Edit Project Details
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            Change the display name or description for this project.
          </DialogDescription>
        </DialogHeader>

        {project && (
          <RenameForm
            key={project.id}
            project={project}
            onOpenChange={onOpenChange}
            onProjectUpdated={onProjectUpdated}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
