import { Navigate, useLocation, type Location } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import { usePortalAuth } from './PortalAuthContext';

/**
 * Guards the authenticated portal routes. If there is no valid portal session,
 * redirect to /portal/login preserving the intended path so the user lands back
 * here after signing in.
 */
export function PortalProtectedRoute({ children }: { children: React.ReactNode }): JSX.Element {
  const { client, loading } = usePortalAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <Spinner />
          <p className="text-sm text-muted-foreground">Loading your portal…</p>
        </div>
      </div>
    );
  }

  if (!client) {
    const state: { from: Location } = { from: location };
    return <Navigate to="/portal/login" state={state} replace />;
  }

  return <>{children}</>;
}
