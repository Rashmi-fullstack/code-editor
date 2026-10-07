'use client';

import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Save,
  Loader2,
  RefreshCw,
  Coins,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { SubscriptionPlan } from '@/lib/types/database';

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriceInr, setFormPriceInr] = useState('499');
  const [formInterval, setFormInterval] = useState('month');
  const [formCredits, setFormCredits] = useState('500');
  const [formBadge, setFormBadge] = useState('');
  const [formRazorpayPlanId, setFormRazorpayPlanId] = useState('');
  const [formFeaturesText, setFormFeaturesText] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsPublished, setFormIsPublished] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/plans', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      } else {
        toast.error('Failed to load plans');
      }
    } catch {
      toast.error('Error fetching subscription plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPlans();
  }, []);

  const openCreateDialog = () => {
    setEditingPlanId(null);
    setFormId('');
    setFormName('');
    setFormDescription('');
    setFormPriceInr('499');
    setFormInterval('month');
    setFormCredits('500');
    setFormBadge('');
    setFormRazorpayPlanId('');
    setFormFeaturesText('500 Codatron AI credits / month\nHigh-priority generation\nFull WebContainer preview runtime');
    setFormIsActive(true);
    setFormIsPublished(true);
    setIsDialogOpen(true);
  };

  const openEditDialog = (plan: SubscriptionPlan) => {
    setEditingPlanId(plan.id);
    setFormId(plan.id);
    setFormName(plan.name);
    setFormDescription(plan.description || '');
    setFormPriceInr(String(plan.price_inr));
    setFormInterval(plan.billing_interval || 'month');
    setFormCredits(String(plan.credits));
    setFormBadge(plan.badge || '');
    setFormRazorpayPlanId(plan.razorpay_plan_id || '');
    const feats = Array.isArray(plan.features) ? (plan.features as string[]) : [];
    setFormFeaturesText(feats.join('\n'));
    setFormIsActive(plan.is_active);
    setFormIsPublished(plan.is_published);
    setIsDialogOpen(true);
  };

  const handleSavePlan = async () => {
    if (!formId.trim() || !formName.trim()) {
      toast.error('Plan ID and Name are required');
      return;
    }

    const features = formFeaturesText
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: formId.trim().toLowerCase(),
          name: formName.trim(),
          description: formDescription.trim(),
          price_inr: Number(formPriceInr) || 0,
          billing_interval: formInterval,
          credits: Number(formCredits) || 0,
          badge: formBadge.trim() || null,
          razorpay_plan_id: formRazorpayPlanId.trim() || null,
          features,
          is_active: formIsActive,
          is_published: formIsPublished,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to save plan');
      }

      toast.success(editingPlanId ? 'Plan updated successfully' : 'Plan created successfully');
      setIsDialogOpen(false);
      await fetchPlans();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error saving plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = async (id: string, name?: string) => {
    if (deletingId) return;
    setDeletingId(id);
    const planName = name || id;
    const toastId = `delete-plan-${id}`;
    toast.loading(`Deleting plan...`, { id: toastId });

    try {
      const res = await fetch(`/api/admin/plans?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success(`Plan "${planName}" deleted successfully.`, { id: toastId });
        await fetchPlans();
      } else {
        toast.error(`Failed to delete plan "${planName}".`, { id: toastId });
      }
    } catch {
      toast.error(`Failed to delete plan "${planName}".`, { id: toastId });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-indigo-400" />
              <span>Subscription Plans & Pricing</span>
            </h1>
            <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs">
              Billing Control
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Configure Codatron customer upgrade tiers, pricing in INR, credit allowances, and features.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPlans}
            disabled={loading}
            className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white gap-1.5 text-xs h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={openCreateDialog}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 text-xs h-9 shadow-lg shadow-indigo-600/20 font-medium"
          >
            <Plus className="h-4 w-4" />
            <span>Create New Plan</span>
          </Button>
        </div>
      </div>

      {/* Plans List Cards */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      ) : plans.length === 0 ? (
        <Card className="rounded-2xl border-white/10 bg-[#141417] p-12 text-center text-zinc-400">
          No plans configured. Click "Create New Plan" to set up your first subscription plan.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
            return (
              <Card
                key={plan.id}
                className="rounded-2xl border border-white/10 bg-[#141417] p-5 flex flex-col justify-between hover:border-white/20 transition relative overflow-hidden"
              >
                {/* Active/Published indicator bar */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${plan.is_active ? 'bg-indigo-500' : 'bg-zinc-700'
                    }`}
                />

                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2 pt-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-base">{plan.name}</h3>
                        {plan.badge && (
                          <Badge className="border-indigo-500/30 bg-indigo-500/20 text-indigo-300 text-[10px] px-2 py-0">
                            {plan.badge}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-zinc-500">ID: {plan.id}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {plan.is_active ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-zinc-700 bg-zinc-800 text-zinc-400 text-[10px]">
                          Disabled
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 line-clamp-2 min-h-[32px]">
                    {plan.description || 'No description provided.'}
                  </p>

                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-extrabold text-white">
                        ₹{plan.price_inr}
                      </span>
                      <span className="text-xs text-zinc-400 ml-1">/{plan.billing_interval}</span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-amber-300 font-medium">
                      <Coins className="h-3.5 w-3.5 text-amber-400" />
                      <span>{plan.credits === -1 ? '∞ Unlimited' : `${plan.credits} credits`}</span>
                    </div>
                  </div>

                  {/* Feature Bullets */}
                  <div className="space-y-1.5 text-xs text-zinc-300 pt-1">
                    {features.slice(0, 4).map((feat, i) => (
                      <div key={i} className="flex items-center gap-2 text-zinc-300">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{feat}</span>
                      </div>
                    ))}
                    {features.length > 4 && (
                      <span className="text-[11px] text-zinc-500 pl-5">
                        +{features.length - 4} more features
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between border-t border-white/10 pt-4 mt-5">
                  <span className="text-[11px] text-zinc-500 font-mono">
                    {plan.razorpay_plan_id ? `Razorpay: ${plan.razorpay_plan_id}` : 'No Razorpay ID'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(plan)}
                      className="h-8 px-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 text-xs gap-1"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === plan.id}
                      onClick={() => void handleDeletePlan(plan.id, plan.name)}
                      className="h-8 px-2.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                      title={`Delete plan "${plan.name || plan.id}"`}
                    >
                      {deletingId === plan.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Plan Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg bg-[#141417] border-white/10 text-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-indigo-400" />
              <span>{editingPlanId ? `Edit Plan: ${formName}` : 'Create New Subscription Plan'}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Set plan pricing, included Codatron application credits, and customer features.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Plan Identifier (ID)</label>
                <Input
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                  disabled={Boolean(editingPlanId)}
                  placeholder="e.g. pro, business, team"
                  className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Display Name</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Developer Pro"
                  className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 font-medium">Description</label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Short tagline for the pricing card"
                className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Price (INR ₹)</label>
                <Input
                  type="number"
                  value={formPriceInr}
                  onChange={(e) => setFormPriceInr(e.target.value)}
                  placeholder="499"
                  className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Interval</label>
                <Select value={formInterval} onValueChange={setFormInterval}>
                  <SelectTrigger className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#18181b] border-white/10 text-white text-xs">
                    <SelectItem value="month">Monthly</SelectItem>
                    <SelectItem value="year">Yearly</SelectItem>
                    <SelectItem value="one_time">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Codatron Credits</label>
                <Input
                  type="number"
                  value={formCredits}
                  onChange={(e) => setFormCredits(e.target.value)}
                  placeholder="500 (-1 for unlimited)"
                  className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Badge (optional)</label>
                <Input
                  value={formBadge}
                  onChange={(e) => setFormBadge(e.target.value)}
                  placeholder="e.g. Most Popular"
                  className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Razorpay Plan ID (optional)</label>
                <Input
                  value={formRazorpayPlanId}
                  onChange={(e) => setFormRazorpayPlanId(e.target.value)}
                  placeholder="e.g. plan_N38dKsl93"
                  className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 font-medium">Features (one per line)</label>
              <Textarea
                rows={4}
                value={formFeaturesText}
                onChange={(e) => setFormFeaturesText(e.target.value)}
                placeholder="500 Codatron AI credits / month&#10;Up to 50 builds&#10;WebContainer live preview"
                className="bg-black/50 border-white/10 text-white rounded-xl text-xs font-mono"
              />
            </div>

            <div className="flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-zinc-700 bg-black text-indigo-600 focus:ring-0"
                />
                <span className="text-zinc-300">Plan Enabled</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsPublished}
                  onChange={(e) => setFormIsPublished(e.target.checked)}
                  className="rounded border-zinc-700 bg-black text-indigo-600 focus:ring-0"
                />
                <span className="text-zinc-300">Publicly Visible</span>
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 border-t border-white/10 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDialogOpen(false)}
              className="rounded-xl border-white/10 bg-transparent hover:bg-white/10 text-zinc-300 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSavePlan}
              disabled={saving}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 text-xs font-medium"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>Save Plan</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
