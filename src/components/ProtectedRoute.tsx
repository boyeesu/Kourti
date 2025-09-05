import React from 'react';
import { Navigate, useLocation, Location } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/spinner';

/**
 * Props for the ProtectedRoute component
 */
interface ProtectedRouteProps {
  /**
   * Child elements to render when authenticated
   */
  children: React.ReactNode;
  
  /**
   * Optional redirect path when not authenticated
   * @default "/auth"
   */
  redirectTo?: string;
}

/**
 * Component that protects routes requiring authentication
 * Redirects to login if user is not authenticated
 */
export function ProtectedRoute({ 
  children, 
  redirectTo = "/auth" 
}: ProtectedRouteProps): JSX.Element {
  const { user, loading } = useAuth();
  const location = useLocation();

  console.log('🛡️ ProtectedRoute check - User:', user ? 'Authenticated' : 'Not authenticated', 'Loading:', loading);

  // Show loading state while checking authentication
  if (loading) {
    console.log('🛡️ ProtectedRoute: Showing loading state');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Spinner />
          <p className="text-sm text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, redirect to login with return path
  if (!user) {
    console.log('🛡️ ProtectedRoute: Redirecting to auth, no user found');
    const state: { from: Location } = { from: location };
    return <Navigate to={redirectTo} state={state} replace />;
  }

  console.log('🛡️ ProtectedRoute: User authenticated, rendering children');
  // User is authenticated, render children
  return <>{children}</>;
}