import { useEffect, useState } from 'react';
import { logWarn } from '@/lib/logger';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { getSession, initSession } from '@/lib/authClient';
import { invokeNodeApi } from '@/lib/backendApi';
import { AppLogo } from '@/components/ui/AppLogo';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [statusMessage, setStatusMessage] = useState('Finishing your sign-in...');

  useEffect(() => {
    let isMounted = true;

    const finalizeAuth = async () => {
      try {
        // With custom JWT auth, the callback may carry a code or token in the URL.
        // Attempt to initialize the session (uses httpOnly refresh cookie).
        await initSession();

        const session = getSession();
        const sessionUser = session?.user;
        if (!sessionUser) {
          throw new Error('No active session found. Please sign in again.');
        }

        setStatusMessage('Checking your workspace...');

        // Check for pending invitation and apply it if exists (async, non-blocking)
        try {
          await invokeNodeApi('/api/v1/invitations/check-and-apply', {
            method: 'POST',
            body: {
              p_user_id: sessionUser.id,
              p_email: sessionUser.email || '',
            },
          });
        } catch (inviteError) {
          // Non-critical - log but don't block
          logWarn('Error checking invitation', { inviteError });
        }

        const profile = await invokeNodeApi<{ organization_id: string | null }>(
          '/api/v1/profiles/me'
        );

        if (!isMounted) return;

        if (profile?.organization_id) {
          navigate('/dashboard', { replace: true });
        } else {
          navigate('/onboarding', { replace: true });
        }
      } catch (error: unknown) {
        if (!isMounted) return;
        const errorMessage =
          error instanceof Error ? error.message : 'Unable to complete sign-in. Please try again.';
        toast.error('Sign-in failed', { description: errorMessage });
        navigate('/auth', { replace: true });
      }
    };

    finalizeAuth();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Almost there</CardTitle>
            <p className="text-muted-foreground mt-2">{statusMessage}</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Please wait while we prepare your account.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
