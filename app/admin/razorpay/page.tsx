'use client';

import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  ShieldCheck,
  Lock,
  Key,
  CheckCircle2,
  XCircle,
  Save,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import type { SafeRazorpayConfig } from '@/lib/billing/razorpay';

export default function AdminRazorpayPage() {
  const [config, setConfig] = useState<SafeRazorpayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/razorpay', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setKeyId(data.config?.keyId || '');
        setIsEnabled(Boolean(data.config?.isEnabled));
      } else {
        toast.error('Failed to load Razorpay configuration');
      }
    } catch {
      toast.error('Error fetching Razorpay configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/razorpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: keyId.trim(),
          secret: secret.trim() || undefined,
          webhookSecret: webhookSecret.trim() || undefined,
          isEnabled,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to save configuration');
      }

      const data = await res.json();
      setConfig(data.config);
      setSecret('');
      setWebhookSecret('');
      toast.success('Razorpay configuration updated safely.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error updating Razorpay config');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-emerald-400" />
              <span>Razorpay Payment Gateway</span>
            </h1>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs">
              Payment Integration
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Configure Razorpay Key ID, server-side API secrets, and webhook endpoints for customer checkout.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchConfig}
          disabled={loading}
          className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white gap-1.5 text-xs h-9"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Security Architecture Notice */}
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-4 text-xs text-indigo-200 flex items-start gap-3">
        <Lock className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-white">Strict Server-Side Security Isolation</p>
          <p className="leading-relaxed text-indigo-200/80">
            Razorpay secret keys and webhook signing secrets are <strong>never</strong> transmitted to client browsers,
            never exposed in API responses, and never stored in client state. Only the public Key ID is provided to safe checkout dialogs.
          </p>
        </div>
      </div>

      {/* Status Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border border-white/10 bg-[#141417] p-4 space-y-1">
          <span className="text-[11px] text-zinc-400 font-medium">Gateway Status</span>
          <div className="flex items-center gap-2 pt-1">
            {config?.isConfigured ? (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs gap-1">
                <CheckCircle2 className="h-3 w-3" />
                <span>Configured</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs gap-1">
                <AlertTriangle className="h-3 w-3" />
                <span>Pending Setup</span>
              </Badge>
            )}
            <Badge variant="outline" className="border-zinc-700 bg-zinc-800 text-zinc-300 text-[10px] uppercase font-mono">
              {config?.mode || 'test'} Mode
            </Badge>
          </div>
        </Card>

        <Card className="rounded-2xl border border-white/10 bg-[#141417] p-4 space-y-1">
          <span className="text-[11px] text-zinc-400 font-medium">Checkout Availability</span>
          <div className="pt-1">
            {config?.isEnabled ? (
              <span className="text-emerald-400 font-bold text-sm flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Enabled for Customers
              </span>
            ) : (
              <span className="text-zinc-500 font-medium text-sm flex items-center gap-1.5">
                <XCircle className="h-4 w-4" /> Disabled (Simulated)
              </span>
            )}
          </div>
        </Card>

        <Card className="rounded-2xl border border-white/10 bg-[#141417] p-4 space-y-1">
          <span className="text-[11px] text-zinc-400 font-medium">Webhook Security</span>
          <div className="pt-1">
            {config?.webhookConfigured ? (
              <span className="text-emerald-400 font-bold text-sm flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Webhook Secret Set
              </span>
            ) : (
              <span className="text-zinc-500 font-medium text-sm flex items-center gap-1.5">
                <XCircle className="h-4 w-4" /> Webhook Not Configured
              </span>
            )}
          </div>
        </Card>
      </div>

      {/* Configuration Form Card */}
      <Card className="rounded-2xl border border-white/10 bg-[#141417] p-6 space-y-5">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Key className="h-4 w-4 text-emerald-400" />
          <span>API Credentials Configuration</span>
        </h2>

        <div className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-zinc-300 font-medium flex items-center justify-between">
              <span>Razorpay Key ID (Public)</span>
              <span className="text-[10px] text-zinc-500">e.g. rzp_test_xxxxxxxx or rzp_live_xxxxxxxx</span>
            </label>
            <Input
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="rzp_test_..."
              className="bg-black/50 border-white/10 text-white font-mono text-xs h-10 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-zinc-300 font-medium flex items-center justify-between">
              <span>Razorpay Key Secret (Strictly Server-Side)</span>
              <span className="text-[10px] text-amber-400/80">Stored securely. Leave blank to keep existing.</span>
            </label>
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={config?.isConfigured ? '••••••••••••••••••••••••••••' : 'Enter Razorpay Key Secret'}
              className="bg-black/50 border-white/10 text-white font-mono text-xs h-10 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-zinc-300 font-medium flex items-center justify-between">
              <span>Webhook Signing Secret (Optional)</span>
              <span className="text-[10px] text-zinc-500">For cryptographic signature verification of payment events</span>
            </label>
            <Input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={config?.webhookConfigured ? '••••••••••••••••••••••••••••' : 'Enter Webhook Secret'}
              className="bg-black/50 border-white/10 text-white font-mono text-xs h-10 rounded-xl"
            />
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="rounded border-zinc-700 bg-black text-emerald-500 focus:ring-0 h-4 w-4"
              />
              <div>
                <span className="text-white font-medium block">Enable Razorpay Live Checkout</span>
                <span className="text-zinc-500 text-[11px]">When disabled, upgrades run in sandbox test mode</span>
              </div>
            </label>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 text-xs font-semibold px-5 shadow-lg shadow-emerald-600/20"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>Save Configuration</span>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
