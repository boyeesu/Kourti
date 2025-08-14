
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

export default function GeneralTab() {
  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Manage your general application settings</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">General settings will be available here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
