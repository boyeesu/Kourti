import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Case, Document } from '@/types';
import {
  Edit,
  MoreHorizontal,
  StickyNote,
  Phone,
  Mail,
  MapPin,
  Building,
  User,
  Calendar,
  FileText,
  Briefcase,
  Eye,
  Globe,
  ShieldCheck,
  ShieldOff,
  Clock,
  Send,
  Loader2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
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
import { Input } from '@/components/ui/input';
import { useClient } from '@/hooks/useClients';
import { useClientLogs, useCreateClientLog } from '@/hooks/useClientLogs';
import { useCasesByClient } from '@/hooks/useCases';
import { useContractsByClient } from '@/hooks/useContracts';
import { useCalendarEventsByClient } from '@/hooks/useCalendar';
import { useDocumentsByClient } from '@/hooks/useDocuments';
import {
  useClientPortalStatus,
  useEnableClientPortal,
  useDisableClientPortal,
} from '@/features/clientPortal/api';
import { DocumentViewer } from '@/components/DocumentViewer';

import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function ClientDetails() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const { data: client, isLoading: clientLoading } = useClient(clientId!);
  const { data: commLogs = [] } = useClientLogs(clientId!);
  const { data: casesData } = useCasesByClient(clientId!);
  const cases = casesData?.cases || [];
  const { data: contracts = [] } = useContractsByClient(clientId!);
  const { data: calEvents = [] } = useCalendarEventsByClient(clientId!);
  const { data: documents = [] } = useDocumentsByClient(clientId!);

  const createLog = useCreateClientLog();
  const [logContent, setLogContent] = useState('');
  const [logType, setLogType] = useState<'email' | 'phone' | 'note'>('note');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'open':
      case 'completed':
        return 'bg-success text-success-foreground';
      case 'pending':
      case 'in_progress':
        return 'bg-warning text-warning-foreground';
      case 'review':
        return 'bg-info text-info-foreground';
      case 'closed':
      case 'inactive':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  if (clientLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </PageContainer>
    );
  }

  if (!client) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Client not found</h1>
          <Button onClick={() => navigate('/clients')}>Back to Clients</Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="animate-fade-in">
      <Breadcrumbs />

      {/* Header */}
      <PageHeader
        backHref="/clients"
        leading={
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary font-medium text-xl">
              {getInitials(client.name)}
            </AvatarFallback>
          </Avatar>
        }
        title={client.name}
        actions={
          <>
            <Button
              variant="outline"
              className="hover-scale"
              onClick={() => navigate(`/clients/${clientId}/edit`)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Client
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/matters/create?client=${clientId}`)}>
                  Create New Matter
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/contracts/create?client=${clientId}`)}>
                  Create New Contract
                </DropdownMenuItem>
                <DropdownMenuItem>Send Email</DropdownMenuItem>
                <DropdownMenuItem>Export Data</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Header meta row: badges + key contact details */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {client.status && (
            <Badge className={`capitalize ${getStatusColor(client.status)}`}>{client.status}</Badge>
          )}
          <PortalStatusBadge clientId={clientId!} />
        </div>
        <Separator orientation="vertical" className="hidden h-5 sm:block" />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {client.company && (
            <span className="flex items-center gap-1.5">
              <Building className="h-4 w-4 shrink-0" />
              {client.company}
            </span>
          )}
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <Mail className="h-4 w-4 shrink-0" />
              {client.email}
            </a>
          )}
          {client.phone && (
            <a
              href={`tel:${client.phone}`}
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <Phone className="h-4 w-4 shrink-0" />
              {client.phone}
            </a>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 shrink-0" />
            Client since {new Date(client.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Tabbed body */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="matters">Matters ({cases.length})</TabsTrigger>
          <TabsTrigger value="contracts">Contracts ({contracts.length})</TabsTrigger>
          <TabsTrigger value="portal">Client Portal</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {/* Overview */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="overview" className="pt-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left content */}
            <div className="space-y-6 lg:col-span-2">
              {/* Contact + Address */}
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <InfoRow icon={Mail} label="Email" value={client.email} />
                  <InfoRow icon={Phone} label="Phone" value={client.phone} />
                  <InfoRow icon={Building} label="Company" value={client.company} />
                  <InfoRow icon={MapPin} label="Address" value={client.address} />
                </CardContent>
              </Card>

              {/* Notes */}
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <StickyNote className="h-5 w-5" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {client.notes ? (
                    <p className="whitespace-pre-wrap text-sm text-foreground">{client.notes}</p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">No notes available</p>
                  )}
                </CardContent>
              </Card>

              {/* Communication Log */}
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <StickyNote className="h-5 w-5" />
                    Communication Log ({commLogs.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Select
                      value={logType}
                      onValueChange={(v) => setLogType(v as 'email' | 'phone' | 'note')}
                    >
                      <SelectTrigger aria-label="Log type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="note">Note</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="sm:col-span-2"
                      placeholder="Enter communication details..."
                      value={logContent}
                      onChange={(e) => setLogContent(e.target.value)}
                      aria-label="Communication details"
                    />
                    <Button
                      disabled={createLog.isPending || !logContent.trim()}
                      onClick={() => {
                        createLog.mutate({
                          type: logType,
                          content: logContent,
                          client_id: clientId!,
                        });
                        setLogContent('');
                      }}
                    >
                      Add Log
                    </Button>
                  </div>

                  {commLogs.length === 0 ? (
                    <p className="py-8 text-center text-muted-foreground">
                      No communications logged yet.
                    </p>
                  ) : (
                    <div className="max-h-64 space-y-3 overflow-auto">
                      {commLogs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-start gap-3 rounded-lg bg-muted/30 p-3"
                        >
                          <Badge variant="outline" className="mt-1 capitalize">
                            {log.type}
                          </Badge>
                          <div className="flex-1">
                            <p className="text-sm">{log.content}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {new Date(log.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right rail */}
            <div className="space-y-6">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>At a glance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg bg-muted/40 p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">{cases.length}</p>
                      <p className="text-sm text-muted-foreground">Matters</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">{contracts.length}</p>
                      <p className="text-sm text-muted-foreground">Contracts</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">{documents.length}</p>
                      <p className="text-sm text-muted-foreground">Documents</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">{calEvents.length}</p>
                      <p className="text-sm text-muted-foreground">Events</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Calendar Events */}
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Calendar Events ({calEvents.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {calEvents.length === 0 ? (
                    <p className="py-8 text-center text-muted-foreground">No events scheduled</p>
                  ) : (
                    <div className="space-y-3">
                      {calEvents.slice(0, 5).map((ev) => (
                        <div key={ev.id} className="rounded-lg border p-3 hover:bg-muted/30">
                          <p className="font-medium">{ev.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(ev.start_date).toLocaleString()}
                          </p>
                          <Badge variant="outline" className="mt-1">
                            {ev.event_type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Documents */}
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Documents ({documents.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DocumentsSection documents={documents} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Matters */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="matters" className="pt-4">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Matters ({cases.length})
              </CardTitle>
              {cases.length > 0 && (
                <Button size="sm" onClick={() => navigate(`/matters/create?client=${clientId}`)}>
                  New Matter
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {cases.length === 0 ? (
                <div className="py-8 text-center">
                  <Briefcase className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                  <p className="mb-4 text-muted-foreground">No matters for this client</p>
                  <Button onClick={() => navigate(`/matters/create?client=${clientId}`)}>
                    Create First Matter
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Next Hearing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cases.map((c: Case) => (
                      <TableRow key={c.id} className="hover:bg-muted/50">
                        <TableCell>
                          <Button
                            variant="link"
                            className="h-auto p-0"
                            onClick={() => navigate(`/matters/${c.id}`)}
                          >
                            {c.title}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge className={`capitalize ${getStatusColor(c.status)}`}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">{c.priority}</TableCell>
                        <TableCell>
                          {c.next_hearing_date
                            ? new Date(c.next_hearing_date).toLocaleDateString()
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Contracts */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="contracts" className="pt-4">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contracts ({contracts.length})
              </CardTitle>
              {contracts.length > 0 && (
                <Button size="sm" onClick={() => navigate(`/contracts/create?client=${clientId}`)}>
                  New Contract
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <div className="py-8 text-center">
                  <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                  <p className="mb-4 text-muted-foreground">No contracts for this client</p>
                  <Button onClick={() => navigate(`/contracts/create?client=${clientId}`)}>
                    Create First Contract
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {contracts.map((ct) => (
                    <div
                      key={ct.id}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30"
                    >
                      <div>
                        <Button
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => navigate(`/contracts/${ct.id}`)}
                        >
                          {ct.title}
                        </Button>
                        <p className="text-sm text-muted-foreground">
                          {ct.start_date &&
                            ct.end_date &&
                            `${new Date(ct.start_date).toLocaleDateString()} - ${new Date(ct.end_date).toLocaleDateString()}`}
                        </p>
                      </div>
                      <Badge className={`capitalize ${getStatusColor(ct.status)}`}>
                        {ct.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Client Portal */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="portal" className="pt-4">
          <ClientPortalSection clientId={clientId!} clientEmail={client.email} />
        </TabsContent>
      </Tabs>

      {/* Document Viewer */}
      {selectedDocument && (
        <DocumentViewer
          open={!!selectedDocument}
          onOpenChange={() => setSelectedDocument(null)}
          document={{
            ...selectedDocument,
            name: selectedDocument.name || selectedDocument.title || 'Untitled',
          }}
        />
      )}
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Info row (Overview contact card)
// ---------------------------------------------------------------------------

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="break-words font-medium">
          {value || <span className="font-normal italic text-muted-foreground">Not provided</span>}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portal status badge (used in the header meta row)
// ---------------------------------------------------------------------------

function PortalStatusBadge({ clientId }: { clientId: string }) {
  const { data: status } = useClientPortalStatus(clientId);

  if (!status) return null;

  if (status.status === 'active') {
    return (
      <Badge className="bg-success text-success-foreground">
        <ShieldCheck className="mr-1 h-3 w-3" />
        Portal active
      </Badge>
    );
  }
  if (status.status === 'pending') {
    return (
      <Badge className="bg-warning text-warning-foreground" variant="secondary">
        <Clock className="mr-1 h-3 w-3" />
        Portal invited
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <ShieldOff className="mr-1 h-3 w-3" />
      Portal off
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Client Portal section
// ---------------------------------------------------------------------------

function ClientPortalSection({
  clientId,
  clientEmail,
}: {
  clientId: string;
  clientEmail?: string | null;
}) {
  const { data: status, isLoading } = useClientPortalStatus(clientId);
  const enable = useEnableClientPortal();
  const disable = useDisableClientPortal();

  if (isLoading) {
    return (
      <Card className="shadow-card">
        <CardContent className="py-12">
          <p className="text-center text-sm text-muted-foreground">Loading portal status…</p>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card className="shadow-card">
        <CardContent className="py-12">
          <p className="text-center text-sm text-muted-foreground">
            Portal status is unavailable right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Email comes from the client profile; fall back to the prop if needed.
  const email = status.email ?? clientEmail ?? null;
  const hasEmail = !!email;
  const matters = status.matters ?? [];

  const stateMeta = (() => {
    switch (status.status) {
      case 'active':
        return {
          badge: <Badge className="bg-success text-success-foreground">Active</Badge>,
          title: 'Portal is active',
          description: status.lastSignInAt
            ? `Last signed in ${new Date(status.lastSignInAt).toLocaleString()}.`
            : 'The client can sign in and view their shared matters.',
        };
      case 'pending':
        return {
          badge: (
            <Badge className="bg-warning text-warning-foreground" variant="secondary">
              Pending
            </Badge>
          ),
          title: 'Invite sent — awaiting acceptance',
          description: 'The client has been invited and needs to accept and verify their email.',
        };
      default:
        return {
          badge: <Badge variant="outline">Not enabled</Badge>,
          title: 'Portal not enabled',
          description:
            'Enable the portal to give this client secure access to their shared matters.',
        };
    }
  })();

  return (
    <div className="space-y-6">
      {/* Status + actions */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Client Portal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{stateMeta.title}</span>
                {stateMeta.badge}
              </div>
              <p className="text-sm text-muted-foreground">{stateMeta.description}</p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {status.status === 'none' && (
                <Button
                  onClick={() => enable.mutate(clientId)}
                  disabled={!hasEmail || enable.isPending}
                >
                  {enable.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Enable client portal
                </Button>
              )}

              {status.status === 'pending' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => enable.mutate(clientId)}
                    disabled={enable.isPending}
                  >
                    {enable.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Resend invite
                  </Button>
                  <DisablePortalButton
                    onDisable={() => disable.mutate(clientId)}
                    pending={disable.isPending}
                  />
                </>
              )}

              {status.status === 'active' && (
                <DisablePortalButton
                  onDisable={() => disable.mutate(clientId)}
                  pending={disable.isPending}
                />
              )}
            </div>
          </div>

          {/* Email (read-only) */}
          <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Invitation email</p>
              {hasEmail ? (
                <p className="break-words font-medium">{email}</p>
              ) : (
                <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
                  <AlertCircle className="h-4 w-4" />
                  An email address is required. Add one on the client profile to enable the portal.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shared matters */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Matters in this client&apos;s portal ({matters.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Public matters are visible to the client in their portal; private matters stay hidden.
            The Public/Private toggle lives on each matter&apos;s page.
          </p>

          {matters.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              This client has no matters yet.
            </p>
          ) : (
            <div className="space-y-2">
              {matters.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3 hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/matters/${m.id}`}
                      className="flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <span className="truncate">{m.title}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                    {m.status && (
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">{m.status}</p>
                    )}
                  </div>
                  {m.portalPrivate ? (
                    <Badge variant="outline" className="shrink-0">
                      Private
                    </Badge>
                  ) : (
                    <Badge className="shrink-0 bg-success text-success-foreground">Public</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DisablePortalButton({ onDisable, pending }: { onDisable: () => void; pending: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending}>
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShieldOff className="mr-2 h-4 w-4" />
          )}
          Disable
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disable client portal?</AlertDialogTitle>
          <AlertDialogDescription>
            The client will lose access to their portal and will no longer be able to view their
            shared matters. You can re-enable access at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDisable}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Disable
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Documents Section Component
// ---------------------------------------------------------------------------

function DocumentsSection({ documents }: { documents: Document[] }) {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  const handleView = (doc: Document) => {
    setSelectedDocument(doc);
  };

  return (
    <>
      {documents.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No documents uploaded</p>
      ) : (
        <div className="space-y-3">
          {documents.slice(0, 10).map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {d.file_size && `${Math.round(d.file_size / 1024)} KB`} •{' '}
                    {new Date(d.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleView(d)}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Document Viewer */}
      {selectedDocument && (
        <DocumentViewer
          open={!!selectedDocument}
          onOpenChange={() => setSelectedDocument(null)}
          document={{
            ...selectedDocument,
            name: selectedDocument.name || selectedDocument.title || 'Untitled',
          }}
        />
      )}
    </>
  );
}
