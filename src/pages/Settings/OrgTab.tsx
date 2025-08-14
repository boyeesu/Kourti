
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { useOrganization } from '@/hooks/useOrganization';

export default function OrgTab() {
  const { data: organization, isLoading } = useOrganization();

  if (isLoading) {
    return <div>Loading organization...</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Organization Information</CardTitle>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
