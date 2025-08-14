
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganization } from "@/hooks/useOrganization";

export default function OrgTab() {
  const { data: organization, isLoading } = useOrganization();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Settings</CardTitle>
          <CardDescription>
            Manage your organization's information and settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Organization Name</label>
              <p className="text-sm text-muted-foreground">{organization?.name || 'Not set'}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Industry</label>
              <p className="text-sm text-muted-foreground">{organization?.industry || 'Not specified'}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Created</label>
              <p className="text-sm text-muted-foreground">
                {organization?.created_at ? new Date(organization.created_at).toLocaleDateString() : 'Unknown'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
