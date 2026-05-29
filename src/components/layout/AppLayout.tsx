// src/components/layout/AppLayout.tsx
import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { TrialBanner } from '@/components/billing/TrialBanner';
import { TrialExpiredModal } from '@/components/billing/TrialExpiredModal';
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
import { useProfile } from '@/hooks/useProfile';
import { useInsights } from '@/hooks/useInsights';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { useUserOrganization } from '@/hooks/useUserOrganization';
// import { NotificationIcon } from '@/components/ui/notifications';
import NotificationsDropdown from './NotificationsDropdown';
import {
  User,
  Settings,
  ShieldCheck,
  Plus,
  Search as SearchIcon,
  FileText,
  Briefcase,
  Calendar,
  UserCheck,
  Home,
  X,
  Menu,
  LayoutDashboard,
  Users,
  FileCheck,
  Receipt,
  Bot,
  Gauge,
  Mic,
  MonitorSmartphone,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { PermissionGate } from '@/components/PermissionGate';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { KeyboardShortcutsDialog } from '@/hooks/useKeyboardShortcuts';
import { useTotalUnreadCount } from '@/hooks/useChat';
// Navigation item type
export type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  end: boolean;
  badge?: string;
  badgeVariant?: 'default' | 'outline' | 'destructive' | 'secondary';
};

// Trigger initial reminders from insights + alert-to-notification bridge
import { useAlertNotifications } from '@/hooks/useAlertNotifications';

function DeadlineReminders() {
  useInsights(7);
  useAlertNotifications();

  return null;
}

// Mobile navigation for small screens
import { useUserRole } from '@/hooks/useUserManagement';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [breakpoint]);

  return isMobile;
}

function MobileAccessNotice() {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isMobile) {
      setDismissed(false);
    }
  }, [isMobile]);

  if (!isMobile || dismissed) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 bg-muted/90 border-b border-border px-3 py-2 text-[13px] backdrop-blur-sm md:hidden">
      <div className="flex items-center gap-2 text-foreground">
        <MonitorSmartphone className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
        <span>Best experienced on desktop or tablet.</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 flex-shrink-0 hover:bg-primary/10"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss mobile notice"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const [showInvoiceSoon, setShowInvoiceSoon] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: userRoleData } = useUserRole();
  const role = userRoleData && 'role' in userRoleData ? userRoleData.role : null;
  const isAdmin = role === 'superadmin' || role === 'admin';
  const totalUnreadCount = useTotalUnreadCount();

  // Sidebar navigation groups (matching AppSidebar structure)
  const coreNavigation = {
    label: 'Core',
    items: [
      { title: 'Dashboard', url: '/', icon: LayoutDashboard, end: true },
      { title: 'Matters', url: '/matters', icon: Briefcase, end: false },
      { title: 'Clients', url: '/clients', icon: UserCheck, end: false },
      { title: 'Calendar', url: '/calendar', icon: Calendar, end: false },
    ],
  };
  const legalToolsNavigation = {
    label: 'Legal Tools',
    items: [
      { title: 'Documents', url: '/documents', icon: FileText, end: false },
      { title: 'Contracts', url: '/contracts', icon: FileCheck, end: false },
      {
        title: 'AI Assistant',
        url: '/ream-ai',
        icon: Bot,
        end: false,
        badge: 'New',
        badgeVariant: 'default' as const,
      },
      { title: 'Voice & Transcriptions', url: '/voice-recorder', icon: Mic, end: false },
    ],
  };
  const mobileWorkspaceNavigation = {
    label: 'Workspace',
    items: [
      {
        title: 'Live Chat',
        url: '/live-chat',
        icon: MessageCircle,
        end: false,
      },
      {
        title: 'Invoicing',
        url: '/invoices',
        icon: Receipt,
        end: false,
        badge: 'Soon',
        badgeVariant: 'outline' as const,
      },
    ],
  };

  // Footer items
  const footerItems: NavItem[] = [
    { title: 'Settings', url: '/settings', icon: Settings, end: false },
    ...(isAdmin
      ? [
          { title: 'Admin Panel', url: '/analytics', icon: Gauge, end: false },
          { title: 'Users', url: '/users', icon: Users, end: false },
        ]
      : []),
  ];

  // Filter logic
  const getFilteredNavigation = () => {
    const navigation: { label: string; items: NavItem[] }[] = [
      coreNavigation,
      legalToolsNavigation,
    ];
    const filteredWorkspace = {
      ...mobileWorkspaceNavigation,
      items: mobileWorkspaceNavigation.items.filter((item) => {
        if (item.url === '/invoices' && !isAdmin) {
          return false;
        }
        return true;
      }),
    };
    if (filteredWorkspace.items.length > 0) navigation.push(filteredWorkspace);
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
          <Button className="mt-2 w-full" onClick={() => setShowInvoiceSoon(false)} autoFocus>
            Close
          </Button>
        </DialogContent>
      </Dialog>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Open main navigation menu"
            title="Open main navigation menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[280px] border-none bg-[hsl(var(--sidebar-background))] p-0"
        >
          <div className="flex flex-col h-full">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Kourti AI</h2>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="px-2 py-4 flex-1 overflow-y-auto">
              {navigationGroups.map((group) => (
                <div key={group.label} className="mb-3">
                  <div className="text-xs text-muted-foreground font-semibold px-2 mb-1">
                    {group.label}
                  </div>
                  <nav className="space-y-1">
                    {group.items.map((item) => {
                      if (!item) return null;
                      const isInvoice = item.url === '/invoices';
                      const isLiveChat = item.url === '/live-chat';

                      return (
                        <Button
                          key={item.url}
                          variant="ghost"
                          className={cn(
                            'w-full justify-start gap-3 rounded-xl px-3 py-2.5 h-11 text-[15px]',
                            isActive(item.url, item.end)
                              ? 'bg-primary/8 text-primary font-semibold'
                              : 'text-muted-foreground font-normal hover:text-foreground hover:bg-muted/50'
                          )}
                          onClick={(e) => {
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
                          {isLiveChat && totalUnreadCount > 0 ? (
                            <Badge
                              variant="destructive"
                              className="ml-auto text-[10px] min-w-5 justify-center"
                            >
                              {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                            </Badge>
                          ) : item.badge ? (
                            <Badge variant={item.badgeVariant} className="ml-auto text-[10px]">
                              {item.badge}
                            </Badge>
                          ) : null}
                        </Button>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>
            <div className="p-4 border-t mt-auto space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Theme</span>
                <ThemeToggle />
              </div>
              <nav className="space-y-1">
                {footerItems.map((item) => (
                  <Button
                    key={item.url}
                    variant="ghost"
                    className={cn(
                      'w-full justify-start gap-3 rounded-xl px-3 py-2.5 h-11 text-[15px]',
                      isActive(item.url, item.end)
                        ? 'bg-primary/8 text-primary font-semibold'
                        : 'text-muted-foreground font-normal hover:text-foreground hover:bg-muted/50'
                    )}
                    onClick={() => {
                      setOpen(false);
                      navigate(item.url);
                    }}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.title}</span>
                  </Button>
                ))}
              </nav>
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
  const { data: profile } = useProfile();
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

  const searchResults = globalSearchResults ?? {
    cases: [],
    documents: [],
    contracts: [],
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
  useKeyboardShortcut(['/', 'Meta+f', 'Control+f', 'Meta+k', 'Control+k'], (e) => {
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
    default: { label: 'Workspace', status: 'Operational', tone: 'info' },
  };

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const activeModuleKey = pathSegments[0] ?? 'dashboard';
  const moduleMeta = moduleDescriptors[activeModuleKey] ?? moduleDescriptors.default;
  const breadcrumbs = pathSegments.length ? pathSegments : ['dashboard'];
  const breadcrumbLabels = breadcrumbs.map((segment: string, index: number) => {
    if (index === 0) {
      return moduleMeta.label;
    }
    return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (char: string) => char.toUpperCase());
  });

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
        navigate={navigate}
        user={user}
        userInitials={userInitials}
        handleSignOut={handleSignOut}
        firstName={profile?.first_name}
      />
    </SidebarProvider>
  );
}

type GlobalSearchResults = {
  cases: {
    id: string;
    title: string;
    subtitle?: string;
    url: string;
    badge?: { label: string; variant?: string };
  }[];
  documents: {
    id: string;
    title: string;
    subtitle?: string;
    url: string;
    badge?: { label: string; variant?: string };
  }[];
  contracts: {
    id: string;
    title: string;
    subtitle?: string;
    url: string;
    badge?: { label: string; variant?: string };
  }[];
  clients: { id: string; title: string; subtitle?: string; url: string }[];
  calendarEvents: {
    id: string;
    title: string;
    subtitle?: string;
    url: string;
    badge?: { label: string; variant?: string };
  }[];
  voiceRecordings: {
    id: string;
    title: string;
    subtitle?: string;
    url: string;
    badge?: { label: string; variant?: string };
  }[];
  transcriptions: {
    id: string;
    title: string;
    subtitle?: string;
    url: string;
    badge?: { label: string; variant?: string };
  }[];
};

type ModuleTone = 'success' | 'info' | 'warning';
type ModuleMeta = { label: string; status: string; tone: ModuleTone };

interface AppLayoutInnerProps {
  children: React.ReactNode;
  term: string;
  setTerm: (term: string) => void;
  searchDialogOpen: boolean;
  setSearchDialogOpen: (open: boolean) => void;
  searchResults: GlobalSearchResults | null;
  hasSearchTerm: boolean;
  isGlobalSearchLoading: boolean;
  globalSearchError: Error | null;
  moduleMeta: ModuleMeta | null;
  breadcrumbLabels: string[];
  navigate: (path: string) => void;
  user: { email?: string; user_metadata?: { avatar_url?: string; name?: string } } | null;
  userInitials: string;
  handleSignOut: () => void;
  firstName?: string;
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
  navigate,
  user,
  userInitials,
  handleSignOut,
  firstName,
}: AppLayoutInnerProps) {
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);

  const hasSearchResults =
    hasSearchTerm &&
    Object.values(searchResults ?? {}).some((items) => Array.isArray(items) && items.length > 0);

  const handleSearchResultSelect = (url: string) => {
    setSearchDialogOpen(false);
    navigate(url);
  };

  return (
    <>
      <KeyboardShortcutsDialog />
      <MobileAccessNotice />

      {/* Quick Actions Modal */}
      <Dialog open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Actions</DialogTitle>
            <DialogDescription>Jump to common tasks and pages</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 pt-2">
            {[
              { label: 'New Matter', icon: Briefcase, href: '/cases/create' },
              { label: 'New Client', icon: UserCheck, href: '/clients/create' },
              { label: 'Upload Document', icon: FileText, href: '/documents/upload' },
              { label: 'New Contract', icon: FileCheck, href: '/contracts/create' },
              { label: 'Calendar', icon: Calendar, href: '/calendar' },
              { label: 'AI Assistant', icon: Bot, href: '/ream-ai' },
              { label: 'Analytics', icon: Gauge, href: '/analytics' },
              { label: 'Voice Recorder', icon: Mic, href: '/voice-recorder' },
            ].map((action) => (
              <button
                key={action.href}
                onClick={() => {
                  setQuickActionsOpen(false);
                  navigate(action.href);
                }}
                className="flex items-center gap-3 rounded-lg border border-border/60 px-4 py-3 text-left text-[14px] font-medium text-foreground transition-colors hover:bg-muted/50 hover:border-primary/30"
              >
                <action.icon className="h-4 w-4 text-muted-foreground" />
                {action.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Assistant Modal */}
      <Dialog open={aiAssistantOpen} onOpenChange={setAiAssistantOpen}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-gradient-to-r from-[#afc8f0]/10 to-[#79a5ea]/10">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#afc8f0] to-[#79a5ea] text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">AI Assistant</h2>
              <p className="text-[12px] text-muted-foreground">
                Ask anything about your legal practice
              </p>
            </div>
          </div>
          <div className="px-5 py-6 space-y-3">
            <p className="text-[13px] text-muted-foreground">What would you like help with?</p>
            <div className="grid grid-cols-1 gap-2">
              {[
                { label: 'Summarize my active matters', icon: Briefcase },
                { label: 'Draft a legal document', icon: FileText },
                { label: 'Review a contract', icon: FileCheck },
                { label: 'Research a legal topic', icon: SearchIcon },
              ].map((suggestion) => (
                <button
                  key={suggestion.label}
                  onClick={() => {
                    setAiAssistantOpen(false);
                    navigate('/ream-ai');
                  }}
                  className="flex items-center gap-3 rounded-lg border border-border/60 px-4 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted/50 hover:border-primary/30"
                >
                  <suggestion.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-5 py-3 border-t border-border/60 bg-muted/30">
            <Button
              className="w-full bg-gradient-to-r from-[#afc8f0] to-[#79a5ea] text-white hover:brightness-110 border-0"
              onClick={() => {
                setAiAssistantOpen(false);
                navigate('/ream-ai');
              }}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Open Full Assistant
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="app-shell flex min-h-screen w-full bg-[hsl(var(--background))]">
        <aside className="hidden shrink-0 md:flex md:w-[240px] lg:w-[260px]">
          <div className="h-full w-full border-r border-border/30 overflow-hidden bg-[hsl(var(--surface))]">
            <AppSidebar />
          </div>
        </aside>

        <div className="flex flex-col flex-1 min-w-0">
          <header className="bg-[hsl(var(--surface))] px-6 py-3 lg:px-8">
            <div className="flex items-center gap-4">
              <MobileNavigation />

              {/* Greeting */}
              <div className="hidden md:block">
                <h1 className="text-[18px] font-medium text-foreground">
                  Welcome back{firstName ? `, ${firstName}` : ''}
                </h1>
              </div>

              {/* Mobile greeting */}
              <span className="text-[16px] font-medium text-foreground md:hidden">
                Welcome back{firstName ? `, ${firstName}` : ''}
              </span>

              <div className="flex-1" />

              {/* Search pill button */}
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex items-center gap-2 rounded-full px-4 h-9 text-[13px] font-medium border-border/60"
                onClick={() => setSearchDialogOpen(true)}
              >
                <SearchIcon className="h-3.5 w-3.5" />
                Search
              </Button>

              {/* Quick Actions button */}
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex items-center gap-1.5 rounded-full px-4 h-9 text-[13px] font-medium border-border/60"
                onClick={() => setQuickActionsOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Quick Actions
              </Button>

              {/* AI Assistant trigger */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setAiAssistantOpen(true)}
                    className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#afc8f0] to-[#79a5ea] text-white shadow-sm transition-all hover:shadow-md hover:brightness-110 active:scale-95"
                  >
                    <Sparkles className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>AI Assistant</TooltipContent>
              </Tooltip>

              {/* Mobile search icon */}
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden h-9 w-9 text-muted-foreground"
                onClick={() => setSearchDialogOpen(true)}
              >
                <SearchIcon className="h-4 w-4" />
              </Button>

              <NotificationsDropdown />
              <DeadlineReminders />

              {/* User avatar */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-9 w-9 items-center justify-center rounded-full overflow-hidden ring-2 ring-border/30 hover:ring-border/60 transition-all">
                    <Avatar className="h-9 w-9">
                      <AvatarImage
                        src={
                          (user as { user_metadata?: { avatar_url?: string } })?.user_metadata
                            ?.avatar_url
                        }
                        alt={user?.email || 'User'}
                      />
                      <AvatarFallback className="bg-muted text-foreground text-xs font-semibold">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="mt-1 w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {(user as { user_metadata?: { name?: string } })?.user_metadata?.name ||
                          user?.email}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <Link to="/settings?tab=profile">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/settings?tab=general">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    <PermissionGate resource="settings" action="manage">
                      <DropdownMenuItem asChild>
                        <Link to="/settings?tab=sso">
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          <span>SSO</span>
                        </Link>
                      </DropdownMenuItem>
                    </PermissionGate>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex items-center justify-between"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span>Theme</span>
                    <ThemeToggle />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <CommandDialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
              <CommandInput
                placeholder="Search cases, documents, contracts, clients, calendar events, and voice content..."
                value={term}
                onValueChange={setTerm}
              />
              <CommandList>
                {!hasSearchTerm && (
                  <>
                    <CommandGroup heading="Quick Navigation">
                      {[
                        { label: 'Dashboard', icon: <Home className="h-4 w-4 mr-2" />, href: '/' },
                        {
                          label: 'Matters',
                          icon: <Briefcase className="h-4 w-4 mr-2" />,
                          href: '/matters',
                        },
                        {
                          label: 'Clients',
                          icon: <UserCheck className="h-4 w-4 mr-2" />,
                          href: '/clients',
                        },
                        {
                          label: 'Calendar',
                          icon: <Calendar className="h-4 w-4 mr-2" />,
                          href: '/calendar',
                        },
                        {
                          label: 'Documents',
                          icon: <FileText className="h-4 w-4 mr-2" />,
                          href: '/documents',
                        },
                        {
                          label: 'Contracts',
                          icon: <FileCheck className="h-4 w-4 mr-2" />,
                          href: '/contracts',
                        },
                        {
                          label: 'Settings',
                          icon: <Settings className="h-4 w-4 mr-2" />,
                          href: '/settings',
                        },
                      ].map((option) => (
                        <CommandItem
                          key={option.href}
                          onSelect={() => {
                            navigate(option.href);
                            setSearchDialogOpen(false);
                          }}
                        >
                          {option.icon}
                          <span>{option.label}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandGroup heading="Quick Actions">
                      {[
                        {
                          label: 'New Matter',
                          icon: <Briefcase className="h-4 w-4 mr-2" />,
                          href: '/cases/create',
                        },
                        {
                          label: 'New Client',
                          icon: <UserCheck className="h-4 w-4 mr-2" />,
                          href: '/clients/create',
                        },
                        {
                          label: 'Upload Document',
                          icon: <FileText className="h-4 w-4 mr-2" />,
                          href: '/documents/upload',
                        },
                      ].map((option) => (
                        <CommandItem
                          key={option.href}
                          onSelect={() => {
                            navigate(option.href);
                            setSearchDialogOpen(false);
                          }}
                        >
                          {option.icon}
                          <span>{option.label}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}

                {hasSearchTerm && searchResults && searchResults.cases.length > 0 && (
                  <CommandGroup heading="Matters">
                    {searchResults.cases.map((item) => (
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
                          <Badge
                            variant={
                              (item.badge.variant as
                                | 'secondary'
                                | 'destructive'
                                | 'default'
                                | 'outline') ?? 'secondary'
                            }
                            className="ml-2"
                          >
                            {item.badge.label}
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {hasSearchTerm && searchResults && searchResults.documents.length > 0 && (
                  <CommandGroup heading="Documents">
                    {searchResults.documents.map((item) => (
                      <CommandItem
                        key={`document-${item.id}`}
                        value={`document-${item.title}`}
                        className="flex items-center gap-3"
                        onSelect={() => handleSearchResultSelect(item.url)}
                      >
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col flex-1">
                          <span className="text-sm font-medium text-foreground">{item.title}</span>
                          {item.subtitle && (
                            <span className="text-xs text-muted-foreground line-clamp-2">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                        {item.badge && (
                          <Badge
                            variant={
                              (item.badge.variant as
                                | 'secondary'
                                | 'destructive'
                                | 'default'
                                | 'outline') ?? 'outline'
                            }
                            className="ml-2"
                          >
                            {item.badge.label}
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {hasSearchTerm && searchResults && searchResults.contracts.length > 0 && (
                  <CommandGroup heading="Contracts">
                    {searchResults.contracts.map((item) => (
                      <CommandItem
                        key={`contract-${item.id}`}
                        value={`contract-${item.title}`}
                        className="flex items-center gap-3"
                        onSelect={() => handleSearchResultSelect(item.url)}
                      >
                        <FileCheck className="h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col flex-1">
                          <span className="text-sm font-medium text-foreground">{item.title}</span>
                          {item.subtitle && (
                            <span className="text-xs text-muted-foreground line-clamp-2">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                        {item.badge && (
                          <Badge
                            variant={
                              (item.badge.variant as
                                | 'secondary'
                                | 'destructive'
                                | 'default'
                                | 'outline') ?? 'secondary'
                            }
                            className="ml-2"
                          >
                            {item.badge.label}
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {hasSearchTerm && searchResults && searchResults.clients.length > 0 && (
                  <CommandGroup heading="Clients">
                    {searchResults.clients.map((item) => (
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

                {hasSearchTerm && searchResults && searchResults.calendarEvents.length > 0 && (
                  <CommandGroup heading="Calendar Events">
                    {searchResults.calendarEvents.map((item) => (
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
                          <Badge
                            variant={
                              (item.badge.variant as
                                | 'secondary'
                                | 'destructive'
                                | 'default'
                                | 'outline') ?? 'secondary'
                            }
                            className="ml-2 capitalize"
                          >
                            {item.badge.label}
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {hasSearchTerm && searchResults && searchResults.voiceRecordings.length > 0 && (
                  <CommandGroup heading="Voice Recordings">
                    {searchResults.voiceRecordings.map((item) => (
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
                          <Badge
                            variant={
                              (item.badge.variant as
                                | 'secondary'
                                | 'destructive'
                                | 'default'
                                | 'outline') ?? 'secondary'
                            }
                            className="ml-2 capitalize"
                          >
                            {item.badge.label}
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {hasSearchTerm && searchResults && searchResults.transcriptions.length > 0 && (
                  <CommandGroup heading="Transcriptions">
                    {searchResults.transcriptions.map((item) => (
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
                            <span className="text-xs text-muted-foreground line-clamp-2">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                        {item.badge && (
                          <Badge
                            variant={
                              (item.badge.variant as
                                | 'secondary'
                                | 'destructive'
                                | 'default'
                                | 'outline') ?? 'secondary'
                            }
                            className="ml-2 capitalize"
                          >
                            {item.badge.label}
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {hasSearchTerm &&
                  searchResults &&
                  !isGlobalSearchLoading &&
                  hasSearchResults &&
                  (() => {
                    const totalResults = Object.values(searchResults).reduce(
                      (sum: number, items) => sum + (Array.isArray(items) ? items.length : 0),
                      0
                    );
                    return (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground border-t">
                        Found {totalResults} result{totalResults !== 1 ? 's' : ''}
                      </div>
                    );
                  })()}
                <CommandEmpty>
                  {!hasSearchTerm ? null : globalSearchError ? (
                    'Unable to search the workspace. Please try again.'
                  ) : isGlobalSearchLoading ? (
                    <div className="flex items-center gap-2 py-4">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      <span>Searching workspace...</span>
                    </div>
                  ) : hasSearchResults ? (
                    'Keep typing to narrow down your results.'
                  ) : (
                    'No results found for your search.'
                  )}
                </CommandEmpty>
              </CommandList>
            </CommandDialog>
          </header>

          <main id="main-content" className="flex-1 overflow-auto bg-[hsl(var(--background))]">
            <TrialBanner />
            <div className="workspace-body__inner h-full">{children}</div>
          </main>
          <TrialExpiredModal />
        </div>
      </div>
    </>
  );
}
