-- Migration: Add platform admin RLS policies for billing tables
-- Description: Allows platform admins to view all subscriptions, payment_transactions,
--              and manage user_plans pricing.
-- Dependencies: 20260309000000_add_flutterwave_subscription_tables.sql

-- =============================================================================
-- 1. Platform admins can view ALL subscriptions
-- =============================================================================
DROP POLICY IF EXISTS subscriptions_select_platform_admin ON public.subscriptions;
CREATE POLICY subscriptions_select_platform_admin
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- =============================================================================
-- 2. Platform admins can view ALL payment_transactions
-- =============================================================================
DROP POLICY IF EXISTS payment_transactions_select_platform_admin ON public.payment_transactions;
CREATE POLICY payment_transactions_select_platform_admin
  ON public.payment_transactions
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- =============================================================================
-- 3. Platform admins can view ALL user_plans (including inactive ones)
--    The existing policy only allows SELECT where is_active = true.
--    Admins need to see inactive plans too for management.
-- =============================================================================
DROP POLICY IF EXISTS user_plans_select_platform_admin ON public.user_plans;
CREATE POLICY user_plans_select_platform_admin
  ON public.user_plans
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- =============================================================================
-- 4. CRITICAL: Platform admins can UPDATE user_plans (pricing, Flutterwave IDs)
--    Without this policy, the useSavePrices mutation from SubscriptionManagement
--    would silently fail for all users (RLS defaults to deny on missing policy).
-- =============================================================================
DROP POLICY IF EXISTS user_plans_update_platform_admin ON public.user_plans;
CREATE POLICY user_plans_update_platform_admin
  ON public.user_plans
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
