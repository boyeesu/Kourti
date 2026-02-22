import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

let currentUser: User | null = null;
let fetchPromise: Promise<User | null> | null = null;
let listenerInitialized = false;

function initializeListener() {
  if (listenerInitialized) {
    return;
  }

  listenerInitialized = true;

  supabase.auth.getSession().then(({ data }) => {
    currentUser = data.session?.user ?? null;
  }).catch(() => {
    currentUser = null;
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
  });
}

async function fetchCurrentUser(refresh = false): Promise<User | null> {
  initializeListener();

  if (refresh) {
    fetchPromise = null;
  }

  if (currentUser && !refresh) {
    return currentUser;
  }

  if (!fetchPromise) {
    fetchPromise = supabase.auth.getSession().then(({ data }) => {
      currentUser = data.session?.user ?? null;
      return currentUser;
    }).catch(() => {
      currentUser = null;
      return null;
    }).finally(() => {
      fetchPromise = null;
    });
  }

  return fetchPromise;
}

export function useCurrentUser() {
  const { user } = useAuth();
  return user;
}

export async function getCurrentUser(options: { refresh?: boolean } = {}) {
  return fetchCurrentUser(Boolean(options.refresh));
}

export async function getCurrentUserId(options: { refresh?: boolean } = {}) {
  const user = await getCurrentUser(options);
  return user?.id ?? null;
}
