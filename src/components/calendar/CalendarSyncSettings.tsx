import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Settings, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import { useCalendarSync } from '@/hooks/useCalendarSync';
import { CalendarConnectDialog } from './CalendarConnectDialog';
import { useToast } from '@/hooks/use-toast';

export function CalendarSyncSettings() {
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'google' | 'microsoft' | null>(null);
  const {
    integrations,
    updateSyncSettings,
    disconnectCalendar,
    triggerSync,
    isLoading,
  } = useCalendarSync();
  const { toast } = useToast();

  const handleConnect = (provider: 'google' | 'microsoft') => {
    setSelectedProvider(provider);
    setConnectDialogOpen(true);
  };

  const handleDisconnect = async (provider: 'google' | 'microsoft') => {
    try {
      await disconnectCalendar.mutateAsync(provider);
      toast({
        title: 'Disconnected',
        description: `${provider === 'google' ? 'Google' : 'Microsoft'} calendar disconnected`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect calendar';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    }
  };

  const handleSyncNow = async (provider: 'google' | 'microsoft') => {
    try {
      await triggerSync.mutateAsync(provider);
      toast({
        title: 'Sync Started',
        description: `Syncing ${provider === 'google' ? 'Google' : 'Microsoft'} calendar...`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start sync';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    }
  };

  const googleIntegration = integrations?.find(i => i.provider === 'google');
  const microsoftIntegration = integrations?.find(i => i.provider === 'microsoft');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Calendar Sync Settings
        </CardTitle>
        <CardDescription>
          Connect and manage your calendar integrations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Google Calendar */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <Label className="text-lg font-semibold">Google Calendar</Label>
              {googleIntegration ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline">Not Connected</Badge>
              )}
            </div>
            {googleIntegration ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSyncNow('google')}
                  disabled={isLoading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Now
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDisconnect('google')}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => handleConnect('google')}>
                Connect
              </Button>
            )}
          </div>

          {googleIntegration && (
            <div className="space-y-4 pl-7">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Sync</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically sync events with Google Calendar
                  </p>
                </div>
                <Switch
                  checked={googleIntegration.sync_enabled ?? true}
                  onCheckedChange={(checked) =>
                    updateSyncSettings.mutate({
                      provider: 'google',
                      sync_enabled: checked,
                    })
                  }
                />
              </div>

              {googleIntegration.sync_enabled && (
                <div className="space-y-2">
                  <Label>Sync Direction</Label>
                  <Select
                    value={googleIntegration.sync_direction || 'bidirectional'}
                    onValueChange={(value: 'import' | 'export' | 'bidirectional') =>
                      updateSyncSettings.mutate({
                        provider: 'google',
                        sync_direction: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="import">Import Only</SelectItem>
                      <SelectItem value="export">Export Only</SelectItem>
                      <SelectItem value="bidirectional">Bidirectional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {googleIntegration.last_sync_at && (
                <p className="text-sm text-muted-foreground">
                  Last synced: {new Date(googleIntegration.last_sync_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Microsoft Teams */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <Label className="text-lg font-semibold">Microsoft Teams</Label>
              {microsoftIntegration ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline">Not Connected</Badge>
              )}
            </div>
            {microsoftIntegration ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSyncNow('microsoft')}
                  disabled={isLoading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Now
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDisconnect('microsoft')}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => handleConnect('microsoft')}>
                Connect
              </Button>
            )}
          </div>

          {microsoftIntegration && (
            <div className="space-y-4 pl-7">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Sync</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically sync events with Microsoft Teams
                  </p>
                </div>
                <Switch
                  checked={microsoftIntegration.sync_enabled ?? true}
                  onCheckedChange={(checked) =>
                    updateSyncSettings.mutate({
                      provider: 'microsoft',
                      sync_enabled: checked,
                    })
                  }
                />
              </div>

              {microsoftIntegration.sync_enabled && (
                <div className="space-y-2">
                  <Label>Sync Direction</Label>
                  <Select
                    value={microsoftIntegration.sync_direction || 'bidirectional'}
                    onValueChange={(value: 'import' | 'export' | 'bidirectional') =>
                      updateSyncSettings.mutate({
                        provider: 'microsoft',
                        sync_direction: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="import">Import Only</SelectItem>
                      <SelectItem value="export">Export Only</SelectItem>
                      <SelectItem value="bidirectional">Bidirectional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {microsoftIntegration.last_sync_at && (
                <p className="text-sm text-muted-foreground">
                  Last synced: {new Date(microsoftIntegration.last_sync_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>

      <CalendarConnectDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        provider={selectedProvider || 'google'}
      />
    </Card>
  );
}
