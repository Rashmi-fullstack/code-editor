'use client';

import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Key,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  Loader2,
  ExternalLink,
  Lock,
  Eye,
  EyeOff,
  Server,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { DEVELOPER_IDE_CONFIG } from '@/lib/ai/developer-ide-config';

interface AIConfigState {
  provider: string;
  model: string;
  keyConfigured: boolean;
  maskedKey: string | null;
  keySource: 'byok' | 'platform';
  updatedAt: string | null;
  isAdmin?: boolean;
  platformEnvConfigured?: {
    huggingface: boolean;
    gemini: boolean;
  };
}

interface AdminProviderConfigProps {
  onConfigUpdated?: () => void;
  title?: string;
  description?: string;
  className?: string;
}

export function AdminProviderConfig({
  onConfigUpdated,
  title = 'AI Provider & BYOK',
  description = 'Manage platform AI routing, provider models, and encrypted platform credentials.',
  className = '',
}: AdminProviderConfigProps) {
  const [aiConfig, setAiConfig] = useState<AIConfigState | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('huggingface');
  const [selectedModel, setSelectedModel] = useState<string>(DEVELOPER_IDE_CONFIG.model);
  const [inputApiKey, setInputApiKey] = useState('');
  const [showKeyText, setShowKeyText] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isDeletingKey, setIsDeletingKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfig = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/profile/ai-config', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Failed to load AI configuration');
      }
      const data: AIConfigState = await res.json();
      setAiConfig(data);
      if (data.provider) {
        setSelectedProvider(data.provider);
      }
      if (data.model) {
        setSelectedModel(data.model);
      }
    } catch (err) {
      console.error('Error fetching AI configuration:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfig();
  }, []);

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputApiKey.trim()) {
      toast.error('Please enter a valid API key or access token.');
      return;
    }

    setIsSavingKey(true);
    try {
      const res = await fetch('/api/profile/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: inputApiKey.trim(),
          provider: selectedProvider,
          model: selectedModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to save configuration');
      }

      toast.success(data.message || 'API key saved and encrypted successfully.');
      setInputApiKey('');
      await fetchConfig();
      if (onConfigUpdated) onConfigUpdated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleRemoveApiKey = async () => {
    setIsDeletingKey(true);
    try {
      const res = await fetch('/api/profile/ai-config', {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to remove configuration');
      }

      toast.success(data.message || 'Key removed. Reverted to server environment configuration.');
      await fetchConfig();
      if (onConfigUpdated) onConfigUpdated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove configuration');
    } finally {
      setIsDeletingKey(false);
    }
  };

  if (isLoading && !aiConfig) {
    return (
      <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-8 shadow-xl">
        <div className="flex items-center justify-center gap-3 py-8 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
          <span>Loading platform provider configuration...</span>
        </div>
      </Card>
    );
  }

  const isConfiguredKey = Boolean(aiConfig?.keyConfigured && aiConfig?.maskedKey);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/12 pb-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-400" />
            <span>{title}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className="rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-mono px-2.5 py-0.5 flex items-center gap-1"
          >
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            <span>Administrator Authorized</span>
          </Badge>
          <Badge
            variant="outline"
            className={`rounded-full text-[10px] font-semibold px-3 py-0.5 border ${
              isConfiguredKey
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-white/10 text-white border-white/15'
            }`}
          >
            {isConfiguredKey ? 'Custom Platform Key Active' : 'Server Environment Fallback'}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Card: Active Configuration Overview */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 space-y-4 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Server className="h-3.5 w-3.5 text-indigo-400" />
                <span>Current AI Stack</span>
              </h3>
              <p className="text-xs text-slate-400">
                Centralized engine routing requests across the platform.
              </p>
            </div>

            <div className="space-y-3 pt-2 text-xs">
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-slate-400">Active Provider</span>
                <span className="font-semibold text-slate-200">
                  {aiConfig?.provider === 'google-gemini' ? 'Google Gemini' : 'Hugging Face (Inference)'}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-slate-400">Target Model</span>
                <span className="font-mono text-[11px] text-white truncate max-w-[180px]" title={aiConfig?.model}>
                  {aiConfig?.model || DEVELOPER_IDE_CONFIG.model}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-slate-400">Key Source</span>
                <Badge
                  variant="outline"
                  className={`text-[9px] font-mono ${
                    isConfiguredKey
                      ? 'border-amber-500/30 text-amber-300'
                      : 'border-emerald-500/30 text-emerald-400'
                  }`}
                >
                  {isConfiguredKey ? 'Custom Configured Key' : 'Platform Shared Key'}
                </Badge>
              </div>

              {isConfiguredKey && (
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-slate-400">Active Masked Key</span>
                  <span className="font-mono text-emerald-400 text-xs">
                    {aiConfig?.maskedKey}
                  </span>
                </div>
              )}

              {aiConfig?.updatedAt && (
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-slate-400">Last Updated</span>
                  <span className="text-slate-400 text-[11px] font-mono">
                    {new Date(aiConfig.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Server Env Defaults:</span>
                <div className="flex gap-1.5 font-mono text-[10px]">
                  <span className={aiConfig?.platformEnvConfigured?.huggingface ? 'text-emerald-400' : 'text-zinc-500'}>
                    HF {aiConfig?.platformEnvConfigured?.huggingface ? '✓' : '✗'}
                  </span>
                  <span>•</span>
                  <span className={aiConfig?.platformEnvConfigured?.gemini ? 'text-emerald-400' : 'text-zinc-500'}>
                    Gemini {aiConfig?.platformEnvConfigured?.gemini ? '✓' : '✗'}
                  </span>
                </div>
              </div>
            </div>

            {isConfiguredKey && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveApiKey}
                  disabled={isDeletingKey}
                  className="w-full rounded-xl border-red-500/30 bg-red-950/20 text-red-300 hover:bg-red-900/40 text-xs font-medium py-1.5 transition cursor-pointer"
                >
                  {isDeletingKey ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      <span>Reverting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      <span>Revert to Environment Key</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Right Card: Key Configuration & Security Form */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="rounded-[24px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 shadow-xl relative overflow-hidden space-y-6">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Key className="h-4 w-4 text-amber-400" />
                <span>Configure Platform API Key</span>
              </h3>
              <p className="text-xs text-slate-400">
                Override or provide dedicated platform credentials. Secrets are validated upstream, encrypted with AES-256-GCM, and strictly protected.
              </p>
            </div>

            <form onSubmit={handleSaveApiKey} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    AI Provider
                  </label>
                  <Select
                    value={selectedProvider}
                    onValueChange={(val) => {
                      setSelectedProvider(val);
                      if (val === 'huggingface') {
                        setSelectedModel(DEVELOPER_IDE_CONFIG.model);
                      } else if (val === 'google-gemini') {
                        setSelectedModel(DEVELOPER_IDE_CONFIG.fallbackModel);
                      }
                    }}
                  >
                    <SelectTrigger className="rounded-xl bg-white/[0.05] border-white/12 text-xs text-white hover:border-white/20 focus:border-white/30">
                      <SelectValue placeholder="Select Provider" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#18181a] border-white/12 text-slate-200 text-xs rounded-xl shadow-2xl">
                      <SelectItem value="huggingface">Hugging Face (Inference Providers)</SelectItem>
                      <SelectItem value="google-gemini">Google Gemini</SelectItem>
                      <SelectItem value="openai" disabled>OpenAI (Coming Soon)</SelectItem>
                      <SelectItem value="anthropic" disabled>Anthropic (Coming Soon)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Target Model
                  </label>
                  <Select
                    value={selectedModel}
                    onValueChange={setSelectedModel}
                  >
                    <SelectTrigger className="rounded-xl bg-white/[0.05] border-white/12 text-xs text-white hover:border-white/20 focus:border-white/30">
                      <SelectValue placeholder="Select Model" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#18181a] border-white/12 text-slate-200 text-xs rounded-xl shadow-2xl">
                      {selectedProvider === 'huggingface' ? (
                        <>
                          <SelectItem value="Qwen/Qwen3-Coder-480B-A35B-Instruct">
                            Qwen3-Coder-480B-A35B-Instruct (Primary)
                          </SelectItem>
                          <SelectItem value="Qwen/Qwen2.5-Coder-32B-Instruct">
                            Qwen2.5-Coder-32B-Instruct
                          </SelectItem>
                          <SelectItem value="deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct">
                            DeepSeek-Coder-V2-Lite-Instruct
                          </SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="gemini-2.5-flash">
                            Gemini 2.5 Flash (Recommended)
                          </SelectItem>
                          <SelectItem value="gemini-flash-latest">
                            Gemini Flash Latest
                          </SelectItem>
                          <SelectItem value="gemini-2.5-pro">
                            Gemini 2.5 Pro
                          </SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Key Input Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">
                    {selectedProvider === 'huggingface'
                      ? 'Hugging Face Token'
                      : 'Google Gemini API Key'}
                  </label>
                  <a
                    href={
                      selectedProvider === 'huggingface'
                        ? 'https://huggingface.co/settings/tokens'
                        : 'https://aistudio.google.com/app/apikey'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
                  >
                    <span>
                      Get {selectedProvider === 'huggingface' ? 'Hugging Face Token' : 'AI Studio Key'}
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="relative">
                  <Input
                    type={showKeyText ? 'text' : 'password'}
                    value={inputApiKey}
                    onChange={(e) => setInputApiKey(e.target.value)}
                    placeholder={
                      selectedProvider === 'huggingface'
                        ? 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                        : 'AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                    }
                    className="rounded-xl bg-white/[0.05] border-white/12 text-xs text-white placeholder:text-slate-500 pr-10 focus:border-emerald-500/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyText(!showKeyText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                  >
                    {showKeyText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Actions & Submit */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                  <Lock className="h-3.5 w-3.5 text-emerald-400" />
                  <span>AES-256-GCM hardware authenticated encryption</span>
                </div>

                <Button
                  type="submit"
                  size="sm"
                  disabled={isSavingKey || !inputApiKey.trim()}
                  className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs px-5 py-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                >
                  {isSavingKey ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      <span>Validating & Encrypting...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-black" />
                      <span>Save & Encrypt Key</span>
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* Cryptographic & Access Policy Notice */}
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-semibold text-[11px]">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Administrator Security Guarantees</span>
              </div>
              <ul className="text-slate-400 space-y-1 text-[11px] list-disc list-inside">
                <li>Credentials are validated against upstream model endpoints before storage.</li>
                <li>Keys are stored using AES-256-GCM cipher with random IVs and verification tags.</li>
                <li>Normal users cannot view, query, or edit platform keys (enforced by RLS & API authorization).</li>
                <li>API responses only return masked hints (••••••••1234) and never expose raw secrets.</li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
