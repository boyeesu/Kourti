import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUserRoles, useCreateUserRole, useDeleteUserRole } from '@/hooks/useUserRoles';
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function RolesTab() {
  const { data: roles = [], isLoading: rolesLoading } = useUserRoles();
  const createRole = useCreateUserRole();
  const deleteRole = useDeleteUserRole();
  const { toast } = useToast();

  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [isDialogOpen, setDialogOpen] = useState(false);

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
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>User Roles</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex items-center gap-1">
                <Plus className="h-4 w-4" />
                New Role
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Role</DialogTitle>
                <DialogDescription>Define a custom user role.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {rolesLoading
          ? <div>Loading roles…</div>
          : roles.length === 0
            ? <div className="text-center text-muted-foreground py-8">No roles defined yet.</div>
            : (
              <div className="space-y-2">
                {roles.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <div className="font-medium">{r.role_name}</div>
                      {r.description && <div className="text-sm text-muted-foreground">{r.description}</div>}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Role</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to delete "{r.role_name}"?</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => handleDelete(r.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )
        }
      </CardContent>
    </Card>
  );
}
