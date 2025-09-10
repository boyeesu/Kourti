// src/hooks/useCurrentUser.tsx
import { useAuth } from '@/hooks/useAuth';

export function useCurrentUser() {
  const { user } = useAuth();
  return user;
}

// Simple utility for getting userId (async to match usage in useNotifications)
export async function getCurrentUserId(): Promise<string | null> {
  // Ideally, you would get this from your auth context
  const localUser = JSON.parse(localStorage.getItem('user') || '{}');
  return localUser?.id || null;
}
