import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  ChevronRight,
  Menu,
  LogOut,
  Receipt,
  Bot,
  Gauge,
  Mic,
  LucideIcon
} from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { Resource, Action } from "@/hooks/usePermissions";

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
} from "@/components/ui/sidebar";
import { useUserRole } from "@/hooks/useUserManagement";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import logo from "@/assets/kourti-legal-logo.png";
import { cn } from "@/lib/utils";

// Sidebar navigation type definition
type NavigationItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  // Optional permission required to show the item
  permission?: { resource: Resource; action: Action };
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

// Primary navigation items
const primaryNavigation: NavigationGroup = {
  label: "Main",
  items: [
    { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
    { title: "Cases", url: "/cases", icon: Briefcase, permission: { resource: 'cases', action: 'read' } },
    { title: "Clients", url: "/clients", icon: UserCheck, permission: { resource: 'clients', action: 'read' } },
    { title: "Calendar", url: "/calendar", icon: Calendar, permission: { resource: 'calendars', action: 'read' } },
  ]
};

// Documents and contracts group
const documentsNavigation: NavigationGroup = {
  label: "Legal Documents",
  items: [
    { title: "Documents", url: "/documents", icon: FileText, permission: { resource: 'documents', action: 'read' } },
    { title: "Contracts", url: "/contracts", icon: FileCheck, permission: { resource: 'contracts', action: 'read' } },
  ]
};

// Tools navigation
const toolsNavigation: NavigationGroup = {
  label: "Tools",
  items: [
    {
      title: "Ream AI",
      url: "/ream-ai",
      icon: Bot,
      badge: "New",
      badgeVariant: "default",
      permission: { resource: 'documents', action: 'read' }
    },
    {
      title: "Voice Recorder",
      url: "/voice-recorder",
      icon: Mic,
      badge: "New",
      badgeVariant: "default",
      permission: { resource: 'documents', action: 'create' }
    },
    {
      title: "Transcriptions",
      url: "/transcriptions",
      icon: FileText,
      permission: { resource: 'documents', action: 'read' }
    },
    {
      title: "Invoicing",
      url: "/invoices",
      icon: Receipt,
      badge: "Soon",
      badgeVariant: "outline",
      permission: { resource: 'invoices', action: 'read' }
    }
  ]
};

// Management items
const managementNavigation: NavigationGroup = {
  label: "Management",
  items: [
    { title: "Users", url: "/users", icon: Users, permission: { resource: 'users', action: 'manage' } },
    { title: "Analytics", url: "/analytics", icon: Gauge, permission: { resource: 'cases', action: 'manage' } },
    { title: "Settings", url: "/settings", icon: Settings, permission: { resource: 'settings', action: 'manage' } },
  ]
};

// This section was removed as requested

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const userInitials = user?.email?.slice(0, 2).toUpperCase() || 'U';
  const summaryDate = React.useMemo(
    () => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()),
    []
  );
  const summaryTime = React.useMemo(
    () => new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
    []
  );

  // Determine if path is active
  const isActive = (path: string, end = false) => {
    if (end) return currentPath === path;
    return currentPath.startsWith(path);
  };

  // Handle sign out
  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
      navigate("/auth", { replace: true });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to sign out. Please try again.",
      });
    }
  };

  // Check user role
  const { data: userRoleData } = useUserRole();
  const role = userRoleData && 'role' in userRoleData ? userRoleData.role : null;
  const isAdmin = role === "superadmin" || role === "admin";
  
  // Filter navigation items based on role
  const getFilteredNavigation = () => {
    // Always include primary and documents navigation
    const navigation = [primaryNavigation, documentsNavigation];
    
    // Create a filtered tools navigation based on role
    const filteredTools = {
      ...toolsNavigation,
      items: toolsNavigation.items.filter(item => {
        // Only show invoicing to admins
        if (item.url === "/invoices" && !isAdmin) {
          return false;
        }
        return true;
      })
    };
    
    // Add filtered tools
    if (filteredTools.items.length > 0) {
      navigation.push(filteredTools);
    }
    
    // Only add management for admins
    if (isAdmin) {
      navigation.push(managementNavigation);
    } else {
      // For non-admins, just add settings
      navigation.push({
        label: "Management",
        items: [managementNavigation.items.find(item => item.url === "/settings")!]
      });
    }
    
    // Support navigation removed as requested
    
    return navigation;
  };
  
  const navigationGroups = getFilteredNavigation();

// Render a navigation item
  const [showInvoiceSoon, setShowInvoiceSoon] = React.useState(false);

  const renderNavItem = (item: NavigationItem) => {
    const core = () => {
      if (item.url === "/invoices") {
        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              className={cn(
                "relative flex h-11 cursor-pointer items-center rounded-xl border border-dashed border-primary/30 px-3 text-sm font-semibold text-primary shadow-sm",
                collapsed && "justify-center px-0"
              )}
              onClick={(e) => {
                e.preventDefault();
                setShowInvoiceSoon(true);
              }}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="ml-3">{item.title}</span>
                  <span className="ml-auto">
                    <Badge variant={item.badgeVariant} className="text-[10px]">
                      {item.badge}
                    </Badge>
                  </span>
                </>
              )}
              {collapsed && item.badge && (
                <Badge
                  variant={item.badgeVariant}
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full p-0 text-[10px]"
                >
                  {item.badge}
                </Badge>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      }

      const active = isActive(item.url, item.end);

      const buttonClass = cn(
        "group relative flex h-11 items-center rounded-xl border border-transparent px-2 text-sm font-medium transition-all duration-200",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "border-primary/30 bg-[hsl(var(--primary))/0.08] text-foreground shadow-sm"
          : "text-muted-foreground hover:border-primary/20 hover:bg-[hsl(var(--primary))/0.04] hover:text-foreground"
      );

      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild className={buttonClass} isActive={active}>
            <NavLink
              to={item.url}
              end={item.end}
              className={cn("flex w-full items-center", collapsed ? "justify-center" : "gap-3")}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {item.badge && (
                      <Badge variant={item.badgeVariant} className="text-[10px]">
                        {item.badge}
                      </Badge>
                    )}
                    {active && <ChevronRight className="h-4 w-4 text-primary" />}
                  </span>
                </>
              )}
              {collapsed && item.badge && (
                <Badge
                  variant={item.badgeVariant}
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full p-0 text-[10px]"
                >
                  {item.badge}
                </Badge>
              )}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    };

    const content = core();

    if (!item.permission) {
      return content;
    }

    return (
      <PermissionGate resource={item.permission.resource} action={item.permission.action} fallback={null}>
        {content}
      </PermissionGate>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
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
      <Sidebar variant="sidebar" collapsible="icon" className="h-full bg-transparent text-foreground">
        <SidebarHeader className="relative border-none px-4 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-[hsl(var(--primary))/0.08]">
              <img src={logo} alt="Kourti Legal" className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold text-foreground">Kourti Legal</h2>
                <p className="text-xs text-muted-foreground/80">Matter Workspace</p>
              </div>
            )}
          </div>

          {!collapsed && (
            <div className="mt-4 space-y-2 rounded-xl border border-dashed border-border/60 bg-[hsl(var(--surface))]/70 px-3 py-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                <span>{summaryDate}</span>
                <span>{summaryTime}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                Stay ahead of filings and client updates today.
              </p>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-[hsl(var(--surface))] text-muted-foreground shadow-sm hover:border-primary/50 hover:text-foreground md:hidden"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </SidebarHeader>

        <SidebarContent
          className="max-h-[100dvh] overflow-y-auto px-3 pb-6 pt-3 sm:px-4 scrollbar-thin scrollbar-thumb-muted-foreground/30"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {navigationGroups.map((group) => (
            <SidebarGroup key={group.label} className="mt-1.5">
              <SidebarGroupLabel className={collapsed ? "sr-only" : "mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70"}>
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1.5">
                  {group.items.map(item => {
                    const renderedItem = renderNavItem(item);
                    if (!renderedItem) {
                      return null;
                    }

                    return (
                      <Tooltip key={item.title}>
                        <TooltipTrigger asChild>
                          {renderedItem}
                        </TooltipTrigger>
                        {collapsed && (
                          <TooltipContent side="right">
                            {item.title}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          <div className="mt-auto pt-4">
            <Separator className="mb-3 bg-border/60" />
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSignOut}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-[hsl(var(--surface))] text-muted-foreground shadow-sm hover:border-destructive/50 hover:text-destructive"
                    aria-label="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign Out</TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-[hsl(var(--surface))]/70 px-3 py-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user?.user_metadata?.avatar_url} />
                  <AvatarFallback>{userInitials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{user?.user_metadata?.name || user?.email}</p>
                  <p className="text-[11px] text-muted-foreground/70">Signed in</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </SidebarContent>
      </Sidebar>
    </TooltipProvider>
  );
}
