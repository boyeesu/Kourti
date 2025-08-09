import React, { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Link } from "react-router-dom";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Button } from "@/components/ui/button";
import { User, Bell, Settings, Search, Plus } from "lucide-react";
import { NotificationModal, useNotifications } from "@/components/ui/notifications";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/hooks/use-search";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function AppLayout({ children }: { children: ReactNode }) {
  const { term, setTerm } = useSearch();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { notifications } = useNotifications();
  const unreadCount = notifications.filter(n => !n.read).length;
  const [notifOpen, setNotifOpen] = React.useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/auth');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <SidebarProvider>
      {/* Overall flex container */}
      <div className="flex h-screen w-screen overflow-hidden">
        {/* Sidebar: Fixed width and full height */}
        <aside className="w-64 flex-shrink-0 h-full bg-gray-800">
          <AppSidebar />
        </aside>

        {/* Right side: Topbar & Main content */}
        <div className="flex flex-col flex-1 min-w-0 h-full">
          {/* Top Bar */}
          <header className="h-16 flex items-center justify-between border-b bg-card/50 backdrop-blur-sm shadow-sm px-4 md:px-6 flex-shrink-0">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="md:mr-2" />
            </div>
            <div className="hidden md:flex flex-1 max-w-md mx-8">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cases, documents, contracts..."
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="pl-10 bg-background/50 border-border/50"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="hidden md:flex">
                <Plus className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => setNotifOpen(true)}
                aria-label="Show notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 bg-destructive rounded-full text-[10px] flex items-center justify-center text-destructive-foreground">
                    {unreadCount}
                  </span>
                )}
              </Button>
              <NotificationModal open={notifOpen} onOpenChange={setNotifOpen} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover border border-border shadow-lg">
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link to="/profile">
                      <User className="h-4 w-4 mr-2" /> Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link to="/settings">
                      <Settings className="h-4 w-4 mr-2" /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="cursor-pointer text-destructive"
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}