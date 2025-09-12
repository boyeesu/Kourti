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
import logo from "@/assets/kouti-legal-logo.png";

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

  // Get navigation item class based on active state
  const getNavCls = (path: string, end = false) => {
    const active = isActive(path, end);
    
    return active 
      ? "bg-primary/10 text-primary font-medium hover:bg-primary/15" 
      : "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";
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
              className="h-8 w-full relative text-sm cursor-pointer"
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

      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild className="h-8 w-full relative text-sm">
            <NavLink to={item.url} end={item.end} className={getNavCls(item.url, item.end)}>
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="ml-3 font-medium">{item.title}</span>
                  {item.badge && (
                    <Badge variant={item.badgeVariant} className="ml-auto">
                      {item.badge}
                    </Badge>
                  )}
                  {isActive(item.url, item.end) && <ChevronRight className="h-4 w-4 ml-auto text-primary" />}
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
      <Sidebar variant="sidebar" collapsible="icon" className="h-screen bg-card/30">
        <SidebarHeader className="border-b border-border p-2">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Kouti Legal" className="h-6 w-6 flex-shrink-0" />
            {!collapsed && (
              <div>
                <h2 className="text-sm font-semibold text-foreground">Kouti Legal</h2>
                <p className="text-xs text-muted-foreground">Legal Management</p>
              </div>
            )}
          </div>
          
          {/* Mobile trigger button */}
          <Button
            variant="ghost" 
            size="icon"
            onClick={toggleSidebar}
            className="md:hidden absolute top-2 right-2 h-6 w-6"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </SidebarHeader>

        <SidebarContent
          className="p-1 sm:p-2 md:p-3 overflow-y-auto max-h-[100dvh] scrollbar-thin scrollbar-thumb-muted-foreground/30"
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
          <div className="mt-auto pt-1">
            <Separator className="mb-1" />
            <div className={`px-1 py-0.5 ${collapsed ? "flex justify-center" : "flex items-center"}`}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full" onClick={handleSignOut}>
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
                  className="w-full justify-start px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
