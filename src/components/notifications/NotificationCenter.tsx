import { useState } from 'react';
import { useNotificationsDb, archiveNotification, unarchiveNotification } from '@/hooks/useNotificationsDb';
import { useUpdateNotification, useDeleteNotification, useMarkAllNotificationsAsRead } from '@/hooks/useNotifications';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, Check, Trash2, Archive, ArchiveRestore, Search, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function NotificationCenter() {
  const { data: organizationId } = useUserOrganization();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const { data: notifications = [], isLoading } = useNotificationsDb(
    organizationId || '',
    {
      status: statusFilter === 'all' ? undefined : statusFilter,
      type: typeFilter === 'all' ? undefined : typeFilter,
      archived: showArchived ? true : false,
      search: searchTerm || undefined,
    }
  );

  const updateNotification = useUpdateNotification();
  const deleteNotification = useDeleteNotification();
  const markAllAsRead = useMarkAllNotificationsAsRead();

  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  const handleArchive = async (id: string) => {
    try {
      await archiveNotification(id);
      toast({
        title: 'Success',
        description: 'Notification archived',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to archive notification',
      });
    }
  };

  const handleUnarchive = async (id: string) => {
    try {
      await unarchiveNotification(id);
      toast({
        title: 'Success',
        description: 'Notification unarchived',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to unarchive notification',
      });
    }
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      case: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      client: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      document: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      contract: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      calendar: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
      info: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
      warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return colors[type] || colors.info;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading notifications...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
            </CardDescription>
          </div>
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAllAsRead.mutate()}
            >
              Mark all as read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="space-y-4 mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search notifications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
              {searchTerm && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  onClick={() => setSearchTerm('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={(v: 'all' | 'unread' | 'read') => setStatusFilter(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="case">Cases</SelectItem>
                <SelectItem value="client">Clients</SelectItem>
                <SelectItem value="document">Documents</SelectItem>
                <SelectItem value="contract">Contracts</SelectItem>
                <SelectItem value="calendar">Calendar</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={showArchived ? 'default' : 'outline'}
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? (
                <>
                  <ArchiveRestore className="h-4 w-4 mr-2" />
                  Show Active
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 mr-2" />
                  Show Archived
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Notifications List */}
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm font-medium text-muted-foreground">
              {showArchived ? 'No archived notifications' : 'No notifications'}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {showArchived ? 'You haven\'t archived any notifications yet' : 'You\'re all caught up!'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  'p-4 rounded-lg border transition-colors',
                  notification.status === 'unread'
                    ? 'bg-muted/50 border-primary/20'
                    : 'bg-background border-border'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={cn(
                        'font-medium text-sm',
                        notification.status === 'unread' ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {notification.title}
                      </h4>
                      <Badge className={cn('text-xs', getTypeColor(notification.type))}>
                        {notification.type}
                      </Badge>
                      {notification.status === 'unread' && (
                        <Badge variant="default" className="text-xs">
                          New
                        </Badge>
                      )}
                    </div>
                    {notification.description && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {notification.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {notification.status === 'unread' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => updateNotification.mutate({ id: notification.id, status: 'read' })}
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    {showArchived ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => handleUnarchive(notification.id)}
                        title="Unarchive"
                      >
                        <ArchiveRestore className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => handleArchive(notification.id)}
                        title="Archive"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => deleteNotification.mutate(notification.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

