import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Eye, ShieldAlert, X } from 'lucide-react';
import {
  useActiveImpersonations,
  useStartImpersonation,
  useEndImpersonation,
} from '@/hooks/useImpersonation';
import { useAdminCapabilities } from '@/hooks/useAdminCapabilities';

export function ImpersonationTab() {
  const { has } = useAdminCapabilities();
  const { data: sessions, isLoading } = useActiveImpersonations();
  const start = useStartImpersonation();
  const end = useEndImpersonation();

  const [targetUserId, setTargetUserId] = useState('');
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('read');
  const [lastToken, setLastToken] = useState<string | null>(null);

  const canWrite = has('impersonate.write');

  const handleStart = async () => {
    const result = await start.mutateAsync({ targetUserId: targetUserId.trim(), scope, reason });
    setLastToken(result.token);
    setTargetUserId('');
    setReason('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Impersonation — “View as”</h2>
        <p className="text-sm text-muted-foreground">
          Start an audited session to reproduce a user’s experience. Read-only sessions cannot
          modify any data. All sessions are logged and can be revoked at any time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start a session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="imp-user">Target user ID</Label>
              <Input
                id="imp-user"
                placeholder="UUID of the firm user"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imp-scope">Scope</Label>
              <select
                id="imp-scope"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={scope}
                onChange={(e) => setScope(e.target.value as 'read' | 'write')}
              >
                <option value="read">Read-only (recommended)</option>
                <option value="write" disabled={!canWrite}>
                  Read-write {canWrite ? '' : '(no permission)'}
                </option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imp-reason">Reason (required, audited)</Label>
            <Input
              id="imp-reason"
              placeholder="e.g. Reproducing case-view bug reported in ticket #1234"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button
            onClick={handleStart}
            disabled={
              start.isPending || targetUserId.trim().length < 10 || reason.trim().length < 3
            }
          >
            <Eye className="mr-2 h-4 w-4" />
            Start session
          </Button>

          {lastToken && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <ShieldAlert className="h-3.5 w-3.5" /> Session token issued
              </div>
              <p className="mb-2">
                This short-lived token authenticates as the target user. The in-browser “become
                user” swap is intentionally a separate, carefully-reviewed step — for now use this
                token with an API client to reproduce the user’s requests, or revoke it below.
              </p>
              <code className="block max-h-24 overflow-auto break-all rounded bg-white/60 p-2">
                {lastToken}
              </code>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !sessions?.length ? (
            <p className="text-sm text-muted-foreground">No active impersonation sessions.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.target_email ?? s.target_user_id}</span>
                      <Badge variant={s.scope === 'write' ? 'destructive' : 'secondary'}>
                        {s.scope}
                      </Badge>
                      {s.organization_name && (
                        <span className="text-muted-foreground">· {s.organization_name}</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      by {s.admin_email ?? s.admin_user_id} · {s.reason} · expires{' '}
                      {new Date(s.expires_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => end.mutate(s.id)}
                    disabled={end.isPending}
                  >
                    <X className="mr-1 h-4 w-4" /> Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
