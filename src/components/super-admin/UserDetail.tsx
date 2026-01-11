import { useParams, useNavigate } from 'react-router-dom';
import { usePlatformUser } from '@/hooks/usePlatformUser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, User, Mail, Phone, Building2, Briefcase, Calendar, Check, X, Trash2, Crown } from 'lucide-react';
import { format } from 'date-fns';
import { useApproveUser, useDisableUser, useDeleteUser } from '@/hooks/useSuperAdminUserManagement';
import { useState } from 'react';
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
import { AssignPlanDialog } from './AssignPlanDialog';
import { useCurrentUserPlan } from '@/hooks/useUserPlans';

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: user, isLoading } = usePlatformUser(id || null);
  const approveUser = useApproveUser();
  const disableUser = useDisableUser();
  const deleteUser = useDeleteUser();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignPlanDialogOpen, setAssignPlanDialogOpen] = useState(false);

  const handleApprove = () => {
    if (user) {
      approveUser.mutate(user.user_id);
    }
  };

  const handleDisable = () => {
    if (user) {
      disableUser.mutate({ userId: user.user_id, reason: 'Disabled by platform admin' });
    }
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (user) {
      deleteUser.mutate({
        userId: user.user_id,
        reason: 'Deleted by platform admin',
      });
      setDeleteDialogOpen(false);
      navigate('/thanos/users');
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'approved':
        return <Badge variant="default">Approved</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'disabled':
        return <Badge variant="destructive">Disabled</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  };

  const getRoleBadge = (role: string | null) => {
    switch (role) {
      case 'superadmin':
        return <Badge variant="default">Super Admin</Badge>;
      case 'admin':
        return <Badge variant="secondary">Admin</Badge>;
      default:
        return <Badge variant="outline">{role || 'User'}</Badge>;
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

  if (!user) {
    return (
      <div className="text-center py-12">
        <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">User not found</p>
        <Button onClick={() => navigate('/thanos/users')} className="mt-4">
          Back to Users
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/thanos/users')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">
                {user.first_name} {user.last_name}
              </h1>
              <p className="text-muted-foreground">User Details & KYC Information</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAssignPlanDialogOpen(true)}>
              <Crown className="h-4 w-4 mr-2" />
              Assign Plan
            </Button>
            {user.status === 'pending' && (
              <Button variant="default" onClick={handleApprove} disabled={approveUser.isPending}>
                <Check className="h-4 w-4 mr-2" />
                Approve
              </Button>
            )}
            {user.status !== 'disabled' && (
              <Button variant="destructive" onClick={handleDisable} disabled={disableUser.isPending}>
                <X className="h-4 w-4 mr-2" />
                Disable
              </Button>
            )}
            <Button variant="destructive" onClick={handleDeleteClick} disabled={deleteUser.isPending}>
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
              <CardDescription>User personal details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                <p className="text-sm font-medium">
                  {user.first_name} {user.last_name}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="text-sm">{user.email || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <p className="text-sm">{user.phone || '—'}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Role</label>
                <div className="mt-1">{getRoleBadge(user.role)}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <div className="mt-1">{getStatusBadge(user.status)}</div>
              </div>
            </CardContent>
          </Card>

          {/* Organization Information */}
          <Card>
            <CardHeader>
              <CardTitle>Organization Information</CardTitle>
              <CardDescription>User's organization details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Organization</label>
                  <p className="text-sm">
                    {user.organization_name ? (
                      <button
                        onClick={() => navigate(`/thanos/organizations/${user.organization_id}`)}
                        className="text-primary hover:underline"
                      >
                        {user.organization_name}
                      </button>
                    ) : (
                      '—'
                    )}
                  </p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Organization Type</label>
                <p className="text-sm">{user.organization_type || '—'}</p>
              </div>
              <div className="flex items-start gap-3">
                <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Department</label>
                  <p className="text-sm">{user.department || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Status & Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Account Status & Activity</CardTitle>
              <CardDescription>User account activity and status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Created At</label>
                  <p className="text-sm">{format(new Date(user.created_at), 'PPpp')}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                <p className="text-sm">{format(new Date(user.updated_at), 'PPpp')}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Last Login</label>
                <p className="text-sm">
                  {user.last_login_at ? format(new Date(user.last_login_at), 'PPpp') : 'Never'}
                </p>
              </div>
              {user.approved_at && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Approved At</label>
                  <p className="text-sm">{format(new Date(user.approved_at), 'PPpp')}</p>
                </div>
              )}
              {user.disabled_at && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Disabled At</label>
                  <p className="text-sm">{format(new Date(user.disabled_at), 'PPpp')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subscription & Plan */}
          <Card>
            <CardHeader>
              <CardTitle>Subscription & Plan</CardTitle>
              <CardDescription>User's current plan</CardDescription>
            </CardHeader>
            <CardContent>
              <UserPlanInfo userId={user.user_id} />
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete user {user.first_name} {user.last_name} ({user.email}). 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AssignPlanDialog
        open={assignPlanDialogOpen}
        onOpenChange={setAssignPlanDialogOpen}
        user={user}
      />
    </>
  );
}

function UserPlanInfo({ userId }: { userId: string }) {
  const { data: currentPlan, isLoading } = useCurrentUserPlan(userId);

  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (!currentPlan) {
    return (
      <div>
        <Badge variant="outline">Free</Badge>
        <p className="text-sm text-muted-foreground mt-2">No active plan</p>
      </div>
    );
  }

  const variant =
    currentPlan.plan_type === 'enterprise'
      ? 'default'
      : currentPlan.plan_type === 'professional'
      ? 'secondary'
      : 'outline';

  return (
    <div className="space-y-2">
      <Badge variant={variant}>{currentPlan.plan_display_name}</Badge>
      {currentPlan.expires_at && (
        <p className="text-sm text-muted-foreground">
          Expires: {format(new Date(currentPlan.expires_at), 'PP')}
        </p>
      )}
      {!currentPlan.expires_at && (
        <p className="text-sm text-muted-foreground">No expiration date</p>
      )}
    </div>
  );
}
