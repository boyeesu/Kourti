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
  Gauge,
  Mic,
  LucideIcon,
  Shield,
  Cpu,
  Handshake,
  Brain,
  Lock,
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { PermissionGate } from '@/components/PermissionGate';
import { Resource, Action, useCanPerformAction } from '@/hooks/usePermissions';
import { useEntitlements, type FeatureKey } from '@/hooks/useEntitlements';
import { useUserRole } from '@/hooks/useUserManagement';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { KourtiKLogo } from '@/components/ui/KourtiKLogo';
import { cn } from '@/lib/utils';
import { useTotalUnreadCount } from '@/hooks/useChat';

interface NavigationItem {
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  permission?: { resource: Resource; action: Action };
  /** Plan feature required; if the org lacks it, the item shows a lock. */
  feature?: FeatureKey;
}

// Main navigation — flat list, no group labels (Startbutton style)
const mainNavItems: NavigationItem[] = [
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
  {
    title: 'AI Agents',
    url: '/agents',
    icon: Cpu,
    badge: 'New',
    badgeVariant: 'default',
    permission: { resource: 'agents', action: 'read' },
    feature: 'agents',
  },
  {
    title: 'Negotiations',
    url: '/negotiations',
    icon: Handshake,
    permission: { resource: 'negotiations', action: 'read' },
    feature: 'negotiations',
  },
  {
    title: 'Intelligence',
    url: '/intelligence',
    icon: Brain,
    permission: { resource: 'cases', action: 'read' },
    feature: 'intelligence',
  },
  {
    title: 'Voice & Transcriptions',
    url: '/voice-recorder',
    icon: Mic,
    permission: { resource: 'documents', action: 'create' },
  },
];

// Footer items
const footerSettingsItem: NavigationItem = { title: 'Settings', url: '/settings', icon: Settings };
const footerAdminItems: NavigationItem[] = [
  {
    title: 'Analytics',
    url: '/analytics',
    icon: Gauge,
    permission: { resource: 'cases', action: 'manage' },
  },
  {
    title: 'Users',
    url: '/users',
    icon: Users,
    permission: { resource: 'users', action: 'manage' },
  },
];
const footerPlatformAdminItem: NavigationItem = {
  title: 'Platform Admin',
  url: '/thanos',
  icon: Shield,
};

const AppSidebar: React.FC = () => {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [showInvoiceSoon, setShowInvoiceSoon] = React.useState(false);
  const totalUnreadCount = useTotalUnreadCount();
  const { data: entitlements } = useEntitlements();

  const { data: userRoleData } = useUserRole();
  const role = userRoleData && 'role' in userRoleData ? userRoleData.role : null;
  const isAdmin = role === 'superadmin' || role === 'admin';
  const { data: isPlatformAdmin = false } = usePlatformAdmin();

  const filteredMainNav = React.useMemo(() => {
    return mainNavItems.filter((item) => {
      if (item.url === '/invoices' && !isAdmin) return false;
      return true;
    });
  }, [isAdmin]);

  const isActive = React.useCallback(
    (path: string, end?: boolean) => {
      if (end) return location.pathname === path;
      return location.pathname.startsWith(path);
    },
    [location.pathname]
  );

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out', { description: 'You have been successfully signed out.' });
      navigate('/auth', { replace: true });
    } catch {
      toast.error('Error', { description: 'Failed to sign out. Please try again.' });
    }
  };

  const NavItemWithPermission = React.forwardRef<HTMLLIElement, { item: NavigationItem }>(
    ({ item }, ref) => {
      const hasAccess = useCanPerformAction(
        item.permission?.resource || 'cases',
        item.permission?.action || 'read'
      );
      if (item.permission && !hasAccess) return null;
      return <NavItemContent item={item} ref={ref} />;
    }
  );
  NavItemWithPermission.displayName = 'NavItemWithPermission';

  const NavItemContent = React.forwardRef<HTMLLIElement, { item: NavigationItem }>(
    ({ item }, ref) => {
      const active = isActive(item.url, item.end);
      const isLiveChat = item.url === '/live-chat';
      // Lock gated items the org's plan doesn't include (only once entitlements
      // have loaded, to avoid a flash of lock on first paint). The page itself
      // shows the upgrade screen; the lock is just the signal in the nav.
      const locked =
        !!item.feature && !!entitlements && !entitlements.features.includes(item.feature);

      const linkClass = cn(
        'flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[15px] transition-all duration-150',
        collapsed && 'justify-center px-0 gap-0',
        active
          ? 'font-semibold text-primary bg-primary/8'
          : 'font-normal text-muted-foreground hover:text-foreground hover:bg-muted/50'
      );

      const iconClass = cn(
        'h-5 w-5 flex-shrink-0',
        active ? 'text-primary' : 'text-muted-foreground/60'
      );

      const content = (
        <SidebarMenuItem ref={ref} key={item.url}>
          <SidebarMenuButton
            asChild
            isActive={active}
            className={cn('h-10 px-0', collapsed && 'justify-center')}
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
              {!collapsed && locked ? (
                <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground/70" />
              ) : !collapsed && isLiveChat && totalUnreadCount > 0 ? (
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

      if (!item.permission) return content;

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
      <Sidebar variant="sidebar" collapsible="icon" className="h-full border-none bg-transparent">
        {/* Logo */}
        <SidebarHeader className="px-5 pt-5 pb-4">
          <div className="flex items-center justify-start w-full">
            <KourtiKLogo size="md" className="max-w-full" />
          </div>
        </SidebarHeader>

        <SidebarContent className="flex h-full flex-col px-3 py-0">
          {/* Main navigation - flat list */}
          <div className="flex-1 overflow-y-auto">
            <SidebarGroup className="p-0">
              <SidebarGroupContent>
                <SidebarMenu className="space-y-0.5">
                  {filteredMainNav.map((item) => (
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
          </div>

          {/* Footer */}
          <div className="mt-auto pt-3 pb-4 space-y-0.5">
            <SidebarMenu className="space-y-0.5">
              <Tooltip disableHoverableContent={!collapsed}>
                <TooltipTrigger asChild>
                  <NavItemContent item={footerSettingsItem} />
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right">{footerSettingsItem.title}</TooltipContent>
                )}
              </Tooltip>

              {isAdmin &&
                footerAdminItems.map((item) => (
                  <Tooltip key={item.url} disableHoverableContent={!collapsed}>
                    <TooltipTrigger asChild>
                      <NavItemWithPermission item={item} />
                    </TooltipTrigger>
                    {collapsed && <TooltipContent side="right">{item.title}</TooltipContent>}
                  </Tooltip>
                ))}

              {isPlatformAdmin && (
                <Tooltip disableHoverableContent={!collapsed}>
                  <TooltipTrigger asChild>
                    <NavItemContent item={footerPlatformAdminItem} />
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right">{footerPlatformAdminItem.title}</TooltipContent>
                  )}
                </Tooltip>
              )}

              {/* Logout - same style as other nav items */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn('h-10 px-0', collapsed && 'justify-center')}
                >
                  <button
                    onClick={handleSignOut}
                    className={cn(
                      'flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-normal text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-muted/50',
                      collapsed && 'justify-center px-0 gap-0'
                    )}
                  >
                    <LogOut className="h-5 w-5 flex-shrink-0 text-muted-foreground/60" />
                    {!collapsed && <span>Logout</span>}
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </SidebarContent>
      </Sidebar>
    </TooltipProvider>
  );
};

export { AppSidebar };
