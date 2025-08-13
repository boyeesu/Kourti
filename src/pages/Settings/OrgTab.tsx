import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useOrganization } from '@/hooks/useOrganization';
import { useUserRoles, useCreateUserRole, useDeleteUserRole } from '@/hooks/useUserRoles';
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function OrgTab() {
  const { data: org, isLoading: orgLoading } = useOrganization();
  const { data: roles = [], isLoading: rolesLoading } = useUserRoles();
  const createRole = useCreateUserRole();
  const deleteRole = useDeleteUserRole();
  const { toast } = useToast();

  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [isDialogOpen, setDialogOpen] = useState(false);

  if (orgLoading) return <div>Loading…</div>;

  const handleCreate = () => {
    if (!newRoleName.trim()) return;
    createRole.mutate(
      { role_name: newRoleName.trim(), description: newRoleDesc.trim() },
      {
        onSuccess: () => toast({ title: 'Role created' }),
        onError: err => toast({ variant: 'destructive', title: 'Error', description: err.message }),
      }
    );
    setDialogOpen(false);
    setNewRoleName('');
    setNewRoleDesc('');
  };

  const handleDelete = (id: string) => {
    deleteRole.mutate(id, {
      onSuccess: () => toast({ title: 'Role deleted' }),
      onError: err => toast({ variant: 'destructive', title: 'Error', description: err.message }),
    });
  };

  return (
    <div className="space-y-6">
      {/* Organization Details read-only */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>Your organization information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={org?.name || ''} readOnly className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={org?.description || ''} readOnly className="bg-muted" />
          </div>
        </CardContent>
      </Card>

      {/* Organization Details only (roles moved to RolesTab) */}
    </div>
  );
}
