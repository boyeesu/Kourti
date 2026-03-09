import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  Calendar,
  FileText,
  FileCheck,
  Users,
  UserCheck,
  Settings,
  LogOut,
  Receipt,
  Bot,
  Gauge,
  Mic,
  LucideIcon,
  HelpCircle,
  MessageCircle,
  Shield,
  CreditCard,
  ChevronRight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PermissionGate } from '@/components/PermissionGate';
import { Resource, Action, useCanPerformAction } from '@/hooks/usePermissions';
import { useUserRole } from '@/hooks/useUserManagement';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { KourtiKLogo } from '@/components/ui/KourtiKLogo';
import { cn } from '@/lib/utils';
import { useTotalUnreadCount } from '@/hooks/useChat';

// Navigation item type definition
interface NavigationItem {
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  permission?: { resource: Resource; action: Action };
}

interface NavigationGroup {
  label: string;
  icon?: LucideIcon;
  items: NavigationItem[];
  collapsible?: boolean;
}

const primaryNavigation: NavigationGroup = {
  label: 'Main',
  items: [
    { title: 'Dashboard', url: '/', icon: LayoutDashboard, end: true },
    {
      title: 'Matters',
      url: '/matters',
      icon: Briefcase,
      permission: { resource: 'cases', action: 'read' },
    },
    {
      title: 'Clients',
      url: '/clients',
      icon: UserCheck,
      permission: { resource: 'clients', action: 'read' },
    },
    {
      title: 'Calendar',
      url: '/calendar',
      icon: Calendar,
      permission: { resource: 'calendars', action: 'read' },
    },
  ],
};

const documentsNavigation: NavigationGroup = {
  label: 'Legal',
  icon: FileText,
  collapsible: true,
  items: [
    {
      title: 'Documents',
      url: '/documents',
      icon: FileText,
      permission: { resource: 'documents', action: 'read' },
    },
    {
      title: 'Contracts',
      url: '/contracts',
      icon: FileCheck,
      permission: { resource: 'contracts', action: 'read' },
    },
  ],
};

const toolsNavigation: NavigationGroup = {
  label: 'Workspace',
  icon: Bot,
  collapsible: true,
  items: [
    {
      title: 'Live Chat',
      url: '/live-chat',
      icon: MessageCircle,
      badge: 'New',
      badgeVariant: 'default',
    },
    {
      title: 'Ream AI',
      url: '/ream-ai',
      icon: Bot,
      permission: { resource: 'documents', action: 'read' },
    },
    {
      title: 'Voice Recorder',
      url: '/voice-recorder',
      icon: Mic,
      permission: { resource: 'documents', action: 'create' },
    },
    {
      title: 'Transcriptions',
      url: '/transcriptions',
      icon: FileText,
      permission: { resource: 'documents', action: 'read' },
    },
    {
      title: 'Invoicing',
      url: '/invoices',
      icon: Receipt,
      badge: 'Soon',
      badgeVariant: 'outline',
      permission: { resource: 'invoices', action: 'read' },
    },
  ],
};

const billingNavigation: NavigationItem = {
  title: 'Billing',
  url: '/settings?tab=billing',
  icon: CreditCard,
};

const managementNavigation: NavigationGroup = {
  label: 'Admin',
  icon: Settings,
  collapsible: true,
  items: [
    {
      title: 'Users',
      url: '/users',
      icon: Users,
      permission: { resource: 'users', action: 'manage' },
    },
    {
      title: 'Analytics',
      url: '/analytics',
      icon: Gauge,
      permission: { resource: 'cases', action: 'manage' },
    },
    {
      title: 'Settings',
      url: '/settings',
      icon: Settings,
      permission: { resource: 'settings', action: 'manage' },
    },
  ],
};

const platformAdminNavigation: NavigationGroup = {
  label: 'Platform Admin',
  items: [{ title: 'Platform Admin', url: '/thanos', icon: Shield }],
};

const groups = [
  primaryNavigation,
  documentsNavigation,
  toolsNavigation,
  managementNavigation,
  platformAdminNavigation,
];

const AppSidebar: React.FC = () => {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const userInitials = user?.email?.slice(0, 2).toUpperCase() || 'U';
  const [showInvoiceSoon, setShowInvoiceSoon] = React.useState(false);
  const totalUnreadCount = useTotalUnreadCount();

  const { data: userRoleData } = useUserRole();
  const role = userRoleData && 'role' in userRoleData ? userRoleData.role : null;
  const isAdmin = role === 'superadmin' || role === 'admin';
  const { data: isPlatformAdmin = false } = usePlatformAdmin();

  const filteredGroups = React.useMemo(() => {
    return groups
      .map((group) => {
        if (group === toolsNavigation) {
          const filteredItems = group.items.filter((item) => {
            if (item.url === '/invoices' && !isAdmin) {
              return false;
            }
            return true;
          });
          return { ...group, items: filteredItems };
        }
        if (group === managementNavigation && !isAdmin) {
          return {
            label: 'Management',
            items: managementNavigation.items.filter((item) => item.url === '/settings'),
          };
        }
        if (group === platformAdminNavigation && !isPlatformAdmin) {
          return null; // Hide platform admin group if user is not platform admin
        }
        return group;
      })
      .filter((group) => group !== null && group.items.length > 0);
  }, [isAdmin, isPlatformAdmin]);

  const isActive = React.useCallback(
    (path: string, end?: boolean) => {
      if (end) {
        return location.pathname === path;
      }
      return location.pathname.startsWith(path);
    },
    [location.pathname]
  );

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: 'Signed out',
        description: 'You have been successfully signed out.',
      });
      navigate('/auth', { replace: true });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to sign out. Please try again.',
      });
    }
  };

  const NavItemWithPermission = React.forwardRef<HTMLLIElement, { item: NavigationItem }>(
    ({ item }, ref) => {
      // Check if user has read access to this resource
      const hasAccess = useCanPerformAction(
        item.permission?.resource || 'cases',
        item.permission?.action || 'read'
      );

      // Hide item if user doesn't have access
      if (item.permission && !hasAccess) {
        return null;
      }

      return <NavItemContent item={item} ref={ref} />;
    }
  );
  NavItemWithPermission.displayName = 'NavItemWithPermission';

  const NavItemContent = React.forwardRef<HTMLLIElement, { item: NavigationItem }>(
    ({ item }, ref) => {
      const active = isActive(item.url, item.end);

      const linkClass = cn(
        'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
        collapsed && 'justify-center px-0 gap-0',
        active
          ? 'bg-[hsl(var(--primary))/0.12] text-[hsl(var(--primary))]'
          : 'text-muted-foreground hover:bg-[hsl(var(--primary))/0.08] hover:text-foreground'
      );

      const iconClass = cn(
        'h-[18px] w-[18px]',
        active ? 'text-[hsl(var(--primary))]' : 'text-muted-foreground'
      );

      // Handle Live Chat with unread badge
      const isLiveChat = item.url === '/live-chat';

      const content = (
        <SidebarMenuItem ref={ref} key={item.url}>
          <SidebarMenuButton
            asChild
            isActive={active}
            className={cn('h-9 px-0', collapsed && 'justify-center')}
          >
            <NavLink
              to={item.url}
              end={item.end}
              className={linkClass}
              onClick={(event) => {
                if (item.url === '/invoices') {
                  event.preventDefault();
                  setShowInvoiceSoon(true);
                }
              }}
            >
              <div className="relative">
                <item.icon className={iconClass} />
                {collapsed && isLiveChat && totalUnreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                    {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                  </span>
                )}
              </div>
              {!collapsed && <span className="truncate">{item.title}</span>}
              {!collapsed && isLiveChat && totalUnreadCount > 0 ? (
                <Badge variant="destructive" className="ml-auto text-[10px] min-w-5 justify-center">
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </Badge>
              ) : !collapsed && item.badge ? (
                <Badge variant={item.badgeVariant} className="ml-auto text-[10px]">
                  {item.badge}
                </Badge>
              ) : null}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );

      if (!item.permission) {
        return content;
      }

      return (
        <PermissionGate
          key={item.url}
          resource={item.permission.resource}
          action={item.permission.action}
          fallback={null}
        >
          {content}
        </PermissionGate>
      );
    }
  );
  NavItemContent.displayName = 'NavItemContent';

  return (
    <TooltipProvider delayDuration={150}>
      <Dialog open={showInvoiceSoon} onOpenChange={setShowInvoiceSoon}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Coming Soon</DialogTitle>
            <DialogDescription>
              The invoicing & billing module will be available in an upcoming release.
            </DialogDescription>
          </DialogHeader>
          <Button className="mt-2 w-full" onClick={() => setShowInvoiceSoon(false)} autoFocus>
            Close
          </Button>
        </DialogContent>
      </Dialog>
      <Sidebar
        variant="sidebar"
        collapsible="icon"
        className="h-full border-r border-[hsl(var(--sidebar-border)/.8)] bg-[hsl(var(--sidebar-background))]"
      >
        <SidebarHeader className="border-b border-[hsl(var(--sidebar-border))] px-3 py-2">
          <div className="flex items-center justify-start w-full pl-3">
            <KourtiKLogo size="md" className="max-w-full" />
          </div>
        </SidebarHeader>
        <SidebarContent className="flex h-full flex-col px-3 py-2">
          <div className="flex-1 space-y-1">
            {filteredGroups.map((group) => {
              if (!group) return null;

              // Collapsible groups
              if (group.collapsible && !collapsed) {
                const groupHasActiveItem = group.items.some((item) => isActive(item.url, item.end));
                return (
                  <SidebarGroup key={group.label} className="p-0">
                    <Collapsible defaultOpen={groupHasActiveItem}>
                      <CollapsibleTrigger className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground hover:bg-[hsl(var(--primary))/0.05] hover:text-foreground transition-colors">
                        {group.icon && <group.icon className="h-4 w-4" />}
                        <span className="flex-1 text-left">{group.label}</span>
                        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarGroupContent>
                          <SidebarMenu className="mt-0.5 space-y-0.5 pl-2">
                            {group.items.map((item) => (
                              <Tooltip key={item.url} disableHoverableContent={!collapsed}>
                                <TooltipTrigger asChild>
                                  <NavItemWithPermission item={item} />
                                </TooltipTrigger>
                                {collapsed && (
                                  <TooltipContent side="right">{item.title}</TooltipContent>
                                )}
                              </Tooltip>
                            ))}
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarGroup>
                );
              }

              // Flat groups (Main, Platform Admin)
              return (
                <SidebarGroup key={group.label} className="p-0">
                  {!collapsed && (
                    <SidebarGroupLabel className="mb-0.5 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {group.label}
                    </SidebarGroupLabel>
                  )}
                  <SidebarGroupContent>
                    <SidebarMenu className="space-y-0.5">
                      {group.items.map((item) => (
                        <Tooltip key={item.url} disableHoverableContent={!collapsed}>
                          <TooltipTrigger asChild>
                            <NavItemWithPermission item={item} />
                          </TooltipTrigger>
                          {collapsed && <TooltipContent side="right">{item.title}</TooltipContent>}
                        </Tooltip>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}

            {/* Billing - standalone item */}
            {!collapsed && (
              <SidebarGroup className="p-0">
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-0.5">
                    <Tooltip disableHoverableContent={!collapsed}>
                      <TooltipTrigger asChild>
                        <NavItemContent item={billingNavigation} />
                      </TooltipTrigger>
                    </Tooltip>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
            {collapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavItemContent item={billingNavigation} />
                </TooltipTrigger>
                <TooltipContent side="right">Billing</TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="mt-auto space-y-2 border-t border-[hsl(var(--sidebar-border))] pt-2">
            <SidebarMenu className="space-y-0.5">
              <Tooltip disableHoverableContent={!collapsed}>
                <TooltipTrigger asChild>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={cn('h-10 px-0', collapsed && 'justify-center')}
                    >
                      <NavLink
                        to="/help-center"
                        className={cn(
                          'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                          collapsed && 'justify-center px-0 gap-0',
                          isActive('/help-center')
                            ? 'bg-[hsl(var(--primary))/0.12] text-[hsl(var(--primary))]'
                            : 'text-muted-foreground hover:bg-[hsl(var(--primary))/0.08] hover:text-foreground'
                        )}
                      >
                        <HelpCircle
                          className={cn(
                            'h-5 w-5',
                            isActive('/help-center')
                              ? 'text-[hsl(var(--primary))]'
                              : 'text-muted-foreground'
                          )}
                        />
                        {!collapsed && <span>Help Center</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </TooltipTrigger>
                {collapsed && <TooltipContent side="right">Help Center</TooltipContent>}
              </Tooltip>
            </SidebarMenu>
            <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--surface))] px-3 py-3">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {user?.user_metadata?.name || user?.email}
                  </p>
                  <p className="text-xs text-muted-foreground">Workspace Lead</p>
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSignOut}
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    aria-label="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign Out</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </SidebarContent>
      </Sidebar>
    </TooltipProvider>
  );
};

export { AppSidebar };
