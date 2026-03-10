import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, CheckCircle2 } from 'lucide-react';
import { useCalendarSync } from '@/hooks/useCalendarSync';
import { toast } from 'sonner';

interface CalendarConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: 'google' | 'microsoft';
}

export function CalendarConnectDialog({
  open,
  onOpenChange,
  provider,
}: CalendarConnectDialogProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const { connectCalendar, isConnected } = useCalendarSync();
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const authUrl = await connectCalendar.mutateAsync(provider);
      if (authUrl) {
        window.location.href = authUrl;
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to initiate calendar connection';
      toast.error('Connection Failed', { description: errorMessage });
      setIsConnecting(false);
    }
  };

  const connected = isConnected(provider);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Connect {provider === 'google' ? 'Google Calendar' : 'Microsoft Teams'}
          </DialogTitle>
          <DialogDescription>
            Connect your {provider === 'google' ? 'Google Calendar' : 'Microsoft Teams'} account to
            sync events.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {connected ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span>Connected</span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                You'll be redirected to authorize access to your calendar.
              </p>
              <Button onClick={handleConnect} disabled={isConnecting} className="w-full">
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>Connect {provider === 'google' ? 'Google' : 'Microsoft'} Calendar</>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
