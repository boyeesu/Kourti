import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logError, logInfo } from '@/lib/logger';
import { env } from '@/lib/env';
import { getAuthRedirectUrl } from '@/utils/auth-helpers';
import { invokeFunctionWithCsrf } from '@/lib/csrfClient';

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
      async (event, currentSession) => {
        logInfo('Auth state change detected', { event, hasSession: Boolean(currentSession) });
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        
        // Fetch CSRF token when user signs in
        if (event === 'SIGNED_IN' && currentSession?.access_token) {
          try {
            const { data: csrfData, error: csrfError } = await supabase.functions.invoke('get-csrf-token', {
              headers: {
                Authorization: `Bearer ${currentSession.access_token}`,
              },
            });

            if (!csrfError && csrfData?.csrfToken) {
              sessionStorage.setItem('csrf_token', csrfData.csrfToken);
              logInfo('CSRF token obtained after auth state change');
            }
          } catch (csrfErr) {
            logError('Error fetching CSRF token on auth change', { csrfErr });
          }
        }

        // Clear CSRF token on sign out
        if (event === 'SIGNED_OUT') {
          sessionStorage.removeItem('csrf_token');
        }
        
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
      const redirectUrl = getAuthRedirectUrl('/auth/callback', env.APP_URL);

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
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return {
          error,
          success: false
        };
      }

      // After successful login, fetch CSRF token from server
      if (authData?.session?.access_token) {
        try {
          const { data: csrfData, error: csrfError } = await supabase.functions.invoke('get-csrf-token', {
            headers: {
              Authorization: `Bearer ${authData.session.access_token}`,
            },
          });

          if (!csrfError && csrfData?.csrfToken) {
            // Store CSRF token in sessionStorage
            sessionStorage.setItem('csrf_token', csrfData.csrfToken);
            logInfo('CSRF token obtained after login');
          } else {
            logError('Failed to get CSRF token', { csrfError });
          }
        } catch (csrfErr) {
          logError('Error fetching CSRF token', { csrfErr });
          // Don't fail login if CSRF token fetch fails
        }
      }

      return {
        error: null,
        success: true
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
      const redirectTo = getAuthRedirectUrl('/auth/callback', env.APP_URL);

      // SECURITY FIX: Removed client-side organization selection - now uses ONLY email domain matching
      // Directly initiate SSO flow - the authorize function will check config availability
      const { data, error } = await supabase.functions.invoke('sso-authorize', {
        body: {
          provider,
          email,
          redirect_to: redirectTo,
        },
      });

      if (error) {
        logError('Failed to initiate SSO', { provider, error });
        return {
          error: new AuthError('Single sign-on is not configured for this account. Please use email and password.'),
          success: false,
        };
      }

      const authorizationUrl = data?.authorization_url ?? data?.authorizationUrl;
      if (!authorizationUrl) {
        logError('SSO authorize function did not return authorization URL', { provider, data });
        return {
          error: new AuthError('Single sign-on is not configured for this email domain.'),
          success: false,
        };
      }

      // Redirect to provider for authentication
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
      // Clear CSRF token on sign out
      sessionStorage.removeItem('csrf_token');
      await supabase.auth.signOut();
    } catch (error) {
      logError('Sign out error', { error });
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const redirectUrl = getAuthRedirectUrl('/auth/reset-password', env.APP_URL);
      
      logInfo('Initiating password reset', { 
        email: email.toLowerCase(), 
        redirectUrl 
      });

      // Use Resend-based edge function instead of Supabase's built-in email service
      // Note: Password reset doesn't require CSRF (unauthenticated endpoint)
      // But we'll include it if available for additional security
      const { data, error } = await invokeFunctionWithCsrf('send-password-reset-email', {
        body: {
          email: email.toLowerCase(),
          redirectUrl,
        }
      });

      if (error) {
        logError('Password reset error', { 
          error, 
          email: email.toLowerCase(),
          redirectUrl 
        });
        return {
          error: new AuthError(error.message || 'Failed to send password reset email'),
          success: false
        };
      }

      if (data?.error) {
        logError('Password reset function error', { 
          error: data.error, 
          email: email.toLowerCase(),
          redirectUrl 
        });
        return {
          error: new AuthError(data.error || 'Failed to send password reset email'),
          success: false
        };
      }

      logInfo('Password reset email sent', { 
        email: email.toLowerCase(),
        redirectUrl,
        messageId: data?.messageId
      });

      return {
        error: null,
        success: true
      };
    } catch (error) {
      logError('Reset password exception', { error });
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
