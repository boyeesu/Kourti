/**
 * @deprecated Supabase client is no longer used.
 * All auth and data operations go through the custom JWT auth system
 * and Node backend API. This file exists only to prevent import errors
 * from any remaining transitive references.
 */

// Stub exports to prevent build errors
export const supabase = null as never;
export const getCurrentSession = () => Promise.resolve({ data: { session: null }, error: null });
export const getCurrentUser = () => Promise.resolve({ data: { user: null }, error: null });
