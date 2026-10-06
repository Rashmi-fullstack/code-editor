-- ==============================================================================
-- Codatron.ai — Admin Control Panel Migration
-- ==============================================================================
-- Adds role & account status to profiles, admin audit logs, system errors,
-- provider health telemetry, and global administrative settings.
-- ==============================================================================

-- 1. Extend profiles with role and status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- 2. Admin Audit Logs Table
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON public.admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);

-- 3. System Errors Table (Structured Error Logging & Rate Limit Tracking)
CREATE TABLE IF NOT EXISTS public.system_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    severity TEXT NOT NULL DEFAULT 'ERROR', -- INFO, WARNING, ERROR, CRITICAL
    category TEXT NOT NULL,                -- AI_PROVIDER, RATE_LIMIT, AUTH, RUNTIME, PREVIEW, DATABASE, COMPILATION
    provider TEXT,                         -- huggingface, google-gemini, webcontainer, platform
    status_code INTEGER,                   -- 429, 503, 401, 500, etc.
    message TEXT NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_errors_severity ON public.system_errors(severity);
CREATE INDEX IF NOT EXISTS idx_system_errors_category ON public.system_errors(category);
CREATE INDEX IF NOT EXISTS idx_system_errors_provider ON public.system_errors(provider);
CREATE INDEX IF NOT EXISTS idx_system_errors_last_seen ON public.system_errors(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_errors_resolved ON public.system_errors(resolved_at);

-- 4. Provider Health Telemetry Table
CREATE TABLE IF NOT EXISTS public.provider_health_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,                -- huggingface, google-gemini
    model TEXT,
    status TEXT NOT NULL,                  -- operational, degraded, unavailable, fallback
    event_type TEXT NOT NULL,              -- request_success, request_error, fallback_triggered, rate_limit
    status_code INTEGER,
    latency_ms INTEGER,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_health_provider ON public.provider_health_events(provider);
CREATE INDEX IF NOT EXISTS idx_provider_health_created_at ON public.provider_health_events(created_at DESC);

-- 5. Admin Settings Table
CREATE TABLE IF NOT EXISTS public.admin_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    primary_provider TEXT NOT NULL DEFAULT 'huggingface',
    fallback_provider TEXT NOT NULL DEFAULT 'google-gemini',
    auto_fallback_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
    new_registrations_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    default_credit_limit INTEGER NOT NULL DEFAULT 4,
    system_announcement TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
);

-- Seed initial admin settings if not present
INSERT INTO public.admin_settings (id, primary_provider, fallback_provider, auto_fallback_enabled, maintenance_mode)
VALUES ('global', 'huggingface', 'google-gemini', TRUE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- 6. Row Level Security Policies
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_health_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current authenticated user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- Policies for admin_audit_logs: Admins can view and insert
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can view audit logs"
    ON public.admin_audit_logs FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can insert audit logs"
    ON public.admin_audit_logs FOR INSERT
    WITH CHECK (public.is_admin());

-- Policies for system_errors: Admins can view/update; authenticated users can insert client errors
DROP POLICY IF EXISTS "Admins can view system errors" ON public.system_errors;
CREATE POLICY "Admins can view system errors"
    ON public.system_errors FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update system errors" ON public.system_errors;
CREATE POLICY "Admins can update system errors"
    ON public.system_errors FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can insert system errors" ON public.system_errors;
CREATE POLICY "Users can insert system errors"
    ON public.system_errors FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Policies for provider_health_events: Admins can view
DROP POLICY IF EXISTS "Admins can view provider events" ON public.provider_health_events;
CREATE POLICY "Admins can view provider events"
    ON public.provider_health_events FOR SELECT
    USING (public.is_admin());

-- Policies for admin_settings: Everyone can read public settings, admins can update
DROP POLICY IF EXISTS "Everyone can view admin settings" ON public.admin_settings;
CREATE POLICY "Everyone can view admin settings"
    ON public.admin_settings FOR SELECT
    USING (TRUE);

DROP POLICY IF EXISTS "Admins can update admin settings" ON public.admin_settings;
CREATE POLICY "Admins can update admin settings"
    ON public.admin_settings FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
