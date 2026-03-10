-- Migration: Fix currency column defaults from NGN to USD
-- Date: 2026-03-11
-- Description: Billing is in USD. Change all currency column defaults from
--              'NGN' to 'USD' and update any existing rows still set to NGN.

-- 1. user_plans.currency default
ALTER TABLE public.user_plans
  ALTER COLUMN currency SET DEFAULT 'USD';

-- 2. payment_transactions.currency default
ALTER TABLE public.payment_transactions
  ALTER COLUMN currency SET DEFAULT 'USD';

-- 3. Update existing rows that still have the old default
UPDATE public.user_plans SET currency = 'USD' WHERE currency = 'NGN';
UPDATE public.payment_transactions SET currency = 'USD' WHERE currency = 'NGN';
