'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Check,
  CheckCircle2,
  Layers,
  FileText,
  Edit2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ProductPlan } from '@/lib/ai/product-planner';

interface FeatureDetailModalProps {
  feature: ProductPlan['features'][0] | null;
  productPlan: ProductPlan | null;
  onClose: () => void;
  onSaveFeature: (updatedFeature: ProductPlan['features'][0]) => void;
  onTriggerAiForFeature: (instruction: string) => void;
  onSwitchToDeveloper?: () => void;
}

export function FeatureDetailModal({
  feature,
  productPlan,
  onClose,
  onSaveFeature,
  onTriggerAiForFeature,
}: FeatureDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState<string | null>(null);
  const [editedDescription, setEditedDescription] = useState<string | null>(null);
  const [editedPriority, setEditedPriority] = useState<ProductPlan['features'][0]['priority'] | null>(null);

  if (!feature) return null;

  const title = editedTitle ?? feature.title;
  const description = editedDescription ?? feature.description;
  const priority = editedPriority ?? feature.priority;

  const setTitle = (val: string) => setEditedTitle(val);
  const setDescription = (val: string) => setEditedDescription(val);
  const setPriority = (val: ProductPlan['features'][0]['priority']) => setEditedPriority(val);

  // Check if in MVP
  const isMvp = (productPlan?.mvp?.mustHave || []).some(
    (item) =>
      item.toLowerCase().includes(feature.title.toLowerCase()) ||
      feature.title.toLowerCase().includes(item.toLowerCase())
  );

  // Find related user stories
  const relatedStories = (productPlan?.userStories || []).filter(
    (story) =>
      story.asA.toLowerCase().includes(feature.title.toLowerCase()) ||
      story.iWant.toLowerCase().includes(feature.title.toLowerCase()) ||
      story.soThat.toLowerCase().includes(feature.title.toLowerCase()) ||
      feature.description.toLowerCase().includes(story.iWant.toLowerCase())
  );

  const handleSave = () => {
    onSaveFeature({
      ...feature,
      title: title.trim() || feature.title,
      description: description.trim() || feature.description,
      priority,
    });
    setIsEditing(false);
  };

  return (
    <Dialog open={Boolean(feature)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl border border-white/15 bg-[#141622]/95 backdrop-blur-2xl text-slate-100 sm:max-w-xl max-h-[88vh] p-6 flex flex-col overflow-hidden shadow-2xl">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent pointer-events-none" />

        <DialogHeader className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-[10px] uppercase font-mono px-2 py-0.5 ${
                  priority === 'high'
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : priority === 'medium'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                }`}
              >
                {priority} Priority
              </Badge>

              {isMvp ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px]"
                >
                  MVP In-Scope
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-white/10 bg-white/5 text-slate-400 text-[10px]"
                >
                  Standard Scope
                </Badge>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing((prev) => !prev)}
              className="h-7 text-xs text-slate-400 hover:text-white px-2.5 rounded-lg"
            >
              <Edit2 className="h-3 w-3 mr-1" />
              <span>{isEditing ? 'Cancel Edit' : 'Edit'}</span>
            </Button>
          </div>

          {isEditing ? (
            <div className="space-y-3 pt-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-black/50 border border-white/20 rounded-xl px-3 py-1.5 text-sm text-white font-semibold outline-none focus:border-indigo-500"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-black/50 border border-white/20 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-indigo-500 resize-none"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Priority:</span>
                {(['high', 'medium', 'low'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase transition ${
                      priority === p
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <Button
                  size="sm"
                  onClick={handleSave}
                  className="ml-auto h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <DialogTitle className="text-base font-bold text-white tracking-tight">
                {feature.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-1 leading-relaxed">
                {feature.description}
              </DialogDescription>
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 py-4 pr-2 space-y-4 text-xs">
          {/* AI Quick Actions for this Feature */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3.5 space-y-2 mb-4">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI Feature Assistant</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onTriggerAiForFeature(
                    `Generate dedicated user stories and detailed acceptance criteria for feature: "${feature.title}".`
                  );
                }}
                className="h-7 text-[11px] rounded-lg border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
              >
                ✨ Generate User Stories
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onTriggerAiForFeature(
                    `Identify missing edge cases and technical requirements for feature: "${feature.title}".`
                  );
                }}
                className="h-7 text-[11px] rounded-lg border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
              >
                ✨ Identify Edge Cases
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onTriggerAiForFeature(
                    `Optimize and enhance the architectural design for feature: "${feature.title}".`
                  );
                }}
                className="h-7 text-[11px] rounded-lg border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
              >
                ✨ Enhance Feature Design
              </Button>
            </div>
          </div>

          {/* Related User Stories */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-purple-400" />
                <span>Related User Stories</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {relatedStories.length} matched
              </span>
            </div>

            {relatedStories.length > 0 ? (
              <div className="space-y-2">
                {relatedStories.map((story) => (
                  <div
                    key={story.id}
                    className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-1 text-slate-300"
                  >
                    <div className="text-xs leading-relaxed">
                      <span className="text-indigo-400 font-semibold">As a</span> {story.asA},{' '}
                      <span className="text-purple-400 font-semibold">I want</span> {story.iWant},{' '}
                      <span className="text-cyan-400 font-semibold">so that</span> {story.soThat}.
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">
                No specific user stories mapped yet. Use AI actions above to generate them.
              </p>
            )}
          </div>

          {/* System Acceptance Criteria */}
          <div className="space-y-2 mb-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Acceptance Criteria</span>
            </span>
            <ul className="space-y-1.5 text-slate-300">
              {(productPlan?.acceptanceCriteria || []).slice(0, 3).map((crit, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span>{crit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Requirements Linkage */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-cyan-400" />
              <span>Functional Requirements</span>
            </span>
            <ul className="space-y-1.5 text-slate-300">
              {(productPlan?.requirements?.functional || []).slice(0, 2).map((req, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-white/10 pt-4 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-mono">
            ID: {feature.id}
          </div>

          <Button
            size="sm"
            onClick={onClose}
            className="h-8 rounded-full bg-white hover:bg-slate-200 text-black text-xs font-semibold px-5"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
