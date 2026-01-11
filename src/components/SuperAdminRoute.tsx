import { Navigate, useLocation } from 'react-router-dom';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/spinner';

interface SuperAdminRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * Component that protects routes requiring platform admin access
 * Bypasses OrganizationCheck but requires platform_admin role
 */
export function SuperAdminRoute({ 
  children, 
  redirectTo = "/dashboard" 
}: SuperAdminRouteProps): JSX.Element {
  const { user, loading: authLoading } = useAuth();
  const { data: isPlatformAdmin, isLoading: adminCheckLoading } = usePlatformAdmin();
  const location = useLocation();

  // Show loading state while checking authentication
  if (authLoading || adminCheckLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Spinner />
          <p className="text-sm text-muted-foreground">Checking permissions...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!user) {
    const state: { from: Location } = { from: location };
    return <Navigate to="/auth" state={state} replace />;
  }

  // If not platform admin, redirect to dashboard
  if (!isPlatformAdmin) {
    return <Navigate to={redirectTo} replace />;
  }

  // User is authenticated and is platform admin, render children
  return <>{children}</>;
}
