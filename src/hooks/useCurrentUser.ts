import { getSession } from '@/lib/authClient';
import { useAuth } from './useAuth';

interface MinimalUser {
  id: string;
  email?: string;
}

let cachedUser: MinimalUser | null = null;

export function clearCurrentUser() {
  cachedUser = null;
}

export function useCurrentUser() {
  const { user } = useAuth();
  return user;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getCurrentUser(_options?: {
  refresh?: boolean;
}): Promise<MinimalUser | null> {
  const session = getSession();
  if (session) {
    cachedUser = { id: session.user.id, email: session.user.email };
    return cachedUser;
  }
  return cachedUser;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getCurrentUserId(_options?: { refresh?: boolean }): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}
