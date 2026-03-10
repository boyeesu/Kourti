import { useState, useEffect } from 'react';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/useNotificationsDb';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Bell, Mail, Smartphone, Save } from 'lucide-react';
import { toast } from 'sonner';

export function NotificationPreferences() {
  const { data: organizationId } = useUserOrganization();
  const { data: preferences, isLoading } = useNotificationPreferences(organizationId || '');
  const updatePreferences = useUpdateNotificationPreferences();
  const [formData, setFormData] = useState({
    email_enabled: true,
    email_frequency: 'immediate' as 'immediate' | 'daily' | 'weekly' | 'never',
    in_app_enabled: true,
    case_notifications: true,
    client_notifications: true,
    document_notifications: true,
    contract_notifications: true,
    calendar_notifications: true,
    task_notifications: true,
    invoice_notifications: true,
    general_notifications: true,
  });

  useEffect(() => {
    if (preferences) {
      setFormData({
        email_enabled: preferences.email_enabled ?? true,
        email_frequency: preferences.email_frequency ?? 'immediate',
        in_app_enabled: preferences.in_app_enabled ?? true,
        case_notifications: preferences.case_notifications ?? true,
        client_notifications: preferences.client_notifications ?? true,
        document_notifications: preferences.document_notifications ?? true,
        contract_notifications: preferences.contract_notifications ?? true,
        calendar_notifications: preferences.calendar_notifications ?? true,
        task_notifications: preferences.task_notifications ?? true,
        invoice_notifications: preferences.invoice_notifications ?? true,
        general_notifications: preferences.general_notifications ?? true,
      });
    }
  }, [preferences]);

  const handleSave = async () => {
    if (!organizationId) {
      toast.error('Error', { description: 'Organization not found' });
      return;
    }

    try {
      await updatePreferences.mutateAsync({
        organization_id: organizationId,
        ...formData,
      });
      toast.success('Success', { description: 'Notification preferences saved' });
    } catch {
      toast.error('Error', { description: 'Failed to save preferences' });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading preferences...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>Manage how and when you receive notifications</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Settings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Email Notifications</h3>
          </div>
          <div className="space-y-4 pl-7">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-enabled">Enable email notifications</Label>
                <p className="text-sm text-muted-foreground">Receive notifications via email</p>
              </div>
              <Switch
                id="email-enabled"
                checked={formData.email_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, email_enabled: checked })}
              />
            </div>
            {formData.email_enabled && (
              <div className="space-y-2">
                <Label htmlFor="email-frequency">Email frequency</Label>
                <Select
                  value={formData.email_frequency}
                  onValueChange={(value: 'immediate' | 'daily' | 'weekly' | 'never') =>
                    setFormData({ ...formData, email_frequency: value })
                  }
                >
                  <SelectTrigger id="email-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="daily">Daily digest</SelectItem>
                    <SelectItem value="weekly">Weekly digest</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* In-App Settings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">In-App Notifications</h3>
          </div>
          <div className="pl-7">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="in-app-enabled">Enable in-app notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Show notifications in the application
                </p>
              </div>
              <Switch
                id="in-app-enabled"
                checked={formData.in_app_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, in_app_enabled: checked })}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Notification Types */}
        <div className="space-y-4">
          <h3 className="font-semibold">Notification Types</h3>
          <p className="text-sm text-muted-foreground">
            Choose which types of notifications you want to receive
          </p>
          <div className="space-y-3">
            <NotificationTypeToggle
              label="Case notifications"
              description="Updates about cases"
              checked={formData.case_notifications}
              onChange={(checked) => setFormData({ ...formData, case_notifications: checked })}
            />
            <NotificationTypeToggle
              label="Client notifications"
              description="Updates about clients"
              checked={formData.client_notifications}
              onChange={(checked) => setFormData({ ...formData, client_notifications: checked })}
            />
            <NotificationTypeToggle
              label="Document notifications"
              description="Updates about documents"
              checked={formData.document_notifications}
              onChange={(checked) => setFormData({ ...formData, document_notifications: checked })}
            />
            <NotificationTypeToggle
              label="Contract notifications"
              description="Updates about contracts"
              checked={formData.contract_notifications}
              onChange={(checked) => setFormData({ ...formData, contract_notifications: checked })}
            />
            <NotificationTypeToggle
              label="Calendar notifications"
              description="Updates about calendar events"
              checked={formData.calendar_notifications}
              onChange={(checked) => setFormData({ ...formData, calendar_notifications: checked })}
            />
            <NotificationTypeToggle
              label="Task notifications"
              description="Updates about tasks"
              checked={formData.task_notifications}
              onChange={(checked) => setFormData({ ...formData, task_notifications: checked })}
            />
            <NotificationTypeToggle
              label="Invoice notifications"
              description="Updates about invoices"
              checked={formData.invoice_notifications}
              onChange={(checked) => setFormData({ ...formData, invoice_notifications: checked })}
            />
            <NotificationTypeToggle
              label="General notifications"
              description="General system notifications"
              checked={formData.general_notifications}
              onChange={(checked) => setFormData({ ...formData, general_notifications: checked })}
            />
          </div>
        </div>

        <Separator />

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updatePreferences.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updatePreferences.isPending ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationTypeToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label>{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
