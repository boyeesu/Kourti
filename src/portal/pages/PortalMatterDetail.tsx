import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  FileText,
  Download,
  Send,
  MessageSquare,
  AlertCircle,
  FilePlus2,
  CheckCircle2,
  StickyNote,
  Gavel,
  RefreshCw,
  FolderPlus,
  Receipt,
  BadgeCheck,
  Megaphone,
  CircleDot,
  Users,
  UserPlus,
  X,
  MapPin,
  CalendarDays,
  CalendarPlus,
  Activity,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  portalGetMatter,
  portalGetTimeline,
  portalGetDocuments,
  portalGetMessages,
  portalPostMessage,
  portalGetMatterTeam,
  portalInviteTeam,
  portalRemoveTeam,
  portalGetMatterCalendar,
  portalRsvpEvent,
  downloadIcs,
  type PortalEventType,
  type PortalTimelineEvent,
  type PortalCalendarEvent,
  type PortalRsvpResponse,
} from '../portalApi';

function prettyStatus(status: string | null): string {
  if (!status) return 'In progress';
  return status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const EVENT_ICON: Record<string, typeof CircleDot> = {
  case_created: FilePlus2,
  status_changed: RefreshCw,
  hearing_scheduled: Gavel,
  document_shared: FileText,
  document_added: FolderPlus,
  task_completed: CheckCircle2,
  note_added: StickyNote,
  client_message: MessageSquare,
  invoice_sent: Receipt,
  invoice_paid: BadgeCheck,
  update_sent: Megaphone,
};

function eventIcon(type: PortalEventType) {
  return EVENT_ICON[type] ?? CircleDot;
}

function isHearing(eventType: string | null): boolean {
  return !!eventType && /hearing|court/i.test(eventType);
}

const RSVP_OPTIONS: { value: PortalRsvpResponse; label: string }[] = [
  { value: 'accepted', label: 'Accepted' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'declined', label: 'Declined' },
];

/** A small badge used on tab triggers to show item counts. */
function CountPill({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
      {count}
    </span>
  );
}

function SectionEmpty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function CalendarItem({
  event,
  onRsvp,
  rsvpPending,
}: {
  event: PortalCalendarEvent;
  onRsvp: (eventId: string, response: PortalRsvpResponse) => void;
  rsvpPending: boolean;
}) {
  const hearing = isHearing(event.event_type);
  const Icon = hearing ? Gavel : CalendarDays;
  return (
    <li
      className={`flex gap-3 rounded-lg border p-3 ${
        hearing ? 'border-primary/30 bg-primary/5' : 'border-border'
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          hearing ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{event.title || 'Event'}</p>
          {hearing && (
            <Badge variant="default" className="h-5 text-[10px]">
              Hearing
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {format(new Date(event.start_date), 'PPP')}
          {event.end_date && event.end_date !== event.start_date
            ? ` – ${format(new Date(event.end_date), 'PPP')}`
            : ''}
        </p>
        {event.location && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {event.location}
          </p>
        )}
        {event.description && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {event.description}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5">
            {RSVP_OPTIONS.map((opt) => {
              const active = event.rsvp === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={rsvpPending}
                  aria-pressed={active}
                  onClick={() => onRsvp(event.id, opt.value)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => downloadIcs(event)}
          >
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
            Add to calendar
          </Button>
        </div>
      </div>
    </li>
  );
}

function TimelineItem({ event }: { event: PortalTimelineEvent }) {
  const Icon = eventIcon(event.eventType);
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-1 w-px flex-1 bg-border last:hidden" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pt-1">
        {event.title && <p className="text-sm font-medium text-foreground">{event.title}</p>}
        {event.body && (
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{event.body}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(event.occurredAt), { addSuffix: true })}
        </p>
      </div>
    </li>
  );
}

export default function PortalMatterDetail() {
  const { caseId = '' } = useParams<{ caseId: string }>();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [invite, setInvite] = useState({ email: '', fullName: '' });

  const matterQ = useQuery({
    queryKey: ['portal', 'matter', caseId],
    queryFn: () => portalGetMatter(caseId),
    enabled: !!caseId,
  });

  const timelineQ = useQuery({
    queryKey: ['portal', 'matter', caseId, 'timeline'],
    queryFn: () => portalGetTimeline(caseId),
    enabled: !!caseId,
  });

  const documentsQ = useQuery({
    queryKey: ['portal', 'matter', caseId, 'documents'],
    queryFn: () => portalGetDocuments(caseId),
    enabled: !!caseId,
  });

  const messagesQ = useQuery({
    queryKey: ['portal', 'matter', caseId, 'messages'],
    queryFn: () => portalGetMessages(caseId),
    enabled: !!caseId,
  });

  const teamQ = useQuery({
    queryKey: ['portal', 'matter', caseId, 'team'],
    queryFn: () => portalGetMatterTeam(caseId),
    enabled: !!caseId,
  });

  const calendarQ = useQuery({
    queryKey: ['portal', 'matter', caseId, 'calendar'],
    queryFn: () => portalGetMatterCalendar(caseId),
    enabled: !!caseId,
  });

  const rsvpEvent = useMutation({
    mutationFn: ({ eventId, response }: { eventId: string; response: PortalRsvpResponse }) =>
      portalRsvpEvent(caseId, eventId, response),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'matter', caseId, 'calendar'] });
      queryClient.invalidateQueries({ queryKey: ['portal', 'calendar'] });
      const label = RSVP_OPTIONS.find((o) => o.value === variables.response)?.label ?? 'Updated';
      toast.success(`RSVP saved: ${label}`);
    },
    onError: (err) => {
      toast.error('Could not save RSVP', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    },
  });

  const handleRsvp = (eventId: string, response: PortalRsvpResponse) => {
    rsvpEvent.mutate({ eventId, response });
  };

  const inviteTeam = useMutation({
    mutationFn: (args: { email: string; fullName?: string }) => portalInviteTeam(caseId, args),
    onSuccess: () => {
      setInvite({ email: '', fullName: '' });
      queryClient.invalidateQueries({ queryKey: ['portal', 'matter', caseId, 'team'] });
      toast.success('Teammate invited', {
        description: 'They will receive an email to access this matter.',
      });
    },
    onError: (err) => {
      toast.error('Could not invite teammate', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    },
  });

  const removeTeam = useMutation({
    mutationFn: (clientUserId: string) => portalRemoveTeam(caseId, clientUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'matter', caseId, 'team'] });
      toast.success('Teammate removed');
    },
    onError: (err) => {
      toast.error('Could not remove teammate', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const email = invite.email.trim();
    if (!email) return;
    const fullName = invite.fullName.trim();
    inviteTeam.mutate({ email, fullName: fullName || undefined });
  };

  const postMessage = useMutation({
    mutationFn: (body: string) => portalPostMessage(caseId, body),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['portal', 'matter', caseId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['portal', 'matter', caseId, 'timeline'] });
    },
    onError: (err) => {
      toast.error('Message not sent', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    postMessage.mutate(body);
  };

  if (matterQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (matterQ.isError || !matterQ.data) {
    return (
      <div className="space-y-4">
        <Link
          to="/portal"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to matters
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {matterQ.error instanceof Error
                ? matterQ.error.message
                : 'This matter is not available.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const matter = matterQ.data;
  const docCount = documentsQ.data?.length ?? 0;
  const calCount = calendarQ.data?.length ?? 0;
  const msgCount = messagesQ.data?.length ?? 0;
  const teamCount = teamQ.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <Link
        to="/portal"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to matters
      </Link>

      {/* Header */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span>{matter.firm.name}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{matter.title}</h1>
            <Badge variant="secondary">{prettyStatus(matter.status)}</Badge>
          </div>

          {matter.clientSummary && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {matter.clientSummary}
            </p>
          )}

          {matter.nextHearingDate && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
              <CalendarClock className="h-4 w-4 text-primary" />
              <span className="text-foreground">
                Next hearing:{' '}
                <span className="font-medium">
                  {format(new Date(matter.nextHearingDate), 'PPP')}
                </span>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabbed sections */}
      <Tabs defaultValue="updates" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="updates">
            <Activity className="mr-1.5 h-4 w-4" />
            Updates
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Calendar
            <CountPill count={calCount} />
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="mr-1.5 h-4 w-4" />
            Documents
            <CountPill count={docCount} />
          </TabsTrigger>
          <TabsTrigger value="messages">
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Messages
            <CountPill count={msgCount} />
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="mr-1.5 h-4 w-4" />
            Team
            <CountPill count={teamCount} />
          </TabsTrigger>
        </TabsList>

        {/* Updates */}
        <TabsContent value="updates">
          <Card>
            <CardContent className="p-6">
              {timelineQ.isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : timelineQ.data && timelineQ.data.length > 0 ? (
                <ul className="relative">
                  {timelineQ.data.map((event) => (
                    <TimelineItem key={event.id} event={event} />
                  ))}
                </ul>
              ) : (
                <SectionEmpty>No updates yet.</SectionEmpty>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Calendar */}
        <TabsContent value="calendar">
          <Card>
            <CardContent className="p-6">
              {calendarQ.isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : calendarQ.data && calendarQ.data.length > 0 ? (
                <ul className="space-y-2">
                  {calendarQ.data.map((event) => (
                    <CalendarItem
                      key={event.id}
                      event={event}
                      onRsvp={handleRsvp}
                      rsvpPending={rsvpEvent.isPending}
                    />
                  ))}
                </ul>
              ) : (
                <SectionEmpty>No upcoming dates scheduled.</SectionEmpty>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <Card>
            <CardContent className="p-6">
              {documentsQ.isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : documentsQ.data && documentsQ.data.length > 0 ? (
                <ul className="divide-y divide-border">
                  {documentsQ.data.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm text-foreground">{doc.name}</span>
                      </div>
                      {doc.downloadUrl ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </a>
                        </Button>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Available on request
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <SectionEmpty>No documents shared yet.</SectionEmpty>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Messages */}
        <TabsContent value="messages">
          <Card>
            <CardContent className="space-y-4 p-6">
              {messagesQ.isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : messagesQ.data && messagesQ.data.length > 0 ? (
                <div className="space-y-3">
                  {messagesQ.data.map((msg) => {
                    const fromClient = msg.senderType === 'client';
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${fromClient ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                            fromClient
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-foreground'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.body}</p>
                          <p
                            className={`mt-1 text-[11px] ${
                              fromClient ? 'text-primary-foreground/70' : 'text-muted-foreground'
                            }`}
                          >
                            {fromClient ? 'You' : matter.firm.name} ·{' '}
                            {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <SectionEmpty>
                  No messages yet. Send a message to your legal team below.
                </SectionEmpty>
              )}

              <Separator />

              <form onSubmit={handleSend} className="space-y-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a message to your legal team…"
                  rows={3}
                  disabled={postMessage.isPending}
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={postMessage.isPending || !draft.trim()}>
                    <Send className="mr-2 h-4 w-4" />
                    {postMessage.isPending ? 'Sending…' : 'Send'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team */}
        <TabsContent value="team">
          <Card>
            <CardContent className="space-y-4 p-6">
              {teamQ.isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : teamQ.data && teamQ.data.length > 0 ? (
                <ul className="divide-y divide-border">
                  {teamQ.data.map((member) => (
                    <li
                      key={member.clientUserId}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {member.fullName || member.email}
                          </span>
                          {member.pending && (
                            <Badge variant="secondary" className="h-5 text-[10px]">
                              Pending
                            </Badge>
                          )}
                        </div>
                        {member.fullName && (
                          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        )}
                      </div>
                      {member.invitedByMe && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive'
                          )}
                          aria-label={`Remove ${member.fullName || member.email}`}
                          disabled={removeTeam.isPending}
                          onClick={() => removeTeam.mutate(member.clientUserId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <SectionEmpty>
                  No teammates yet. Invite a colleague to follow this matter.
                </SectionEmpty>
              )}

              <Separator />

              <form onSubmit={handleInvite} className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  Invite a teammate
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    type="email"
                    placeholder="colleague@example.com"
                    autoComplete="off"
                    value={invite.email}
                    onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                    disabled={inviteTeam.isPending}
                    required
                  />
                  <Input
                    type="text"
                    placeholder="Full name (optional)"
                    autoComplete="off"
                    value={invite.fullName}
                    onChange={(e) => setInvite({ ...invite, fullName: e.target.value })}
                    disabled={inviteTeam.isPending}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={inviteTeam.isPending || !invite.email.trim()}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    {inviteTeam.isPending ? 'Inviting…' : 'Invite teammate'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
