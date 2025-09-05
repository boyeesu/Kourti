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

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // If not authenticated, redirect to login with return path
  if (!user) {
    const state: { from: Location } = { from: location };
    return <Navigate to={redirectTo} state={state} replace />;
  }

  // User is authenticated, render children
  return <>{children}</>;
}