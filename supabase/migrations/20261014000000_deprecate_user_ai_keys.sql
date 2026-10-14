-- ==============================================================================
-- Migration: 20261014000000_deprecate_user_ai_keys.sql
-- Description: Deprecate user-owned Bring-Your-Own-Key (BYOK) storage and enforce
--              centralized platform AI routing.
--
-- Safety: Non-destructive migration. Revokes normal-user access to personal API
--         key storage, closes BYOK client attack surface, and restricts access
--         strictly to service role / platform administrators during data retention.
--
-- Preservation: Does NOT drop platform configurations, admin settings,
--               ai_token_usage analytics, credits, generation history, or subscriptions.
-- ==============================================================================

-- 1. Ensure table exists before updating policies
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_ai_keys') THEN
        -- 2. Drop user-facing management policy so normal users can no longer read/write personal keys
        DROP POLICY IF EXISTS "Users can manage own ai keys" ON public.user_ai_keys;

        -- 3. Ensure Row Level Security is active
        ALTER TABLE public.user_ai_keys ENABLE ROW LEVEL SECURITY;

        -- 4. Restrict access strictly to authenticated platform administrators for retention/audit
        DROP POLICY IF EXISTS "Admins only access user ai keys" ON public.user_ai_keys;
        CREATE POLICY "Admins only access user ai keys"
            ON public.user_ai_keys FOR ALL
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.admin_users
                    WHERE admin_users.user_id = auth.uid()
                    AND admin_users.is_active = TRUE
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.admin_users
                    WHERE admin_users.user_id = auth.uid()
                    AND admin_users.is_active = TRUE
                )
            );

        -- 5. Mark table as deprecated in Postgres comments
        COMMENT ON TABLE public.user_ai_keys IS
            'DEPRECATED: Normal-user BYOK has been removed. All inference is routed through centralized platform AI. Maintained only for administrative retention.';
    END IF;
END $$;

-- ==============================================================================
-- REVERSAL SCRIPT (Rollback):
-- To restore normal user access if ever required:
--
-- DROP POLICY IF EXISTS "Admins only access user ai keys" ON public.user_ai_keys;
-- CREATE POLICY "Users can manage own ai keys"
--     ON public.user_ai_keys FOR ALL
--     USING (auth.uid() = user_id)
--     WITH CHECK (auth.uid() = user_id);
-- ==============================================================================
-- PERMANENT DELETION (Post-Retention):
-- Once all legacy keys are expired or purged:
-- DROP TABLE IF EXISTS public.user_ai_keys;
-- ==============================================================================
