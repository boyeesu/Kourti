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
  fallback = null,
}: PermissionGateProps) {
  const { data: hasPermission, isLoading, error } = useUserPermission(resource, action);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Spinner />
      </div>
    );
  }

  // Fail-closed: deny access on error for defense-in-depth security
  if (error) {
    console.error('Permission check failed:', error);
    return <>{fallback}</>;
  }

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
