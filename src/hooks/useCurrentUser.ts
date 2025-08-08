import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

let cachedUserPromise: Promise<User | null> | null = null;

export function getCurrentUser() {
  if (!cachedUserPromise) {
    cachedUserPromise = supabase.auth.getUser().then(({ data }) => data.user ?? null);
  }
  return cachedUserPromise;
}

export async function getCurrentUserId() {
  const user = await getCurrentUser();
  return user?.id ?? null;
}
