/**
 * Organization validation utilities
 * Ensures users can only access resources within their organization
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

export interface OrganizationValidationResult {
  valid: boolean;
  error?: string;
  organizationId?: string;
}

/**
 * Validate that a user belongs to an organization
 */
export async function validateUserOrganization(
  supabase: SupabaseClient,
  userId: string
): Promise<OrganizationValidationResult> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', userId)
      .single();

    if (error) {
      return {
        valid: false,
        error: 'Failed to verify user organization',
      };
    }

    if (!profile?.organization_id) {
      return {
        valid: false,
        error: 'User is not associated with an organization',
      };
    }

    return {
      valid: true,
      organizationId: profile.organization_id,
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Error validating organization',
    };
  }
}

/**
 * Validate that a user has access to a specific organization
 */
export async function validateOrganizationAccess(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<OrganizationValidationResult> {
  const userOrgResult = await validateUserOrganization(supabase, userId);

  if (!userOrgResult.valid) {
    return userOrgResult;
  }

  if (userOrgResult.organizationId !== organizationId) {
    return {
      valid: false,
      error: 'Cannot access resources from a different organization',
    };
  }

  return {
    valid: true,
    organizationId: userOrgResult.organizationId,
  };
}

/**
 * Validate organization access and throw if invalid
 */
export async function requireOrganizationAccess(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<string> {
  const result = await validateOrganizationAccess(supabase, userId, organizationId);

  if (!result.valid) {
    throw new Error(result.error || 'Organization access denied');
  }

  return result.organizationId!;
}

/**
 * Get user's organization ID
 */
export async function getUserOrganizationId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const result = await validateUserOrganization(supabase, userId);
  return result.organizationId || null;
}
