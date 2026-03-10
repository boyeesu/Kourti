// src/components/layout/NotificationsDropdown.tsx
import React, { useState, useMemo } from 'react';
import {
  useNotifications,
  useMarkAllNotificationsAsRead,
  useUpdateNotification,
  useDeleteNotification,
} from '@/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Check, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { formatDistanceToNow } from 'date-fns';

type FilterTab = 'all' | 'unread';

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  return 'Earlier';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Earlier'];

const NotificationsDropdown: React.FC = () => {
  const { data: notifications, isLoading } = useNotifications();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const updateNotification = useUpdateNotification();
  const deleteNotification = useDeleteNotification();
  const [filter, setFilter] = useState<FilterTab>('all');

  const unreadCount = notifications?.filter((n) => n.status === 'unread').length || 0;

  const filteredNotifications = useMemo(() => {
    if (!notifications) return [];
    if (filter === 'unread') return notifications.filter((n) => n.status === 'unread');
    return notifications;
  }, [notifications, filter]);

  const groupedNotifications = useMemo(() => {
    const groups: Record<string, typeof filteredNotifications> = {};
    for (const n of filteredNotifications) {
      const group = getDateGroup(n.created_at || '');
      if (!groups[group]) groups[group] = [];
      groups[group].push(n);
    }
    return groups;
  }, [filteredNotifications]);

  const triggerClasses =
    'relative h-10 w-10 rounded-lg border border-[hsl(var(--surface-border))] bg-[hsl(var(--surface))] text-muted-foreground transition-colors hover:border-[hsl(var(--primary))] hover:text-foreground';

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" className={triggerClasses} disabled>
        <Bell className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className={triggerClasses}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 space-y-4">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <SheetTitle>Notifications</SheetTitle>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="rounded-full text-xs">
                  {unreadCount}
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={() => markAllAsRead.mutate()}
              >
                Mark All Read
              </Button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={filter === 'all' ? 'default' : 'ghost'}
              className="h-7 text-xs rounded-full px-3"
              onClick={() => setFilter('all')}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={filter === 'unread' ? 'default' : 'ghost'}
              className="h-7 text-xs rounded-full px-3"
              onClick={() => setFilter('unread')}
            >
              Unread
            </Button>
          </div>
        </SheetHeader>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20">
              <Bell className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No notifications</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {filter === 'unread' ? 'No unread notifications' : "You're all caught up!"}
              </p>
            </div>
          ) : (
            GROUP_ORDER.map((group) => {
              const items = groupedNotifications[group];
              if (!items?.length) return null;
              return (
                <div key={group}>
                  {/* Sticky group header */}
                  <div className="sticky top-0 z-10 bg-[hsl(var(--surface-muted))] px-6 py-2 border-b border-border/40">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {group}
                    </span>
                  </div>

                  {/* Notification items */}
                  {items.map((n) => (
                    <div
                      key={n.id}
                      className={`relative flex items-start gap-3 px-6 py-3 border-b border-border/30 transition-colors ${
                        n.status === 'unread' ? 'bg-primary/[0.03]' : 'bg-transparent'
                      }`}
                    >
                      {/* Unread indicator dot */}
                      {n.status === 'unread' && (
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" />
                      )}

                      {/* Icon */}
                      <div className="flex-shrink-0 mt-0.5 h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm leading-snug ${
                            n.status === 'unread'
                              ? 'font-semibold text-foreground'
                              : 'font-normal text-muted-foreground'
                          }`}
                        >
                          {n.title}
                        </p>
                        {n.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {n.description}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/60 mt-1">
                          {n.created_at
                            ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true })
                            : 'Unknown date'}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {n.status === 'unread' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => updateNotification.mutate({ id: n.id, status: 'read' })}
                            title="Mark as read"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => deleteNotification.mutate(n.id)}
                          title="Delete notification"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationsDropdown;
