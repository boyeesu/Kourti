import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getEmailOtpSetting, setEmailOtpSetting } from '@/lib/authClient';

export function TwoFactorEmailCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    getEmailOtpSetting()
      .then((res) => {
        if (mounted) setEnabled(res.enabled);
      })
      .catch(() => {
        if (mounted) setEnabled(true); // default-on assumption
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggle = (next: boolean) => {
    setPendingValue(next);
    setPassword('');
  };

  const handleConfirm = async () => {
    if (pendingValue === null) return;
    if (!password) {
      toast.error('Enter your current password to confirm.');
      return;
    }
    setSaving(true);
    const { enabled: newEnabled, error } = await setEmailOtpSetting(pendingValue, password);
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Could not update 2FA setting');
      return;
    }
    setEnabled(newEnabled);
    setPendingValue(null);
    setPassword('');
    toast.success(`Email 2FA ${newEnabled ? 'enabled' : 'disabled'}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-Factor Authentication (Email)</CardTitle>
        <CardDescription>
          Require a one-time code sent to your email each time you sign in. We recommend keeping
          this on — it also confirms your email address is correct.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Email one-time code</p>
            <p className="text-xs text-muted-foreground">
              {enabled === null
                ? 'Loading…'
                : enabled
                  ? 'Enabled — a code is sent to your email at every sign-in.'
                  : 'Disabled — sign-in only requires your password.'}
            </p>
          </div>
          <Switch
            checked={pendingValue ?? enabled ?? false}
            disabled={enabled === null || saving}
            onCheckedChange={handleToggle}
          />
        </div>

        {pendingValue !== null && pendingValue !== enabled && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <Label htmlFor="emailotp-password">Confirm with current password</Label>
            <Input
              id="emailotp-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
            />
            <div className="flex gap-2">
              <Button onClick={handleConfirm} disabled={saving || !password}>
                {saving ? 'Saving…' : pendingValue ? 'Enable 2FA' : 'Disable 2FA'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPendingValue(null);
                  setPassword('');
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
