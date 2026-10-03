-- ==============================================================================
-- Migration: 20260923000000_ai_credits_and_account_management.sql
-- Adds Application-Level AI Credit Quota, Atomic Concurrency Controls, and
-- Usage Linking for Codatron.ai
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extend profiles with Credit Counters
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS credit_limit INTEGER NOT NULL DEFAULT 4,
ADD COLUMN IF NOT EXISTS credits_used INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS credits_reserved INTEGER NOT NULL DEFAULT 0;

-- ------------------------------------------------------------------------------
-- 2. Extend ai_token_usage with credit_used metric
-- ------------------------------------------------------------------------------
ALTER TABLE public.ai_token_usage
ADD COLUMN IF NOT EXISTS credit_used INTEGER NOT NULL DEFAULT 0;

-- ------------------------------------------------------------------------------
-- 3. Concurrency-Safe Atomic Credit Reservation Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_user_credit(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 4
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_used INTEGER;
    v_reserved INTEGER;
    v_limit INTEGER;
BEGIN
    -- Lock user profile row against concurrent transactions
    SELECT credits_used, credits_reserved, credit_limit
    INTO v_used, v_reserved, v_limit
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    -- If profile row does not exist yet, create default entry
    IF NOT FOUND THEN
        INSERT INTO public.profiles (id, email, credit_limit, credits_used, credits_reserved)
        SELECT p_user_id, email, COALESCE(p_limit, 4), 0, 1
        FROM auth.users
        WHERE id = p_user_id;

        RETURN TRUE;
    END IF;

    -- Calculate effective ceiling
    v_limit := COALESCE(v_limit, p_limit, 4);

    -- Check available credit
    IF (COALESCE(v_used, 0) + COALESCE(v_reserved, 0)) >= v_limit THEN
        RETURN FALSE;
    END IF;

    -- Reserve 1 credit atomically
    UPDATE public.profiles
    SET credits_reserved = COALESCE(credits_reserved, 0) + 1,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Concurrency-Safe Atomic Credit Finalization Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_user_credit(
    p_user_id UUID,
    p_success BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET credits_reserved = GREATEST(0, COALESCE(credits_reserved, 0) - 1),
        credits_used = CASE 
            WHEN p_success THEN COALESCE(credits_used, 0) + 1 
            ELSE COALESCE(credits_used, 0) 
        END,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Release Credit Helper Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_user_credit(
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET credits_reserved = GREATEST(0, COALESCE(credits_reserved, 0) - 1),
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$;
