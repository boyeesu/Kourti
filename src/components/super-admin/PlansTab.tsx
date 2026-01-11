import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAllUserPlanAssignments, useRevokeUserPlan, UserPlanAssignment } from '@/hooks/useUserPlans';
import { Skeleton } from '@/components/ui/skeleton';
import { Crown, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
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

export function PlansTab() {
  const { data: assignments = [], isLoading } = useAllUserPlanAssignments();
  const revokePlan = useRevokeUserPlan();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [assignmentToRevoke, setAssignmentToRevoke] = useState<UserPlanAssignment | null>(null);

  const filteredAssignments = assignments.filter((assignment) => {
    const matchesSearch =
      assignment.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assignment.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assignment.plan_display_name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || assignment.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleRevokeClick = (assignment: UserPlanAssignment) => {
    setAssignmentToRevoke(assignment);
    setRevokeDialogOpen(true);
  };

  const handleRevokeConfirm = () => {
    if (assignmentToRevoke) {
      revokePlan.mutate({
        userId: assignmentToRevoke.user_id,
        reason: 'Revoked by platform admin',
      });
      setRevokeDialogOpen(false);
      setAssignmentToRevoke(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>;
      case 'revoked':
        return <Badge variant="destructive">Revoked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlanTypeBadge = (planType: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      enterprise: 'default',
      professional: 'secondary',
      starter: 'outline',
      free: 'outline',
    };
    return <Badge variant={variants[planType] || 'outline'}>{planType}</Badge>;
  };

  const activeAssignments = filteredAssignments.filter((a) => a.status === 'active').length;
  const expiredAssignments = filteredAssignments.filter((a) => a.status === 'expired').length;
  const revokedAssignments = filteredAssignments.filter((a) => a.status === 'revoked').length;

  return (
    <>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">User Plans</h2>
          <p className="text-muted-foreground">
            Manage plan assignments for all users across the platform
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Plans</CardTitle>
              <Crown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeAssignments}</div>
              <p className="text-xs text-muted-foreground">
                Currently active plan assignments
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expired Plans</CardTitle>
              <X className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiredAssignments}</div>
              <p className="text-xs text-muted-foreground">
                Plans that have expired
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revoked Plans</CardTitle>
              <X className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{revokedAssignments}</div>
              <p className="text-xs text-muted-foreground">
                Plans that have been revoked
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Plan Assignments</CardTitle>
            <CardDescription>
              View and manage all user plan assignments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by user name, email, or plan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border rounded-md bg-background"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="revoked">Revoked</option>
                </select>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredAssignments.length === 0 ? (
              <div className="text-center py-12">
                <Crown className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery || statusFilter !== 'all'
                    ? 'No plan assignments found matching filters'
                    : 'No plan assignments yet'}
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned By</TableHead>
                      <TableHead>Starts At</TableHead>
                      <TableHead>Expires At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssignments.map((assignment) => (
                      <TableRow key={assignment.assignment_id}>
                        <TableCell className="font-medium">
                          {assignment.user_name}
                          <br />
                          <span className="text-sm text-muted-foreground">
                            {assignment.user_email}
                          </span>
                        </TableCell>
                        <TableCell>{assignment.plan_display_name}</TableCell>
                        <TableCell>{getPlanTypeBadge(assignment.plan_type)}</TableCell>
                        <TableCell>{getStatusBadge(assignment.status)}</TableCell>
                        <TableCell>
                          {assignment.assigned_by_email || '—'}
                        </TableCell>
                        <TableCell>
                          {format(new Date(assignment.starts_at), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          {assignment.expires_at
                            ? format(new Date(assignment.expires_at), 'MMM dd, yyyy')
                            : 'Never'}
                        </TableCell>
                        <TableCell className="text-right">
                          {assignment.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeClick(assignment)}
                            >
                              <X className="h-4 w-4 mr-2" />
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the {assignmentToRevoke?.plan_display_name} plan
              from {assignmentToRevoke?.user_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeConfirm}
              className="bg-destructive"
            >
              Revoke Plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
