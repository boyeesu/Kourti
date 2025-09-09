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
  HelpCircle
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';

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
function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  const handleNavigation = (href: string) => {
    navigate(href);
    setOpen(false);
  };
  
  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };
  
  const navigationItems = [
    { label: 'Dashboard', icon: <Home className="h-5 w-5" />, href: '/' },
    { label: 'Cases', icon: <Briefcase className="h-5 w-5" />, href: '/cases' },
    { label: 'Clients', icon: <UserCheck className="h-5 w-5" />, href: '/clients' },
    { label: 'Calendar', icon: <Calendar className="h-5 w-5" />, href: '/calendar' },
    { label: 'Documents', icon: <FileText className="h-5 w-5" />, href: '/documents' },
  ];
  
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
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
          
          <div className="px-2 py-4 flex-1">
            <nav className="space-y-1">
              {navigationItems.map((item) => (
                <Button
                  key={item.href}
                  variant={isActive(item.href) ? "default" : "ghost"}
                  className="w-full justify-start h-12"
                  onClick={() => handleNavigation(item.href)}
                >
                  {item.icon}
                  <span className="ml-3">{item.label}</span>
                </Button>
              ))}
            </nav>
          </div>
          
          <div className="p-4 border-t mt-auto">
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => handleNavigation('/settings')}
            >
              <Settings className="h-5 w-5 mr-3" />
              Settings
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
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

          <main className="flex-1 overflow-auto bg-background">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}