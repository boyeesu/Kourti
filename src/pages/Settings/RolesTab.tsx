import { useState } from 'react';
import { PlusCircleIcon, TrashIcon, UserIcon } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useProfile } from '@/hooks/useProfile';
import { useUserRole } from '@/hooks/useUserManagement';
import {
  useUserRoles,
  useUsersWithRoles,
  useUpdateUserRole,
  useCreateUserRole,
  useDeleteUserRole,
} from '@/hooks/useUserRoles';
import { useInviteUser } from '@/hooks/useUserManagement';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { InviteUserDialog } from '@/components/InviteUserDialog';

const roleSchema = z.object({
  role_name: z.string().min(3, 'Role name must be at least 3 characters'),
  description: z.string().optional(),
});

type RoleFormData = z.infer<typeof roleSchema>;

export default function RolesTab() {
  const { data: profile, isLoading: profileLoading, error: profileError } = useProfile();
  const { data: roles = [], isLoading: rolesLoading } = useUserRoles();
  const { data: users = [], isLoading: usersLoading, error: usersError } = useUsersWithRoles();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('roles');
  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      role_name: '',
      description: '',
    },
  });

  const createRole = useCreateUserRole();
  const deleteRole = useDeleteUserRole();
  const updateUserRole = useUpdateUserRole();
  const inviteUser = useInviteUser();

  const handleSubmit = async (data: RoleFormData) => {
    try {
      await createRole.mutateAsync(data);
      form.reset();
      setDialogOpen(false);
    } catch (error) {
      console.error('Error creating role:', error);
    }
  };

  const handleDeleteRole = (roleId: string, roleName: string) => {
    if (confirm(`Are you sure you want to delete the "${roleName}" role?`)) {
      deleteRole.mutateAsync(roleId);
    }
  };

  const handleRoleChange = (userId: string, role: string) => {
    updateUserRole.mutateAsync({ userId, role });
  };

  const systemRoles = [
    { id: '1', name: 'superadmin', description: 'Full system access' },
    { id: '2', name: 'admin', description: 'Organization administration' },
    { id: '3', name: 'user', description: 'Regular user access' },
  ];

  const allRoleOptions = [
    { value: 'superadmin', label: 'Super Admin' },
    { value: 'admin', label: 'Admin' },
    { value: 'user', label: 'Regular User' },
    ...roles.map((role) => ({ value: role.role_name, label: role.role_name })),
  ];

  // Check roles from user_role_assignments
  const { data: userRoleData } = useUserRole();
  const isCurrentUserSuperAdmin = userRoleData?.role === 'superadmin';
  const isCurrentUserAdmin = userRoleData?.role === 'admin' || isCurrentUserSuperAdmin;

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return 'U';
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`;
  };

  if (profileLoading || rolesLoading || usersLoading) {
    return <div className="flex items-center justify-center p-8">Loading...</div>;
  }

  if (profileError || usersError) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          There was an error loading role information. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {!isCurrentUserAdmin && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Only administrators can manage roles. Contact your organization administrator for
            access.
          </AlertDescription>
        </Alert>
      )}

      {/* Section Toggle Buttons */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeSection === 'roles' ? 'default' : 'ghost'}
          onClick={() => setActiveSection('roles')}
          className="rounded-b-none"
        >
          Roles
        </Button>
        <Button
          variant={activeSection === 'users' ? 'default' : 'ghost'}
          onClick={() => setActiveSection('users')}
          className="rounded-b-none"
        >
          Users
        </Button>
      </div>

      {/* Roles Section */}
      {activeSection === 'roles' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Roles</CardTitle>
              <CardDescription>Default roles provided by the system</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role Name</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemRoles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4" />
                          <span className="capitalize">{role.name}</span>
                          <Badge variant="default" className="ml-2">
                            System
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>{role.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Custom Roles</CardTitle>
                <CardDescription>Organization-specific roles</CardDescription>
              </div>

              {isCurrentUserSuperAdmin && (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <PlusCircleIcon className="h-4 w-4 mr-2" />
                      Add Role
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Role</DialogTitle>
                      <DialogDescription>Add a new role to your organization</DialogDescription>
                    </DialogHeader>

                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        <FormField
                          control={form.control}
                          name="role_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Role Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g. Legal Assistant" />
                              </FormControl>
                              <FormDescription>A unique name for this role</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  placeholder="Describe the permissions and responsibilities of this role"
                                  rows={3}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <DialogFooter>
                          <Button type="submit">Create Role</Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>

            <CardContent>
              {roles.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  No custom roles have been created yet.
                  {isCurrentUserSuperAdmin && (
                    <p className="mt-2">Click "Add Role" to create your first custom role.</p>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>Description</TableHead>
                      {isCurrentUserSuperAdmin && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell className="font-medium">{role.role_name}</TableCell>
                        <TableCell>{role.description}</TableCell>
                        {isCurrentUserSuperAdmin && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRole(role.id, role.role_name)}
                            >
                              <TrashIcon className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>

            <CardFooter>
              <p className="text-xs text-muted-foreground">
                Custom roles allow you to create organization-specific access levels beyond the
                standard system roles.
              </p>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Users Section */}
      {activeSection === 'users' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage user roles for your team members</CardDescription>
            </div>

            {isCurrentUserAdmin && (
              <InviteUserDialog onInvite={(data) => inviteUser.mutateAsync(data)} />
            )}
          </CardHeader>

          <CardContent>
            {users.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                No users found in your organization.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Title</TableHead>
                    {isCurrentUserAdmin && <TableHead>Role</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={user.avatar_url || undefined}
                              alt={`${user.first_name} ${user.last_name}`}
                            />
                            <AvatarFallback>
                              {getInitials(user.first_name || '', user.last_name || '')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">
                              {user.first_name} {user.last_name}
                            </div>
                            {user.user_id === profile?.user_id && (
                              <Badge variant="outline" className="text-xs">
                                You
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.department || '-'}</TableCell>
                      <TableCell>{user.title || '-'}</TableCell>
                      {isCurrentUserAdmin && (
                        <TableCell>
                          {isCurrentUserSuperAdmin || user.user_id !== profile?.user_id ? (
                            <Select
                              value={user.role}
                              onValueChange={(value) => handleRoleChange(user.user_id, value)}
                              disabled={!isCurrentUserSuperAdmin && user.role === 'superadmin'}
                            >
                              <SelectTrigger className="w-[130px]">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                {allRoleOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="capitalize">{user.role}</div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>

          <CardFooter>
            <p className="text-xs text-muted-foreground">
              {isCurrentUserAdmin
                ? 'As an administrator, you can change user roles to control access levels.'
                : 'Contact an administrator to change user roles.'}
            </p>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
