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
import {
  BarChart3,
  Building2,
  Users,
  LogOut,
  Home,
  Crown,
  CreditCard,
  Activity,
  Mail,
  ScrollText,
  BookOpen,
  UserCog,
  Layers,
  Workflow,
  Gauge,
  Eye,
  Briefcase,
  Inbox,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminCapabilities, type AdminCapability } from '@/hooks/useAdminCapabilities';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Capability required to see this item. Omit = visible to all platform staff. */
  cap?: AdminCapability;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: 'Platform Admin',
    items: [
      { title: 'Overview', url: '/thanos', icon: BarChart3 },
      { title: 'Organizations', url: '/thanos/organizations', icon: Building2 },
      { title: 'Users', url: '/thanos/users', icon: Users },
      { title: 'Analytics', url: '/thanos/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Billing',
    items: [
      { title: 'Plans', url: '/thanos/plans', icon: Crown, cap: 'billing.manage' },
      {
        title: 'Subscriptions',
        url: '/thanos/subscriptions',
        icon: CreditCard,
        cap: 'billing.manage',
      },
      { title: 'Billing Ops', url: '/thanos/billing-ops', icon: CreditCard, cap: 'billing.manage' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { title: 'Org Usage', url: '/thanos/usage', icon: Gauge },
      { title: 'System Health', url: '/thanos/health', icon: Activity },
      { title: 'Marketing Leads', url: '/thanos/leads', icon: Inbox },
      { title: 'Email Log', url: '/thanos/email', icon: Mail },
      { title: 'Audit Log', url: '/thanos/audit', icon: ScrollText },
    ],
  },
  {
    label: 'Management',
    items: [
      { title: 'Bulk Ops', url: '/thanos/bulk-ops', icon: Layers, cap: 'users.manage' },
      { title: 'Client Portal', url: '/thanos/client-portal', icon: UserCog, cap: 'users.manage' },
      {
        title: 'Impersonation',
        url: '/thanos/impersonation',
        icon: Eye,
        cap: 'impersonate.read',
      },
      {
        title: 'Knowledge Base',
        url: '/thanos/knowledge-base',
        icon: BookOpen,
        cap: 'content.manage',
      },
      {
        title: 'Lifecycle Rules',
        url: '/thanos/lifecycle-rules',
        icon: Workflow,
        cap: 'rules.manage',
      },
      { title: 'Case Types', url: '/thanos/case-types', icon: Briefcase },
    ],
  },
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

  const { has, isLoading: capsLoading } = useAdminCapabilities();
  // While capabilities load, show everything (the route guards still apply);
  // once loaded, hide items the staff member lacks the capability for.
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.cap || capsLoading || has(item.cap)),
    }))
    .filter((section) => section.items.length > 0);

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
          {visibleSections.map((section) => (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {section.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-0.5">
                  {section.items.map((item) => {
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
          ))}
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
