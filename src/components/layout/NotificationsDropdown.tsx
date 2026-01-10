// src/components/layout/NotificationsDropdown.tsx
import React from "react";
import { useNotifications, useMarkAllNotificationsAsRead, useUpdateNotification, useDeleteNotification } from "@/hooks/useNotifications";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Check, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const NotificationsDropdown: React.FC = () => {
  const { data: notifications, isLoading } = useNotifications();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const updateNotification = useUpdateNotification();
  const deleteNotification = useDeleteNotification();

  const unreadCount = notifications?.filter(n => n.status === 'unread').length || 0;

  const triggerClasses = "relative h-10 w-10 rounded-lg border border-[hsl(var(--surface-border))] bg-[hsl(var(--surface))] text-muted-foreground transition-colors hover:border-[hsl(var(--primary))] hover:text-foreground";

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" className={triggerClasses} disabled>
        <Bell className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Button size="sm" variant="ghost" onClick={() => markAllAsRead.mutate()}>
              Mark All as Read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {!notifications || notifications.length === 0 ? (
          <div className="p-6 text-center">
            <Bell className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground font-medium">No notifications</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              You're all caught up!
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((n) => (
              <div 
                key={n.id} 
                className={`p-3 border-b last:border-b-0 ${
                  n.status === 'unread' ? 'bg-muted/30' : 'bg-background'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm ${n.status === 'unread' ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {n.title}
                    </div>
                    {n.description && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {n.description}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground/70 mt-2">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {n.status === 'unread' && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 w-7 p-0"
                        onClick={() => updateNotification.mutate({ id: n.id, status: 'read' })}
                        title="Mark as read"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => deleteNotification.mutate(n.id)}
                      title="Delete notification"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationsDropdown;
