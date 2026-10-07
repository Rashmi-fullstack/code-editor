-- ==============================================================================
-- Codatron.ai — Payments & Subscriptions Live Monitor Enhancements
-- ==============================================================================

-- 1. Add payment_method column to payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- 2. Add performance indexes for real-time querying & sorting
CREATE INDEX IF NOT EXISTS idx_payments_created_at_desc ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_plan_id ON public.payments(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON public.subscriptions(current_period_end);
