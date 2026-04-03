import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

/**
 * Hook to check if the current user is a platform admin
 */
export function usePlatformAdmin() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['platform-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        return false;
      }

      try {
        const data = await invokeNodeApi<{ isPlatformAdmin: boolean }>(
          '/api/v1/users/is-platform-admin'
        );
        return Boolean(data.isPlatformAdmin);
      } catch (error) {
        logError('Error checking platform admin status', error);
        return false;
      }
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Get platform admin status synchronously (for use outside React components)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function isPlatformAdmin(_userId: string): Promise<boolean> {
  try {
    const data = await invokeNodeApi<{ isPlatformAdmin: boolean }>(
      '/api/v1/users/is-platform-admin'
    );
    return Boolean(data.isPlatformAdmin);
  } catch (error) {
    console.error('Error checking platform admin status:', error);
    return false;
  }
}
