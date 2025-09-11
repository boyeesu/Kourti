import React, { createContext, useContext, ReactNode } from 'react';

interface NotificationsContextType {
  // Add any notification context properties here if needed
}

const NotificationsContext = createContext<NotificationsContextType>({});

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
};

interface NotificationsProviderProps {
  children: ReactNode;
}

export const NotificationsProvider: React.FC<NotificationsProviderProps> = ({ children }) => {
  const value: NotificationsContextType = {};

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

export interface Notification {
  id: string;
  title: string;
  description?: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'case' | 'client' | 'contract' | 'calendar' | 'document';
  status: 'read' | 'unread';
  read: boolean;
  created_at: string;
  date: string;
}