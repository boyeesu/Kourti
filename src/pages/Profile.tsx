import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrganization } from "@/hooks/useOrganization";
import { Building, Mail, Phone, Globe, MapPin, User } from "lucide-react";

export default function Profile() {
  const { data: organization, isLoading } = useOrganization();

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
          <h1 className="text-3xl font-bold text-foreground">Profile & Organization</h1>
          <p className="text-muted-foreground">Manage your personal and organization settings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organization Information */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              Organization Details
            </CardTitle>
            <CardDescription>
              Your organization information and contact details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input 
                id="org-name" 
                value={organization?.name || 'Not set'} 
                readOnly 
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-description">Description</Label>
              <Textarea 
                id="org-description" 
                value={organization?.description || 'No description'} 
                readOnly 
                className="bg-muted"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="org-email">Email</Label>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="org-email" 
                    value={organization?.email || 'Not set'} 
                    readOnly 
                    className="bg-muted"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-phone">Phone</Label>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="org-phone" 
                    value={organization?.phone || 'Not set'} 
                    readOnly 
                    className="bg-muted"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-website">Website</Label>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <Input 
                  id="org-website" 
                  value={organization?.website || 'Not set'} 
                  readOnly 
                  className="bg-muted"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-address">Address</Label>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <Textarea 
                  id="org-address" 
                  value={organization?.address || 'Not set'} 
                  readOnly 
                  className="bg-muted"
                />
              </div>
            </div>

            <Button className="w-full" disabled>
              Update Organization (Coming Soon)
            </Button>
          </CardContent>
        </Card>

        {/* User Profile */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Your personal profile and account settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first-name">First Name</Label>
                <Input 
                  id="first-name" 
                  placeholder="Not set" 
                  readOnly 
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="last-name">Last Name</Label>
                <Input 
                  id="last-name" 
                  placeholder="Not set" 
                  readOnly 
                  className="bg-muted"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-email">Email Address</Label>
              <Input 
                id="user-email" 
                placeholder="Not set" 
                readOnly 
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-role">Role</Label>
              <Input 
                id="user-role" 
                value="User" 
                readOnly 
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-department">Department</Label>
              <Input 
                id="user-department" 
                placeholder="Not set" 
                readOnly 
                className="bg-muted"
              />
            </div>

            <Button className="w-full" disabled>
              Update Profile (Coming Soon)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}