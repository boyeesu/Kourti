import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logError, logInfo } from '@/lib/logger';
import { env } from '@/lib/env';
import { getAuthRedirectUrl } from '@/utils/auth-helpers';

interface UserData {
  first_name?: string;
  last_name?: string;
  email: string;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, userData?: UserData) => Promise<{
    error: AuthError | null;
    success: boolean;
  }>;
  signIn: (email: string, password: string) => Promise<{
    error: AuthError | null;
    success: boolean;
  }>;
  signInWithProvider: (provider: 'google' | 'microsoft', email?: string) => Promise<{
    error: AuthError | null;
    success: boolean;
  }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{
    error: AuthError | null;
    success: boolean;
  }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        logInfo('Auth state change detected', { event, hasSession: Boolean(currentSession) });
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession }, error }) => {
      if (error) {
        logError('Error retrieving existing session', { error });
      }
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    }).catch((error) => {
      logError('Session check failed', { error });
      setLoading(false);
    });

    return () => {
      // Clean up subscription when component unmounts
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, userData?: UserData) => {
    try {
      // Use origin + path as redirect URL for better UX
      const redirectUrl = getAuthRedirectUrl('/auth/confirm', env.APP_URL);

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            first_name: userData?.first_name || '',
            last_name: userData?.last_name || '',
            email: email,
            ...userData
          }
        }
      });
      
      return { 
        error, 
        success: !error 
      };
    } catch (error) {
      logError('Sign up error', { error });
      return {
        error: new AuthError('An unexpected error occurred during sign up.'),
        success: false
      };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      return {
        error,
        success: !error
      };
    } catch (error) {
      logError('Sign in error', { error });
      return {
        error: new AuthError('An unexpected error occurred during sign in.'),
        success: false
      };
    }
  };

  const signInWithProvider = async (provider: 'google' | 'microsoft', email?: string) => {
    try {
      const organizationId = typeof window !== 'undefined'
        ? window.sessionStorage.getItem('auth:selected_organization_id') ?? undefined
        : undefined;

      const dryRunPayload = {
        provider,
        email,
        organization_id: organizationId,
        dry_run: true,
      };

      const { data: dryRunData, error: dryRunError } = await supabase.functions.invoke('sso-authorize', {
        body: dryRunPayload,
      });

      if (dryRunError) {
        logError('SSO dry run failed', { provider, error: dryRunError });
        return {
          error: new AuthError('Single sign-on is temporarily unavailable. Please try again later or use your password.'),
          success: false,
        };
      }

      if (!dryRunData?.available) {
        logInfo('SSO provider not available for request', { provider, email, organizationId });
        return {
          error: new AuthError('Single sign-on is not configured for this account.'),
          success: false,
        };
      }

      const redirectTo = (() => {
        try {
          if (typeof dryRunData?.redirect_to === 'string' && dryRunData.redirect_to.length) {
            return dryRunData.redirect_to;
          }
          return getAuthRedirectUrl('/auth/callback', env.APP_URL);
        } catch (redirectError) {
          logError('Failed to compute SSO redirect URL', { redirectError });
          return env.APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
        }
      })();

      if (dryRunData.mode === 'supabase_managed') {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: provider as any,
          options: {
            redirectTo,
            queryParams: email ? { login_hint: email } : undefined,
          },
        });

        if (error) {
          logError('Supabase-managed OAuth sign-in failed', { provider, error });
          return {
            error: error as AuthError,
            success: false,
          };
        }

        if (data?.url && typeof window !== 'undefined') {
          window.location.assign(data.url);
        }

        return {
          error: null,
          success: true,
        };
      }

      const { data, error } = await supabase.functions.invoke('sso-authorize', {
        body: {
          provider,
          email,
          organization_id: organizationId,
          redirect_to: redirectTo,
        },
      });

      if (error) {
        logError('Failed to initiate organization-scoped SSO', { provider, error });
        return {
          error: new AuthError('Unable to start single sign-on. Please contact your administrator.'),
          success: false,
        };
      }

      const authorizationUrl = data?.authorization_url ?? data?.authorizationUrl;
      if (!authorizationUrl) {
        logError('SSO authorize function did not return a redirect URL', { provider, data });
        return {
          error: new AuthError('Single sign-on misconfiguration detected. Please use password login.'),
          success: false,
        };
      }

      if (typeof window !== 'undefined') {
        window.location.assign(authorizationUrl);
      }

      return {
        error: null,
        success: true,
      };
    } catch (error) {
      logError('Sign in with SSO provider failed', { provider, error });
      return {
        error: new AuthError('Unable to start single sign-on. Please try again later.'),
        success: false,
      };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      logError('Sign out error', { error });
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const redirectUrl = getAuthRedirectUrl('/auth/reset-password', env.APP_URL);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      return {
        error,
        success: !error
      };
    } catch (error) {
      logError('Reset password error', { error });
      return {
        error: new AuthError('An unexpected error occurred during password reset.'),
        success: false
      };
    }
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    signInWithProvider,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}