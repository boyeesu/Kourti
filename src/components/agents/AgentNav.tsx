import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Bot, LayoutDashboard, Bell, ShieldCheck } from 'lucide-react';

const navItems = [
  { label: 'Jobs', href: '/agents', icon: Bot },
  { label: 'Dashboard', href: '/agents/dashboard', icon: LayoutDashboard },
  { label: 'Monitors', href: '/agents/monitors', icon: Bell },
  { label: 'Approvals', href: '/agents/approvals', icon: ShieldCheck },
];

export function AgentNav() {
  const { pathname } = useLocation();

  return (
    <nav className="flex gap-1 border-b pb-px">
      {navItems.map(({ label, href, icon: Icon }) => {
        const active = href === '/agents' ? pathname === '/agents' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            to={href}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md transition-colors',
              active
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
