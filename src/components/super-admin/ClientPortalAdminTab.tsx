import { useState } from 'react';
import { format } from 'date-fns';
import { ArrowLeft, Building2, Mail, Search, UserX, Users, GitMerge } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useDisablePortalClient,
  useMergePortalClients,
  usePortalAdminClient,
  usePortalAdminClientLinks,
  usePortalAdminClients,
  useResendPortalInvite,
  type PortalAdminClientListItem,
} from '@/hooks/useClientPortalAdmin';

const PAGE_SIZE = 50;

function fmt(date: string | null | undefined): string {
  if (!date) return '—';
  try {
    return format(new Date(date), 'MMM dd, yyyy HH:mm');
  } catch {
    return '—';
  }
}

// ── Reason dialog (used by resend / disable) ─────────────────────────────────

function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason('');
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Reason (required, min 3 chars)</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you performing this action?"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button disabled={!valid || pending} onClick={() => onConfirm(reason.trim())}>
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Client detail panel ──────────────────────────────────────────────────────

function ClientDetail({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const { data, isLoading } = usePortalAdminClient(clientId);
  const { data: firmLinks } = usePortalAdminClientLinks(clientId);
  const resend = useResendPortalInvite();
  const disable = useDisablePortalClient();

  const [resendOpen, setResendOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <p className="text-muted-foreground">Client not found.</p>
      </div>
    );
  }

  const { client, caseLinks, clientLevelLinks, firmContacts } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to list
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setResendOpen(true)}
            disabled={client.has_password}
            title={client.has_password ? 'Client already accepted their invite' : undefined}
          >
            <Mail className="h-4 w-4 mr-2" /> Resend invite
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDisableOpen(true)}
            disabled={!client.is_active}
          >
            <UserX className="h-4 w-4 mr-2" /> Disable
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {client.full_name || client.email}
            {!client.is_active && <Badge variant="destructive">Disabled</Badge>}
            {client.has_pending_invite && !client.has_password && (
              <Badge variant="secondary">Invite pending</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-3">
          <Field label="Email" value={client.email} />
          <Field label="Phone" value={client.phone ?? '—'} />
          <Field label="Active" value={client.is_active ? 'Yes' : 'No'} />
          <Field label="Has password" value={client.has_password ? 'Yes' : 'No'} />
          <Field label="Email verified" value={fmt(client.email_verified_at)} />
          <Field label="Last sign-in" value={fmt(client.last_sign_in_at)} />
          <Field label="Invite expires" value={fmt(client.invite_expires_at)} />
          <Field label="Created" value={fmt(client.created_at)} />
        </CardContent>
      </Card>

      {/* Multi-firm view */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> Linked firms ({firmLinks?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!firmLinks || firmLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No firm links.</p>
          ) : (
            firmLinks.map((f) => (
              <div
                key={f.organization_id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div className="font-medium">{f.organization_name || f.organization_id}</div>
                <div className="flex gap-2 text-muted-foreground">
                  <Badge variant="outline">{f.client_level_count} client-level</Badge>
                  <Badge variant="outline">{f.explicit_case_count} matter grants</Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Case + client-level access links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Access links ({caseLinks.length + clientLevelLinks.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {caseLinks.length === 0 && clientLevelLinks.length === 0 && (
            <p className="text-sm text-muted-foreground">No access links.</p>
          )}
          {clientLevelLinks.map((l) => (
            <div key={l.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{l.client_name || 'Client contact'}</span>
                <Badge variant={l.status === 'active' ? 'default' : 'secondary'}>{l.status}</Badge>
              </div>
              <div className="text-muted-foreground">
                {l.organization_name || l.organization_id} • client-level • {l.role} • by{' '}
                {l.granted_by_type}
              </div>
            </div>
          ))}
          {caseLinks.map((l) => (
            <div key={l.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{l.case_title || l.case_id}</span>
                <Badge variant={l.status === 'active' ? 'default' : 'secondary'}>{l.status}</Badge>
              </div>
              <div className="text-muted-foreground">
                {l.organization_name || l.organization_id} • matter grant • {l.role}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Firm contact rows + portal status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Firm contact records ({firmContacts.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {firmContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No linked firm contacts.</p>
          ) : (
            firmContacts.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <div className="font-medium">{c.name || c.email || c.id}</div>
                  <div className="text-muted-foreground">
                    {c.organization_name || c.organization_id}
                  </div>
                </div>
                <Badge variant={c.portal_enabled ? 'default' : 'secondary'}>
                  {c.portal_enabled ? 'Portal enabled' : 'Portal off'}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ReasonDialog
        open={resendOpen}
        title="Resend portal invite"
        description={`Re-issue a fresh 24h invite token and email it to ${client.email}.`}
        confirmLabel="Resend invite"
        pending={resend.isPending}
        onClose={() => setResendOpen(false)}
        onConfirm={(reason) =>
          resend.mutate({ clientId: client.id, reason }, { onSuccess: () => setResendOpen(false) })
        }
      />
      <ReasonDialog
        open={disableOpen}
        title="Disable client identity"
        description="This deactivates the global client login and burns all active sessions, invite, and reset tokens."
        confirmLabel="Disable client"
        pending={disable.isPending}
        onClose={() => setDisableOpen(false)}
        onConfirm={(reason) =>
          disable.mutate(
            { clientId: client.id, reason },
            { onSuccess: () => setDisableOpen(false) }
          )
        }
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="break-all">{value}</div>
    </div>
  );
}

// ── Merge form ───────────────────────────────────────────────────────────────

function MergeForm() {
  const merge = useMergePortalClients();
  const [open, setOpen] = useState(false);
  const [primaryId, setPrimaryId] = useState('');
  const [duplicateId, setDuplicateId] = useState('');
  const [reason, setReason] = useState('');

  const UUID = /^[0-9a-fA-F-]{36}$/;
  const valid =
    UUID.test(primaryId.trim()) &&
    UUID.test(duplicateId.trim()) &&
    primaryId.trim() !== duplicateId.trim() &&
    reason.trim().length >= 3;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <GitMerge className="h-4 w-4 mr-2" /> Merge duplicates
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge duplicate client identities</DialogTitle>
            <DialogDescription>
              Re-points the duplicate&apos;s access grants &amp; firm contacts to the primary, then
              disables the duplicate. Colliding grants are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="primaryId">Primary client ID (the survivor)</Label>
              <Input
                id="primaryId"
                value={primaryId}
                onChange={(e) => setPrimaryId(e.target.value)}
                placeholder="uuid"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="duplicateId">Duplicate client ID (to be disabled)</Label>
              <Input
                id="duplicateId"
                value={duplicateId}
                onChange={(e) => setDuplicateId(e.target.value)}
                placeholder="uuid"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mergeReason">Reason (required, min 3 chars)</Label>
              <Textarea
                id="mergeReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={merge.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!valid || merge.isPending}
              onClick={() =>
                merge.mutate(
                  {
                    primaryId: primaryId.trim(),
                    duplicateId: duplicateId.trim(),
                    reason: reason.trim(),
                  },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setPrimaryId('');
                      setDuplicateId('');
                      setReason('');
                    },
                  }
                )
              }
            >
              {merge.isPending ? 'Merging…' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────

export function ClientPortalAdminTab() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = usePortalAdminClients({
    q: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const items = data?.items ?? [];

  if (selectedId) {
    return (
      <div className="space-y-6">
        <ClientDetail clientId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Client Portal Admin
          </h2>
          <p className="text-muted-foreground">
            Cross-firm view of global client identities, invites, and merges
          </p>
        </div>
        <MergeForm />
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No clients found</div>
          ) : (
            <div className="space-y-2">
              {items.map((c: PortalAdminClientListItem) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="flex w-full items-center justify-between rounded-lg border p-4 text-left hover:bg-muted/50"
                >
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {c.full_name || c.email}
                      {!c.is_active && (
                        <Badge variant="destructive" className="text-xs">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{c.email}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{c.firm_count} firm(s)</Badge>
                    <Badge variant="outline">{c.case_access_count} matter(s)</Badge>
                    <span>{fmt(c.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={items.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
