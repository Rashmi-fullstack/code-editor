'use client';

import React, { useState, useMemo } from 'react';
import {
  Compass,
  Lightbulb,
  Users,
  Target,
  Sparkles,
  Layers,
  CheckCircle2,
  Calendar,
  ListTodo,
  FileText,
  Search,
  Loader2,
  Check,
  AlertCircle,
  CheckCircle,
  Globe,
  Wand2,
  Save,
  Edit2,
  X,
  Plus,
  MoreHorizontal,
  Download,
  Copy,
  ChevronRight,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { createClient } from '@/lib/client';
import { saveProductPlanToDb, isRealPlan } from '@/lib/db/product';
import type { ProductPlan, DevelopmentTask } from '@/lib/ai/product-planner';
import type { Project, ProjectFile } from '@/lib/types/database';

import { OverviewWorkspace, type GenerationStatus } from './overview-workspace';
import { FeatureDetailModal } from './feature-detail-modal';
import { AiAssistantPanel } from './ai-assistant-panel';

export type PmSection =
  | 'overview'
  | 'vision'
  | 'personas'
  | 'research'
  | 'mvp'
  | 'features'
  | 'stories'
  | 'acceptance'
  | 'roadmap'
  | 'tasks'
  | 'requirements';

export interface ProductWorkspaceProps {
  project: Project | null;
  files: ProjectFile[];
  productPlan: ProductPlan | null;
  workspaceName?: string;
  isDirty?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  lastSavedAt?: Date | null;
  onPlanGenerated: (plan: ProductPlan) => void;
  onFilesUpdated: (newFiles: ProjectFile[], dependencies?: Array<{ name: string; version: string }>) => void;
  onSwitchToDeveloper: (targetFilePath?: string) => void;
  onRenameWorkspace?: (newName: string) => Promise<void> | void;
}

interface SidebarGroup {
  name: string;
  items: Array<{
    id: PmSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number;
  }>;
}

export function ProductWorkspace({
  project,
  files,
  productPlan,
  workspaceName,
  onDirtyChange,
  lastSavedAt,
  onPlanGenerated,
  onRenameWorkspace,
  onSwitchToDeveloper,
}: ProductWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<PmSection>('overview');
  const [overviewResetKey, setOverviewResetKey] = useState(0);
  const [idea, setIdea] = useState('');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('IDLE');
  const [generationError, setGenerationError] = useState<{
    message: string;
    code?: string;
    status?: number;
    provider?: string;
  } | null>(null);
  const [showIdeaModal, setShowIdeaModal] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // Planning task state
  const [selectedTaskForReqs, setSelectedTaskForReqs] = useState<DevelopmentTask | null>(null);
  const [taskFilterStatus, setTaskFilterStatus] = useState<string>('all');
  const [taskFilterCategory] = useState<string>('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  // Feature Detail & Modals
  const [selectedFeatureForDetail, setSelectedFeatureForDetail] = useState<
    ProductPlan['features'][0] | null
  >(null);
  const [featureSearch, setFeatureSearch] = useState('');
  const [featureFilterPriority, setFeatureFilterPriority] = useState<string>('all');

  // Dedicated PM Artifact Rename States (strictly isolated from developer files)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskRenameInput, setTaskRenameInput] = useState('');
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [featureRenameInput, setFeatureRenameInput] = useState('');

  // Modals for manual creation
  const [showAddFeatureModal, setShowAddFeatureModal] = useState(false);
  const [newFeatureTitle, setNewFeatureTitle] = useState('');
  const [newFeatureDesc, setNewFeatureDesc] = useState('');
  const [newFeaturePriority, setNewFeaturePriority] = useState<'high' | 'medium' | 'low'>('medium');

  const [showAddPersonaModal, setShowAddPersonaModal] = useState(false);
  const [newPersonaRole, setNewPersonaRole] = useState('');
  const [newPersonaNeeds, setNewPersonaNeeds] = useState('');
  const [newPersonaPain, setNewPersonaPain] = useState('');

  const [showAddStoryModal, setShowAddStoryModal] = useState(false);
  const [newStoryRole, setNewStoryRole] = useState('');
  const [newStoryWant, setNewStoryWant] = useState('');
  const [newStorySoThat, setNewStorySoThat] = useState('');
  const [newStoryAc, setNewStoryAc] = useState('');

  // Inline editing for Vision
  const [isEditingVision, setIsEditingVision] = useState(false);
  const [visionPurpose, setVisionPurpose] = useState(productPlan?.vision?.purpose || '');
  const [visionValueProp, setVisionValueProp] = useState(productPlan?.vision?.valueProposition || '');
  const [visionOutcome, setVisionOutcome] = useState(productPlan?.vision?.targetOutcome || '');

  const handleStartEditVision = () => {
    setVisionPurpose(productPlan?.vision?.purpose || '');
    setVisionValueProp(productPlan?.vision?.valueProposition || '');
    setVisionOutcome(productPlan?.vision?.targetOutcome || '');
    setIsEditingVision((prev) => !prev);
  };

  // Handle task rename
  const handleStartRenameTask = (task: DevelopmentTask) => {
    setEditingTaskId(task.id);
    setTaskRenameInput(task.title);
  };

  const handleConfirmRenameTask = async (taskId: string) => {
    const clean = taskRenameInput.trim();
    if (!clean || !productPlan) {
      setEditingTaskId(null);
      return;
    }
    const updatedTasks = (productPlan.developmentTasks || []).map((t) =>
      t.id === taskId ? { ...t, title: clean } : t
    );
    const updatedPlan: ProductPlan = { ...productPlan, developmentTasks: updatedTasks };
    onPlanGenerated(updatedPlan);
    setEditingTaskId(null);
    onDirtyChange?.(true);
    if (project) {
      const supabase = createClient();
      await saveProductPlanToDb(supabase, project.id, updatedPlan);
      onDirtyChange?.(false);
    }
    toast.success(`Renamed task to "${clean}"`);
  };

  // Handle feature rename
  const handleStartRenameFeature = (feat: ProductPlan['features'][0]) => {
    setEditingFeatureId(feat.id);
    setFeatureRenameInput(feat.title);
  };

  const handleConfirmRenameFeature = async (featureId: string) => {
    const clean = featureRenameInput.trim();
    if (!clean || !productPlan) {
      setEditingFeatureId(null);
      return;
    }
    const updatedFeatures = (productPlan.features || []).map((f) =>
      f.id === featureId ? { ...f, title: clean } : f
    );
    const updatedPlan: ProductPlan = { ...productPlan, features: updatedFeatures };
    onPlanGenerated(updatedPlan);
    setEditingFeatureId(null);
    onDirtyChange?.(true);
    if (project) {
      const supabase = createClient();
      await saveProductPlanToDb(supabase, project.id, updatedPlan);
      onDirtyChange?.(false);
    }
    toast.success(`Renamed feature to "${clean}"`);
  };

  // Manual s
  // ave plan
  const handleManualSavePlan = async () => {
    if (!project || !productPlan) return;
    setIsSavingPlan(true);
    try {
      const supabase = createClient();
      const res = await saveProductPlanToDb(supabase, project.id, productPlan);
      if (!res.success) throw res.error || new Error('Could not save product plan');
      onDirtyChange?.(false);
      toast.success('Product plan & requirements saved to project!');
    } catch (err: unknown) {
      console.error('Failed to save plan:', err);
      toast.error(err instanceof Error ? err.message : 'Could not save product plan');
    } finally {
      setIsSavingPlan(false);
    }
  };

  // Generate / Evolve complete product specification
  const handleGeneratePlan = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || idea).trim();
    if (!project || !promptToSend) {
      toast.error('Please describe your product idea or instruction first.');
      return;
    }
    setIsGeneratingPlan(true);
    setGenerationStatus('ANALYZING');
    setGenerationError(null);

    try {
      const res = await fetch(`/api/projects/${project.id}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea: promptToSend,
          existingPaths: files.map((f) => f.path),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const status = res.status;
        const code = data.code || (status === 429 ? 'RATE_LIMITED' : 'FAILED');
        const errObj = {
          message: data.message || 'Failed to generate product plan.',
          code,
          status,
          provider: data.provider,
        };
        setGenerationError(errObj);
        if (code === 'RATE_LIMITED' || status === 429) {
          setGenerationStatus('RATE_LIMITED');
        } else if (code === 'INVALID_RESPONSE') {
          setGenerationStatus('INVALID_RESPONSE');
        } else {
          setGenerationStatus('FAILED');
        }
        throw new Error(data.message || 'Failed to generate product plan.');
      }

      setGenerationStatus('SUCCESS');
      setGenerationError(null);
      onPlanGenerated(data.plan);
      setShowIdeaModal(false);
      onDirtyChange?.(false);
      toast.success('AI Product Blueprint successfully generated!');
      return data.plan;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Product planning failed.';
      toast.error(msg);
      throw err;
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Save manual Vision update
  const handleSaveVision = async () => {
    if (!productPlan) return;
    const updatedPlan: ProductPlan = {
      ...productPlan,
      vision: {
        ...productPlan.vision,
        purpose: visionPurpose.trim(),
        valueProposition: visionValueProp.trim(),
        targetOutcome: visionOutcome.trim(),
      },
    };
    onPlanGenerated(updatedPlan);
    setIsEditingVision(false);
    onDirtyChange?.(true);
    if (project) {
      const supabase = createClient();
      await saveProductPlanToDb(supabase, project.id, updatedPlan);
      onDirtyChange?.(false);
    }
    toast.success('Product vision updated!');
  };

  // Add new feature manually
  const handleAddFeature = async () => {
    if (!newFeatureTitle.trim() || !productPlan) return;
    const newFeat: ProductPlan['features'][0] = {
      id: `feat-${Date.now()}`,
      title: newFeatureTitle.trim(),
      description: newFeatureDesc.trim() || 'No description provided.',
      priority: newFeaturePriority,
    };
    const updatedPlan: ProductPlan = {
      ...productPlan,
      features: [...(productPlan.features || []), newFeat],
    };
    onPlanGenerated(updatedPlan);
    setNewFeatureTitle('');
    setNewFeatureDesc('');
    setShowAddFeatureModal(false);
    onDirtyChange?.(true);
    if (project) {
      const supabase = createClient();
      await saveProductPlanToDb(supabase, project.id, updatedPlan);
      onDirtyChange?.(false);
    }
    toast.success(`Feature "${newFeat.title}" added!`);
  };

  // Add new persona manually
  const handleAddPersona = async () => {
    if (!newPersonaRole.trim() || !productPlan) return;
    const newPersona = {
      role: newPersonaRole.trim(),
      needs: newPersonaNeeds.trim() || 'Core needs in definition.',
      painPoints: newPersonaPain.trim() || 'Pain points in definition.',
    };
    const updatedPlan: ProductPlan = {
      ...productPlan,
      personas: [...(productPlan.personas || []), newPersona],
    };
    onPlanGenerated(updatedPlan);
    setNewPersonaRole('');
    setNewPersonaNeeds('');
    setNewPersonaPain('');
    setShowAddPersonaModal(false);
    onDirtyChange?.(true);
    if (project) {
      const supabase = createClient();
      await saveProductPlanToDb(supabase, project.id, updatedPlan);
      onDirtyChange?.(false);
    }
    toast.success(`Persona "${newPersona.role}" added!`);
  };

  // Add new user story manually
  const handleAddStory = async () => {
    if (!newStoryRole.trim() || !newStoryWant.trim() || !productPlan) return;
    const newStory = {
      id: `US-${String((productPlan.userStories || []).length + 1).padStart(3, '0')}`,
      asA: newStoryRole.trim(),
      iWant: newStoryWant.trim(),
      soThat: newStorySoThat.trim() || 'achieve user goals.',
      acceptanceCriteria: newStoryAc.trim()
        ? newStoryAc.split('\n').filter((l) => l.trim())
        : ['Verify functionality works as expected.'],
    };
    const updatedPlan: ProductPlan = {
      ...productPlan,
      userStories: [...(productPlan.userStories || []), newStory],
    };
    onPlanGenerated(updatedPlan);
    setNewStoryRole('');
    setNewStoryWant('');
    setNewStorySoThat('');
    setNewStoryAc('');
    setShowAddStoryModal(false);
    onDirtyChange?.(true);
    if (project) {
      const supabase = createClient();
      await saveProductPlanToDb(supabase, project.id, updatedPlan);
      onDirtyChange?.(false);
    }
    toast.success(`User Story ${newStory.id} added!`);
  };

  // Save feature updated from detail modal
  const handleSaveFeatureFromDetail = async (updatedFeature: ProductPlan['features'][0]) => {
    if (!productPlan) return;
    const updatedFeatures = (productPlan.features || []).map((f) =>
      f.id === updatedFeature.id ? updatedFeature : f
    );
    const updatedPlan: ProductPlan = { ...productPlan, features: updatedFeatures };
    onPlanGenerated(updatedPlan);
    setSelectedFeatureForDetail(updatedFeature);
    onDirtyChange?.(true);
    if (project) {
      const supabase = createClient();
      await saveProductPlanToDb(supabase, project.id, updatedPlan);
      onDirtyChange?.(false);
    }
    toast.success(`Feature "${updatedFeature.title}" updated!`);
  };

  // Planning task status toggle (Pure project planning checklist)
  const handleToggleTaskStatus = async (taskId: string, newStatus: DevelopmentTask['status']) => {
    if (!productPlan) return;
    const updatedTasks = (productPlan.developmentTasks || []).map((t) =>
      t.id === taskId ? { ...t, status: newStatus } : t
    );
    const updatedPlan: ProductPlan = { ...productPlan, developmentTasks: updatedTasks };
    onPlanGenerated(updatedPlan);
    onDirtyChange?.(true);
    if (project) {
      const supabase = createClient();
      await saveProductPlanToDb(supabase, project.id, updatedPlan);
      onDirtyChange?.(false);
    }
    toast.success(`Task status updated to ${newStatus}`);
  };

  const validPlan = useMemo(() => {
    return productPlan && isRealPlan(productPlan) ? productPlan : null;
  }, [productPlan]);

  const devTasks = useMemo(() => {
    return Array.isArray(validPlan?.developmentTasks) ? validPlan.developmentTasks : [];
  }, [validPlan]);

  const tasksList = useMemo(() => {
    if (!devTasks || devTasks.length === 0) return [];
    return devTasks.filter((t) => {
      const matchesStatus = taskFilterStatus === 'all' || t.status === taskFilterStatus;
      const matchesCategory =
        taskFilterCategory === 'all' || (t.category || t.type) === taskFilterCategory;
      const matchesSearch =
        !taskSearch.trim() ||
        t.title.toLowerCase().includes(taskSearch.toLowerCase()) ||
        t.description.toLowerCase().includes(taskSearch.toLowerCase());
      return matchesStatus && matchesCategory && matchesSearch;
    });
  }, [devTasks, taskFilterStatus, taskFilterCategory, taskSearch]);

  const completedCount = useMemo(() => {
    return devTasks.filter((t) => t.status === 'completed').length;
  }, [devTasks]);

  const totalTasks = devTasks.length;

  const filteredFeatures = useMemo(() => {
    const list = validPlan?.features || [];
    return list.filter((f) => {
      const matchesPriority =
        featureFilterPriority === 'all' || f.priority === featureFilterPriority;
      const matchesSearch =
        !featureSearch.trim() ||
        f.title.toLowerCase().includes(featureSearch.toLowerCase()) ||
        f.description.toLowerCase().includes(featureSearch.toLowerCase());
      return matchesPriority && matchesSearch;
    });
  }, [validPlan?.features, featureFilterPriority, featureSearch]);

  // Sidebar Groups: OVERVIEW, DISCOVER, PLAN, DELIVERY (Derive badges STRICTLY from verified real saved data)
  const sidebarGroups: SidebarGroup[] = useMemo(
    () => [
      {
        name: 'OVERVIEW',
        items: [
          { id: 'overview', label: 'Overview', icon: Compass },
        ],
      },
      {
        name: 'DISCOVER',
        items: [
          { id: 'vision', label: 'Product Vision', icon: Lightbulb },
          {
            id: 'personas',
            label: 'Users & Personas',
            icon: Users,
            badge: validPlan?.personas?.length || undefined,
          },
          { id: 'research', label: 'Research', icon: Globe },
        ],
      },
      {
        name: 'PLAN',
        items: [
          {
            id: 'features',
            label: 'MVP & Features',
            icon: Target,
            badge: validPlan?.features?.length || undefined,
          },
          {
            id: 'stories',
            label: 'User Stories',
            icon: Layers,
            badge: validPlan?.userStories?.length || undefined,
          },
          {
            id: 'requirements',
            label: 'Requirements',
            icon: FileText,
            badge:
              (validPlan?.requirements?.functional?.length || 0) +
              (validPlan?.requirements?.nonFunctional?.length || 0) || undefined,
          },
        ],
      },
      {
        name: 'DELIVERY',
        items: [
          {
            id: 'roadmap',
            label: 'Roadmap',
            icon: Calendar,
            badge: validPlan?.roadmap?.length || undefined,
          },
          {
            id: 'tasks',
            label: 'Team & Timeline',
            icon: ListTodo,
            badge: validPlan && totalTasks > 0 ? totalTasks : undefined,
          },
        ],
      },
    ],
    [validPlan, totalTasks]
  );

  const activeSectionTitle = useMemo(() => {
    for (const group of sidebarGroups) {
      const item = group.items.find((i) => i.id === activeSection);
      if (item) return item.label;
    }
    return 'Product Workspace';
  }, [sidebarGroups, activeSection]);

  const handleExportPlanJson = () => {
    if (!productPlan) return;
    const blob = new Blob([JSON.stringify(productPlan, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safePlanName = (workspaceName || productPlan?.vision?.workspaceName || 'product-plan')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    a.download = `${safePlanName || 'product-plan'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded product plan JSON');
  };

  const handleCopySummary = () => {
    const summary =
      productPlan?.overview?.summary ||
      productPlan?.vision?.purpose ||
      'No summary available.';
    void navigator.clipboard.writeText(summary);
    toast.success('Executive summary copied to clipboard!');
  };

  return (
    <div className="flex-1 flex h-full bg-[#000] text-slate-100 overflow-hidden select-none relative">
      {/* Subtle atmospheric glow background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.08),rgba(255,255,255,0))] z-0" />

      {/* ========================================================================= */}
      {/* LEFT NAVIGATION SIDEBAR */}
      {/* ========================================================================= */}
      <aside className="w-64 shrink-0 bg-black/50 backdrop-blur-xl border-r border-white/10 flex flex-col justify-between relative z-10">
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          {/* Header */}
          <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-black shadow-md overflow-hidden shrink-0">
                <Compass className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-xs font-bold text-white tracking-wider uppercase">
                  Product Workspace
                </h2>
                <p className="text-[10px] text-slate-400">Strategy & Architecture</p>
              </div>
            </div>
          </div>

          {/* Grouped Navigation List */}
          <ScrollArea className="flex-1 px-3 py-3">
            <div className="space-y-5">
              {sidebarGroups.map((group) => (
                <div key={group.name} className="space-y-1">
                  <div className="px-2.5 pb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    {group.name}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeSection === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveSection(item.id);
                            if (item.id === 'overview') {
                              setOverviewResetKey((prev) => prev + 1);
                            }
                          }}
                          className={`flex items-center justify-between w-full px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${isActive
                            ? 'bg-white text-black font-semibold shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
                            }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <Icon
                              className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-black' : 'text-slate-400'
                                }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.badge !== undefined && (
                            <Badge
                              variant="secondary"
                              className={`h-4 px-1.5 text-[9px] font-mono rounded-full shrink-0 ${isActive
                                ? 'bg-black/10 text-black'
                                : 'bg-white/10 text-slate-300'
                                }`}
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Sidebar Footer: Planning Workspace Status & Developer Destination */}
        <div className="p-3 border-t border-white/10 bg-black/40 space-y-2 shrink-0">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace</span>
            <span className="text-[10px] text-slate-300 font-semibold">Product Manager</span>
          </div>
          <div className="text-[11px] text-slate-400 px-1 truncate">
            {validPlan ? '✓ Strategy Blueprint Ready' : 'Awaiting Product Idea'}
          </div>
          <button
            type="button"
            onClick={() => onSwitchToDeveloper()}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white text-xs transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              <span>Developer IDE</span>
            </div>
            <ChevronRight className="h-3 w-3 text-slate-500" />
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN WORKSPACE CONTENT */}
      {/* ========================================================================= */}
      {activeSection === 'overview' ? (
        <main className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden relative z-10">
          <OverviewWorkspace
            key={`overview-workspace-${overviewResetKey}`}
            project={project}
            productPlan={validPlan}
            workspaceName={workspaceName}
            lastSavedAt={lastSavedAt}
            filesCount={files.filter((f) => !f.is_folder).length}
            generationStatus={generationStatus}
            generationError={generationError}
            onNavigateSection={setActiveSection}
            onExecuteAiCommand={handleGeneratePlan}
            onRetryGeneration={() => void handleGeneratePlan()}
            onOpenIdeaModal={() => setShowIdeaModal(true)}
            onRenameWorkspace={onRenameWorkspace}
          />
        </main>
      ) : (
        <main className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden relative z-10">
          {/* Contextual Section Header */}
          <header className="h-14 px-6 border-b border-white/10 bg-black/40 backdrop-blur-xl flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveSection('overview')}
                className="h-8 px-2.5 text-xs text-slate-400 hover:text-white rounded-lg gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>AI Planner</span>
              </Button>
              <div className="h-4 w-px bg-white/10" />
              <h1 className="text-sm font-bold text-white capitalize tracking-wide truncate">
                {activeSectionTitle}
              </h1>
              <Badge
                variant="outline"
                className="border-white/10 bg-white/[0.04] text-[10px] text-slate-300 truncate max-w-[160px]"
              >
                {workspaceName || validPlan?.vision?.workspaceName || 'Untitled Product Plan'}
              </Badge>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Primary Action: Evolve / Define Plan */}
              <Button
                size="sm"
                onClick={() => setShowIdeaModal(true)}
                className="bg-white hover:bg-slate-200 text-black text-xs gap-1.5 font-semibold px-4 h-8 rounded-full shadow-md cursor-pointer transition"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{validPlan ? '✨ Evolve Plan' : 'Define Product'}</span>
              </Button>

              {/* More Contextual Actions Dropdown */}
              {validPlan && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full text-slate-400 hover:text-white"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-48 rounded-2xl border-white/15 bg-[#18181a]/95 backdrop-blur-xl text-slate-200 text-xs shadow-2xl"
                  >
                    <DropdownMenuItem
                      onClick={handleExportPlanJson}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export Plan (JSON)</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleCopySummary}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Executive Summary</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </header>

          {/* Dynamic Section Content */}
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-5xl mx-auto space-y-6 pb-12">

            {/* 2. PRODUCT VISION SECTION */}
            {activeSection === 'vision' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Product Vision & Strategic Intent
                    </h3>
                    <p className="text-xs text-slate-400">
                      Why this product exists, the core value proposition, and intended impact.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStartEditVision}
                      className="h-8 rounded-full border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
                    >
                      <Edit2 className="h-3 w-3 mr-1.5" />
                      <span>{isEditingVision ? 'Cancel' : 'Edit Vision'}</span>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        handleGeneratePlan(
                          'Regenerate and refine the product vision, core purpose, and target outcome.'
                        )
                      }
                      disabled={isGeneratingPlan}
                      className="h-8 rounded-full bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Regenerate with AI</span>
                    </Button>
                  </div>
                </div>

                {isEditingVision ? (
                  <div className="rounded-2xl border border-white/15 bg-[#0e101b] p-6 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                        Core Purpose (Why we build this)
                      </label>
                      <textarea
                        value={visionPurpose}
                        onChange={(e) => setVisionPurpose(e.target.value)}
                        rows={3}
                        className="w-full bg-black/50 border border-white/15 rounded-xl p-3 text-xs text-white outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                        Value Proposition (How we win)
                      </label>
                      <textarea
                        value={visionValueProp}
                        onChange={(e) => setVisionValueProp(e.target.value)}
                        rows={3}
                        className="w-full bg-black/50 border border-white/15 rounded-xl p-3 text-xs text-white outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                        Target Outcome & Success Metrics
                      </label>
                      <textarea
                        value={visionOutcome}
                        onChange={(e) => setVisionOutcome(e.target.value)}
                        rows={3}
                        className="w-full bg-black/50 border border-white/15 rounded-xl p-3 text-xs text-white outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={handleSaveVision}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Save Vision
                      </Button>
                    </div>
                  </div>
                ) : validPlan?.vision?.purpose ? (
                  <div className="space-y-4">
                    {/* Purpose Card */}
                    <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-6 space-y-2 relative overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                          Core Purpose
                        </span>
                        <Badge
                          variant="outline"
                          className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-[10px]"
                        >
                          ✨ AI Formulated
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed pt-1">
                        {validPlan.vision.purpose}
                      </p>
                    </div>

                    {/* Value Proposition */}
                    <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-6 space-y-2">
                      <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                        Value Proposition
                      </span>
                      <p className="text-xs text-slate-200 leading-relaxed pt-1">
                        {validPlan.vision.valueProposition}
                      </p>
                    </div>

                    {/* Target Outcome */}
                    <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-6 space-y-2">
                      <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                        Target Outcome & Success Metrics
                      </span>
                      <p className="text-xs text-slate-200 leading-relaxed pt-1">
                        {validPlan.vision.targetOutcome}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-8 text-center space-y-3">
                    <p className="text-xs text-slate-400">
                      No product vision defined yet. Create your vision with AI or write it manually.
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => setShowIdeaModal(true)}
                        className="bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Generate with AI</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleStartEditVision}
                        className="text-xs text-slate-200 border-white/15"
                      >
                        Write Manually
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. TARGET USERS & PERSONAS SECTION */}
            {activeSection === 'personas' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Target Users & Personas
                    </h3>
                    <p className="text-xs text-slate-400">
                      Archetypes of users, their core objectives, and critical pain points.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddPersonaModal(true)}
                      className="h-8 rounded-full border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      <span>Add Persona</span>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        handleGeneratePlan(
                          'Generate rich target user personas with concrete workflows, pain points, and needs.'
                        )
                      }
                      disabled={isGeneratingPlan}
                      className="h-8 rounded-full bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Generate Personas</span>
                    </Button>
                  </div>
                </div>

                {validPlan?.personas && validPlan.personas.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {validPlan.personas.map((persona, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-4 hover:border-white/20 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-bold text-xs border border-indigo-500/20">
                            <Users className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white">{persona.role}</h4>
                            <span className="text-[10px] text-slate-500">
                              Primary Persona #{idx + 1}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-3 text-xs">
                          <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3">
                            <span className="text-slate-400 font-semibold uppercase text-[10px] block mb-1">
                              Core Needs & Goals
                            </span>
                            <p className="text-slate-200 leading-relaxed">{persona.needs}</p>
                          </div>

                          <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3">
                            <span className="text-rose-400/80 font-semibold uppercase text-[10px] block mb-1">
                              Pain Points & Friction
                            </span>
                            <p className="text-slate-200 leading-relaxed">{persona.painPoints}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-8 text-center space-y-3">
                    <p className="text-xs text-slate-400">
                      No personas defined yet. Understand your audience by generating personas with AI.
                    </p>
                    <Button
                      size="sm"
                      onClick={() =>
                        handleGeneratePlan('Generate target personas for this product.')
                      }
                      className="bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Generate Personas</span>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* 4. FEATURES & MVP SECTION */}
            {activeSection === 'features' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Product Features Backlog
                    </h3>
                    <p className="text-xs text-slate-400">
                      Core application capabilities and interactive components.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddFeatureModal(true)}
                      className="h-8 rounded-full border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      <span>New Feature</span>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        handleGeneratePlan(
                          'Generate a complete set of innovative application features prioritized by MVP readiness.'
                        )
                      }
                      disabled={isGeneratingPlan}
                      className="h-8 rounded-full bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Generate Features</span>
                    </Button>
                  </div>
                </div>

                {/* MVP Scope & Launch Boundaries */}
                {validPlan?.mvp && (
                  <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-emerald-400" />
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                          MVP Scope & Launch Boundaries
                        </h4>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-300">
                        {validPlan.mvp.mustHave?.length || 0} in-scope · {validPlan.mvp.exclusions?.length || 0} deferred
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-2">
                        <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
                          Must-Have (In-Scope for MVP)
                        </span>
                        <ul className="space-y-1.5 text-xs text-slate-200">
                          {(validPlan.mvp.mustHave || []).map((item, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 space-y-2">
                        <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
                          Out of Scope / Post-MVP Exclusions
                        </span>
                        <ul className="space-y-1.5 text-xs text-slate-200">
                          {(validPlan.mvp.exclusions || []).map((item, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Filters & Search */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0d0f22] p-3 rounded-xl border border-white/10">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={featureSearch}
                      onChange={(e) => setFeatureSearch(e.target.value)}
                      placeholder="Search features by title or description…"
                      className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    {['all', 'high', 'medium', 'low'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setFeatureFilterPriority(p)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase transition ${featureFilterPriority === p
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                          }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Feature Cards Grid */}
                {filteredFeatures.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredFeatures.map((feat) => (
                      <div
                        key={feat.id}
                        onClick={() => setSelectedFeatureForDetail(feat)}
                        className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-3 hover:border-white/20 transition cursor-pointer group flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            {editingFeatureId === feat.id ? (
                              <div
                                className="flex items-center gap-1.5 flex-1 min-w-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="text"
                                  value={featureRenameInput}
                                  onChange={(e) => setFeatureRenameInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void handleConfirmRenameFeature(feat.id);
                                    if (e.key === 'Escape') setEditingFeatureId(null);
                                  }}
                                  autoFocus
                                  className="rounded border border-indigo-500/50 bg-black/60 px-2 py-0.5 text-xs text-white outline-none w-full"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleConfirmRenameFeature(feat.id)}
                                  className="rounded p-1 text-emerald-400 hover:bg-white/10"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingFeatureId(null)}
                                  className="rounded p-1 text-slate-400 hover:bg-white/10"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 group/rename min-w-0">
                                <h4
                                  className="text-xs font-bold text-white group-hover:text-indigo-300 transition truncate"
                                  title={feat.title}
                                >
                                  {feat.title}
                                </h4>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartRenameFeature(feat);
                                  }}
                                  className="opacity-0 group-hover/rename:opacity-100 p-0.5 rounded text-slate-400 hover:text-white transition"
                                >
                                  <Edit2 className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            )}

                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase shrink-0 ${feat.priority === 'high'
                                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                : feat.priority === 'medium'
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                  : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                                }`}
                            >
                              {feat.priority}
                            </Badge>
                          </div>

                          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                            {feat.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-white/5">
                          <span className="group-hover:text-indigo-300 transition flex items-center gap-1">
                            <span>Inspect feature detail</span>
                            <ChevronRight className="h-3 w-3" />
                          </span>
                          <span className="font-mono text-[10px]">ID: {feat.id}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-8 text-center space-y-3">
                    <p className="text-xs text-slate-400">No features found.</p>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => setShowAddFeatureModal(true)}
                        className="bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Feature</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGeneratePlan('Generate core features.')}
                        className="text-xs text-slate-200 border-white/15"
                      >
                        Generate with AI
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 6. USER STORIES SECTION */}
            {activeSection === 'stories' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Agile User Stories & Journey Mapping
                    </h3>
                    <p className="text-xs text-slate-400">
                      User role outcomes with acceptance gates.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddStoryModal(true)}
                      className="h-8 rounded-full border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      <span>New Story</span>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        handleGeneratePlan(
                          'Generate granular agile user stories with given/when/then acceptance criteria.'
                        )
                      }
                      disabled={isGeneratingPlan}
                      className="h-8 rounded-full bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Generate Stories</span>
                    </Button>
                  </div>
                </div>

                {validPlan?.userStories && validPlan.userStories.length > 0 ? (
                  <div className="space-y-3">
                    {validPlan.userStories.map((story) => (
                      <div
                        key={story.id}
                        className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-3 hover:border-white/20 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                          >
                            {story.id}
                          </Badge>
                        </div>

                        <div className="text-xs text-slate-200 leading-relaxed">
                          <span className="text-indigo-400 font-bold">As a</span> {story.asA},{' '}
                          <span className="text-purple-400 font-bold">I want</span> {story.iWant},{' '}
                          <span className="text-cyan-400 font-bold">so that</span> {story.soThat}.
                        </div>

                        {story.acceptanceCriteria && story.acceptanceCriteria.length > 0 && (
                          <div className="pt-2 border-t border-white/5 space-y-1.5">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                              Acceptance Criteria
                            </span>
                            <ul className="space-y-1 text-xs text-slate-300">
                              {story.acceptanceCriteria.map((ac, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                                  <span>{ac}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-8 text-center space-y-3">
                    <p className="text-xs text-slate-400">No user stories created yet.</p>
                    <Button
                      size="sm"
                      onClick={() => handleGeneratePlan('Generate user stories.')}
                      className="bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Generate User Stories</span>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* 7. ACCEPTANCE CRITERIA SECTION */}
            {activeSection === 'acceptance' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      System Acceptance Criteria & Quality Gates
                    </h3>
                    <p className="text-xs text-slate-400">
                      Standardized definition of done and automated verification rules.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      handleGeneratePlan(
                        'Formulate rigorous system-wide acceptance criteria and quality gates.'
                      )
                    }
                    disabled={isGeneratingPlan}
                    className="h-8 rounded-full bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Audit Gates with AI</span>
                  </Button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-6 space-y-4">
                  <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs uppercase tracking-wider">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Quality Verification Standards</span>
                  </div>
                  {validPlan?.acceptanceCriteria && validPlan.acceptanceCriteria.length > 0 ? (
                    <ul className="space-y-3 text-xs text-slate-200">
                      {validPlan.acceptanceCriteria.map((crit, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5"
                        >
                          <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                          <span className="leading-relaxed">{crit}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                      <p className="text-xs text-slate-400">
                        No quality verification standards defined yet. Click &quot;Audit Gates with AI&quot; to generate criteria.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 8. ROADMAP SECTION */}
            {activeSection === 'roadmap' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Delivery Roadmap & Milestones
                    </h3>
                    <p className="text-xs text-slate-400">
                      Phased implementation timeline from foundational architecture to MVP release.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      handleGeneratePlan(
                        'Generate a release roadmap with key milestones and target dates based on project requirements.'
                      )
                    }
                    disabled={isGeneratingPlan}
                    className="h-8 rounded-full bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Build Roadmap with AI</span>
                  </Button>
                </div>

                {validPlan?.roadmap && validPlan.roadmap.length > 0 ? (
                  <div className="space-y-4">
                    {validPlan.roadmap.map((phase, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl border border-white/10 bg-[#0e101b] p-6 flex items-start gap-5 hover:border-white/20 transition"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-bold text-sm border border-indigo-500/20 shrink-0">
                          {idx + 1}
                        </span>
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-white">{phase.milestone}</h4>
                            {phase.targetWeek && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-slate-300 font-mono"
                              >
                                {phase.targetWeek}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {phase.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-8 text-center space-y-3">
                    <p className="text-xs text-slate-400">No roadmap generated yet.</p>
                    <Button
                      size="sm"
                      onClick={() => handleGeneratePlan('Create a roadmap for this project.')}
                      className="bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Build Roadmap</span>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* 9. DEVELOPMENT TASKS SECTION */}
            {activeSection === 'tasks' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Development Tasks & Implementation Breakdown
                    </h3>
                    <p className="text-xs text-slate-400">
                      Technical milestones, acceptance boundaries, and planning checklist ({completedCount}/{totalTasks} completed).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        handleGeneratePlan(
                          'Decompose product requirements into actionable development tasks.'
                        )
                      }
                      disabled={isGeneratingPlan}
                      className="h-8 rounded-full bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Generate Tasks with AI</span>
                    </Button>
                  </div>
                </div>

                {/* Team & Timeline Overview */}
                {(validPlan?.teamRequirement || validPlan?.timeline) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {validPlan?.teamRequirement && (
                      <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-purple-400" />
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                              Team & Manpower
                            </h4>
                          </div>
                          {validPlan.teamRequirement.total > 0 && (
                            <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-300">
                              {validPlan.teamRequirement.total} {validPlan.teamRequirement.total === 1 ? 'member' : 'members'}
                            </Badge>
                          )}
                        </div>
                        {validPlan.teamRequirement.roles && validPlan.teamRequirement.roles.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {validPlan.teamRequirement.roles.map((r, i) => (
                              <span
                                key={i}
                                className="text-[11px] px-2.5 py-1 rounded-lg border bg-purple-500/10 border-purple-500/30 text-purple-200 font-medium"
                              >
                                {r.role} ({r.count})
                              </span>
                            ))}
                          </div>
                        )}
                        {validPlan.teamRequirement.mvpTeam && (
                          <p className="text-[11px] text-slate-400 leading-relaxed border-t border-white/5 pt-2">
                            <span className="text-slate-300 font-semibold">MVP Approach:</span>{' '}
                            {validPlan.teamRequirement.mvpTeam}
                          </p>
                        )}
                      </div>
                    )}

                    {validPlan?.timeline && (
                      <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-cyan-400" />
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                              Timeline & Schedule
                            </h4>
                          </div>
                          {validPlan.timeline.totalMvpWeeks && (
                            <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-300">
                              {validPlan.timeline.totalMvpWeeks}
                            </Badge>
                          )}
                        </div>
                        {validPlan.timeline.phases && validPlan.timeline.phases.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            {validPlan.timeline.phases.slice(0, 3).map((p, i) => (
                              <div key={i} className="flex items-center justify-between text-xs text-slate-300">
                                <span className="text-[11px] truncate max-w-[200px]">{p.phase}</span>
                                <span className="text-[10px] text-slate-500 font-mono">{p.duration}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Filters & Search */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0d0f22] p-3 rounded-xl border border-white/10">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      placeholder="Search tasks by keyword or component…"
                      className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    {['all', 'todo', 'in-progress', 'completed'].map((statusKey) => (
                      <button
                        key={statusKey}
                        type="button"
                        onClick={() => setTaskFilterStatus(statusKey)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition ${taskFilterStatus === statusKey
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                          }`}
                      >
                        {statusKey}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Task Cards */}
                {tasksList.length > 0 ? (
                  <div className="space-y-3">
                    {tasksList.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-2xl border border-white/10 bg-[#0e101b] p-5 transition hover:border-white/20 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {editingTaskId === task.id ? (
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <input
                                  type="text"
                                  value={taskRenameInput}
                                  onChange={(e) => setTaskRenameInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void handleConfirmRenameTask(task.id);
                                    if (e.key === 'Escape') setEditingTaskId(null);
                                  }}
                                  autoFocus
                                  className="rounded border border-indigo-500/50 bg-black/60 px-2 py-0.5 text-xs text-white outline-none w-full"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleConfirmRenameTask(task.id)}
                                  className="rounded p-1 text-emerald-400 hover:bg-white/10"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingTaskId(null)}
                                  className="rounded p-1 text-slate-400 hover:bg-white/10"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 group min-w-0">
                                <h4
                                  onClick={() => handleStartRenameTask(task)}
                                  className="text-xs font-bold text-white hover:text-indigo-300 cursor-pointer transition truncate"
                                  title="Click to rename task"
                                >
                                  {task.title}
                                </h4>
                                <button
                                  type="button"
                                  onClick={() => handleStartRenameTask(task)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-white transition"
                                >
                                  <Edit2 className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            )}

                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase shrink-0 ${task.priority === 'high'
                                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                                }`}
                            >
                              {task.priority}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[10px] border-purple-500/30 bg-purple-500/10 text-purple-300 uppercase shrink-0"
                            >
                              {task.type || task.category || 'component'}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {task.status === 'completed' && (
                              <Badge className="bg-emerald-600 text-white text-[10px] gap-1">
                                <Check className="h-3 w-3" />
                                <span>Built</span>
                              </Badge>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed">
                          {task.description}
                        </p>

                        {/* Affected Files & Dependencies */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(task.affectedFiles || []).map((file, fIdx) => (
                            <span
                              key={fIdx}
                              className="font-mono text-[10px] rounded bg-white/5 border border-white/5 px-2 py-0.5 text-slate-300"
                            >
                              {file}
                            </span>
                          ))}
                        </div>

                        {/* Planning Status & Requirements */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                              Status:
                            </span>
                            {(['todo', 'in-progress', 'completed'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleToggleTaskStatus(task.id, st)}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${task.status === st
                                  ? st === 'completed'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : st === 'in-progress'
                                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                      : 'bg-white/10 text-white border border-white/20'
                                  : 'text-slate-400 hover:text-white'
                                  }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedTaskForReqs(task)}
                            className="h-8 text-xs border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 gap-1.5 rounded-lg"
                          >
                            <FileText className="h-3 w-3 text-slate-400" />
                            <span>View Task Plan</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-8 text-center space-y-3">
                    <p className="text-xs text-slate-400">No tasks found matching criteria.</p>
                  </div>
                )}
              </div>
            )}

            {/* 10. REQUIREMENTS SECTION */}
            {activeSection === 'requirements' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Technical Requirements Specification
                    </h3>
                    <p className="text-xs text-slate-400">
                      Functional expectations and non-functional engineering standards.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      handleGeneratePlan('Expand functional and non-functional requirements.')
                    }
                    disabled={isGeneratingPlan}
                    className="h-8 rounded-full bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Expand Requirements</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-6 space-y-3">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                      Functional Requirements
                    </h4>
                    {validPlan?.requirements?.functional && validPlan.requirements.functional.length > 0 ? (
                      <ul className="space-y-2 text-xs text-slate-300">
                        {validPlan.requirements.functional.map((req, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                            <span>{req}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">
                        No functional requirements specified yet. Click &quot;Expand Requirements&quot; to generate.
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-6 space-y-3">
                    <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                      Non-Functional & Quality
                    </h4>
                    {validPlan?.requirements?.nonFunctional && validPlan.requirements.nonFunctional.length > 0 ? (
                      <ul className="space-y-2 text-xs text-slate-300">
                        {validPlan.requirements.nonFunctional.map((req, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                            <span>{req}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">
                        No non-functional or quality criteria specified yet. Click &quot;Expand Requirements&quot; to generate.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 11. RESEARCH & BENCHMARKS SECTION */}
            {activeSection === 'research' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Market Research & Competitive Benchmarks
                    </h3>
                    <p className="text-xs text-slate-400">
                      Competitive landscape analysis and user insights.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      handleGeneratePlan(
                        'Perform competitive market research and benchmark alternatives.'
                      )
                    }
                    disabled={isGeneratingPlan}
                    className="h-8 rounded-full bg-white hover:bg-slate-200 text-black text-xs font-semibold gap-1.5"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Run Research Agent</span>
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-6 space-y-2">
                    <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                      Market Analysis
                    </h4>
                    {validPlan?.research?.marketAnalysis ? (
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {validPlan.research.marketAnalysis}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 leading-relaxed">
                        No market analysis generated yet. Click &quot;Run Research Agent&quot; to analyze the market landscape.
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-6 space-y-3">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                      Competitive Benchmarks
                    </h4>
                    {validPlan?.research?.competitiveBenchmarks && validPlan.research.competitiveBenchmarks.length > 0 ? (
                      <ul className="space-y-2 text-xs text-slate-300">
                        {validPlan.research.competitiveBenchmarks.map((bench, idx) => (
                          <li key={idx} className="flex items-start gap-2.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                            <span>{bench}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">
                        No competitive benchmarks generated yet. Click &quot;Run Research Agent&quot; to benchmark alternatives.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </main>
      )}

      {/* ========================================================================= */}
      {/* COLLAPSIBLE RIGHT AI ASSISTANT PANEL */}
      {/* ========================================================================= */}
      <AiAssistantPanel
        isOpen={showAiPanel}
        onClose={() => setShowAiPanel(false)}
        isGeneratingPlan={isGeneratingPlan}
        onSendPrompt={handleGeneratePlan}
      />

      {/* ========================================================================= */}
      {/* FEATURE DETAIL MODAL */}
      {/* ========================================================================= */}
      {selectedFeatureForDetail && (
        <FeatureDetailModal
          feature={selectedFeatureForDetail}
          productPlan={productPlan}
          onClose={() => setSelectedFeatureForDetail(null)}
          onSaveFeature={handleSaveFeatureFromDetail}
          onTriggerAiForFeature={handleGeneratePlan}
        />
      )}

      {/* ========================================================================= */}
      {/* IDEA INTAKE MODAL */}
      {/* ========================================================================= */}
      <Dialog open={showIdeaModal} onOpenChange={setShowIdeaModal}>
        <DialogContent className="rounded-3xl border border-white/15 bg-[#18181a]/95 backdrop-blur-2xl text-white sm:max-w-lg p-6 overflow-hidden shadow-2xl">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent pointer-events-none" />
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow-sm overflow-hidden shrink-0">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <span>{productPlan ? 'Evolve Product Plan with AI' : 'Describe Product Idea'}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {productPlan
                ? 'Instruct Codatron to update your roadmap, refine features, or modify technical scope.'
                : 'Codatron AI will formulate a complete specification: Vision, Personas, MVP, Features, Stories, and Development Tasks.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. Build a modern streaming dashboard with recommendation carousels, video player modals, subscription billing tiers, and user profiles."
              rows={4}
              className="w-full resize-none rounded-xl border border-white/15 bg-white/[0.05] p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none transition"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowIdeaModal(false)}
              className="text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-full px-4 h-9"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => handleGeneratePlan()}
              disabled={isGeneratingPlan || !idea.trim()}
              className="bg-white hover:bg-slate-200 text-black text-xs gap-1.5 font-semibold px-5 h-9 rounded-full shadow-md cursor-pointer transition"
            >
              {isGeneratingPlan ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
                  <span>Synthesizing Plan…</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>{productPlan ? 'Update Plan' : 'Generate Plan'}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* ADD FEATURE MODAL */}
      {/* ========================================================================= */}
      <Dialog open={showAddFeatureModal} onOpenChange={setShowAddFeatureModal}>
        <DialogContent className="rounded-3xl border border-white/15 bg-[#18181a]/95 backdrop-blur-2xl text-white sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Plus className="h-4 w-4 text-indigo-400" />
              <span>Add New Feature</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="text-slate-400 font-medium block mb-1">Feature Title</label>
              <input
                type="text"
                value={newFeatureTitle}
                onChange={(e) => setNewFeatureTitle(e.target.value)}
                placeholder="e.g. Dark Mode Toggle with Persisted State"
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">Description</label>
              <textarea
                value={newFeatureDesc}
                onChange={(e) => setNewFeatureDesc(e.target.value)}
                placeholder="Describe user capability and technical scope…"
                rows={3}
                className="w-full bg-black/50 border border-white/15 rounded-xl p-3 text-white outline-none focus:border-indigo-500 resize-none"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">Priority</label>
              <div className="flex gap-2">
                {(['high', 'medium', 'low'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setNewFeaturePriority(p)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium uppercase transition ${newFeaturePriority === p
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddFeatureModal(false)}
              className="text-xs text-slate-400 rounded-full"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddFeature}
              disabled={!newFeatureTitle.trim()}
              className="bg-white hover:bg-slate-200 text-black text-xs font-semibold rounded-full px-5"
            >
              Add Feature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* ADD PERSONA MODAL */}
      {/* ========================================================================= */}
      <Dialog open={showAddPersonaModal} onOpenChange={setShowAddPersonaModal}>
        <DialogContent className="rounded-3xl border border-white/15 bg-[#18181a]/95 backdrop-blur-2xl text-white sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-400" />
              <span>Add Target User Persona</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="text-slate-400 font-medium block mb-1">Persona Role</label>
              <input
                type="text"
                value={newPersonaRole}
                onChange={(e) => setNewPersonaRole(e.target.value)}
                placeholder="e.g. Senior Frontend Engineer"
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">Core Needs</label>
              <textarea
                value={newPersonaNeeds}
                onChange={(e) => setNewPersonaNeeds(e.target.value)}
                placeholder="What does this persona need to accomplish?"
                rows={2}
                className="w-full bg-black/50 border border-white/15 rounded-xl p-3 text-white outline-none focus:border-indigo-500 resize-none"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">Pain Points</label>
              <textarea
                value={newPersonaPain}
                onChange={(e) => setNewPersonaPain(e.target.value)}
                placeholder="What frustrates them in current workflows?"
                rows={2}
                className="w-full bg-black/50 border border-white/15 rounded-xl p-3 text-white outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddPersonaModal(false)}
              className="text-xs text-slate-400 rounded-full"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddPersona}
              disabled={!newPersonaRole.trim()}
              className="bg-white hover:bg-slate-200 text-black text-xs font-semibold rounded-full px-5"
            >
              Add Persona
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* ADD USER STORY MODAL */}
      {/* ========================================================================= */}
      <Dialog open={showAddStoryModal} onOpenChange={setShowAddStoryModal}>
        <DialogContent className="rounded-3xl border border-white/15 bg-[#18181a]/95 backdrop-blur-2xl text-white sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-400" />
              <span>Add User Story</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="text-slate-400 font-medium block mb-1">As a (Role)</label>
              <input
                type="text"
                value={newStoryRole}
                onChange={(e) => setNewStoryRole(e.target.value)}
                placeholder="e.g. Registered Developer"
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">I want (Goal)</label>
              <input
                type="text"
                value={newStoryWant}
                onChange={(e) => setNewStoryWant(e.target.value)}
                placeholder="e.g. to toggle dark/light theme instantly"
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">So that (Benefit)</label>
              <input
                type="text"
                value={newStorySoThat}
                onChange={(e) => setNewStorySoThat(e.target.value)}
                placeholder="e.g. I can reduce eye strain in low-light environments"
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">
                Acceptance Criteria (One per line)
              </label>
              <textarea
                value={newStoryAc}
                onChange={(e) => setNewStoryAc(e.target.value)}
                placeholder="Given user clicks toggle, then theme changes without reload"
                rows={2}
                className="w-full bg-black/50 border border-white/15 rounded-xl p-3 text-white outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddStoryModal(false)}
              className="text-xs text-slate-400 rounded-full"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddStory}
              disabled={!newStoryRole.trim() || !newStoryWant.trim()}
              className="bg-white hover:bg-slate-200 text-black text-xs font-semibold rounded-full px-5"
            >
              Add Story
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* VIEW REQUIREMENTS DIALOG */}
      {/* ========================================================================= */}
      {selectedTaskForReqs && (
        <Dialog
          open={Boolean(selectedTaskForReqs)}
          onOpenChange={() => setSelectedTaskForReqs(null)}
        >
          <DialogContent className="rounded-3xl border border-white/15 bg-[#18181a]/95 backdrop-blur-2xl text-slate-100 sm:max-w-lg max-h-[85vh] p-6 flex flex-col overflow-hidden shadow-2xl">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase font-mono">
                  {selectedTaskForReqs.type || selectedTaskForReqs.category}
                </Badge>
                <DialogTitle className="text-sm font-bold text-white truncate">
                  {selectedTaskForReqs.title}
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-slate-400">
                Detailed requirements and technical implementation plan
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 py-3 pr-2">
              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold uppercase text-[10px]">
                    Description
                  </span>
                  <p className="text-slate-300 mt-1 leading-relaxed">
                    {selectedTaskForReqs.description}
                  </p>
                </div>

                {selectedTaskForReqs.requirements && (
                  <div>
                    <span className="text-slate-500 font-semibold uppercase text-[10px]">
                      Functional Requirements
                    </span>
                    <p className="text-slate-300 mt-1 leading-relaxed">
                      {selectedTaskForReqs.requirements}
                    </p>
                  </div>
                )}

                {selectedTaskForReqs.acceptanceCriteria &&
                  selectedTaskForReqs.acceptanceCriteria.length > 0 && (
                    <div>
                      <span className="text-slate-500 font-semibold uppercase text-[10px]">
                        Acceptance Criteria
                      </span>
                      <ul className="space-y-1 mt-1 text-slate-300">
                        {selectedTaskForReqs.acceptanceCriteria.map((crit, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                            <span>{crit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                <div>
                  <span className="text-slate-500 font-semibold uppercase text-[10px]">
                    Affected Files
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(selectedTaskForReqs.affectedFiles || []).map((file, idx) => (
                      <span
                        key={idx}
                        className="font-mono text-[10px] rounded-full bg-white/[0.06] border border-white/12 px-2.5 py-0.5 text-slate-200"
                      >
                        {file}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="pt-2 border-t border-white/5 gap-2 sm:gap-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedTaskForReqs(null)}
                className="text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-full px-5 h-9"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}