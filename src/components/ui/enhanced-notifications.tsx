import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  FileText,
  Briefcase,
  Info,
  CheckCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  title: string;
  description?: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'case' | 'client' | 'contract' | 'calendar' | 'document';
  status: 'read' | 'unread';
  created_at: string;
  date: string;
}

interface EnhancedNotificationsProps {
  notifications: Notification[];
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
  onNotificationClick?: (notification: Notification) => void;
}

export function EnhancedNotifications({
  notifications,
  onMarkAsRead: _onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAll,
  onNotificationClick,
}: EnhancedNotificationsProps) {
  const [activeTab, setActiveTab] = useState("all");

  // Filter notifications by tab
  const filteredNotifications = useMemo(() => {
    const all = notifications;
    const unread = all.filter((n) => n.status === "unread");
    const read = all.filter((n) => n.status === "read");
    const cases = all.filter((n) => n.type === "case");
    const documents = all.filter((n) => n.type === "document");
    const events = all.filter((n) => n.type === "calendar");

    switch (activeTab) {
      case "unread":
        return unread;
      case "read":
        return read;
      case "cases":
        return cases;
      case "documents":
        return documents;
      case "events":
        return events;
      default:
        return all;
    }
  }, [notifications, activeTab]);

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "case":
        return <Briefcase className="h-4 w-4" />;
      case "document":
        return <FileText className="h-4 w-4" />;
      case "calendar":
        return <Calendar className="h-4 w-4" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4" />;
      case "error":
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getNotificationColor = (type: Notification["type"]) => {
    switch (type) {
      case "success":
        return "text-success bg-success/10";
      case "warning":
        return "text-warning bg-warning/10";
      case "error":
        return "text-destructive bg-destructive/10";
      case "case":
        return "text-primary bg-primary/10";
      case "document":
        return "text-blue-600 bg-blue-100";
      case "calendar":
        return "text-purple-600 bg-purple-100";
      default:
        return "text-muted-foreground bg-muted";
    }
  };

  const unreadCount = notifications.filter((n) => n.status === "unread").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Notifications</h2>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-2">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onMarkAllAsRead && unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkAllAsRead}
              className="text-xs"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
          {onClearAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="text-xs text-destructive"
            >
              Clear all
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2 h-4 px-1 text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="read">Read</TabsTrigger>
          <TabsTrigger value="cases">Cases</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No notifications found
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredNotifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={cn(
                    "transition-all hover:shadow-md cursor-pointer",
                    notification.status === "unread" && "border-primary/50 bg-primary/5"
                  )}
                  onClick={() => onNotificationClick?.(notification)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "rounded-full p-2 flex-shrink-0",
                          getNotificationColor(notification.type)
                        )}
                      >
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm">
                              {notification.title}
                            </h4>
                            {notification.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {notification.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              {formatDistanceToNow(new Date(notification.date), {
                                addSuffix: true,
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {notification.status === "unread" && (
                              <div className="h-2 w-2 rounded-full bg-primary" />
                            )}
                            {onDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete(notification.id);
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

