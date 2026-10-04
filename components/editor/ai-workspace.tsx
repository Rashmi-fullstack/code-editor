'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  FileCode,
  X,
  Code2,
  Zap,
  Check,
  ChevronRight,
  Bot,
  User,
  Paperclip,
  Square,
  Terminal,
  Copy,
  Edit2,
  RotateCcw,
  ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { BorderBeam } from '@/components/ui/border-beam';
import { useCredits } from '@/components/credit-provider';
import { toast } from 'sonner';
import type { ProjectFile } from '@/lib/types/database';

export type AiMode = 'build' | 'code' | 'debug';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: AiMode;
  timestamp: Date;
  status?: 'pending' | 'success' | 'error';
  stages?: string[];
  currentStage?: string;
  plan?: string[];
  operations?: Array<{ type: string; path: string; newPath?: string }>;
  filesCount?: number;
  error?: string;
  isFixed?: boolean;
  attachedImage?: string;
  isExhaustedRetry?: boolean;
}

export interface AIWorkspaceProps {
  files: ProjectFile[];
  activePath: string;
  dirtyPaths?: Set<string>;
  onOpenFile: (file: ProjectFile) => void;
  onCreateFile?: (path: string) => Promise<void> | void;
  onCreateFolder?: (path: string) => Promise<void> | void;
  onRenameFile?: (file: ProjectFile, newPath: string) => Promise<void> | void;
  onDeleteFile?: (file: ProjectFile) => Promise<void> | void;
  prompt: string;
  setPrompt: (value: string) => void;
  selectedCode?: string;
  onClearSelectedCode?: () => void;
  previewError?: string;
  onClearPreviewError?: () => void;
  isWorking: boolean;
  onGenerate: (overridePrompt?: string, mode?: AiMode, referenceImage?: string) => Promise<unknown> | void;
  onStopWorking?: () => void;
  onOpenDiagnostics?: () => void;
  projectId?: string;
  currentMode: AiMode;
  onModeChange: (mode: AiMode) => void;
  conversation: AiMessage[];
  generationStage?: string;
  onSelectGeneratedFile?: (path: string) => void;
  keySource?: 'platform' | 'byok';
  activeTab?: 'ai' | 'files';
  onActiveTabChange?: (tab: 'ai' | 'files') => void;
  modelDisplayName?: string;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  isChatLoading?: boolean;
}

const BUILD_SUGGESTIONS = [
  'Build a Netflix-style streaming homepage with dark theme, cinematic hero, movie rows, and search',
  'Build a modern developer portfolio with project showcases, skills matrix, and contact form',
  'Create a SaaS analytics dashboard with chart widgets, KPI metrics, and dark mode',
  'Build an e-commerce storefront with cart drawer, product grid, and category filters',
];

const CODE_SUGGESTIONS = [
  'Make the hero section taller and add more movie posters',
  'Add live search filtering with real-time query highlight',
  'Refactor into clean reusable functional components with TypeScript types',
  'Add a sleek mobile navigation drawer and responsive layout',
];

export function AIWorkspace({
  files,
  activePath,
  onOpenFile,
  prompt,
  setPrompt,
  selectedCode,
  onClearSelectedCode,
  isWorking,
  onGenerate,
  onStopWorking,
  onOpenDiagnostics,
  currentMode = 'build',
  conversation,
  generationStage,
  onSelectGeneratedFile,
  onEditMessage,
  onRegenerateMessage,
  isChatLoading = false,
}: AIWorkspaceProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { creditsRemaining } = useCredits();

  const [attachedImage, setAttachedImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const [expandedOps, setExpandedOps] = useState<Record<string, boolean>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState<boolean>(false);

  const isAtBottomRef = useRef<boolean>(true);
  const prevMsgCountRef = useRef<number>(conversation.length);

  // Track scroll position to prevent interrupting user while reading earlier messages
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
    isAtBottomRef.current = isAtBottom;
    setShowScrollBottom(!isAtBottom && conversation.length > 2);
  }, [conversation.length]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Scroll to bottom on initial mount or when user sends message
  useEffect(() => {
    if (conversation.length > prevMsgCountRef.current || isWorking) {
      if (isAtBottomRef.current || conversation.length - prevMsgCountRef.current > 0) {
        scrollToBottom('smooth');
      }
    }
    prevMsgCountRef.current = conversation.length;
  }, [conversation.length, isWorking]);

  const toggleOps = (msgId: string) => {
    setExpandedOps((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleStartEdit = (msg: AiMessage) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleConfirmEdit = (msgId: string) => {
    const trimmed = editContent.trim();
    if (!trimmed || isWorking) return;
    setEditingMessageId(null);
    setEditContent('');
    onEditMessage?.(msgId, trimmed);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, WebP, etc.)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachedImage({ name: file.name, dataUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSend = () => {
    if (isWorking || (!prompt.trim() && !attachedImage)) return;
    const imgData = attachedImage?.dataUrl;
    setAttachedImage(null);
    void onGenerate(undefined, currentMode, imgData);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileClick = (filePath: string) => {
    const f = files.find((item) => item.path === filePath);
    if (f) {
      onOpenFile(f);
      onSelectGeneratedFile?.(filePath);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#0a0b16] text-xs text-slate-200 select-none overflow-hidden relative">
      {/* Top Header: Clean Codatron AI Branding (No internal model/provider IDs) */}
      <div className="h-12 px-3.5 border-b border-white/10 bg-[#0d0f20] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-sm shadow-indigo-500/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-white text-xs tracking-tight">Codatron AI</span>
            </div>
            <p className="text-[10px] text-slate-400 font-normal">AI Application Builder</p>
          </div>
        </div>

        {/* Right Status Indicator & Credit Count */}
        <div className="flex items-center gap-2">
          {isWorking ? (
            <Badge
              variant="outline"
              className="border-indigo-500/30 bg-indigo-500/10 text-[10px] text-indigo-300 font-medium py-0.5 px-2 flex items-center gap-1.5"
            >
              <Loader2 className="h-2.5 w-2.5 animate-spin text-indigo-400" />
              <span>Building…</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300 font-medium py-0.5 px-2 flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span>Ready</span>
            </Badge>
          )}

          <div
            className="flex items-center gap-1 text-amber-400 text-[11px] font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md"
            title={`${creditsRemaining} AI credits available`}
          >
            <Zap className="h-3 w-3 fill-current" />
            <span>{creditsRemaining}</span>
          </div>
        </div>
      </div>

      {/* Main Conversation Feed */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 p-3.5 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-white/10 relative"
      >
        {/* Loading Conversation Skeleton (Non-blocking hydration) */}
        {isChatLoading && conversation.length === 0 && (
          <div className="space-y-3 py-2 animate-pulse">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
              <span>Loading conversation…</span>
            </div>
            <div className="h-16 rounded-xl bg-white/[0.03] border border-white/5" />
            <div className="h-20 rounded-xl bg-white/[0.03] border border-white/5" />
          </div>
        )}

        {/* Welcome Empty State (when conversation has 0 messages) */}
        {!isChatLoading && conversation.length === 0 && (
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/40 via-[#0d0f24] to-purple-950/20 p-4 space-y-2.5 shadow-xl">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-600 text-white">
                  <Sparkles className="h-3 w-3" />
                </span>
                <span>AI Application Builder</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Describe what you want to build. Codatron builds the full experience, creates responsive layouts,
                adds real visual assets, and prepares your live preview automatically.
              </p>
            </div>

            {/* Suggestions Chips */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-0.5">
                Suggested Prompts
              </p>
              <div className="space-y-1.5">
                {(files.length === 0 ? BUILD_SUGGESTIONS : CODE_SUGGESTIONS).map((text) => (
                  <button
                    key={text}
                    type="button"
                    disabled={isWorking}
                    onClick={() => {
                      setPrompt(text);
                      textareaRef.current?.focus();
                    }}
                    className="w-full text-left rounded-xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.08] hover:border-indigo-500/30 p-2.5 text-[11px] text-slate-300 transition group flex items-start justify-between gap-2 cursor-pointer"
                  >
                    <span className="leading-snug">{text}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition shrink-0 mt-0.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Conversation Messages */}
        {conversation.map((msg) => (
          <div key={msg.id} className="space-y-2.5">
            {msg.role === 'user' ? (
              /* User Message Bubble with ChatGPT-like Hover Actions & Inline Editing */
              <div className="group flex items-start gap-2 pl-6 justify-end relative">
                {/* Actions on hover (Copy & Edit) */}
                {editingMessageId !== msg.id && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      title="Copy prompt"
                    >
                      {copiedId === msg.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    </button>
                    {onEditMessage && (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(msg)}
                        disabled={isWorking}
                        className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
                        title="Edit prompt"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* Inline Editing Mode or Standard Display */}
                {editingMessageId === msg.id ? (
                  <div className="rounded-2xl rounded-tr-sm bg-[#15172b] border border-indigo-500/50 p-3 max-w-[95%] w-full shadow-xl space-y-2 text-left">
                    <div className="flex items-center gap-1.5 text-[10px] text-indigo-300 font-medium">
                      <Edit2 className="h-3 w-3" />
                      <span>Edit message</span>
                    </div>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                          e.preventDefault();
                          handleConfirmEdit(msg.id);
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      className="w-full text-xs font-normal p-2 rounded-lg bg-black/40 border border-white/10 text-white focus-visible:ring-1 focus-visible:ring-indigo-400 min-h-[64px]"
                      autoFocus
                      rows={3}
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                        className="h-6 px-2.5 text-[11px] text-slate-400 hover:text-white"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!editContent.trim() || isWorking}
                        onClick={() => handleConfirmEdit(msg.id)}
                        className="h-6 px-3 text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                      >
                        Update
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl rounded-tr-sm bg-indigo-600/90 text-white px-3.5 py-2.5 max-w-[90%] text-xs shadow-md space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-indigo-200/80 font-medium">
                      <User className="h-3 w-3" />
                      <span>You</span>
                      <span>•</span>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {msg.attachedImage && (
                      <div className="rounded-lg overflow-hidden border border-white/20 max-w-[220px] max-h-[140px] bg-black/40">
                        <img
                          src={msg.attachedImage}
                          alt="Reference Attachment"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                )}
              </div>
            ) : (
              /* AI Response Message Bubble with Natural Conversational Tone, Compact Changes, & Hover Actions */
              <div className="group flex items-start gap-2.5 pr-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-md mt-0.5">
                  <Bot className="h-3.5 w-3.5" />
                </div>

                <div className="flex-1 space-y-2 min-w-0">
                  <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-[#0e1022] p-3.5 text-xs space-y-2.5 shadow-md">
                    {/* Natural Conversational Response Text */}
                    <div className="text-slate-200 leading-relaxed font-normal whitespace-pre-wrap">
                      {msg.content}
                    </div>

                    {/* Temporary Progress Stages Stepper (ONLY visible during active execution) */}
                    {msg.status === 'pending' && (
                      <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/30 p-2.5 space-y-2">
                        <div className="flex items-center gap-2 text-indigo-300 font-medium text-[11px]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                          <span>{msg.currentStage || generationStage || 'Building your application…'}</span>
                        </div>
                        {msg.stages && msg.stages.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-indigo-500/10">
                            {msg.stages.map((stg) => {
                              const stageIdx = msg.stages!.indexOf(stg);
                              const currentIdx = msg.stages!.indexOf(msg.currentStage || '');
                              const isDone = currentIdx > stageIdx;
                              const isCurrent = msg.currentStage === stg;

                              return (
                                <div key={stg} className="flex items-center gap-2 text-[10px]">
                                  {isDone ? (
                                    <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                                  ) : isCurrent ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-indigo-400 shrink-0" />
                                  ) : (
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0 ml-0.5 mr-1" />
                                  )}
                                  <span className={isDone ? 'text-slate-300' : isCurrent ? 'text-indigo-200 font-medium' : 'text-slate-500'}>
                                    {stg}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="h-1.5 w-full bg-indigo-950/80 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 animate-pulse w-3/4 rounded-full" />
                        </div>
                      </div>
                    )}

                    {/* Compact Collapsible File Changes Summary (Part 12) */}
                    {msg.status === 'success' && msg.operations && msg.operations.length > 0 && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => toggleOps(msg.id)}
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition cursor-pointer bg-white/[0.03] hover:bg-white/[0.07] px-2.5 py-1 rounded-lg border border-white/5"
                        >
                          <FileCode className="h-3 w-3 text-indigo-400" />
                          <span>
                            {msg.operations.length} {msg.operations.length === 1 ? 'file changed' : 'files changed'}
                          </span>
                          <ChevronRight
                            className={`h-3 w-3 transition-transform text-slate-500 ${
                              expandedOps[msg.id] ? 'rotate-90 text-indigo-400' : ''
                            }`}
                          />
                        </button>

                        {expandedOps[msg.id] && (
                          <div className="mt-2 rounded-xl border border-white/10 bg-black/50 p-2 space-y-1 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                            {msg.operations.map((op) => {
                              const isCreate = op.type === 'create';
                              const isUpdate = op.type === 'update';
                              const isDelete = op.type === 'delete';

                              return (
                                <button
                                  key={op.path}
                                  type="button"
                                  onClick={() => handleFileClick(op.path)}
                                  className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg text-[11px] font-mono text-slate-300 hover:bg-white/10 hover:text-white transition group text-left cursor-pointer"
                                  title={`Open ${op.path} in code editor`}
                                >
                                  <span className="flex items-center gap-1.5 truncate">
                                    <span
                                      className={`font-bold text-xs ${
                                        isCreate
                                          ? 'text-emerald-400'
                                          : isUpdate
                                          ? 'text-blue-400'
                                          : isDelete
                                          ? 'text-rose-400'
                                          : 'text-purple-400'
                                      }`}
                                    >
                                      {isCreate ? '+' : isUpdate ? '~' : isDelete ? '-' : '→'}
                                    </span>
                                    <span className="truncate">{op.path}</span>
                                  </span>

                                  <span
                                    className={`text-[9px] uppercase font-sans font-semibold px-1.5 py-0.5 rounded tracking-wider shrink-0 ${
                                      isCreate
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : isUpdate
                                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                        : isDelete
                                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                        : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                    }`}
                                  >
                                    {isCreate ? 'CREATE' : isUpdate ? 'UPDATE' : isDelete ? 'DELETE' : 'RENAME'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Polite Recovery Card on Exceeded Retries */}
                    {msg.status === 'error' && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                        <p className="text-slate-300 text-[11px] leading-relaxed">
                          I couldn&apos;t finish this change automatically. You can ask me to try again or open Diagnostics for details.
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            onClick={() => void onGenerate()}
                            disabled={isWorking}
                            className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3"
                          >
                            Try again
                          </Button>
                          {onOpenDiagnostics && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={onOpenDiagnostics}
                              className="h-7 text-xs border-white/10 text-slate-300 hover:bg-white/10 px-3 gap-1"
                            >
                              <Terminal className="h-3 w-3" />
                              <span>View details</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Conversational Action Bar on hover: Copy & Regenerate */}
                    {msg.status !== 'pending' && (
                      <div className="flex items-center justify-between pt-1 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
                            title="Copy response"
                          >
                            {copiedId === msg.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                            <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                          </button>
                          {onRegenerateMessage && (
                            <button
                              type="button"
                              onClick={() => onRegenerateMessage(msg.id)}
                              disabled={isWorking}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer disabled:opacity-50"
                              title="Regenerate response"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Regenerate</span>
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-28 right-5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/90 text-white shadow-lg hover:bg-indigo-500 transition cursor-pointer"
          title="Scroll to latest message"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Bottom Prompt Composer */}
      <div className="p-3 border-t border-white/10 bg-[#0d0f20]/95 backdrop-blur-md space-y-2 shrink-0">
        {/* Active Context Chips (active file or selected code) */}
        {(activePath || selectedCode) && (
          <div className="flex items-center gap-1.5 overflow-x-auto text-[10px] pb-0.5">
            {activePath && (
              <span className="flex items-center gap-1 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md text-slate-300 font-mono truncate">
                <FileCode className="h-2.5 w-2.5 text-blue-400 shrink-0" />
                <span className="truncate">{activePath}</span>
              </span>
            )}
            {selectedCode && (
              <span className="flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-md text-cyan-300 truncate">
                <Code2 className="h-2.5 w-2.5 text-cyan-400 shrink-0" />
                <span>Selected snippet</span>
                {onClearSelectedCode && (
                  <button
                    type="button"
                    onClick={onClearSelectedCode}
                    className="hover:text-white ml-0.5 cursor-pointer"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            )}
          </div>
        )}

        {/* Hidden File Input for Reference Images */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />

        {/* Composer Box */}
        <div className="relative rounded-2xl border border-white/10 bg-slate-950/80 p-2.5 focus-within:border-indigo-500/60 shadow-inner transition space-y-2">
          {isWorking && (
            <BorderBeam size={80} duration={3} colorFrom="#8b5cf6" colorTo="#3b82f6" />
          )}

          {/* Attached Image Preview Chip */}
          {attachedImage && (
            <div className="flex items-center gap-2 bg-indigo-950/50 border border-indigo-500/30 rounded-xl p-1.5 text-[11px] text-indigo-200">
              <img
                src={attachedImage.dataUrl}
                alt="Attachment"
                className="w-7 h-7 rounded-lg object-cover border border-indigo-400/40"
              />
              <span className="truncate max-w-[200px] font-mono text-[10px] text-indigo-300">
                {attachedImage.name}
              </span>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="text-slate-400 hover:text-white ml-auto p-1 rounded-md hover:bg-white/10 cursor-pointer"
                title="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isWorking}
            placeholder={
              isWorking
                ? 'Building your application…'
                : 'Describe what you want to build or change…'
            }
            rows={2}
            className="w-full resize-none border-0 bg-transparent p-1 text-xs leading-relaxed text-slate-200 placeholder:text-slate-500 focus-visible:ring-0 min-h-[48px] max-h-[140px]"
          />

          <div className="flex items-center justify-between pt-1 border-t border-white/5">
            {/* Attachment Button */}
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isWorking}
                className="h-7 px-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 gap-1.5 rounded-lg cursor-pointer"
                title="Attach reference image or mockup"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Attach Image</span>
              </Button>
            </div>

            {/* Action Buttons: Stop (while working) or Send */}
            <div className="flex items-center gap-1.5">
              {isWorking && onStopWorking && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onStopWorking}
                  className="h-7 px-2.5 text-[11px] text-red-300 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 gap-1 rounded-lg cursor-pointer"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  <span>Stop</span>
                </Button>
              )}

              <Button
                onClick={handleSend}
                disabled={isWorking || (!prompt.trim() && !attachedImage)}
                size="sm"
                className="h-7 gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 px-3.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 active:scale-95 disabled:opacity-50 transition cursor-pointer"
              >
                {isWorking ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Building…</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3 w-3" />
                    <span>Send</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
