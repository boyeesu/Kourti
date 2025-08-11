import { useState, createContext, useContext, ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Bell, CheckCircle, AlertCircle, UserPlus, RefreshCw } from 'lucide-react';

export type NotificationType = 'approval' | 'event' | 'case-assigned' | 'update';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  date: string;
  read?: boolean;
}

interface NotificationContextValue {
  notifications: Notification[];
  addNotification: (notif: Omit<Notification, 'id' | 'date' | 'read'>) => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (notif: Omit<Notification, 'id' | 'date' | 'read'>) => {
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}-${Math.random()}`,
        date: new Date().toLocaleString(),
        read: false,
        ...notif,
      },
      ...prev,
    ]);
  };
  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };
  const clearAll = () => setNotifications([]);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, markAsRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function NotificationModal({ open, onOpenChange }: { open: boolean, onOpenChange: (val: boolean) => void }) {
  const { notifications, markAsRead, clearAll } = useNotifications();

  const iconForType = (type: NotificationType) => {
    switch (type) {
      case 'approval': return <CheckCircle className="h-5 w-5 text-success" />;
      case 'event': return <Bell className="h-5 w-5 text-primary" />;
      case 'case-assigned': return <UserPlus className="h-5 w-5 text-info" />;
      case 'update': return <RefreshCw className="h-5 w-5 text-secondary" />;
      default: return <AlertCircle className="h-5 w-5 text-warning" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl h-[400px] overflow-auto">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>Your in-app alerts are shown here.</DialogDescription>
        </DialogHeader>
        {notifications.length === 0 && (
          <div className="text-center text-muted-foreground py-8">No notifications.</div>
        )}
        <div className="space-y-4">
          {notifications.map((notif) => (
            <div key={notif.id} className={`flex gap-3 items-start border rounded p-3 ${notif.read ? 'opacity-60' : ''}`}>
              <div className="pt-1">{iconForType(notif.type)}</div>
              <div className="flex-1">
                <div className="font-semibold mb-1">{notif.title}</div>
                <div className="text-sm text-muted-foreground mb-1">{notif.description}</div>
                <div className="text-xs text-muted-foreground">{notif.date}</div>
              </div>
              {!notif.read && (
                <button
                  className="text-xs bg-muted px-2 py-1 rounded"
                  onClick={() => markAsRead(notif.id)}
                >
                  Mark as read
                </button>
              )}
            </div>
          ))}
        </div>
        {notifications.length > 0 && (
          <div className="flex justify-end pt-2">
            <button
              className="text-xs px-2 py-1 bg-destructive rounded text-destructive-foreground"
              onClick={clearAll}
            >
              Clear All
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
