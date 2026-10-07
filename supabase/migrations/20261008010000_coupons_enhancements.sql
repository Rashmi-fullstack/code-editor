-- ==============================================================================
-- Codatron.ai — Coupons Table Enhancements: description & deleted_at columns
-- ==============================================================================

ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_coupons_deleted_at ON public.coupons(deleted_at);
