-- ==============================================================================
-- Codatron.ai — Billing Plans, Coupons & Razorpay Configuration Migration
-- ==============================================================================

-- 1. Subscription Plans Table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_inr INTEGER NOT NULL DEFAULT 0,
    billing_interval TEXT NOT NULL DEFAULT 'month', -- 'month', 'year', 'one_time'
    credits INTEGER NOT NULL DEFAULT 100,           -- -1 for unlimited
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    badge TEXT,
    razorpay_plan_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON public.subscription_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_order ON public.subscription_plans(display_order);

-- 2. Coupons Table
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    discount_type TEXT NOT NULL DEFAULT 'percent', -- 'percent', 'fixed'
    discount_value NUMERIC NOT NULL,
    max_redemptions INTEGER,
    redemptions_count INTEGER NOT NULL DEFAULT 0,
    per_user_limit INTEGER NOT NULL DEFAULT 1,
    min_plan_amount NUMERIC NOT NULL DEFAULT 0,
    applicable_plans JSONB NOT NULL DEFAULT '[]'::jsonb,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(is_active);

-- 3. Coupon Redemptions Table
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID REFERENCES public.coupons(id) ON DELETE CASCADE,
    coupon_code TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT,
    plan_id TEXT NOT NULL,
    discount_applied NUMERIC NOT NULL DEFAULT 0,
    final_price NUMERIC NOT NULL DEFAULT 0,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON public.coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON public.coupon_redemptions(coupon_id);

-- 4. Extend Admin Settings for Razorpay Configuration
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'admin_settings' AND column_name = 'razorpay_key_id'
    ) THEN
        ALTER TABLE public.admin_settings ADD COLUMN razorpay_key_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'admin_settings' AND column_name = 'razorpay_secret_set'
    ) THEN
        ALTER TABLE public.admin_settings ADD COLUMN razorpay_secret_set BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'admin_settings' AND column_name = 'razorpay_webhook_secret_set'
    ) THEN
        ALTER TABLE public.admin_settings ADD COLUMN razorpay_webhook_secret_set BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'admin_settings' AND column_name = 'razorpay_enabled'
    ) THEN
        ALTER TABLE public.admin_settings ADD COLUMN razorpay_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- 5. Seed default plans
INSERT INTO public.subscription_plans (id, name, description, price_inr, billing_interval, credits, badge, is_active, is_published, display_order, features)
VALUES 
(
    'free',
    'Starter Free',
    'Initial allowance for autonomous AI web application synthesis.',
    0,
    'month',
    100,
    'Starter',
    TRUE,
    TRUE,
    0,
    '["100 Codatron AI credits", "Autonomous project architecture & code synthesis", "Instant in-browser WebContainer preview runtime", "Monaco Code Editor with zero-cost manual editing", "Full project ZIP export"]'::jsonb
),
(
    'pro',
    'Developer Pro',
    'For active builders creating production-ready applications.',
    499,
    'month',
    500,
    'Most Popular',
    TRUE,
    TRUE,
    1,
    '["500 Codatron AI credits / month", "Up to 50 AI generation & refactoring operations", "High-priority generation queues & low latency", "Autonomous Product Manager planning & roadmaps", "Custom BYOK personal API key integration", "Unlimited manual editing, preview & live HMR"]'::jsonb
),
(
    'premium',
    'Team Premium',
    'For teams and studios shipping complex multi-page applications.',
    999,
    'month',
    1200,
    'Best Value',
    TRUE,
    TRUE,
    2,
    '["1,200 Codatron AI credits / month", "Multi-seat collaboration & shared workspaces", "Deep multi-file refactoring & automatic repair loops", "Dedicated engineering support & custom models", "All Developer Pro features included"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price_inr = EXCLUDED.price_inr,
    credits = EXCLUDED.credits,
    features = EXCLUDED.features,
    updated_at = NOW();

-- 6. Seed initial coupon
INSERT INTO public.coupons (code, discount_type, discount_value, max_redemptions, per_user_limit, expires_at, is_active)
VALUES ('WELCOME20', 'percent', 20, 100, 1, '2026-12-31 23:59:59+00', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 7. Row Level Security Policies for Billing & Plans
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published plans" ON public.subscription_plans;
CREATE POLICY "Public can view published plans"
    ON public.subscription_plans FOR SELECT
    USING (is_published = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage plans" ON public.subscription_plans;
CREATE POLICY "Admins can manage plans"
    ON public.subscription_plans FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;
CREATE POLICY "Anyone can view active coupons"
    ON public.coupons FOR SELECT
    USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;
CREATE POLICY "Admins can manage coupons"
    ON public.coupons FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own redemptions" ON public.coupon_redemptions;
CREATE POLICY "Users can view own redemptions"
    ON public.coupon_redemptions FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert own redemptions" ON public.coupon_redemptions;
CREATE POLICY "Users can insert own redemptions"
    ON public.coupon_redemptions FOR INSERT
    WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- 8. Core Application Tables Admin Visibility
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
    ON public.profiles FOR UPDATE
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all projects" ON public.projects;
CREATE POLICY "Admins can view all projects"
    ON public.projects FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all projects" ON public.projects;
CREATE POLICY "Admins can update all projects"
    ON public.projects FOR UPDATE
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all ai token usage" ON public.ai_token_usage;
CREATE POLICY "Admins can view all ai token usage"
    ON public.ai_token_usage FOR SELECT
    USING (public.is_admin());

