// src/components/layout/NotificationsDropdown.tsx
import React from "react";
import { useNotifications, useMarkAllNotificationsAsRead, useUpdateNotification, useDeleteNotification } from "@/hooks/useNotifications";
import { Button } from '@/components/ui/button';

const NotificationsDropdown: React.FC = () => {
  const { data: notifications, isLoading } = useNotifications();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const updateNotification = useUpdateNotification();
  const deleteNotification = useDeleteNotification();

  if (isLoading) return <div className="p-4">Loading notifications...</div>;

  if (!notifications || notifications.length === 0) {
    return <div className="p-4">No notifications</div>;
  }

  return (
    <div className="w-80 max-h-96 overflow-auto bg-white rounded-md shadow-lg border p-2">
      <div className="flex justify-between items-center pb-2">
        <span className="text-base font-semibold">Notifications</span>
        <Button size="sm" variant="ghost" onClick={() => markAllAsRead.mutate()}>Mark All as Read</Button>
      </div>
      <ul>
        {notifications.map((n: any) => (
          <li key={n.id} className={`flex items-start justify-between px-2 py-2 border-b last:border-b-0 bg-${n.status === 'unread' ? 'gray-100' : 'white'}`}> 
            <div className="flex-1">
              <div className="font-medium">{n.title}</div>
              {n.description && <div className="text-xs text-gray-600">{n.description}</div>}
              <div className="text-[10px] text-gray-400">{new Date(n.created_at).toLocaleString()}</div>
            </div>
            <div className="flex flex-col space-y-1 ml-2">
              {n.status === 'unread' && (
                <Button size="xs" variant="link" onClick={() => updateNotification.mutate({ id: n.id, status: 'read' })}>Read</Button>
              )}
              <Button size="xs" variant="link" onClick={() => deleteNotification.mutate(n.id)}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default NotificationsDropdown;
