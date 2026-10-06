-- Migration: 20261006000000_credit_system_refinement.sql
-- Production-Ready Lovable/v0-style Credit System Refinement for Codatron.ai
-- Sets standard user allowance to 100 credits, introduces usage-based credit costs,
-- and enforces atomic concurrency safety with canonical server-side admin bypass.

-- 1. Upgrade default credit limit to 100 for all users
ALTER TABLE public.profiles 
ALTER COLUMN credit_limit SET DEFAULT 100;

UPDATE public.profiles 
SET credit_limit = 100 
WHERE credit_limit < 100;

-- 2. Update admin settings default credit limit
UPDATE public.admin_settings 
SET default_credit_limit = 100 
WHERE id = 'global';

-- 3. Drop existing overloaded functions to avoid signature conflicts
DROP FUNCTION IF EXISTS public.reserve_user_credit(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.reserve_user_credit(UUID);
DROP FUNCTION IF EXISTS public.finalize_user_credit(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.release_user_credit(UUID);

-- 4. Concurrency-Safe Multi-Credit Reservation Function
CREATE OR REPLACE FUNCTION public.reserve_user_credit(
    p_user_id UUID,
    p_amount INTEGER DEFAULT 10,
    p_limit INTEGER DEFAULT 100
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
    v_role TEXT;
    v_req_amount INTEGER;
BEGIN
    v_req_amount := GREATEST(1, COALESCE(p_amount, 10));

    SELECT credits_used, credits_reserved, credit_limit, role
    INTO v_used, v_reserved, v_limit, v_role
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.profiles (id, email, credit_limit, credits_used, credits_reserved)
        SELECT p_user_id, email, COALESCE(p_limit, 100), 0, v_req_amount
        FROM auth.users
        WHERE id = p_user_id;
        RETURN TRUE;
    END IF;

    -- Canonical server-side admin check: Administrators bypass Codatron credit limits
    IF v_role = 'admin' THEN
        RETURN TRUE;
    END IF;

    v_limit := COALESCE(v_limit, p_limit, 100);

    IF (COALESCE(v_used, 0) + COALESCE(v_reserved, 0) + v_req_amount) > v_limit THEN
        RETURN FALSE;
    END IF;

    UPDATE public.profiles
    SET credits_reserved = COALESCE(credits_reserved, 0) + v_req_amount,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

-- 5. Concurrency-Safe Multi-Credit Finalization Function
CREATE OR REPLACE FUNCTION public.finalize_user_credit(
    p_user_id UUID,
    p_success BOOLEAN,
    p_amount INTEGER DEFAULT 10
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req_amount INTEGER;
BEGIN
    v_req_amount := GREATEST(1, COALESCE(p_amount, 10));

    UPDATE public.profiles
    SET credits_reserved = GREATEST(0, COALESCE(credits_reserved, 0) - v_req_amount),
        credits_used = CASE 
            WHEN p_success THEN COALESCE(credits_used, 0) + v_req_amount 
            ELSE COALESCE(credits_used, 0) 
        END,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$;

-- 6. Concurrency-Safe Multi-Credit Release Function
CREATE OR REPLACE FUNCTION public.release_user_credit(
    p_user_id UUID,
    p_amount INTEGER DEFAULT 10
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req_amount INTEGER;
BEGIN
    v_req_amount := GREATEST(1, COALESCE(p_amount, 10));

    UPDATE public.profiles
    SET credits_reserved = GREATEST(0, COALESCE(credits_reserved, 0) - v_req_amount),
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$;
