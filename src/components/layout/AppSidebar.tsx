import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
  HelpCircle
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  useSidebar
} from "@/components/ui/sidebar";
import { PermissionGate } from "@/components/PermissionGate";
import { Resource, Action } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserManagement";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/kourti-legal-logo.png";
import { cn } from "@/lib/utils";

// Navigation item type definition
interface NavigationItem {
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  permission?: { resource: Resource; action: Action };
}

interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

const primaryNavigation: NavigationGroup = {
  label: "Main",
  items: [
    { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
    { title: "Cases", url: "/cases", icon: Briefcase, permission: { resource: "cases", action: "read" } },
    { title: "Clients", url: "/clients", icon: UserCheck, permission: { resource: "clients", action: "read" } },
    { title: "Calendar", url: "/calendar", icon: Calendar, permission: { resource: "calendars", action: "read" } }
  ]
};

const documentsNavigation: NavigationGroup = {
  label: "Legal",
  items: [
    { title: "Documents", url: "/documents", icon: FileText, permission: { resource: "documents", action: "read" } },
    { title: "Contracts", url: "/contracts", icon: FileCheck, permission: { resource: "contracts", action: "read" } }
  ]
};

const toolsNavigation: NavigationGroup = {
  label: "Workspace",
  items: [
    {
      title: "Ream AI",
      url: "/ream-ai",
      icon: Bot,
      badge: "New",
      badgeVariant: "default",
      permission: { resource: "documents", action: "read" }
    },
    {
      title: "Voice Recorder",
      url: "/voice-recorder",
      icon: Mic,
      badge: "New",
      badgeVariant: "default",
      permission: { resource: "documents", action: "create" }
    },
    {
      title: "Transcriptions",
      url: "/transcriptions",
      icon: FileText,
      permission: { resource: "documents", action: "read" }
    },
    {
      title: "Invoicing",
      url: "/invoices",
      icon: Receipt,
      badge: "Soon",
      badgeVariant: "outline",
      permission: { resource: "invoices", action: "read" }
    }
  ]
};

const managementNavigation: NavigationGroup = {
  label: "Management",
  items: [
    { title: "Users", url: "/users", icon: Users, permission: { resource: "users", action: "manage" } },
    { title: "Analytics", url: "/analytics", icon: Gauge, permission: { resource: "cases", action: "manage" } },
    { title: "Settings", url: "/settings", icon: Settings, permission: { resource: "settings", action: "manage" } }
  ]
};

const groups = [primaryNavigation, documentsNavigation, toolsNavigation, managementNavigation];

const AppSidebar: React.FC = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const userInitials = user?.email?.slice(0, 2).toUpperCase() || "U";
  const [showInvoiceSoon, setShowInvoiceSoon] = React.useState(false);

  const { data: userRoleData } = useUserRole();
  const role = userRoleData && "role" in userRoleData ? userRoleData.role : null;
  const isAdmin = role === "superadmin" || role === "admin";

  const filteredGroups = React.useMemo(() => {
    return groups
      .map((group) => {
        if (group === toolsNavigation) {
          const filteredItems = group.items.filter((item) => {
            if (item.url === "/invoices" && !isAdmin) {
              return false;
            }
            return true;
          });
          return { ...group, items: filteredItems };
        }
        if (group === managementNavigation && !isAdmin) {
          return {
            label: "Management",
            items: managementNavigation.items.filter((item) => item.url === "/settings")
          };
        }
        return group;
      })
      .filter((group) => group.items.length > 0);
  }, [isAdmin]);

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
        title: "Signed out",
        description: "You have been successfully signed out."
      });
      navigate("/auth", { replace: true });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to sign out. Please try again."
      });
    }
  };

  const renderNavItem = (item: NavigationItem) => {
    const active = isActive(item.url, item.end);

    const linkClass = cn(
      "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
      collapsed && "justify-center px-0 gap-0",
      active
        ? "bg-[hsl(var(--primary))/0.12] text-[hsl(var(--primary))]"
        : "text-muted-foreground hover:bg-[hsl(var(--primary))/0.08] hover:text-foreground"
    );

    const iconClass = cn("h-5 w-5", active ? "text-[hsl(var(--primary))]" : "text-muted-foreground");

    const content = (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild isActive={active} className={cn("h-11 px-0", collapsed && "justify-center")}>
          <NavLink
            to={item.url}
            end={item.end}
            className={linkClass}
            onClick={(event) => {
              if (item.url === "/invoices") {
                event.preventDefault();
                setShowInvoiceSoon(true);
              }
            }}
          >
            <item.icon className={iconClass} />
            {!collapsed && (
              <span className="truncate">{item.title}</span>
            )}
            {!collapsed && item.badge && (
              <Badge variant={item.badgeVariant} className="ml-auto text-[10px]">
                {item.badge}
              </Badge>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

    if (!item.permission) {
      return content;
    }

    return (
      <PermissionGate key={item.url} resource={item.permission.resource} action={item.permission.action} fallback={null}>
        {content}
      </PermissionGate>
    );
  };

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
        <SidebarHeader className="border-b border-[hsl(var(--sidebar-border))] px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--primary))/0.1]">
              <img src={logo} alt="Kourti Legal" className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">Kouti Legal Hub</span>
                <span className="text-xs text-muted-foreground">Admin Console</span>
              </div>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent className="flex h-full flex-col px-3 py-4">
          <div className="flex-1 space-y-5">
            {filteredGroups.map((group) => (
              <SidebarGroup key={group.label}>
                {!collapsed && (
                  <SidebarGroupLabel className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {group.label}
                  </SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1">
                    {group.items.map((item) => (
                      <Tooltip key={item.url} disableHoverableContent={!collapsed}>
                        <TooltipTrigger asChild>{renderNavItem(item)}</TooltipTrigger>
                        {collapsed && (
                          <TooltipContent side="right">{item.title}</TooltipContent>
                        )}
                      </Tooltip>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </div>

          <div className="mt-auto space-y-3 border-t border-[hsl(var(--sidebar-border))] pt-3">
            {!collapsed && (
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-lg border border-transparent px-3 py-2 text-sm text-muted-foreground hover:border-[hsl(var(--primary))/0.25] hover:bg-[hsl(var(--primary))/0.08] hover:text-foreground"
                onClick={() => navigate("/help-center")}
              >
                <HelpCircle className="h-4 w-4" />
                Help Center
              </Button>
            )}
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
