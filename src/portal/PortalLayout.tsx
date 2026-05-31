import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppLogo } from '@/components/ui/AppLogo';
import { usePortalAuth } from './PortalAuthContext';

/**
 * Minimal, calm branded shell for the client portal. Top bar with the Kourti
 * logo, the signed-in client's name/email, and a sign-out button.
 */
export function PortalLayout({ children }: { children: React.ReactNode }) {
  const { client, logout } = usePortalAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logout();
    navigate('/portal/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="flex items-center gap-3"
            aria-label="Go to your matters"
          >
            <AppLogo size="sm" />
            <span className="hidden text-sm font-medium text-foreground sm:inline">
              Client Portal
            </span>
          </button>

          <div className="flex items-center gap-3">
            {client && (
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight text-foreground">
                  {client.fullName || client.email}
                </p>
                {client.fullName && (
                  <p className="text-xs leading-tight text-muted-foreground">{client.email}</p>
                )}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
