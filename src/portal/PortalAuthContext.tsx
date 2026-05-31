/**
 * Client Portal auth context. Isolated from the staff `useAuth` context.
 * Hydrates from stored portal tokens via GET /me on mount.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  portalGetMe,
  portalLogin,
  portalVerifyOtp,
  portalResendOtp,
  portalLogout,
  clearPortalTokens,
  ensurePortalSession,
  setPortalTokens,
  type PortalAuthUser,
  type PortalResendOtpResponse,
} from './portalApi';

/**
 * Outcome of a login attempt. On success the client is signed in. When the firm
 * requires a one-time code, `otpRequired` carries the short-lived `otpToken`
 * plus a masked `emailHint` so the UI can drive the second step.
 */
interface PortalLoginResult {
  error: string | null;
  success: boolean;
  otpRequired: { otpToken: string; otpTokenExpiresIn: number; emailHint: string } | null;
}

interface PortalVerifyResult {
  error: string | null;
  success: boolean;
}

interface PortalAuthContextType {
  client: PortalAuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<PortalLoginResult>;
  /** Complete the OTP step started by `login`. On success the client is signed in. */
  verifyOtp: (otpToken: string, code: string) => Promise<PortalVerifyResult>;
  /** Resend the OTP code for the in-flight login. */
  resendOtp: (otpToken: string) => Promise<PortalResendOtpResponse>;
  logout: () => Promise<void>;
  /** Re-hydrate the current client from /me (e.g. after invite acceptance). */
  refresh: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextType | undefined>(undefined);

export function PortalAuthProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<PortalAuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async () => {
    // On page reload the in-memory access token is gone; re-establish it from
    // the tab-scoped refresh token (sessionStorage) before calling /me.
    const recovered = await ensurePortalSession();
    if (!recovered) {
      setClient(null);
      setLoading(false);
      return;
    }
    try {
      const me = await portalGetMe();
      setClient(me);
    } catch {
      clearPortalTokens();
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await hydrate();
      if (!mounted) return;
    })();
    return () => {
      mounted = false;
    };
  }, [hydrate]);

  const login = useCallback(async (email: string, password: string): Promise<PortalLoginResult> => {
    try {
      const res = await portalLogin(email, password);
      if (res.kind === 'otp_required') {
        return {
          error: null,
          success: false,
          otpRequired: {
            otpToken: res.otpToken,
            otpTokenExpiresIn: res.otpTokenExpiresIn,
            emailHint: res.emailHint,
          },
        };
      }
      setPortalTokens(res);
      setClient(res.user);
      return { error: null, success: true, otpRequired: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in. Please try again.';
      return { error: message, success: false, otpRequired: null };
    }
  }, []);

  const verifyOtp = useCallback(
    async (otpToken: string, code: string): Promise<PortalVerifyResult> => {
      try {
        const res = await portalVerifyOtp(otpToken, code);
        setPortalTokens(res);
        setClient(res.user);
        return { error: null, success: true };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'That code did not work. Please try again.';
        return { error: message, success: false };
      }
    },
    []
  );

  const resendOtp = useCallback(
    (otpToken: string): Promise<PortalResendOtpResponse> => portalResendOtp(otpToken),
    []
  );

  const logout = useCallback(async () => {
    await portalLogout();
    clearPortalTokens();
    setClient(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await hydrate();
  }, [hydrate]);

  const value: PortalAuthContextType = {
    client,
    loading,
    login,
    verifyOtp,
    resendOtp,
    logout,
    refresh,
  };

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePortalAuth(): PortalAuthContextType {
  const ctx = useContext(PortalAuthContext);
  if (ctx === undefined) {
    throw new Error('usePortalAuth must be used within a PortalAuthProvider');
  }
  return ctx;
}
