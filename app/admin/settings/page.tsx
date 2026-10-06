'use client';

import React, { useEffect, useState } from 'react';
import {
  Settings,
  Shield,
  Save,
  Cpu,
  AlertTriangle,
  RotateCcw,
  UserCheck,
  Megaphone,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface AdminSettingsState {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  primaryProvider: 'huggingface' | 'google-gemini';
  fallbackProvider: 'google-gemini' | 'huggingface';
  autoFallbackEnabled: boolean;
  maxRetryAttempts: number;
  allowNewRegistrations: boolean;
  systemNotification: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSettingsState>({
    maintenanceMode: false,
    maintenanceMessage: 'Codatron is currently undergoing scheduled platform maintenance. Please check back shortly.',
    primaryProvider: 'huggingface',
    fallbackProvider: 'google-gemini',
    autoFallbackEnabled: true,
    maxRetryAttempts: 2,
    allowNewRegistrations: true,
    systemNotification: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Error loading settings');
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save settings');

      toast.success('Admin settings successfully saved & audited');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error updating settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-white/5 rounded-lg" />
        <div className="space-y-4">
          <div className="h-44 rounded-2xl bg-white/5 border border-white/8" />
          <div className="h-44 rounded-2xl bg-white/5 border border-white/8" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-emerald-400" />
            Global Platform Settings
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure system operational modes, primary provider routing, and platform policies.
          </p>
        </div>

        <Button
          size="sm"
          disabled={saving}
          onClick={handleSave}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shadow-lg shadow-emerald-600/20"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving Changes...' : 'Save Settings'}
        </Button>
      </div>

      {/* Maintenance Mode Card */}
      <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Platform Maintenance Mode
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400">
            When enabled, non-admin users will receive a maintenance notice. Administrators retain full access to /admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/6">
            <div>
              <p className="font-semibold text-white">Enable Maintenance Mode</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Block generation and normal workspace routes for non-administrators
              </p>
            </div>
            <Switch
              checked={settings.maintenanceMode}
              onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
            />
          </div>

          {settings.maintenanceMode && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                User Maintenance Message
              </label>
              <Input
                value={settings.maintenanceMessage}
                onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value })}
                className="bg-white/5 border-white/10 text-xs text-white"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Routing & Fallback Policies */}
      <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-400" />
            AI Provider Routing & Fallback
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400">
            Control the high-availability failover pipeline between Hugging Face and Gemini.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Primary Model Provider
              </label>
              <select
                value={settings.primaryProvider}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    primaryProvider: e.target.value as 'huggingface' | 'google-gemini',
                  })
                }
                className="w-full h-9 rounded-xl bg-[#1c1c28] border border-white/10 text-xs text-white px-3 focus:outline-none"
              >
                <option value="huggingface">Hugging Face (Qwen2.5-Coder-32B)</option>
                <option value="google-gemini">Google Gemini (gemini-2.5-flash)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Failover Redundant Provider
              </label>
              <select
                value={settings.fallbackProvider}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    fallbackProvider: e.target.value as 'google-gemini' | 'huggingface',
                  })
                }
                className="w-full h-9 rounded-xl bg-[#1c1c28] border border-white/10 text-xs text-white px-3 focus:outline-none"
              >
                <option value="google-gemini">Google Gemini (gemini-2.5-flash)</option>
                <option value="huggingface">Hugging Face (Qwen2.5-Coder-32B)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/6">
            <div>
              <p className="font-semibold text-white">Automated Fallback Switching</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Automatically route prompts to redundant provider on 503/network failure
              </p>
            </div>
            <Switch
              checked={settings.autoFallbackEnabled}
              onCheckedChange={(checked) => setSettings({ ...settings, autoFallbackEnabled: checked })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Maximum Retry Attempts on Transient 503
            </label>
            <Input
              type="number"
              min={1}
              max={5}
              value={settings.maxRetryAttempts}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxRetryAttempts: Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 1)),
                })
              }
              className="w-32 bg-white/5 border-white/10 text-xs text-white font-mono"
            />
          </div>
        </CardContent>
      </Card>

      {/* User Registration & Announcements */}
      <Card className="rounded-2xl border-white/8 bg-[#15151c]/90 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-purple-400" />
            Signups & System Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/6">
            <div>
              <p className="font-semibold text-white">Allow New User Registrations</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                When disabled, new signups will be blocked at the authentication gate
              </p>
            </div>
            <Switch
              checked={settings.allowNewRegistrations}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, allowNewRegistrations: checked })
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Global System Banner / Notification
            </label>
            <Input
              value={settings.systemNotification}
              onChange={(e) => setSettings({ ...settings, systemNotification: e.target.value })}
              placeholder="e.g. Scheduled platform maintenance tonight at 23:00 UTC."
              className="bg-white/5 border-white/10 text-xs text-white"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
