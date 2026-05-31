import { useState, type ComponentType } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, FolderKanban, CalendarDays, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppLogo } from '@/components/ui/AppLogo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn, getInitials } from '@/lib/utils';
import { usePortalAuth } from './PortalAuthContext';

interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Matters',
    to: '/portal',
    icon: FolderKanban,
    isActive: (p) => p === '/portal' || p.startsWith('/portal/matters'),
  },
  {
    label: 'Calendar',
    to: '/portal/calendar',
    icon: CalendarDays,
    isActive: (p) => p.startsWith('/portal/calendar'),
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ClientFooter({ onSignOut }: { onSignOut: () => void }) {
  const { client } = usePortalAuth();
  if (!client) return null;
  return (
    <div className="border-t border-border/60 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
            {getInitials(client.fullName || client.email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight text-foreground">
            {client.fullName || client.email}
          </p>
          {client.fullName && (
            <p className="truncate text-xs leading-tight text-muted-foreground">{client.email}</p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onSignOut}
        className="mt-1 w-full justify-start text-muted-foreground hover:text-foreground"
      >
        <LogOut className="mr-2 h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}

/**
 * Branded shell for the client portal: a persistent left sidebar with the Kourti
 * logo, primary navigation (Matters, Calendar), and the signed-in client. On
 * small screens the sidebar collapses into a slide-over drawer.
 */
export function PortalLayout({ children }: { children: React.ReactNode }) {
  const { logout } = usePortalAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await logout();
    navigate('/portal/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/60 bg-background md:flex">
        <div className="flex h-16 items-center px-5">
          <Link to="/portal" className="flex items-center gap-2" aria-label="Client portal home">
            <AppLogo size="sm" />
            <span className="text-sm font-semibold text-foreground">Client Portal</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks />
        </div>
        <ClientFooter onSignOut={handleSignOut} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-16 items-center px-5">
              <Link
                to="/portal"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2"
              >
                <AppLogo size="sm" />
                <span className="text-sm font-semibold text-foreground">Client Portal</span>
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </div>
            <ClientFooter
              onSignOut={() => {
                setMobileOpen(false);
                void handleSignOut();
              }}
            />
          </SheetContent>
        </Sheet>
        <Link to="/portal" className="flex items-center gap-2">
          <AppLogo size="sm" />
          <span className="text-sm font-semibold text-foreground">Client Portal</span>
        </Link>
      </header>

      <main className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
