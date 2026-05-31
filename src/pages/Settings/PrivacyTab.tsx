import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { invokeNodeApi } from '@/lib/backendApi';
import { useAuth } from '@/hooks/useAuth';
import { Download, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { env } from '@/lib/env';
import { getAccessToken, refreshSession } from '@/lib/authClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getValidToken(): Promise<string> {
  const token = getAccessToken();
  if (token) return token;
  const session = await refreshSession();
  return session.accessToken;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PrivacyTab() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  // Toggle states
  const [marketingEnabled, setMarketingEnabled] = useState<boolean | null>(null);
  const [marketingLoading, setMarketingLoading] = useState(false);

  const [restrictionEnabled, setRestrictionEnabled] = useState<boolean | null>(null);
  const [restrictionLoading, setRestrictionLoading] = useState(false);

  // Export state
  const [exportLoading, setExportLoading] = useState(false);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleMarketingToggle = async (granted: boolean) => {
    setMarketingLoading(true);
    const prev = marketingEnabled;
    setMarketingEnabled(granted);
    try {
      await invokeNodeApi('/api/v1/users/me/marketing-consent', {
        method: 'POST',
        body: { granted },
      });
      toast.success(granted ? 'Marketing emails enabled' : 'Marketing emails disabled');
    } catch (err) {
      setMarketingEnabled(prev);
      toast.error('Failed to update marketing preference', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setMarketingLoading(false);
    }
  };

  const handleRestrictionToggle = async (restricted: boolean) => {
    setRestrictionLoading(true);
    const prev = restrictionEnabled;
    setRestrictionEnabled(restricted);
    try {
      await invokeNodeApi('/api/v1/users/me/processing-restriction', {
        method: 'POST',
        body: { restricted },
      });
      toast.success(
        restricted ? 'Processing restriction applied' : 'Processing restriction lifted'
      );
    } catch (err) {
      setRestrictionEnabled(prev);
      toast.error('Failed to update processing restriction', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRestrictionLoading(false);
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const accessToken = await getValidToken();
      const response = await fetch(`${env.BACKEND_API_URL}/api/v1/users/me/export`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(data?.error || data?.message || `Export failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use Content-Disposition filename if present, else fall back
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)/i);
      a.download = match?.[1]?.replace(/['"]/g, '') ?? 'my-data-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Data export downloaded');
    } catch (err) {
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }
    if (!deletePassword) {
      toast.error('Password is required');
      return;
    }

    setDeleteLoading(true);
    try {
      await invokeNodeApi('/api/v1/users/me', {
        method: 'DELETE',
        body: { password: deletePassword, confirm: 'DELETE' },
      });
      toast.success('Account deleted');
      setDeleteOpen(false);
      await signOut();
      navigate('/auth', { replace: true });
    } catch (err) {
      toast.error('Failed to delete account', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Marketing emails */}
      <Card>
        <CardHeader>
          <CardTitle>Marketing Communications</CardTitle>
          <CardDescription>
            Control whether you receive product updates and marketing emails from Kourti.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="marketing-toggle" className="text-sm leading-snug max-w-sm">
              Receive product updates, feature announcements, and occasional marketing emails.
            </Label>
            <Switch
              id="marketing-toggle"
              checked={marketingEnabled ?? false}
              onCheckedChange={handleMarketingToggle}
              disabled={marketingLoading}
              aria-label="Marketing emails"
            />
          </div>
        </CardContent>
      </Card>

      {/* Processing restriction */}
      <Card>
        <CardHeader>
          <CardTitle>Restrict Data Processing</CardTitle>
          <CardDescription>
            Under GDPR/NDPR you may request that we restrict processing of your personal data in
            certain circumstances. Enabling this flag signals that restriction to our systems.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="restriction-toggle" className="text-sm leading-snug max-w-sm">
              Restrict processing of my personal data (your account will remain accessible but
              certain automated processing will be paused pending review).
            </Label>
            <Switch
              id="restriction-toggle"
              checked={restrictionEnabled ?? false}
              onCheckedChange={handleRestrictionToggle}
              disabled={restrictionLoading}
              aria-label="Restrict data processing"
            />
          </div>
        </CardContent>
      </Card>

      {/* Data export */}
      <Card>
        <CardHeader>
          <CardTitle>Download My Data</CardTitle>
          <CardDescription>
            Export a copy of your personal data in JSON format (right of portability under
            GDPR/NDPR).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleExport} disabled={exportLoading}>
            {exportLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {exportLoading ? 'Preparing export…' : 'Download my data'}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Delete account */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Delete Account
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action is{' '}
            <strong>irreversible</strong>. All your data — cases, documents, billing history — will
            be erased and cannot be recovered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => {
              setDeleteConfirmText('');
              setDeletePassword('');
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete my account
          </Button>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Delete Account — This Cannot Be Undone
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-1">
              <span className="block">
                You are about to permanently delete your account and all data associated with it.
                Once deleted, your cases, documents, team, and billing history{' '}
                <strong>cannot be recovered</strong>.
              </span>
              <span className="block font-medium text-foreground">
                Type <span className="font-mono text-destructive">DELETE</span> and enter your
                password to confirm.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirm" className="text-sm">
                Type DELETE to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className={
                  deleteConfirmText && deleteConfirmText !== 'DELETE' ? 'border-destructive' : ''
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-password" className="text-sm">
                Your password
              </Label>
              <Input
                id="delete-password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={
                deleteLoading || deleteConfirmText !== 'DELETE' || deletePassword.length === 0
              }
            >
              {deleteLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {deleteLoading ? 'Deleting…' : 'Permanently delete account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
