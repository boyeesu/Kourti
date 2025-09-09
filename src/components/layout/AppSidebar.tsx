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
    { title: "Cases", url: "/cases", icon: Briefcase },
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
  const renderNavItem = (item: NavigationItem) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild className="h-10 w-full relative">
        <NavLink 
          to={item.url} 
          end={item.end} 
          className={getNavCls(item.url, item.end)}
        >
          <item.icon className="h-5 w-5 flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="ml-3 font-medium">{item.title}</span>
              
              {/* Badge */}
              {item.badge && (
                <Badge variant={item.badgeVariant} className="ml-auto">
                  {item.badge}
                </Badge>
              )}
              
              {/* Active indicator */}
              {isActive(item.url, item.end) && (
                <ChevronRight className="h-4 w-4 ml-auto text-primary" />
              )}
            </>
          )}
          
          {/* Show badge in collapsed mode */}
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

  return (
    <TooltipProvider delayDuration={300}>
      <Sidebar variant="sidebar" collapsible="icon" className="border-r">
        <SidebarHeader className="border-b border-border h-14 flex items-center px-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Kouti Legal" className="h-8 w-8 flex-shrink-0" />
            {!collapsed && (
              <div>
                <h2 className="text-lg font-semibold text-foreground">Kouti Legal</h2>
                <p className="text-xs text-muted-foreground">Legal Management</p>
              </div>
            )}
          </div>
          
          {/* Mobile trigger button */}
          <Button
            variant="ghost" 
            size="icon"
            onClick={toggleSidebar}
            className="md:hidden absolute top-4 right-4 h-8 w-8"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </SidebarHeader>

        <SidebarContent className="p-1">
          {navigationGroups.map((group) => (
            <SidebarGroup key={group.label} className="mt-1">
              <SidebarGroupLabel className={collapsed ? "sr-only" : "text-xs font-medium text-muted-foreground px-3 mb-1"}>
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-0.5">
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
            <Separator className="mb-2" />
            
            <div className={`px-2 py-1 ${collapsed ? "flex justify-center" : "flex items-center"}`}>
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
