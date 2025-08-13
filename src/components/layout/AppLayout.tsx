// src/components/layout/AppLayout.tsx
import React, { ReactNode, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useSearch } from '@/hooks/use-search';
import { useAuth } from '@/hooks/useAuth';
import { useInsights } from '@/hooks/useInsights';
import { useNotifications } from '@/components/ui/notifications';
import { User, Bell, Settings, Plus, Search as SearchIcon } from 'lucide-react';

// List notifications in a popover
function NotificationList() {
  const { notifications, markAsRead, clearAll } = useNotifications();

  if (!notifications.length) {
    return <div className="p-4 text-center text-muted-foreground">No notifications.</div>;
  }

  return (
    <div className="p-4 space-y-2">
      {notifications.map((n) => (
        <div key={n.id} className={`flex justify-between items-start p-2 rounded ${n.read ? 'opacity-60' : ''}`}>
          <div>
            <div className="font-semibold">{n.title}</div>
            <div className="text-sm text-muted-foreground">{n.description}</div>
            <div className="text-xs text-muted-foreground">{n.date}</div>
          </div>
          {!n.read && (
            <Button size="icon" variant="ghost" onClick={() => markAsRead(n.id)}>
              Mark read
            </Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={clearAll}>
        Clear All
      </Button>
    </div>
  );
}

// Trigger initial reminders from insights
function DeadlineReminders() {
  const { upcomingCases, upcomingContracts } = useInsights(7);
  const { addNotification } = useNotifications();

  useEffect(() => {
    upcomingCases.forEach((c: any) =>
      addNotification({
        type: 'event',
        title: 'Upcoming hearing',
        description: `${c.title} on ${new Date(c.next_hearing_date!).toLocaleDateString()}`,
      })
    );
    upcomingContracts.forEach((c: any) =>
      addNotification({
        type: 'event',
        title: 'Contract expiring soon',
        description: `${c.title} on ${new Date(c._insight_date).toLocaleDateString()}`,
      })
    );
  }, [upcomingCases, upcomingContracts, addNotification]);

  return null;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { term, setTerm } = useSearch();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { notifications } = useNotifications();
  const unreadCount = notifications.filter((n) => !n.read).length;
  const [notifOpen, setNotifOpen] = React.useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <aside className="w-64 bg-sidebar">
          <AppSidebar />
        </aside>
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex h-16 items-center justify-between px-4 md:px-6 bg-card/50 border-b shadow-sm">
            {/* Sidebar toggle */}
            <SidebarTrigger className="md:mr-2" />

            {/* Search bar */}
            <div className="hidden md:flex flex-1 justify-center">
              <div className="relative w-full max-w-md">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cases, documents, contracts..."
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigate('/cases/create')}>
                <Plus className="h-5 w-5" />
              </Button>

              <Popover open={notifOpen} onOpenChange={setNotifOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-3 w-3 bg-destructive rounded-full text-[10px] text-destructive-foreground flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-80 bg-popover border border-border shadow-lg rounded">
                  <NotificationList />
                </PopoverContent>
              </Popover>

              <DeadlineReminders />

              <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} aria-label="Settings">
                <Settings className="h-5 w-5" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover border border-border shadow-lg">
                  <DropdownMenuItem asChild>
                    <Link to="/profile">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 overflow-auto bg-background">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}