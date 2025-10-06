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

// Sidebar navigation type definition
type NavigationItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  // Permission required to show the item (defaults to { resource, action: 'read' })
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
    { title: "Clients", url: "/clients", icon: UserCheck },
    { title: "Calendar", url: "/calendar", icon: Calendar },
  ]
};

// Documents and contracts group
const documentsNavigation: NavigationGroup = {
  label: "Legal Documents",
  items: [
    { title: "Documents", url: "/documents", icon: FileText },
    { title: "Contracts", url: "/contracts", icon: FileCheck },
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
      badgeVariant: "default" 
    },
    { 
      title: "Voice Recorder", 
      url: "/voice-recorder", 
      icon: Mic, 
      badge: "New", 
      badgeVariant: "default" 
    },
    { 
      title: "Transcriptions", 
      url: "/transcriptions", 
      icon: FileText
    },
    { 
      title: "Invoicing", 
      url: "/invoices", 
      icon: Receipt,
      badge: "Soon",
      badgeVariant: "outline"
    }
  ]
};

// Management items
const managementNavigation: NavigationGroup = {
  label: "Management",
  items: [
    { title: "Users", url: "/users", icon: Users },
    { title: "Analytics", url: "/analytics", icon: Gauge },
    { title: "Settings", url: "/settings", icon: Settings },
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
    const perm = item.permission ?? { resource: item.url.split("/")[1] as Resource, action: "read" as Action };

    const core = () => {
      // Intercept Invoicing (beta banner)
      if (item.url === "/invoices") {
        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              className="relative h-11 cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                setShowInvoiceSoon(true);
              }}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="ml-3 font-medium">{item.title}</span>
                  <Badge variant={item.badgeVariant} className="ml-auto">
                    {item.badge}
                  </Badge>
                </>
              )}
              {collapsed && item.badge && (
                <Badge
                  variant={item.badgeVariant}
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0"
                >
                  {item.badge}
                </Badge>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      }

      const active = isActive(item.url, item.end);

      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild className="relative h-11" isActive={active}>
            <NavLink to={item.url} end={item.end} className="flex w-full items-center">
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="ml-3 font-medium">{item.title}</span>
                  {item.badge && (
                    <Badge variant={item.badgeVariant} className="ml-auto">
                      {item.badge}
                    </Badge>
                  )}
                  {active && <ChevronRight className="ml-auto h-4 w-4 text-primary" />}
                </>
              )}
              {collapsed && item.badge && (
                <Badge
                  variant={item.badgeVariant}
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0"
                >
                  {item.badge}
                </Badge>
              )}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    };

    return (
      <PermissionGate resource={perm.resource} action={perm.action} fallback={null}>
        {core()}
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
      <Sidebar variant="sidebar" collapsible="icon" className="h-full bg-transparent">
        <SidebarHeader className="border-none px-3 py-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Kourti Legal" className="h-6 w-6 flex-shrink-0" />
            {!collapsed && (
              <div>
                <h2 className="text-sm font-semibold text-foreground">Kourti Legal</h2>
                <p className="text-xs text-muted-foreground">Legal Management</p>
              </div>
            )}
          </div>

          {/* Mobile trigger button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-[hsl(var(--surface))] text-muted-foreground shadow-sm hover:border-primary/50 hover:text-foreground md:hidden"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </SidebarHeader>

        <SidebarContent
          className="max-h-[100dvh] overflow-y-auto px-2 pb-6 pt-2 sm:px-3 md:px-4 scrollbar-thin scrollbar-thumb-muted-foreground/30"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {navigationGroups.map((group) => (
            <SidebarGroup key={group.label} className="mt-0.5">
              <SidebarGroupLabel className={collapsed ? "sr-only" : "text-xs font-medium text-muted-foreground px-2 mb-0.5"}>
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-0">
                  {group.items.map(item => (
                    <Tooltip key={item.title}>
                      <TooltipTrigger asChild>
                        {renderNavItem(item)}
                      </TooltipTrigger>
                      {collapsed && (
                        <TooltipContent side="right">
                          {item.title}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          {/* User profile section at bottom */}
          <div className="mt-auto pt-2">
            <Separator className="mb-2 bg-border/60" />
            <div className={`px-1 py-0.5 ${collapsed ? "flex justify-center" : "flex items-center"}`}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-[hsl(var(--surface))] text-muted-foreground hover:border-primary/50 hover:text-foreground" onClick={handleSignOut}>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.user_metadata?.avatar_url} />
                        <AvatarFallback>{userInitials}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    Sign Out
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  className="w-full justify-start rounded-full border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="h-5 w-5 flex-shrink-0" />
                  <span className="ml-3 font-medium">Sign Out</span>
                </Button>
              )}
            </div>
          </div>
        </SidebarContent>
      </Sidebar>
    </TooltipProvider>
  );
}
