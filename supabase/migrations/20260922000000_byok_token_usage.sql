-- ==============================================================================
-- Migration: 20260922000000_byok_token_usage.sql
-- Adds support for User Bring-Your-Own-Key (BYOK) and granular AI Token Usage tracking
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. user_ai_keys (Encrypted BYOK Storage)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_ai_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'google-gemini',
    model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    encrypted_key TEXT NOT NULL,
    key_hint TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_ai_keys_user_id ON public.user_ai_keys(user_id);

-- Enable RLS
ALTER TABLE public.user_ai_keys ENABLE ROW LEVEL SECURITY;

-- Policies for user_ai_keys: only user can access their own encrypted keys
DROP POLICY IF EXISTS "Users can manage own ai keys" ON public.user_ai_keys;
CREATE POLICY "Users can manage own ai keys"
    ON public.user_ai_keys FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. ai_token_usage (Granular Real-Time Token Analytics)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'google-gemini',
    model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    operation TEXT NOT NULL, -- 'PLAN', 'GENERATE', 'DEBUG', 'FIX', 'CHAT', 'REFACTOR', 'ANALYZE'
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    key_source TEXT NOT NULL DEFAULT 'platform', -- 'platform' | 'byok'
    success BOOLEAN NOT NULL DEFAULT TRUE,
    latency_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_token_usage_user_id ON public.ai_token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_project_id ON public.ai_token_usage(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_created_at ON public.ai_token_usage(created_at DESC);

-- Enable RLS
ALTER TABLE public.ai_token_usage ENABLE ROW LEVEL SECURITY;

-- Policies for ai_token_usage
DROP POLICY IF EXISTS "Users can view own token usage" ON public.ai_token_usage;
CREATE POLICY "Users can view own token usage"
    ON public.ai_token_usage FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own token usage" ON public.ai_token_usage;
CREATE POLICY "Users can insert own token usage"
    ON public.ai_token_usage FOR INSERT
    WITH CHECK (auth.uid() = user_id);
