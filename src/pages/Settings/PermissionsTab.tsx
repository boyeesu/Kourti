import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  useRolePermissions,
  useUpdatePermission,
  RESOURCES,
  ACTIONS,
  Resource,
  Action,
} from '@/hooks/usePermissions';
import { useAllRoles } from '@/hooks/useAllRoles';
import { useUserRoleAssignments } from '@/hooks/useUserRoleAssignments';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Shield, Users, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function PermissionsTab() {
  const { data: allRoles = [] } = useAllRoles();
  const [selectedRole, setSelectedRole] = useState<string>('');
  const { data: permissions = [] } = useRolePermissions(selectedRole);
  const updatePermission = useUpdatePermission();

  // Track pending changes before saving
  const [pendingChanges, setPendingChanges] = useState<Map<string, boolean>>(new Map());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // SECURITY: Only superadmins can manage permissions (prevents admin self-escalation)
  const { data: roleData } = useUserRoleAssignments();
  const isSuperAdmin = roleData?.isSuperAdmin || false;

  // Get available roles (global + custom)
  const availableRoles = allRoles.map((role) => ({
    value: role.role || role.role_name,
    label: role.display_name || role.role_name || role.role,
    source: role.source,
  }));

  // Create a permission map for easy lookup
  const permissionMap = new Map<string, boolean>();
  permissions.forEach((perm) => {
    const key = `${perm.resource}-${perm.action}`;
    permissionMap.set(key, perm.granted);
  });

  const getPermissionValue = (resource: Resource, action: Action): boolean => {
    const key = `${resource}-${action}`;
    // Check pending changes first
    if (pendingChanges.has(key)) {
      return pendingChanges.get(key) || false;
    }

    // Superadmin always has all permissions (not configurable)
    if (selectedRole === 'superadmin') return true;

    // For admin, user, and custom roles: check explicit permissions first
    if (permissionMap.has(key)) {
      return permissionMap.get(key) || false;
    }

    // Fall back to built-in defaults if no explicit permission exists
    if (selectedRole === 'admin') return true;
    if (selectedRole === 'user') return action !== 'delete' && action !== 'manage';

    // Custom roles with no explicit permission: deny
    return false;
  };

  const handlePermissionChange = (resource: Resource, action: Action, granted: boolean) => {
    if (!selectedRole) return;

    // Superadmin permissions cannot be modified (always has full access)
    if (selectedRole === 'superadmin') {
      return;
    }

    // Store in pending changes instead of saving immediately
    const key = `${resource}-${action}`;
    const newPendingChanges = new Map(pendingChanges);
    newPendingChanges.set(key, granted);
    setPendingChanges(newPendingChanges);
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedRole || pendingChanges.size === 0) return;

    try {
      // Save all pending changes
      const promises = Array.from(pendingChanges.entries()).map(([key, granted]) => {
        const [resource, action] = key.split('-') as [Resource, Action];
        return updatePermission.mutateAsync({
          role_name: selectedRole,
          resource,
          action,
          granted,
        });
      });

      await Promise.all(promises);

      setPendingChanges(new Map());
      setHasUnsavedChanges(false);

      toast.success('Permissions saved', {
        description: 'All permission changes have been applied successfully.',
      });
    } catch {
      toast.error('Failed to save permissions', {
        description: 'Some changes could not be saved. Please try again.',
      });
    }
  };

  const handleDiscardChanges = () => {
    setPendingChanges(new Map());
    setHasUnsavedChanges(false);
    toast.success('Changes discarded', {
      description: 'All unsaved changes have been discarded.',
    });
  };

  const getResourceIcon = (resource: Resource) => {
    const icons = {
      cases: '⚖️',
      clients: '👥',
      documents: '📄',
      contracts: '📋',
      calendars: '📅',
      invoices: '💰',
      tasks: '✅',
      settings: '⚙️',
      users: '👤',
    };
    return icons[resource] || '📁';
  };

  const getActionColor = (action: Action) => {
    const colors = {
      read: 'bg-blue-100 text-blue-800',
      create: 'bg-green-100 text-green-800',
      update: 'bg-yellow-100 text-yellow-800',
      delete: 'bg-red-100 text-red-800',
      manage: 'bg-purple-100 text-purple-800',
    };
    return colors[action] || 'bg-gray-100 text-gray-800';
  };

  if (!isSuperAdmin) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Only super administrators can manage role permissions. Contact your organization super
          administrator for access.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Role Permissions
        </h3>
        <p className="text-sm text-muted-foreground">
          Configure fine-grained permissions for each role in your organization
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Select Role
              </CardTitle>
            </div>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Choose a role..." />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex items-center gap-2">
                      {role.label}
                      <Badge
                        variant={role.source === 'global' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {role.source}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        {selectedRole && (
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                Configuring permissions for:
                <Badge variant="outline">{selectedRole}</Badge>
                {hasUnsavedChanges && (
                  <Badge variant="secondary" className="ml-2">
                    Unsaved changes
                  </Badge>
                )}
              </div>
              {hasUnsavedChanges && selectedRole !== 'superadmin' && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleDiscardChanges}>
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveChanges}
                    disabled={updatePermission.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              )}
            </div>

            {/* Permission matrix */}
            <div className="overflow-auto border rounded-md">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Resource</th>
                    {ACTIONS.map((action) => (
                      <th key={action} className="px-3 py-2 text-center font-medium">
                        <div className="flex items-center justify-center gap-1">
                          <Badge
                            variant="outline"
                            className={`${getActionColor(action)} text-xs capitalize`}
                          >
                            {action}
                          </Badge>
                          {/* Toggle entire column */}
                          <Switch
                            aria-label={`Toggle all ${action}`}
                            disabled={selectedRole === 'superadmin'}
                            checked={RESOURCES.every((r) => getPermissionValue(r, action))}
                            onCheckedChange={(checked) => {
                              RESOURCES.forEach((r) => handlePermissionChange(r, action, checked));
                            }}
                          />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RESOURCES.map((resource) => {
                    const allActionsGranted = ACTIONS.every((a) => getPermissionValue(resource, a));
                    return (
                      <tr key={resource} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap font-medium">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getResourceIcon(resource)}</span>
                            {resource.charAt(0).toUpperCase() + resource.slice(1)}
                            {/* Toggle entire row */}
                            <Switch
                              aria-label={`Toggle all for ${resource}`}
                              className="ml-auto"
                              disabled={selectedRole === 'superadmin'}
                              checked={allActionsGranted}
                              onCheckedChange={(checked) => {
                                ACTIONS.forEach((a) =>
                                  handlePermissionChange(resource, a, checked)
                                );
                              }}
                            />
                          </div>
                        </td>
                        {ACTIONS.map((action) => {
                          const hasPermission = getPermissionValue(resource, action);
                          return (
                            <td key={action} className="px-3 py-2 text-center">
                              <Switch
                                aria-label={`${action} ${resource}`}
                                checked={hasPermission}
                                disabled={selectedRole === 'superadmin'}
                                onCheckedChange={(checked) =>
                                  handlePermissionChange(resource, action, checked)
                                }
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedRole === 'superadmin' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Super Administrator has all permissions by default and cannot be modified.
                </AlertDescription>
              </Alert>
            )}
            {selectedRole && ['admin', 'user'].includes(selectedRole) && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {selectedRole === 'admin'
                    ? 'Administrator has full permissions by default. Toggle switches off to restrict specific access.'
                    : 'User has create, read, and update permissions by default (no delete/manage). Adjust as needed.'}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
