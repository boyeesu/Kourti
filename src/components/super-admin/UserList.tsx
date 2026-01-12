import { useNavigate } from 'react-router-dom';
import { PlatformUser } from '@/hooks/useAllUsers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Check, X, Trash2, Crown } from 'lucide-react';
import { useApproveUser, useDisableUser, useDeleteUser } from '@/hooks/useSuperAdminUserManagement';
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
import { useState } from 'react';
import { format } from 'date-fns';
import { AssignPlanDialog } from './AssignPlanDialog';
import { useCurrentUserPlan } from '@/hooks/useUserPlans';

interface UserListProps {
  users: PlatformUser[];
}

export function UserList({ users }: UserListProps) {
  const navigate = useNavigate();
  const approveUser = useApproveUser();
  const disableUser = useDisableUser();
  const deleteUser = useDeleteUser();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<PlatformUser | null>(null);
  const [assignPlanDialogOpen, setAssignPlanDialogOpen] = useState(false);
  const [userToAssignPlan, setUserToAssignPlan] = useState<PlatformUser | null>(null);

  const handleApprove = (userId: string) => {
    approveUser.mutate(userId);
  };

  const handleDisable = (userId: string) => {
    disableUser.mutate({ userId, reason: 'Disabled by platform admin' });
  };

  const handleDeleteClick = (user: PlatformUser) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (userToDelete) {
      deleteUser.mutate({
        userId: userToDelete.user_id,
        reason: 'Deleted by platform admin',
      });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const handleAssignPlanClick = (user: PlatformUser) => {
    setUserToAssignPlan(user);
    setAssignPlanDialogOpen(true);
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                onApprove={() => handleApprove(user.user_id)}
                onDisable={() => handleDisable(user.user_id)}
                onDelete={() => handleDeleteClick(user)}
                onAssignPlan={() => handleAssignPlanClick(user)}
                onNavigate={() => navigate(`/thanos/users/${user.user_id}`)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete user {userToDelete?.first_name}{' '}
              {userToDelete?.last_name} ({userToDelete?.email}). This action cannot be undone.
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
        user={userToAssignPlan}
      />
    </>
  );
}

interface UserRowProps {
  user: PlatformUser;
  onApprove: () => void;
  onDisable: () => void;
  onDelete: () => void;
  onAssignPlan: () => void;
  onNavigate: () => void;
}

function UserRow({ user, onApprove, onDisable, onDelete, onAssignPlan, onNavigate }: UserRowProps) {
  const { data: currentPlan } = useCurrentUserPlan(user.user_id);

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

  const getPlanBadge = () => {
    if (!currentPlan) {
      return <Badge variant="outline">Free</Badge>;
    }

    const variant = currentPlan.plan_type === 'enterprise' 
      ? 'default' 
      : currentPlan.plan_type === 'professional'
      ? 'secondary'
      : 'outline';

    return (
      <Badge variant={variant}>
        {currentPlan.plan_display_name}
        {currentPlan.expires_at && (
          <span className="ml-1 text-xs">
            (expires {format(new Date(currentPlan.expires_at), 'MMM dd')})
          </span>
        )}
      </Badge>
    );
  };

  return (
    <TableRow 
      className="cursor-pointer hover:bg-muted/50"
      onClick={onNavigate}
    >
      <TableCell className="font-medium">
        {user.first_name} {user.last_name}
      </TableCell>
      <TableCell>{user.email || '—'}</TableCell>
      <TableCell>{user.phone || '—'}</TableCell>
      <TableCell>{user.organization_name || '—'}</TableCell>
      <TableCell>{user.department || '—'}</TableCell>
      <TableCell>{getRoleBadge(user.role)}</TableCell>
      <TableCell>{getStatusBadge(user.status)}</TableCell>
      <TableCell>{getPlanBadge()}</TableCell>
      <TableCell>{format(new Date(user.created_at), 'MMM dd, yyyy')}</TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAssignPlan(); }}>
              <Crown className="h-4 w-4 mr-2" />
              Assign Plan
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {user.status === 'pending' && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onApprove(); }}>
                <Check className="h-4 w-4 mr-2" />
                Approve
              </DropdownMenuItem>
            )}
            {user.status !== 'disabled' && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDisable(); }}>
                <X className="h-4 w-4 mr-2" />
                Disable
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
