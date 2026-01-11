import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Organization } from '@/hooks/useAllOrganizations';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Power, PowerOff, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToggleOrganizationStatus } from '@/hooks/useToggleOrganizationStatus';
import { useDeleteOrganization } from '@/hooks/useDeleteOrganization';

interface OrganizationListProps {
  organizations: Organization[];
}

const formatOrgType = (type: string | null) => {
  if (!type) return 'N/A';
  return type
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export function OrganizationList({ organizations }: OrganizationListProps) {
  const navigate = useNavigate();
  const toggleStatus = useToggleOrganizationStatus();
  const deleteOrg = useDeleteOrganization();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);

  const handleDeleteClick = (org: Organization) => {
    setOrgToDelete(org);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (orgToDelete) {
      deleteOrg.mutate({
        orgId: orgToDelete.id,
        reason: 'Deleted by platform admin',
      });
      setDeleteDialogOpen(false);
      setOrgToDelete(null);
    }
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.map((org) => (
              <TableRow 
                key={org.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/thanos/organizations/${org.id}`)}
              >
                <TableCell className="font-medium">{org.name}</TableCell>
                <TableCell>{formatOrgType(org.type)}</TableCell>
                <TableCell>{org.email || '—'}</TableCell>
                <TableCell>{org.phone || '—'}</TableCell>
                <TableCell className="max-w-[200px] truncate">{org.address || '—'}</TableCell>
                <TableCell>
                  {[org.state, org.country].filter(Boolean).join(', ') || '—'}
                </TableCell>
                <TableCell>{org.user_count}</TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell>{format(new Date(org.created_at), 'MMM dd, yyyy')}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant={org.is_active ? 'destructive' : 'default'}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStatus.mutate({
                          orgId: org.id,
                          isActive: !org.is_active,
                        });
                      }}
                      disabled={toggleStatus.isPending}
                    >
                      {org.is_active ? (
                        <>
                          <PowerOff className="h-4 w-4 mr-1" />
                          Disable
                        </>
                      ) : (
                        <>
                          <Power className="h-4 w-4 mr-1" />
                          Enable
                        </>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(org);
                      }}
                      disabled={deleteOrg.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{orgToDelete?.name}</strong>? 
              This will permanently delete the organization and all associated data, including {orgToDelete?.user_count || 0} users.
              This action cannot be undone.
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
