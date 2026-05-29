import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import { useOrganization } from '@/hooks/useOrganization';
import { Organization } from '@/hooks/useAllOrganizations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  Users,
  Calendar,
  Power,
  PowerOff,
  Trash2,
  CreditCard,
  Crown,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToggleOrganizationStatus } from '@/hooks/useToggleOrganizationStatus';
import { useDeleteOrganization } from '@/hooks/useDeleteOrganization';
import { useState } from 'react';
import { logError } from '@/lib/logger';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface OrgSubscription {
  id: string;
  status: string;
  billing_interval: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan_display_name: string;
  plan_type: string;
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string;
  provider_customer_email: string;
}

function useOrgSubscriptions(orgId: string | null) {
  return useQuery({
    queryKey: ['org-subscriptions', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      try {
        const data = await invokeNodeApi<OrgSubscription[]>(
          `/api/v1/admin/organizations/${orgId}/subscriptions`
        );
        return data || [];
      } catch (error) {
        logError('Error fetching org subscriptions', error);
        return [];
      }
    },
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });
}

function formatCurrency(amount: number | null | undefined, currency = 'USD') {
  if (amount == null) return '--';
  const symbol = currency === 'NGN' ? '\u20A6' : currency === 'USD' ? '$' : currency;
  return `${symbol}${amount.toLocaleString()}`;
}

const formatOrgType = (type: string | null) => {
  if (!type) return 'N/A';
  return type
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: organization, isLoading } = useOrganization(id || null);
  const { data: orgSubscriptions = [], isLoading: subsLoading } = useOrgSubscriptions(id || null);
  const toggleStatus = useToggleOrganizationStatus();
  const deleteOrg = useDeleteOrganization();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (organization) {
      const org = organization as Organization;
      deleteOrg.mutate({
        orgId: org.id,
        reason: 'Deleted by platform admin',
      });
      setDeleteDialogOpen(false);
      navigate('/thanos/organizations');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="text-center py-12">
        <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Organization not found</p>
        <Button onClick={() => navigate('/thanos/organizations')} className="mt-4">
          Back to Organizations
        </Button>
      </div>
    );
  }

  const org = organization as Organization;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/thanos/organizations')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{org.name}</h1>
              <p className="text-muted-foreground">Organization Details & KYC Information</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={org.is_active ? 'destructive' : 'default'}
              onClick={() => {
                toggleStatus.mutate({
                  orgId: org.id,
                  isActive: !org.is_active,
                });
              }}
              disabled={toggleStatus.isPending}
            >
              {org.is_active ? (
                <>
                  <PowerOff className="h-4 w-4 mr-2" />
                  Disable
                </>
              ) : (
                <>
                  <Power className="h-4 w-4 mr-2" />
                  Enable
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClick}
              disabled={deleteOrg.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Organization details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Name</label>
                <p className="text-sm font-medium">{org.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Type</label>
                <p className="text-sm">{formatOrgType(org.type)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <div className="mt-1">
                  <Badge
                    variant={
                      !org.is_active
                        ? 'destructive'
                        : org.status === 'active'
                          ? 'default'
                          : org.status === 'empty'
                            ? 'secondary'
                            : 'destructive'
                    }
                  >
                    {!org.is_active ? 'Disabled' : org.status}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Description</label>
                <p className="text-sm">{org.description || '—'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
              <CardDescription>Organization contact details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="text-sm">{organization.email || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <p className="text-sm">{organization.phone || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Website</label>
                  <p className="text-sm">
                    {org.website ? (
                      <a
                        href={org.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {org.website}
                      </a>
                    ) : (
                      '—'
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address Information */}
          <Card>
            <CardHeader>
              <CardTitle>Address Information</CardTitle>
              <CardDescription>Organization location</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Address</label>
                  <p className="text-sm">{org.address || '—'}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">State</label>
                <p className="text-sm">{org.state || '—'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Country</label>
                <p className="text-sm">{org.country || '—'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Statistics & Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Statistics & Metadata</CardTitle>
              <CardDescription>Organization statistics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Total Users</label>
                  <p className="text-sm font-medium">{org.user_count}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Created At</label>
                  <p className="text-sm">{format(new Date(org.created_at), 'PPpp')}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                <p className="text-sm">{format(new Date(org.updated_at), 'PPpp')}</p>
              </div>
              {org.logo_url && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Logo</label>
                  <div className="mt-2">
                    <img
                      src={org.logo_url}
                      alt={org.name}
                      className="h-16 w-16 object-contain rounded"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Billing & Subscription */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Billing & Subscription
            </CardTitle>
            <CardDescription>Organization subscription and plan details</CardDescription>
          </CardHeader>
          <CardContent>
            {subsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : orgSubscriptions.length === 0 ? (
              <div className="text-center py-8">
                <Crown className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No subscriptions found for this organization
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {orgSubscriptions.map((sub) => {
                  const amount =
                    sub.billing_interval === 'yearly' ? sub.price_yearly : sub.price_monthly;
                  const statusVariant =
                    sub.status === 'active'
                      ? 'default'
                      : sub.status === 'past_due'
                        ? 'destructive'
                        : 'secondary';

                  return (
                    <div
                      key={sub.id}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{sub.plan_display_name}</span>
                          <Badge variant="outline" className="capitalize">
                            {sub.plan_type}
                          </Badge>
                          <Badge variant={statusVariant} className="capitalize">
                            {sub.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {sub.provider_customer_email} &middot; {sub.billing_interval}
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <div className="font-semibold">
                          {formatCurrency(amount, sub.currency)}
                          <span className="text-xs text-muted-foreground ml-1">
                            /{sub.billing_interval === 'yearly' ? 'yr' : 'mo'}
                          </span>
                        </div>
                        {sub.current_period_end && (
                          <p className="text-xs text-muted-foreground">
                            {sub.cancel_at_period_end ? 'Cancels' : 'Renews'}{' '}
                            {format(new Date(sub.current_period_end), 'MMM dd, yyyy')}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{org.name}</strong>? This will permanently
              delete the organization and all associated data, including {org.user_count || 0}{' '}
              users. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
