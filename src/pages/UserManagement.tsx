import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInviteUser, useUserRole } from "@/hooks/useUserManagement";
import { useAllRoles } from "@/hooks/useAllRoles";
import { useOrganizationUsers, useToggleUserStatus, useDeleteInvitation, useResendInvitation, useChangeUserRole } from "@/hooks/useOrganizationUsers";
import { UserPlus, Users, Shield, User, UserMinus, UserCheck, Trash2, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator 
} from "@/components/ui/dropdown-menu";

export default function UserManagement() {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<string>("");
  const [department, setDepartment] = useState("");

  const { data: userRole } = useUserRole();
  const { data: roles = [] } = useAllRoles();
  const { data: users = [], isLoading } = useOrganizationUsers();
  const inviteUser = useInviteUser();
  const toggleUserStatus = useToggleUserStatus();
  const deleteInvitation = useDeleteInvitation();
  const resendInvitation = useResendInvitation();
  const changeUserRole = useChangeUserRole();

  useEffect(() => {
    if (!role && roles.length > 0) {
      // Find first assignable role (not superadmin unless you are one)
      const defaultRole = roles.find(r =>
        userRole?.role === 'superadmin' ||
        (r.role !== 'superadmin' && r.role_name !== 'superadmin')
      );
      setRole(defaultRole?.role || defaultRole?.role_name || roles[0].role || roles[0].role_name);
    }
  }, [roles, role, userRole]);

  const canInviteUsers = userRole?.role === 'superadmin' || userRole?.role === 'admin';
  const isSuperAdmin = userRole?.role === 'superadmin';
  const canManageRoles = userRole?.role === 'superadmin' || userRole?.role === 'admin';

  const handleInviteUser = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !firstName || !lastName || !role) {
      return;
    }

    inviteUser.mutate({
      email,
      firstName,
      lastName,
      role: role,
      department: department || undefined,
    });

    // Reset form
    setEmail("");
    setFirstName("");
    setLastName("");
    // Reset to the default role after successful invite
    const defaultRole = roles.find(r =>
      userRole?.role === 'superadmin' ||
      (r.role !== 'superadmin' && r.role_name !== 'superadmin')
    );
    setRole(defaultRole?.role || defaultRole?.role_name || roles[0]?.role || roles[0]?.role_name || "");
    setDepartment("");
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'superadmin': return <Shield className="h-4 w-4 text-purple-600" />;
      case 'admin':
      case 'administrator': return <Users className="h-4 w-4 text-blue-600" />;
      case 'finance': return <Users className="h-4 w-4 text-green-700"/>;
      case 'legal': return <Users className="h-4 w-4 text-red-600"/>;
      default: return <User className="h-4 w-4 text-gray-600" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'superadmin': return "bg-purple-100 text-purple-800";
      case 'admin':
      case 'administrator': return "bg-blue-100 text-blue-800";
      case 'finance': return "bg-green-100 text-green-800";
      case 'legal': return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.charAt(0) || 'U'}${lastName?.charAt(0) || 'U'}`.toUpperCase();
  };

  const getVerificationBadge = (verificationStatus: string) => {
    switch (verificationStatus) {
      case 'verified':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Verified</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'unverified':
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800">Unverified</Badge>;
      case 'expired':
        return <Badge variant="secondary" className="bg-red-100 text-red-800">Expired</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const handleDisableUser = (userId: string) => {
    toggleUserStatus.mutate({ userId, disable: true });
  };

  const handleEnableUser = (userId: string) => {
    toggleUserStatus.mutate({ userId, disable: false });
  };

  const handleDeleteInvitation = (invitationId: string) => {
    deleteInvitation.mutate(invitationId);
  };

  const handleResendInvitation = (user: any) => {
    resendInvitation.mutate(user);
  };

  const handleChangeRole = (userId: string, newRole: string) => {
    changeUserRole.mutate({ userId, newRole });
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground">Manage organization members and permissions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invite User Form */}
        {canInviteUsers && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Invite New User
              </CardTitle>
              <CardDescription>
                Add a new member to your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInviteUser} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john.doe@example.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles
                        .filter((r) => userRole?.role === 'superadmin' || (r.role !== 'superadmin' && r.role_name !== 'superadmin'))
                        .map((r) => (
                          <SelectItem key={r.role || r.role_name} value={r.role || r.role_name}>
                            {r.display_name || r.role_name || r.role}
                            {r.source === 'custom' && ' (Custom)'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department (Optional)</Label>
                  <Input
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Legal, HR, etc."
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={inviteUser.isPending}
                >
                  {inviteUser.isPending ? 'Inviting...' : 'Invite User'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Organization Members */}
        <Card className={`shadow-card ${canInviteUsers ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Organization Users ({users.length})
            </CardTitle>
            <CardDescription>
              All users and pending invitations in your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Added</TableHead>
                    {isSuperAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
                    const initials = getInitials(user.first_name || 'U', user.last_name || 'U');
                    const isDisabled = user.status === 'disabled';
                    const isPendingInvitation = user.user_type === 'invitation';
                    
                    return (
                      <TableRow key={user.id} className={isDisabled ? 'opacity-60' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={`bg-primary/10 text-primary font-medium ${isDisabled ? 'opacity-50' : ''}`}>
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{fullName || 'No name'}</div>
                              {isDisabled && <div className="text-xs text-muted-foreground">Disabled</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          {canManageRoles && !isPendingInvitation ? (
                            <Select
                              value={user.role}
                              onValueChange={(newRole) => handleChangeRole(user.user_id!, newRole)}
                              disabled={changeUserRole.isPending}
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue>
                                  <Badge className={getRoleColor(user.role)} variant="secondary">
                                    <div className="flex items-center gap-1">
                                      {getRoleIcon(user.role)}
                                      {user.role}
                                    </div>
                                  </Badge>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {roles
                                  .filter((r) => userRole?.role === 'superadmin' || (r.role !== 'superadmin' && r.role_name !== 'superadmin'))
                                  .map((r) => (
                                    <SelectItem key={r.role || r.role_name} value={r.role || r.role_name}>
                                      {r.display_name || r.role_name || r.role}
                                      {r.source === 'custom' && ' (Custom)'}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge className={getRoleColor(user.role)} variant="secondary">
                              <div className="flex items-center gap-1">
                                {getRoleIcon(user.role)}
                                {user.role}
                              </div>
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{user.department || 'Not specified'}</TableCell>
                        <TableCell>{getVerificationBadge(user.verification_status)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {isPendingInvitation ? 'Invitation' : 'User'}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                        {isSuperAdmin && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Open menu</span>
                                  <Users className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {isPendingInvitation ? (
                                  <>
                                    <DropdownMenuItem onClick={() => handleResendInvitation(user)}>
                                      <Mail className="mr-2 h-4 w-4" />
                                      Resend Invitation
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => handleDeleteInvitation(user.id)}
                                      className="text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete Invitation
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <>
                                    {isDisabled ? (
                                      <DropdownMenuItem onClick={() => handleEnableUser(user.user_id!)}>
                                        <UserCheck className="mr-2 h-4 w-4" />
                                        Enable User
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem 
                                        onClick={() => handleDisableUser(user.user_id!)}
                                        className="text-destructive"
                                      >
                                        <UserMinus className="mr-2 h-4 w-4" />
                                        Disable User
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {users.length === 0 && (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No users found</h3>
                  <p className="text-muted-foreground">
                    Start by inviting your first team member
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}