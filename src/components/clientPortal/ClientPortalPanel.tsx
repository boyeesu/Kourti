import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { UserPlus, Trash2, Loader2, Send, Sparkles, Mail, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useCasePortalAccess,
  useInviteClient,
  useRevokeAccess,
  useSetPortalPrivate,
  useSetClientSummary,
  useCasePortalEvents,
  useToggleEventVisibility,
  usePostEvent,
  useCasePortalDocuments,
  useToggleDocumentShare,
  useCasePortalDigests,
  useGenerateDigest,
  useApproveDigest,
  useDiscardDigest,
  useClientPortalSettings,
  useUpdateClientPortalSettings,
  type PortalAccessRow,
  type PortalDigest,
} from '@/features/clientPortal/api';

interface CaseLike {
  id: string;
  portal_private?: boolean | null;
  client_summary?: string | null;
}

interface ClientPortalPanelProps {
  caseId: string;
  caseData: CaseLike;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function accessStatusBadge(row: PortalAccessRow) {
  if (row.revoked_at || row.status === 'revoked') {
    return <Badge variant="outline">Revoked</Badge>;
  }
  if (!row.email_verified_at || !row.last_sign_in_at) {
    return (
      <Badge className="bg-warning text-warning-foreground" variant="secondary">
        Pending
      </Badge>
    );
  }
  return <Badge className="bg-success text-success-foreground">Active</Badge>;
}

function digestStatusBadge(status: PortalDigest['status']) {
  switch (status) {
    case 'sent':
      return <Badge className="bg-success text-success-foreground">Sent</Badge>;
    case 'approved':
      return <Badge className="bg-info text-info-foreground">Approved</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'draft':
    default:
      return <Badge variant="secondary">Draft</Badge>;
  }
}

export function ClientPortalPanel({ caseId, caseData }: ClientPortalPanelProps) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Client Portal</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="access" className="w-full">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="access">Access</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="updates">Updates</TabsTrigger>
          </TabsList>

          <TabsContent value="access" className="pt-4">
            <AccessSection caseId={caseId} caseData={caseData} />
          </TabsContent>
          <TabsContent value="summary" className="pt-4">
            <SummarySection caseId={caseId} caseData={caseData} />
          </TabsContent>
          <TabsContent value="timeline" className="pt-4">
            <TimelineSection caseId={caseId} />
          </TabsContent>
          <TabsContent value="documents" className="pt-4">
            <DocumentsSection caseId={caseId} />
          </TabsContent>
          <TabsContent value="updates" className="pt-4">
            <UpdatesSection caseId={caseId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

function AccessSection({ caseId, caseData }: ClientPortalPanelProps) {
  const { data: rows = [], isLoading } = useCasePortalAccess(caseId);
  const invite = useInviteClient(caseId);
  const revoke = useRevokeAccess(caseId);
  const setPrivate = useSetPortalPrivate(caseId);
  const { data: settings } = useClientPortalSettings();
  const updateSettings = useUpdateClientPortalSettings();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    invite.mutate(
      { email: email.trim(), fullName: fullName.trim() || undefined },
      {
        onSuccess: () => {
          setEmail('');
          setFullName('');
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Firm-wide settings ── */}
      <div className="rounded-lg border border-dashed p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Firm-wide
        </p>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Require 2FA for all client sign-ins</Label>
            <p className="text-sm text-muted-foreground">
              Applies to every client across your firm, not just this matter.
            </p>
          </div>
          <Switch
            checked={settings?.requireOtp ?? false}
            disabled={updateSettings.isPending || settings === undefined}
            onCheckedChange={(checked) => updateSettings.mutate({ requireOtp: checked })}
          />
        </div>
      </div>

      {/* ── Per-matter controls ── */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Portal private</Label>
          <p className="text-sm text-muted-foreground">
            When private, clients cannot view this matter in their portal.
          </p>
        </div>
        <Switch
          checked={!!caseData.portal_private}
          disabled={setPrivate.isPending}
          onCheckedChange={(checked) => setPrivate.mutate(checked)}
        />
      </div>

      <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label className="mb-2 block text-sm font-medium">Client email *</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            required
          />
        </div>
        <div className="flex-1">
          <Label className="mb-2 block text-sm font-medium">Full name (optional)</Label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>
        <Button type="submit" disabled={invite.isPending || !email.trim()}>
          {invite.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="mr-2 h-4 w-4" />
          )}
          Invite client
        </Button>
      </form>

      {isLoading ? (
        <p className="py-4 text-sm text-muted-foreground">Loading access…</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No clients have access to this matter yet.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">{row.full_name || row.email || 'Client'}</p>
                {row.full_name && row.email && (
                  <p className="text-sm text-muted-foreground">{row.email}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {accessStatusBadge(row)}
                {!row.revoked_at && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke portal access?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {row.full_name || row.email || 'This client'} will no longer be able to
                          view this matter in their portal.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => revoke.mutate(row.client_user_id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Revoke
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function SummarySection({ caseId, caseData }: ClientPortalPanelProps) {
  const setSummary = useSetClientSummary(caseId);
  const [value, setValue] = useState(caseData.client_summary ?? '');

  useEffect(() => {
    setValue(caseData.client_summary ?? '');
  }, [caseData.client_summary]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A plain-English summary the client sees in their portal.
      </p>
      <Textarea
        rows={6}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Describe the current state of the matter in plain language for your client…"
      />
      <div className="flex justify-end">
        <Button
          onClick={() => setSummary.mutate(value.trim() ? value : null)}
          disabled={setSummary.isPending}
        >
          {setSummary.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save summary
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function TimelineSection({ caseId }: { caseId: string }) {
  const { data: events = [], isLoading } = useCasePortalEvents(caseId);
  const toggle = useToggleEventVisibility(caseId);
  const post = usePostEvent(caseId);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    post.mutate(
      {
        eventType: 'manual_update',
        title: title.trim(),
        body: body.trim() || undefined,
        clientVisible: true,
      },
      {
        onSuccess: () => {
          setTitle('');
          setBody('');
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handlePost} className="space-y-3 rounded-lg border p-4">
        <Label className="text-sm font-medium">Post an update for the client</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Update title"
        />
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Details (optional)"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={post.isPending || !title.trim()}>
            {post.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Post update
          </Button>
        </div>
      </form>

      {isLoading ? (
        <p className="py-4 text-sm text-muted-foreground">Loading timeline…</p>
      ) : events.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No timeline events yet.</p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start justify-between gap-4 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{event.title || event.event_type}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {event.event_type.replace(/_/g, ' ')} ·{' '}
                  {format(new Date(event.occurred_at), 'PP')}
                </p>
                {event.body && <p className="mt-1 text-sm text-muted-foreground">{event.body}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">Visible</span>
                <Switch
                  checked={event.client_visible}
                  disabled={toggle.isPending}
                  onCheckedChange={(checked) =>
                    toggle.mutate({ eventId: event.id, clientVisible: checked })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function DocumentsSection({ caseId }: { caseId: string }) {
  const { data: docs = [], isLoading } = useCasePortalDocuments(caseId);
  const toggleShare = useToggleDocumentShare(caseId);

  if (isLoading) {
    return <p className="py-4 text-sm text-muted-foreground">Loading documents…</p>;
  }

  if (docs.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">No documents on this matter.</p>
    );
  }

  return (
    <div className="space-y-2">
      {docs.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex min-w-0 items-center gap-3">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate font-medium">{doc.name}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(doc.createdAt), 'PP')}
                {doc.fileSize ? ` · ${formatBytes(doc.fileSize)}` : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">Shared</span>
            <Switch
              checked={doc.clientVisible}
              disabled={toggleShare.isPending}
              onCheckedChange={(checked) =>
                toggleShare.mutate({ documentId: doc.id, share: checked })
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Updates (digests)
// ---------------------------------------------------------------------------

function UpdatesSection({ caseId }: { caseId: string }) {
  const { data: digests = [], isLoading } = useCasePortalDigests(caseId);
  const generate = useGenerateDigest(caseId);
  const [preview, setPreview] = useState<PortalDigest | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          AI-drafted progress updates you can review and send to the client.
        </p>
        <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Generate draft update
        </Button>
      </div>

      {isLoading ? (
        <p className="py-4 text-sm text-muted-foreground">Loading updates…</p>
      ) : digests.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No updates yet.</p>
      ) : (
        <div className="space-y-2">
          {digests.map((digest) => (
            <div
              key={digest.id}
              className="flex items-start justify-between gap-4 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {digestStatusBadge(digest.status)}
                  <p className="truncate font-medium">{digest.subject || 'Untitled update'}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {format(new Date(digest.created_at), 'PPp')}
                </p>
                {digest.status === 'failed' && digest.error && (
                  <p className="mt-1 text-sm text-destructive">{digest.error}</p>
                )}
              </div>
              <div className="shrink-0">
                {digest.status === 'draft' ? (
                  <Button size="sm" variant="outline" onClick={() => setPreview(digest)}>
                    Preview &amp; approve
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPreview(digest)}
                    disabled={!digest.body_md}
                  >
                    View
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <DigestPreviewDialog
          caseId={caseId}
          digest={preview}
          open={!!preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function DigestPreviewDialog({
  caseId,
  digest,
  open,
  onClose,
}: {
  caseId: string;
  digest: PortalDigest;
  open: boolean;
  onClose: () => void;
}) {
  const approve = useApproveDigest(caseId);
  const discard = useDiscardDigest(caseId);
  const isDraft = digest.status === 'draft';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {digest.subject || 'Update preview'}
          </DialogTitle>
          <DialogDescription>
            {digest.channel} · {format(new Date(digest.created_at), 'PPp')}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm">
          {digest.body_md || 'No content.'}
        </div>
        {isDraft && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => discard.mutate(digest.id, { onSuccess: onClose })}
              disabled={discard.isPending || approve.isPending}
            >
              {discard.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Discard
            </Button>
            <Button
              onClick={() => approve.mutate(digest.id, { onSuccess: onClose })}
              disabled={approve.isPending || discard.isPending}
            >
              {approve.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Approve &amp; send
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
