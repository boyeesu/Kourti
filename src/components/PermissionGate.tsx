import React from 'react';
import { useUserPermission, Resource, Action } from '@/hooks/usePermissions';

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
  const { data: hasPermission, isLoading } = useUserPermission(resource, action);

  if (isLoading) {
    return <div className="animate-pulse bg-muted h-4 w-20 rounded" />;
  }

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}