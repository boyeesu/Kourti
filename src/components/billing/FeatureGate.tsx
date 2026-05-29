import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useHasFeature, FEATURE_META, type FeatureKey } from '@/hooks/useEntitlements';

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
}

/**
 * Page-level gate: renders children when the org's plan includes `feature`,
 * otherwise a "locked — upgrade" screen. The backend independently returns 403
 * for the same features, so this is UX only, not the security boundary.
 */
export function FeatureGate({ feature, children }: FeatureGateProps) {
  const navigate = useNavigate();
  const { allowed, isLoading } = useHasFeature(feature);
  const meta = FEATURE_META[feature];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (allowed) return <>{children}</>;

  const label = meta?.label ?? 'This feature';
  const plan = meta?.requiredPlan ?? 'Professional';

  return (
    <div className="flex items-center justify-center px-4 py-16">
      <Card className="max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4 p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Lock className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">
              {label} is a {plan} feature
            </h2>
            <p className="text-sm text-muted-foreground">
              Upgrade your plan to unlock {label.toLowerCase()} and the rest of the {plan}{' '}
              automation suite.
            </p>
          </div>
          <Button onClick={() => navigate('/settings?tab=billing')} className="mt-1">
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Upgrade to {plan}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
