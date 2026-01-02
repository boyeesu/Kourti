/**
 * Shared database types and utilities
 * Provides type-safe database operations
 */

import type { Database } from '@/integrations/supabase/types';

// Extract table names from Database type
export type TableName = keyof Database['public']['Tables'];

// Helper type to get Row type from a table
export type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row'];

// Helper type to get Insert type from a table
export type TableInsert<T extends TableName> = Database['public']['Tables'][T]['Insert'];

// Helper type to get Update type from a table
export type TableUpdate<T extends TableName> = Database['public']['Tables'][T]['Update'];

// Common profile type
export interface Profile {
  id: string;
  user_id: string;
  organization_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string | null;
}

// Common case type
export interface Case {
  id: string;
  title: string;
  organization_id: string;
  client_id: string | null;
  status: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

// Common document type
export interface Document {
  id: string;
  title: string;
  organization_id: string;
  case_id: string | null;
  client_id: string | null;
  file_path: string | null;
  file_type: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

// Common client type
export interface Client {
  id: string;
  name: string;
  organization_id: string;
  email: string | null;
  phone: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

// Type guard for Profile
export function isProfile(obj: unknown): obj is Profile {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'user_id' in obj &&
    'organization_id' in obj
  );
}

// Type guard for Case
export function isCase(obj: unknown): obj is Case {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'title' in obj &&
    'organization_id' in obj
  );
}

// Type guard for Document
export function isDocument(obj: unknown): obj is Document {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'title' in obj &&
    'organization_id' in obj
  );
}

