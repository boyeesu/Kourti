import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  CheckCheck,
  FileText,
  Gavel,
  MessageSquare,
  Receipt,
  Megaphone,
  RefreshCw,
  FolderPlus,
  CircleDot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  portalGetNotifications,
  portalGetUnreadCount,
  portalMarkAllNotificationsRead,
  portalMarkNotificationRead,
  portalGetMe,
  portalUpdateMe,
  type PortalNotification,
} from './portalApi';

/** Parse a date-ish value, returning null for missing/invalid input. */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const TYPE_ICON: Record<string, typeof CircleDot> = {
  case_created: FolderPlus,
  status_changed: RefreshCw,
  hearing_scheduled: Gavel,
  document_shared: FileText,
  document_added: FileText,
  client_message: MessageSquare,
  invoice_sent: Receipt,
  invoice_paid: Receipt,
  update_sent: Megaphone,
};

function typeIcon(type: string) {
  return TYPE_ICON[type] ?? CircleDot;
}

export function PortalNotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Poll the unread count in the background so the badge stays live.
  const unreadQ = useQuery({
    queryKey: ['portal', 'notifications', 'unread-count'],
    queryFn: portalGetUnreadCount,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Full list is only fetched while the popover is open.
  const listQ = useQuery({
    queryKey: ['portal', 'notifications'],
    queryFn: portalGetNotifications,
    enabled: open,
    staleTime: 30 * 1000,
  });

  const meQ = useQuery({
    queryKey: ['portal', 'me'],
    queryFn: portalGetMe,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    queryClient.invalidateQueries({ queryKey: ['portal', 'notifications', 'unread-count'] });
  };

  const markAll = useMutation({
    mutationFn: portalMarkAllNotificationsRead,
    onSuccess: invalidate,
  });

  const markOne = useMutation({
    mutationFn: portalMarkNotificationRead,
    onSuccess: invalidate,
  });

  const toggleEmail = useMutation({
    mutationFn: (enabled: boolean) => portalUpdateMe({ emailNotificationsEnabled: enabled }),
    onSuccess: (data) => {
      queryClient.setQueryData(['portal', 'me'], data);
    },
  });

  const unread = unreadQ.data?.count ?? 0;

  const handleOpen = (n: PortalNotification) => {
    if (!n.readAt) markOne.mutate(n.id);
    setOpen(false);
    if (n.caseId) navigate(`/portal/matters/${n.caseId}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[360px]">
          {listQ.isLoading ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : listQ.data && listQ.data.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {listQ.data.map((n) => {
                const Icon = typeIcon(n.type);
                const when = toDate(n.createdAt);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleOpen(n)}
                      className={cn(
                        'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                        !n.readAt && 'bg-primary/5'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          n.readAt ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-foreground">
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {n.matterTitle && <span className="truncate">{n.matterTitle}</span>}
                          {n.matterTitle && when && <span aria-hidden>·</span>}
                          {when && <span>{formatDistanceToNow(when, { addSuffix: true })}</span>}
                        </p>
                      </div>
                      {!n.readAt && (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                          aria-hidden
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">You're all caught up</p>
              <p className="text-xs text-muted-foreground">
                Updates on your matters will show up here.
              </p>
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
          <span className="text-xs text-muted-foreground">Email me updates</span>
          <Switch
            checked={meQ.data?.emailNotificationsEnabled ?? true}
            disabled={meQ.isLoading || toggleEmail.isPending}
            onCheckedChange={(v) => toggleEmail.mutate(v)}
            aria-label="Email me updates"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
