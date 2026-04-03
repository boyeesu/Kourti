/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logError, logInfo } from '@/lib/logger';
import {
  initSession,
  signIn as authSignIn,
  signUp as authSignUp,
  signOut as authSignOut,
  resetPassword as authResetPassword,
  onAuthStateChange,
  type AuthSession,
  type AuthError as AuthClientError,
} from '@/lib/authClient';
import { trackEvent, AnalyticsEvents, identifyUser, resetAnalytics } from '@/lib/analytics';

// ── Compatibility types ─────────────────────────────────────────────────────
// These match the shape that the rest of the app expects from useAuth().
// We map our custom auth user to this shape so existing pages/hooks don't break.

interface User {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

interface Session {
  access_token: string;
  refresh_token?: string;
  user: User;
}

interface AuthError {
  message: string;
  code?: string;
}

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
  signUp: (
    email: string,
    password: string,
    userData?: UserData
  ) => Promise<{ error: AuthError | null; success: boolean }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null; success: boolean }>;
  signInWithProvider: (
    provider: 'google' | 'microsoft',
    email?: string
  ) => Promise<{ error: AuthError | null; success: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null; success: boolean }>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toUser(session: AuthSession | null): User | null {
  if (!session) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    user_metadata: {
      first_name: session.user.firstName,
      last_name: session.user.lastName,
    },
    app_metadata: {
      organization_id: session.user.organizationId,
    },
  };
}

function toSession(session: AuthSession | null): Session | null {
  if (!session) return null;
  return {
    access_token: session.accessToken,
    user: toUser(session)!,
  };
}

function toAuthError(err: AuthClientError | null): AuthError | null {
  if (!err) return null;
  return { message: err.message, code: err.code };
}

// ── Context ─────────────────────────────────────────────────────────────────

// Preserve context reference across Vite HMR
const AUTH_CONTEXT_KEY = Symbol.for('kouti-auth-context');
const AuthContext: React.Context<AuthContextType | undefined> =
  (globalThis as any)[AUTH_CONTEXT_KEY] ??
  ((globalThis as any)[AUTH_CONTEXT_KEY] = createContext<AuthContextType | undefined>(undefined));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    // Listen for auth state changes (sign in, sign out, token refresh)
    const unsubscribe = onAuthStateChange((event, authSession) => {
      if (!mounted) return;

      logInfo('Auth state change', { event, hasSession: Boolean(authSession) });

      setUser(toUser(authSession));
      setSession(toSession(authSession));

      if (event === 'SIGNED_IN' && authSession) {
        identifyUser(authSession.user.id);
        trackEvent(AnalyticsEvents.LOGIN);
      }

      if (event === 'SIGNED_OUT') {
        trackEvent(AnalyticsEvents.LOGOUT);
        resetAnalytics();
      }
    });

    // Initialize session from persisted storage / refresh token
    initSession()
      .then((authSession) => {
        if (!mounted) return;
        setUser(toUser(authSession));
        setSession(toSession(authSession));
        setLoading(false);
      })
      .catch((error) => {
        if (!mounted) return;
        logError('Session init failed', { error });
        setLoading(false);
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, userData?: UserData) => {
    try {
      const { session: authSession, error } = await authSignUp(email, password, {
        firstName: userData?.first_name,
        lastName: userData?.last_name,
      });

      if (error) {
        return { error: toAuthError(error)!, success: false };
      }

      logInfo('Sign up successful', { email });
      trackEvent(AnalyticsEvents.SIGNUP);

      setUser(toUser(authSession));
      setSession(toSession(authSession));

      return { error: null, success: true };
    } catch (error) {
      logError('Sign up error', { error });
      return {
        error: { message: 'An unexpected error occurred during sign up.' },
        success: false,
      };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { session: authSession, error } = await authSignIn(email, password);

      if (error) {
        return { error: toAuthError(error)!, success: false };
      }

      setUser(toUser(authSession));
      setSession(toSession(authSession));

      return { error: null, success: true };
    } catch (error) {
      logError('Sign in error', { error });
      return {
        error: { message: 'An unexpected error occurred during sign in.' },
        success: false,
      };
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const signInWithProvider = async (_provider: 'google' | 'microsoft', _email?: string) => {
    // SSO via OAuth providers is not yet implemented in custom auth mode.
    // This can be added later with a custom OAuth flow.
    return {
      error: { message: 'Single sign-on is not available yet. Please use email and password.' },
      success: false,
    };
  };

  const signOutHandler = async () => {
    try {
      queryClient.cancelQueries();
      queryClient.clear();
      await authSignOut();
      setUser(null);
      setSession(null);
    } catch (error) {
      logError('Sign out error', { error });
    }
  };

  const resetPasswordHandler = async (email: string) => {
    try {
      const { error } = await authResetPassword(email);
      if (error) {
        return { error: toAuthError(error)!, success: false };
      }
      return { error: null, success: true };
    } catch (error) {
      logError('Reset password error', { error });
      return {
        error: { message: 'An unexpected error occurred during password reset.' },
        success: false,
      };
    }
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut: signOutHandler,
    signInWithProvider,
    resetPassword: resetPasswordHandler,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Safe no-op fallback used during Vite HMR tree rebuilds
const noopAsync = async () => ({ error: null as any, success: false });
const HMR_FALLBACK: AuthContextType = {
  user: null,
  session: null,
  loading: true,
  signUp: noopAsync,
  signIn: noopAsync,
  signOut: async () => {},
  signInWithProvider: noopAsync,
  resetPassword: noopAsync,
};

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    if (import.meta.env.DEV) {
      return HMR_FALLBACK;
    }
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
