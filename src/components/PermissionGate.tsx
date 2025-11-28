import React from 'react';
import { useUserPermission, Resource, Action } from '@/hooks/usePermissions';
import { Spinner } from '@/components/ui/spinner';

interface PermissionGateProps {
  resource: Resource;
  action: Action;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({ 
  resource, 
  action, 
  children, 
  fallback = null 
}: PermissionGateProps) {
  const { data: hasPermission, isLoading, error } = useUserPermission(resource, action);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Spinner />
      </div>
    );
  }

  // If there's an error checking permissions, allow access to prevent blocking users
  // The RPC function will handle actual authorization
  if (error) {
    console.warn('Permission check error, allowing access:', error);
    return <>{children}</>;
  }

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}