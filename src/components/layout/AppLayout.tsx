// src/components/layout/AppLayout.tsx
import { ReactNode, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useSearch } from '@/hooks/use-search';
import { useAuth } from '@/hooks/useAuth';
import { useInsights } from '@/hooks/useInsights';
import { NotificationIcon } from '@/components/ui/notifications';
import { 
  User,
  Settings,
  Plus,
  Search as SearchIcon,
  FileText,
  Briefcase,
  Calendar,
  UserCheck,
  Home,
  X,
  Menu,
  HelpCircle,
  LayoutDashboard,
  Users,
  FileCheck,
  Receipt,
  Bot,
  Gauge,
  Mic
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';

// Navigation item type
export type NavItem = {
  title: string;
  url: string;
  icon: any;
  end: boolean;
  badge?: string;
  badgeVariant?: "default" | "outline" | "destructive" | "secondary";
};

// Types - can be removed as we're using the database-backed notifications now

// Legacy notification components - can be removed as we're using database-backed notifications

// Command palette for quick navigation
function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  
  // Register keyboard shortcut (Cmd+K or Ctrl+K)
  useKeyboardShortcut(['Meta+k', 'Control+k'], () => {
    setOpen(true);
  });
  
  // Navigation options
  const navigationOptions = [
    { label: 'Dashboard', icon: <Home className="h-4 w-4 mr-2" />, href: '/' },
    { label: 'Cases', icon: <Briefcase className="h-4 w-4 mr-2" />, href: '/cases' },
    { label: 'Clients', icon: <UserCheck className="h-4 w-4 mr-2" />, href: '/clients' },
    { label: 'Calendar', icon: <Calendar className="h-4 w-4 mr-2" />, href: '/calendar' },
    { label: 'Documents', icon: <FileText className="h-4 w-4 mr-2" />, href: '/documents' },
    { label: 'Settings', icon: <Settings className="h-4 w-4 mr-2" />, href: '/settings' },
  ];
  
  const actionOptions = [
    { label: 'New Case', icon: <Briefcase className="h-4 w-4 mr-2" />, href: '/cases/create' },
    { label: 'New Client', icon: <UserCheck className="h-4 w-4 mr-2" />, href: '/clients/create' },
    { label: 'Upload Document', icon: <FileText className="h-4 w-4 mr-2" />, href: '/documents/upload' },
  ];

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {navigationOptions.map((option) => (
              <CommandItem
                key={option.href}
                onSelect={() => {
                  navigate(option.href);
                  setOpen(false);
                }}
              >
                {option.icon}
                <span>{option.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Actions">
            {actionOptions.map((option) => (
              <CommandItem
                key={option.href}
                onSelect={() => {
                  navigate(option.href);
                  setOpen(false);
                }}
              >
                {option.icon}
                <span>{option.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

// Trigger initial reminders from insights
function DeadlineReminders() {
  useInsights(7);

  // You can add notification creation logic here if needed
  // For example, create database notifications for deadlines
  
  return null;
}

// Mobile navigation for small screens
import { useUserRole } from '@/hooks/useUserManagement';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const [showInvoiceSoon, setShowInvoiceSoon] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: userRoleData } = useUserRole();
  const role = userRoleData && 'role' in userRoleData ? userRoleData.role : null;
  const isAdmin = role === "superadmin" || role === "admin";

  // Sidebar navigation groups and filtering (from AppSidebar)
  const primaryNavigation = {
    label: "Main",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
      { title: "Cases", url: "/cases", icon: Briefcase, end: false },
      { title: "Clients", url: "/clients", icon: UserCheck, end: false },
      { title: "Calendar", url: "/calendar", icon: Calendar, end: false }
    ]
  };
  const documentsNavigation = {
    label: "Legal Documents",
    items: [
      { title: "Documents", url: "/documents", icon: FileText, end: false },
      { title: "Contracts", url: "/contracts", icon: FileCheck, end: false }
    ]
  };
  const toolsNavigation = {
    label: "Tools",
    items: [
      { title: "Ream AI", url: "/ream-ai", icon: Bot, end: false, badge: "New", badgeVariant: "default" as const },
      { title: "Voice Recorder", url: "/voice-recorder", icon: Mic, end: false, badge: "New", badgeVariant: "default" as const },
      { title: "Transcriptions", url: "/transcriptions", icon: FileText, end: false },
      { title: "Invoicing", url: "/invoices", icon: Receipt, end: false, badge: "Soon", badgeVariant: "outline" as const }
    ]
  };
  const managementNavigation = {
    label: "Management",
    items: [
      { title: "Users", url: "/users", icon: Users, end: false },
      { title: "Analytics", url: "/analytics", icon: Gauge, end: false },
      { title: "Settings", url: "/settings", icon: Settings, end: false }
    ]
  };
  // Filter logic
  const getFilteredNavigation = () => {
    const navigation: { label: string; items: NavItem[] }[] = [primaryNavigation, documentsNavigation];
    const filteredTools = {
      ...toolsNavigation,
      items: toolsNavigation.items.filter(item => {
        if (item.url === "/invoices" && !isAdmin) {
          return false;
        }
        return true;
      })
    };
    if (filteredTools.items.length > 0) navigation.push(filteredTools);
    if (isAdmin) {
      navigation.push(managementNavigation);
    } else {
      navigation.push({ label: "Management", items: [managementNavigation.items.find(i => i.url === "/settings")!] });
    }
    return navigation;
  };

  const navigationGroups = getFilteredNavigation();
  const isActive = (path: string, end?: boolean) => {
    if (end) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <Dialog open={showInvoiceSoon} onOpenChange={setShowInvoiceSoon}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Coming Soon</DialogTitle>
            <DialogDescription>
              The invoicing & billing module will be available in an upcoming release!
            </DialogDescription>
          </DialogHeader>
          <Button className="mt-2 w-full" onClick={() => setShowInvoiceSoon(false)} autoFocus>Close</Button>
        </DialogContent>
      </Dialog>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
<Button
  variant="ghost"
  size="icon"
  className="md:hidden"
  aria-label="Open main navigation menu"
  title="Open main navigation menu"
>
  <Menu className="h-5 w-5" />
</Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Kouti Legal</h2>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="px-2 py-4 flex-1 overflow-y-auto">
              {navigationGroups.map(group => (
                <div key={group.label} className="mb-3">
                  <div className="text-xs text-muted-foreground font-semibold px-2 mb-1">
                    {group.label}
                  </div>
                  <nav className="space-y-1">
                    {group.items.map(item => {
                      if (!item) return null;
                      const isInvoice = item.url === "/invoices";
                      return (
                        <Button
                          key={item.url}
                          variant={isActive(item.url, item.end) ? "default" : "ghost"}
                          className="w-full justify-start h-11 flex items-center text-base"
                          onClick={e => {
                            setOpen(false);
                            if (isInvoice) {
                              e.preventDefault();
                              setShowInvoiceSoon(true);
                              return;
                            } else {
                              navigate(item.url);
                            }
                          }}
                        >
                          <item.icon className="h-5 w-5 mr-2" />
                          <span>{item.title}</span>
                          {item.badge && (
                            <Badge variant={item.badgeVariant} className="ml-auto">
                              {item.badge}
                            </Badge>
                          )}
                        </Button>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>
            <div className="p-4 border-t mt-auto">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setOpen(false);
                  navigate('/settings')
                }}
              >
                <Settings className="h-5 w-5 mr-3" />
                Settings
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { term, setTerm } = useSearch();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const userInitials = user?.email?.slice(0, 2).toUpperCase() || 'U';

  // Command palette
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Handle keyboard shortcut for search
  useKeyboardShortcut(['/', 'Meta+f', 'Control+f'], (e) => {
    e.preventDefault();
    setSearchDialogOpen(true);
  });

  return (
    <SidebarProvider>
      <CommandPalette />
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        {/* Sidebar - hidden on mobile */}
        <aside className="hidden md:block w-64 border-r border-border">
          <AppSidebar />
        </aside>
        
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex h-12 items-center justify-between px-4 md:px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b z-10">
            <div className="flex items-center gap-2">
              {/* Mobile menu */}
              <MobileNavigation />
              
              {/* Sidebar toggle - visible only on desktop */}
              <div className="hidden md:block">
                <SidebarTrigger className="mr-2" />
              </div>
              
              {/* Path/Breadcrumb would go here */}
            </div>

            {/* Search bar */}
            <div 
              className="flex-1 max-w-md mx-4 cursor-pointer"
              onClick={() => setSearchDialogOpen(true)}
            >
              <div className="relative w-full bg-muted rounded-md border border-input h-9 px-3 flex items-center text-muted-foreground text-sm">
                <SearchIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>Search... <span className="hidden sm:inline">or press</span> <kbd className="ml-1 text-xs bg-background px-1 py-0.5 rounded border">⌘K</kbd></span>
              </div>
            </div>

            {/* Command dialog for search */}
            <CommandDialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
              <CommandInput 
                placeholder="Search cases, clients, documents..." 
                value={term}
                onValueChange={setTerm}
              />
              <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                {/* Results would go here */}
              </CommandList>
            </CommandDialog>

            {/* Actions */}
            <div className="flex items-center gap-1 md:gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => navigate('/cases/create')} 
                      className="hidden sm:flex"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Create New Case</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <NotificationIcon />
              
              <DeadlineReminders />

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => window.open('/help', '_blank')} 
                      aria-label="Help"
                      className="hidden sm:flex"
                    >
                      <HelpCircle className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Help Center</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 p-0 ml-1">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.user_metadata?.avatar_url} alt={user?.email || 'User'} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 mt-1">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.user_metadata?.name || user?.email}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <Link to="/settings/profile">
                        <User className="h-4 w-4 mr-2" />
                        <span>Profile</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/settings">
                        <Settings className="h-4 w-4 mr-2" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleSignOut}>
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 overflow-auto bg-background px-1.5 py-2 sm:px-4 sm:py-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}