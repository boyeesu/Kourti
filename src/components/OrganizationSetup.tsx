import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { useCreateDefaultOrganization } from "@/hooks/useCreateDefaultOrganization";

export default function OrganizationSetup() {
  const [orgName, setOrgName] = useState<string>("");
  const createOrg = useCreateDefaultOrganization();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🏢 Creating organization:', orgName);
    try {
      await createOrg.mutateAsync(orgName);
      console.log('🏢 Organization created successfully');
      // After creation, user will need to sign in again
      setTimeout(() => {
        console.log('🏢 Redirecting to login...');
        window.location.href = "/auth";
      }, 2000);
    } catch (error) {
      console.error('🏢 Failed to create organization:', error);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Kouti Legal</CardTitle>
          <CardDescription>
            To get started, please create your organization.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="orgName">
                  Organization Name
                </label>
                <Input
                  id="orgName"
                  placeholder="Enter your law firm or organization name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={createOrg.isPending}
            >
              {createOrg.isPending ? "Creating..." : "Create Organization"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}