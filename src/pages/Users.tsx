import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Plus, Search } from "lucide-react";
import { useOrganizationMembers } from "@/hooks/useOrganization";

export default function Users() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: usersData, isLoading } = useOrganizationMembers(1, 100);
  const users = usersData?.members || [];

  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const filteredUsers = users.filter((user) => {
    const term = searchTerm.toLowerCase();
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return (
      fullName.toLowerCase().includes(term) ||
      (user.email && user.email.toLowerCase().includes(term)) ||
      (user.role && user.role.toLowerCase().includes(term))
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-success text-success-foreground";
      case "Invited":
        return "bg-warning text-warning-foreground";
      case "Disabled":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <p className="text-muted-foreground">
            Manage organization members and permissions
          </p>
        </div>
        <Button className="shadow-md">
          <Plus className="h-4 w-4 mr-2" />
          Invite User
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>All Users ({filteredUsers.length})</CardTitle>
          <CardDescription>Team members with access to Kouti Legal</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 max-w-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
                  const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase();
                  
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src="" alt={fullName} />
                            <AvatarFallback>
                              {initials || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{fullName || 'No name'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{user.email || 'No email'}</TableCell>
                      <TableCell>{user.role || 'user'}</TableCell>
                      <TableCell>
                        <Badge
                          className="bg-success text-success-foreground"
                          variant="secondary"
                        >
                          Active
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {filteredUsers.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No users found.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
