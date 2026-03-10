import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { KourtiKLogo } from '@/components/ui/KourtiKLogo';
import { BarChart3, Building2, Users, LogOut, Home, Crown, CreditCard } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navigation: NavItem[] = [
  { title: 'Overview', url: '/thanos', icon: BarChart3 },
  { title: 'Organizations', url: '/thanos/organizations', icon: Building2 },
  { title: 'Users', url: '/thanos/users', icon: Users },
  { title: 'Plans', url: '/thanos/plans', icon: Crown },
  { title: 'Subscriptions', url: '/thanos/subscriptions', icon: CreditCard },
  { title: 'Analytics', url: '/thanos/analytics', icon: BarChart3 },
];

export function ThanosSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const isActive = (path: string) => {
    if (path === '/thanos') {
      return location.pathname === '/thanos';
    }
    return location.pathname.startsWith(path);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out', {
        description: 'You have been successfully signed out.',
      });
      navigate('/auth', { replace: true });
    } catch {
      toast.error('Error', {
        description: 'Failed to sign out. Please try again.',
      });
    }
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  return (
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
        <div className="flex-1 space-y-3">
          <SidebarGroup>
            <SidebarGroupLabel className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Platform Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className={cn(
                          'w-full justify-start',
                          active && 'bg-sidebar-accent text-sidebar-accent-foreground'
                        )}
                      >
                        <a
                          href={item.url}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(item.url);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
        <div className="space-y-1 border-t border-[hsl(var(--sidebar-border))] pt-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="w-full justify-start">
                <a
                  href="/dashboard"
                  onClick={(e) => {
                    e.preventDefault();
                    handleGoToDashboard();
                  }}
                >
                  <Home className="h-4 w-4" />
                  <span>Go to Dashboard</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleSignOut}
                className="w-full justify-start text-destructive hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
