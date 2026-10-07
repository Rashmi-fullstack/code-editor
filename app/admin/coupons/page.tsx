'use client';

import React, { useEffect, useState } from 'react';
import {
  Tag,
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  XCircle,
  Calendar,
  Users,
  Percent,
  Coins,
  RefreshCw,
  Loader2,
  Save,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import type { DbCoupon } from '@/lib/types/database';
import { formatCouponExpirationDate, isCouponExpired } from '@/lib/billing/coupons';

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<DbCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [originalCode, setOriginalCode] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDiscountType, setFormDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [formDiscountValue, setFormDiscountValue] = useState('20');
  const [formMaxRedemptions, setFormMaxRedemptions] = useState('100');
  const [formPerUserLimit, setFormPerUserLimit] = useState('1');
  const [formMinPlanAmount, setFormMinPlanAmount] = useState('0');
  const [formExpiresAt, setFormExpiresAt] = useState('2026-12-31');
  const [formIsActive, setFormIsActive] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/coupons', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCoupons(data.coupons || []);
      } else {
        toast.error('Failed to load coupons');
      }
    } catch {
      toast.error('Error fetching promotional coupons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCoupons();
  }, []);

  const openCreateDialog = () => {
    setEditingCouponId(null);
    setOriginalCode('');
    setFormCode('');
    setFormDiscountType('percent');
    setFormDiscountValue('20');
    setFormMaxRedemptions('100');
    setFormPerUserLimit('1');
    setFormMinPlanAmount('0');
    setFormExpiresAt('2026-12-31');
    setFormIsActive(true);
    setIsDialogOpen(true);
  };

  const openEditDialog = (coupon: DbCoupon) => {
    setEditingCouponId(coupon.id);
    setOriginalCode(coupon.code);
    setFormCode(coupon.code);
    setFormDiscountType(coupon.discount_type);
    setFormDiscountValue(String(coupon.discount_value));
    setFormMaxRedemptions(coupon.max_redemptions !== null ? String(coupon.max_redemptions) : '');
    setFormPerUserLimit(String(coupon.per_user_limit));
    setFormMinPlanAmount(String(coupon.min_plan_amount));
    setFormExpiresAt(coupon.expires_at ? coupon.expires_at.split('T')[0] : '');
    setFormIsActive(coupon.is_active);
    setIsDialogOpen(true);
  };

  const handleSaveCoupon = async () => {
    const cleanCode = formCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanCode) {
      toast.error('Coupon code is required');
      return;
    }

    const discountVal = Number(formDiscountValue);
    if (isNaN(discountVal) || discountVal <= 0) {
      toast.error('Please enter a valid discount value');
      return;
    }
    if (formDiscountType === 'percent' && discountVal > 100) {
      toast.error('Percentage discount cannot exceed 100%');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCouponId || undefined,
          code: cleanCode,
          discount_type: formDiscountType,
          discount_value: discountVal,
          max_redemptions: formMaxRedemptions.trim() ? Number(formMaxRedemptions) : null,
          per_user_limit: Number(formPerUserLimit) || 1,
          min_plan_amount: Number(formMinPlanAmount) || 0,
          expires_at: formExpiresAt.trim() ? `${formExpiresAt}T23:59:59Z` : null,
          is_active: formIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to save coupon');
      }

      toast.success(editingCouponId ? `Coupon "${cleanCode}" updated` : `Coupon "${cleanCode}" created`);
      setIsDialogOpen(false);
      await fetchCoupons();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error saving coupon');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCoupon = async (coupon: DbCoupon) => {
    if (deletingId) return;
    setDeletingId(coupon.id);
    const toastId = `delete-coupon-${coupon.id}`;
    toast.loading(`Deleting coupon...`, { id: toastId });

    try {
      const res = await fetch(`/api/admin/coupons?id=${encodeURIComponent(coupon.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success(`Coupon "${coupon.code}" deleted successfully.`, { id: toastId });
        await fetchCoupons();
      } else {
        toast.error(`Failed to delete coupon "${coupon.code}".`, { id: toastId });
      }
    } catch {
      toast.error(`Failed to delete coupon "${coupon.code}".`, { id: toastId });
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
              <Tag className="h-6 w-6 text-amber-400" />
              <span>Promotional Coupons</span>
            </h1>
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
              Discounts
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Create and enforce promo codes, redemption limits, expiration dates, and discount rules.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCoupons}
            disabled={loading}
            className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white gap-1.5 text-xs h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={openCreateDialog}
            className="rounded-xl bg-amber-500 hover:bg-amber-400 text-black gap-1.5 text-xs h-9 font-semibold shadow-lg shadow-amber-500/20"
          >
            <Plus className="h-4 w-4" />
            <span>Create Coupon</span>
          </Button>
        </div>
      </div>

      {/* Coupons Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
        </div>
      ) : coupons.length === 0 ? (
        <Card className="rounded-2xl border-white/10 bg-[#141417] p-12 text-center text-zinc-400">
          No coupons configured. Click &quot;Create Coupon&quot; to issue your first promo code.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {coupons.map((coupon) => {
            const expired = isCouponExpired(coupon.expires_at);
            return (
              <Card
                key={coupon.id}
                className="rounded-2xl border border-white/10 bg-[#141417] p-5 flex flex-col justify-between hover:border-white/20 transition relative overflow-hidden"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-lg text-amber-300 tracking-wider">
                          {coupon.code}
                        </span>
                        {coupon.is_active && !expired ? (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]">
                            Active
                          </Badge>
                        ) : expired ? (
                          <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-400 text-[10px]">
                            Expired
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-zinc-700 bg-zinc-800 text-zinc-400 text-[10px]">
                            Disabled
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xl font-extrabold text-white">
                        {coupon.discount_type === 'percent' ? `${coupon.discount_value}% OFF` : `₹${coupon.discount_value} OFF`}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Redemptions</span>
                      <span className="text-zinc-200 font-medium font-mono">
                        {coupon.redemptions_count} / {coupon.max_redemptions !== null ? coupon.max_redemptions : '∞'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-zinc-500 block">Per-user limit</span>
                      <span className="text-zinc-200 font-medium">{coupon.per_user_limit} per account</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-zinc-500 block">Expires</span>
                      <span className="text-zinc-200 font-medium font-mono">
                        {formatCouponExpirationDate(coupon.expires_at)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-zinc-500 block">Min. Plan</span>
                      <span className="text-zinc-200 font-medium font-mono">
                        {coupon.min_plan_amount > 0 ? `₹${coupon.min_plan_amount}` : 'None'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 border-t border-white/10 pt-4 mt-5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(coupon)}
                    className="h-8 px-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 text-xs gap-1"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletingId === coupon.id}
                    onClick={() => void handleDeleteCoupon(coupon)}
                    className="h-8 px-2.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                    title={`Delete coupon "${coupon.code}"`}
                  >
                    {deletingId === coupon.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Coupon Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md bg-[#141417] border-white/10 text-white rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Tag className="h-5 w-5 text-amber-400" />
              <span>{editingCouponId ? `Edit Coupon: ${originalCode || formCode}` : 'Create New Coupon'}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Configure discount type, max redemptions, and validation parameters.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 font-medium">Coupon Code</label>
              <Input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME25, HACKATHON50"
                autoComplete="off"
                spellCheck={false}
                className="bg-black/50 border-white/10 text-amber-300 font-mono font-bold h-9 rounded-xl text-xs uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Discount Type</label>
                <Select
                  value={formDiscountType}
                  onValueChange={(val) => setFormDiscountType(val as 'percent' | 'fixed')}
                >
                  <SelectTrigger className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#18181b] border-white/10 text-white text-xs">
                    <SelectItem value="percent">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Discount Value</label>
                <Input
                  type="number"
                  value={formDiscountValue}
                  onChange={(e) => setFormDiscountValue(e.target.value)}
                  placeholder={formDiscountType === 'percent' ? '20' : '100'}
                  className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Max Total Redemptions</label>
                <Input
                  type="number"
                  value={formMaxRedemptions}
                  onChange={(e) => setFormMaxRedemptions(e.target.value)}
                  placeholder="Blank for unlimited"
                  className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Per-User Limit</label>
                <Input
                  type="number"
                  value={formPerUserLimit}
                  onChange={(e) => setFormPerUserLimit(e.target.value)}
                  placeholder="1"
                  className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Minimum Plan Price (₹)</label>
                <Input
                  type="number"
                  value={formMinPlanAmount}
                  onChange={(e) => setFormMinPlanAmount(e.target.value)}
                  placeholder="0"
                  className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400 font-medium">Expiration Date</label>
                <Input
                  type="date"
                  value={formExpiresAt}
                  onChange={(e) => setFormExpiresAt(e.target.value)}
                  className="bg-black/50 border-white/10 text-white h-9 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-zinc-700 bg-black text-amber-500 focus:ring-0"
                />
                <span className="text-zinc-300">Coupon Active and Redeemable</span>
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 border-t border-white/10 pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => setIsDialogOpen(false)}
              className="rounded-xl border-white/10 bg-transparent hover:bg-white/10 text-zinc-300 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCoupon}
              disabled={saving}
              className="rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5 text-xs shadow-lg shadow-amber-500/20"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>{saving ? 'Saving...' : 'Save Coupon'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
