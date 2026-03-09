import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ProfileTab from './ProfileTab';
import OrgTab from './OrgTab';
import RolesTab from './RolesTab';
import PermissionsTab from './PermissionsTab';
import { useUserRoleAssignments } from '@/hooks/useUserRoleAssignments';

const SSOTab = lazy(() => import('./SSOTab'));
const BillingTab = lazy(() => import('./BillingTab'));

const AVAILABLE_TABS = [
  'profile',
  'organization',
  'billing',
  'roles',
  'permissions',
  'sso',
] as const;

type TabValue = (typeof AVAILABLE_TABS)[number];

function isValidTab(value: string | null): value is TabValue {
  return value !== null && (AVAILABLE_TABS as readonly string[]).includes(value);
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const initialTab = isValidTab(urlTab) ? urlTab : 'profile';
  const [tab, setTab] = useState<TabValue>(initialTab);

  // Get user role assignments
  const { data: roleData } = useUserRoleAssignments();
  const isSuperAdmin = roleData?.isSuperAdmin || false;
  const isAdmin = roleData?.isAdmin || false;

  useEffect(() => {
    const nextUrlTab = searchParams.get('tab');
    const nextTab = isValidTab(nextUrlTab) ? nextUrlTab : 'profile';
    if (nextTab !== tab) {
      setTab(nextTab);
    }
  }, [searchParams, tab]);

  const handleTabChange = (value: string) => {
    if (!isValidTab(value)) {
      return;
    }
    setTab(value);
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (value === 'profile') {
      nextSearchParams.delete('tab');
    } else {
      nextSearchParams.set('tab', value);
    }
    setSearchParams(nextSearchParams, { replace: true });
  };

  const tabDescriptions = useMemo(
    () => ({
      profile: 'Update personal details and security preferences',
      organization: 'Manage your organization settings and branding',
      billing: 'Manage your subscription, plan, and payment history',
      roles: 'Fine-tune roles and permissions',
      permissions: 'Assign granular permissions to roles and users',
      sso: 'Set up single sign-on for your identity providers',
    }),
    []
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">{tabDescriptions[tab]}</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="permissions" disabled={!isAdmin}>
            Permissions
          </TabsTrigger>
          <TabsTrigger value="sso" disabled={!isSuperAdmin}>
            SSO
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="organization">
          <OrgTab />
        </TabsContent>
        <TabsContent value="billing">
          <Suspense
            fallback={<div className="p-6 text-sm text-muted-foreground">Loading billing...</div>}
          >
            <BillingTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        <TabsContent value="permissions">
          <PermissionsTab />
        </TabsContent>
        <TabsContent value="sso">
          <Suspense
            fallback={
              <div className="p-6 text-sm text-muted-foreground">Loading SSO settings...</div>
            }
          >
            <SSOTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
