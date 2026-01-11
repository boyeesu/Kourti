import { PlatformUser } from '@/hooks/useAllUsers';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Check, X, Trash2, User } from 'lucide-react';
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

interface UserListProps {
  users: PlatformUser[];
}

export function UserList({ users }: UserListProps) {
  const approveUser = useApproveUser();
  const disableUser = useDisableUser();
  const deleteUser = useDeleteUser();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<PlatformUser | null>(null);

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

  return (
    <>
      <div className="space-y-4">
        {users.map((user) => (
          <Card key={user.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h3 className="font-semibold">
                        {user.first_name} {user.last_name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    {getStatusBadge(user.status)}
                    {getRoleBadge(user.role)}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {user.organization_name && (
                      <div>Organization: {user.organization_name}</div>
                    )}
                    {user.department && <div>Department: {user.department}</div>}
                    <div>
                      Created: {format(new Date(user.created_at), 'MMM dd, yyyy')}
                    </div>
                    {user.last_login_at && (
                      <div>
                        Last login: {format(new Date(user.last_login_at), 'MMM dd, yyyy')}
                      </div>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {user.status === 'pending' && (
                      <DropdownMenuItem onClick={() => handleApprove(user.user_id)}>
                        <Check className="h-4 w-4 mr-2" />
                        Approve
                      </DropdownMenuItem>
                    )}
                    {user.status !== 'disabled' && (
                      <DropdownMenuItem onClick={() => handleDisable(user.user_id)}>
                        <X className="h-4 w-4 mr-2" />
                        Disable
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleDeleteClick(user)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        ))}
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
    </>
  );
}
