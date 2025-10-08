// src/components/layout/AppLayout.tsx
import { ReactNode, useMemo, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
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
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { useUserOrganization } from '@/hooks/useUserOrganization';
// import { NotificationIcon } from '@/components/ui/notifications';
import NotificationsDropdown from "./NotificationsDropdown";
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
  Mic,
  ChevronRight
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { cn } from '@/lib/utils';

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
    { label: 'Matters', icon: <Briefcase className="h-4 w-4 mr-2" />, href: '/matters' },
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
      { title: "Matters", url: "/matters", icon: Briefcase, end: false },
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
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[hsl(var(--surface-border))] bg-[hsl(var(--surface))] text-muted-foreground transition-colors hover:border-[hsl(var(--primary))] hover:text-foreground md:hidden"
            aria-label="Open main navigation menu"
            title="Open main navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] border-none bg-[hsl(var(--sidebar-background))] p-0">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Kourti Legal</h2>
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
                          variant="ghost"
                          className={cn(
                            "w-full justify-start gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium",
                            isActive(item.url, item.end)
                              ? "bg-[hsl(var(--primary))/0.12] text-[hsl(var(--primary))]"
                              : "text-muted-foreground hover:bg-[hsl(var(--primary))/0.08] hover:text-foreground"
                          )}
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
                          <item.icon className="h-5 w-5" />
                          <span>{item.title}</span>
                          {item.badge && (
                            <Badge variant={item.badgeVariant} className="ml-auto text-[10px]">
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
  const location = useLocation();
  const userInitials = user?.email?.slice(0, 2).toUpperCase() || 'U';
  const { data: organizationId } = useUserOrganization();

  // Command palette
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  const {
    data: globalSearchResults,
    isFetching: isGlobalSearchLoading,
    error: globalSearchError,
  } = useGlobalSearch({ term, organizationId, enabled: searchDialogOpen });

  const searchResults =
    globalSearchResults ?? {
      cases: [],
      clients: [],
      calendarEvents: [],
      voiceRecordings: [],
      transcriptions: [],
    };

  const hasSearchTerm = term.trim().length >= 2;

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Handle keyboard shortcut for search
  useKeyboardShortcut(['/', 'Meta+f', 'Control+f'], (e) => {
    e.preventDefault();
    setSearchDialogOpen(true);
  });

  type ModuleTone = 'success' | 'info' | 'warning';

  const moduleDescriptors: Record<string, { label: string; status: string; tone: ModuleTone }> = {
    dashboard: { label: 'Dashboard Overview', status: 'Operational', tone: 'success' },
    cases: { label: 'Case Management', status: 'Active Review', tone: 'info' },
    clients: { label: 'Client Services', status: 'Engagement Focus', tone: 'info' },
    calendar: { label: 'Calendar', status: 'Schedule Synced', tone: 'success' },
    documents: { label: 'Document Control', status: 'Secure Vault', tone: 'success' },
    contracts: { label: 'Contracts', status: 'Revision Cycle', tone: 'warning' },
    analytics: { label: 'Analytics', status: 'Insights Live', tone: 'info' },
    users: { label: 'User Management', status: 'Access Governance', tone: 'info' },
    settings: { label: 'Settings', status: 'Configuration', tone: 'info' },
    'ream-ai': { label: 'Ream AI', status: 'Assistant Ready', tone: 'success' },
    default: { label: 'Workspace', status: 'Operational', tone: 'info' }
  };

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const activeModuleKey = pathSegments[0] ?? 'dashboard';
  const moduleMeta = moduleDescriptors[activeModuleKey] ?? moduleDescriptors.default;
  const breadcrumbs = pathSegments.length ? pathSegments : ['dashboard'];
  const breadcrumbLabels = breadcrumbs.map((segment: string, index: number) => {
    if (index === 0) {
      return moduleMeta.label;
    }
    return segment
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char: string) => char.toUpperCase());
  });

  const toneClassMap: Record<ModuleTone, string> = {
    success: 'bg-[hsl(var(--success))]',
    info: 'bg-[hsl(var(--primary))]',
    warning: 'bg-[hsl(var(--warning))]'
  };

  const headerTimestamp = useMemo(
    () => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date()),
    []
  );

  return (
    <SidebarProvider>
      <AppLayoutInner 
        children={children}
        term={term}
        setTerm={setTerm}
        searchDialogOpen={searchDialogOpen}
        setSearchDialogOpen={setSearchDialogOpen}
        searchResults={searchResults}
        hasSearchTerm={hasSearchTerm}
        isGlobalSearchLoading={isGlobalSearchLoading}
        globalSearchError={globalSearchError}
        moduleMeta={moduleMeta}
        breadcrumbLabels={breadcrumbLabels}
        toneClassMap={toneClassMap}
        headerTimestamp={headerTimestamp}
        navigate={navigate}
        user={user}
        userInitials={userInitials}
        handleSignOut={handleSignOut}
      />
    </SidebarProvider>
  );
}

function AppLayoutInner({
  children,
  term,
  setTerm,
  searchDialogOpen,
  setSearchDialogOpen,
  searchResults,
  hasSearchTerm,
  isGlobalSearchLoading,
  globalSearchError,
  moduleMeta,
  breadcrumbLabels,
  toneClassMap,
  headerTimestamp,
  navigate,
  user,
  userInitials,
  handleSignOut
}: any) {
  const hasSearchResults =
    hasSearchTerm &&
    Object.values(searchResults ?? {}).some(
      (items) => Array.isArray(items) && items.length > 0
    );

  const handleSearchResultSelect = (url: string) => {
    setSearchDialogOpen(false);
    navigate(url);
  };

  return (
    <>
      <CommandPalette />
      <div className="app-shell flex min-h-screen w-full bg-[hsl(var(--background))]">
        <aside className="hidden w-[260px] shrink-0 px-3 py-5 md:flex">
          <div className="workspace-sidebar h-full w-full overflow-hidden">
            <AppSidebar />
          </div>
        </aside>

        <div className="flex flex-col flex-1 min-w-0 gap-6 px-3 py-5 sm:px-6 lg:px-8">
          <header className="workspace-header surface-panel px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <MobileNavigation />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Workspace</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-semibold text-foreground">{moduleMeta.label}</span>
                      <span className="hidden text-xs text-muted-foreground/80 sm:inline-flex">{moduleMeta.status}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="hidden items-center gap-2 rounded-full border border-[hsl(var(--surface-border))] bg-[hsl(var(--muted))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:flex">
                    <span className={cn("h-2 w-2 rounded-full", toneClassMap[moduleMeta.tone])} />
                    <span>{moduleMeta.status}</span>
                  </div>
                  <Button
                    variant="default"
                    className="hidden items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--primary))/0.9] sm:flex"
                    onClick={() => navigate('/cases/create')}
                  >
                    <Plus className="h-4 w-4" />
                    New Case
                  </Button>
                  <NotificationsDropdown />
                  <DeadlineReminders />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate('/help-center')}
                          aria-label="Help Center"
                          className="hidden h-10 w-10 items-center justify-center rounded-lg border border-[hsl(var(--surface-border))] bg-[hsl(var(--surface))] text-muted-foreground transition-colors hover:border-[hsl(var(--primary))] hover:text-foreground sm:flex"
                        >
                          <HelpCircle className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Help Center</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-1 flex h-10 w-10 items-center justify-center rounded-lg border border-[hsl(var(--surface-border))] bg-[hsl(var(--surface))] p-0 text-foreground transition-colors hover:border-[hsl(var(--primary))]"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user?.user_metadata?.avatar_url} alt={user?.email || 'User'} />
                          <AvatarFallback className="bg-[hsl(var(--primary))/0.12] text-[hsl(var(--primary))] text-sm">
                            {userInitials}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="mt-1 w-56">
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
                            <User className="mr-2 h-4 w-4" />
                            <span>Profile</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/settings">
                            <Settings className="mr-2 h-4 w-4" />
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
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div
                  className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-[hsl(var(--surface-border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:border-[hsl(var(--primary))] hover:text-foreground"
                  onClick={() => setSearchDialogOpen(true)}
                >
                  <SearchIcon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 truncate">Search cases, clients, calendar events, voice notes...</span>
                  <span className="hidden items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:flex">
                    Press
                    <kbd className="rounded-md border border-[hsl(var(--surface-border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[10px] font-semibold text-foreground">⌘K</kbd>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground md:justify-end">
                  <span className="font-medium text-foreground">Updated {headerTimestamp}</span>
                </div>
              </div>

              {breadcrumbLabels.length > 1 && (
                <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {breadcrumbLabels.map((label: string, index: number) => (
                    <span key={`${label}-${index}`} className="flex items-center gap-1">
                      {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
                      <span className={index === breadcrumbLabels.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                        {label}
                      </span>
                    </span>
                  ))}
                </nav>
              )}
            </div>

            <CommandDialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
              <CommandInput
                placeholder="Search cases, clients, calendar events, and voice content..."
                value={term}
                onValueChange={setTerm}
              />
              <CommandList>
                {hasSearchTerm &&
                  searchResults.cases.length > 0 && (
                    <CommandGroup heading="Matters">
                      {searchResults.cases.map((item: any) => (
                        <CommandItem
                          key={`case-${item.id}`}
                          value={`case-${item.title}`}
                          className="flex items-center gap-3"
                          onSelect={() => handleSearchResultSelect(item.url)}
                        >
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <div className="flex flex-col flex-1">
                            <span className="text-sm font-medium text-foreground">{item.title}</span>
                            {item.subtitle && (
                              <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                            )}
                          </div>
                          {item.badge && (
                            <Badge variant={item.badge.variant ?? 'secondary'} className="ml-2">
                              {item.badge.label}
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                {hasSearchTerm &&
                  searchResults.clients.length > 0 && (
                    <CommandGroup heading="Clients">
                      {searchResults.clients.map((item: any) => (
                        <CommandItem
                          key={`client-${item.id}`}
                          value={`client-${item.title}`}
                          className="flex items-center gap-3"
                          onSelect={() => handleSearchResultSelect(item.url)}
                        >
                          <UserCheck className="h-4 w-4 text-muted-foreground" />
                          <div className="flex flex-col flex-1">
                            <span className="text-sm font-medium text-foreground">{item.title}</span>
                            {item.subtitle && (
                              <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                {hasSearchTerm &&
                  searchResults.calendarEvents.length > 0 && (
                    <CommandGroup heading="Calendar Events">
                      {searchResults.calendarEvents.map((item: any) => (
                        <CommandItem
                          key={`event-${item.id}`}
                          value={`event-${item.title}`}
                          className="flex items-center gap-3"
                          onSelect={() => handleSearchResultSelect(item.url)}
                        >
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div className="flex flex-col flex-1">
                            <span className="text-sm font-medium text-foreground">{item.title}</span>
                            {item.subtitle && (
                              <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                            )}
                          </div>
                          {item.badge && (
                            <Badge variant={item.badge.variant ?? 'secondary'} className="ml-2 capitalize">
                              {item.badge.label}
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                {hasSearchTerm &&
                  searchResults.voiceRecordings.length > 0 && (
                    <CommandGroup heading="Voice Recordings">
                      {searchResults.voiceRecordings.map((item: any) => (
                        <CommandItem
                          key={`voice-${item.id}`}
                          value={`voice-${item.title}`}
                          className="flex items-center gap-3"
                          onSelect={() => handleSearchResultSelect(item.url)}
                        >
                          <Mic className="h-4 w-4 text-muted-foreground" />
                          <div className="flex flex-col flex-1">
                            <span className="text-sm font-medium text-foreground">{item.title}</span>
                            {item.subtitle && (
                              <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                            )}
                          </div>
                          {item.badge && (
                            <Badge variant={item.badge.variant ?? 'secondary'} className="ml-2 capitalize">
                              {item.badge.label}
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                {hasSearchTerm &&
                  searchResults.transcriptions.length > 0 && (
                    <CommandGroup heading="Transcriptions">
                      {searchResults.transcriptions.map((item: any) => (
                        <CommandItem
                          key={`transcription-${item.id}`}
                          value={`transcription-${item.title}`}
                          className="flex items-center gap-3"
                          onSelect={() => handleSearchResultSelect(item.url)}
                        >
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div className="flex flex-col flex-1">
                            <span className="text-sm font-medium text-foreground">{item.title}</span>
                            {item.subtitle && (
                              <span className="text-xs text-muted-foreground line-clamp-2">{item.subtitle}</span>
                            )}
                          </div>
                          {item.badge && (
                            <Badge variant={item.badge.variant ?? 'secondary'} className="ml-2 capitalize">
                              {item.badge.label}
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                <CommandEmpty>
                  {!hasSearchTerm
                    ? 'Type at least 2 characters to search across the workspace.'
                    : globalSearchError
                    ? 'Unable to search the workspace. Please try again.'
                    : isGlobalSearchLoading
                    ? 'Searching workspace...'
                    : hasSearchResults
                    ? 'Keep typing to narrow down your results.'
                    : 'No results found for your search.'}
                </CommandEmpty>
              </CommandList>
            </CommandDialog>
          </header>

          <main className="workspace-body flex-1 overflow-auto">
            <div className="workspace-body__inner">
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}