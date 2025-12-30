-- Create subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  stripe_price_id TEXT NOT NULL UNIQUE,
  price_amount INTEGER NOT NULL, -- in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create organization subscriptions table
CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'past_due', 'canceled', 'trialing', 'unpaid')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id)
);

-- Create payment history table
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES organization_subscriptions(id),
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  amount INTEGER NOT NULL, -- in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'pending', 'failed', 'refunded')),
  description TEXT,
  invoice_url TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org_id ON organization_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_stripe_sub_id ON organization_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON organization_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_org_id ON payment_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_created_at ON payment_history(created_at DESC);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_plans (readable by all authenticated users)
CREATE POLICY "subscription_plans_select" ON subscription_plans
  FOR SELECT TO authenticated
  USING (is_active = true);

-- RLS Policies for organization_subscriptions
CREATE POLICY "org_subscriptions_select" ON organization_subscriptions
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT get_user_organization_id()));

CREATE POLICY "org_subscriptions_insert" ON organization_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT get_user_organization_id()));

CREATE POLICY "org_subscriptions_update" ON organization_subscriptions
  FOR UPDATE TO authenticated
  USING (organization_id = (SELECT get_user_organization_id()));

-- RLS Policies for payment_history
CREATE POLICY "payment_history_select" ON payment_history
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT get_user_organization_id()));

-- Insert default subscription plans
INSERT INTO subscription_plans (name, description, stripe_price_id, price_amount, currency, interval, features) VALUES
  ('Starter', 'Perfect for small teams getting started', 'price_starter_monthly', 2900, 'usd', 'month', '["Up to 5 users", "100 cases", "Basic document storage", "Email support"]'::jsonb),
  ('Professional', 'For growing legal practices', 'price_professional_monthly', 7900, 'usd', 'month', '["Up to 20 users", "Unlimited cases", "Advanced document management", "AI contract analysis", "Priority support"]'::jsonb),
  ('Enterprise', 'For large organizations', 'price_enterprise_monthly', 19900, 'usd', 'month', '["Unlimited users", "Unlimited cases", "Full AI suite", "Custom integrations", "Dedicated support", "SSO"]'::jsonb),
  ('Starter Annual', 'Perfect for small teams - Annual billing', 'price_starter_yearly', 29000, 'usd', 'year', '["Up to 5 users", "100 cases", "Basic document storage", "Email support", "2 months free"]'::jsonb),
  ('Professional Annual', 'For growing legal practices - Annual billing', 'price_professional_yearly', 79000, 'usd', 'year', '["Up to 20 users", "Unlimited cases", "Advanced document management", "AI contract analysis", "Priority support", "2 months free"]'::jsonb),
  ('Enterprise Annual', 'For large organizations - Annual billing', 'price_enterprise_yearly', 199000, 'usd', 'year', '["Unlimited users", "Unlimited cases", "Full AI suite", "Custom integrations", "Dedicated support", "SSO", "2 months free"]'::jsonb)
ON CONFLICT (stripe_price_id) DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_subscription_updated_at();

DROP TRIGGER IF EXISTS org_subscriptions_updated_at ON organization_subscriptions;
CREATE TRIGGER org_subscriptions_updated_at
  BEFORE UPDATE ON organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscription_updated_at();
