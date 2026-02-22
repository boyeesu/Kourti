// @ts-ignore: Deno module
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno module
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { createErrorResponse } from "../_shared/errorHandling.ts";
import { requireOrganizationAccess } from "../_shared/organizationValidation.ts";
import { requireCsrfTokenForUser } from "../_shared/csrfProtection.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8083",
  "https://app.kourti.com",
  "https://kouti-legal-hub-41.lovable.app",
]
  .flatMap((value) => (value ? value.split(",") : []))
  .filter(Boolean)
  .map((origin) => {
    // Ensure all origins have a protocol
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      // If it's a domain without protocol, assume https
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  // Can't use "*" with allowCredentials: true, so we must have a specific origin
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || "https://app.kourti.com"); // Fallback to a specific origin, never "*"

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ["POST", "OPTIONS"],
  };
}

interface CreateInvitedUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  organizationId: string;
}

// Generate a secure temporary password without bias
// Uses rejection sampling to ensure uniform distribution
function generateTempPassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const charsLength = chars.length;
  // Calculate the maximum value that ensures uniform distribution
  // We reject values >= maxValid to avoid modulo bias
  const maxValid = 256 - (256 % charsLength);
  
  let password = '';
  
  for (let i = 0; i < length; i++) {
    let randomByte: number;
    // Rejection sampling: keep generating until we get a valid byte
    do {
      const temp = new Uint8Array(1);
      crypto.getRandomValues(temp);
      randomByte = temp[0];
    } while (randomByte >= maxValid);
    
    password += chars[randomByte % charsLength];
  }
  
  return password;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("create-invited-user function invoked");

  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    // Verify authorization - must be an authenticated admin/superadmin
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client for user creation and auth verification
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Extract token from Authorization header (format: "Bearer <token>")
    const token = authHeader.replace('Bearer ', '').trim();
    
    if (!token) {
      throw new Error('Invalid authorization header format');
    }

    // Verify caller is authenticated using service role client
    const { data: { user: callerUser }, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerUser) {
      console.error('Authentication failed:', {
        error: callerError?.message,
        status: callerError?.status,
        hasUser: !!callerUser
      });
      throw new Error('Unauthorized: Invalid or expired token');
    }
    
    console.log('User authenticated:', callerUser.id);

    // Rate limiting - prevent user enumeration and abuse (after auth check)
    const rateLimitId = callerUser.id || getRateLimitIdentifier(req);
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMIT_PRESETS.AUTH,
      identifier: rateLimitId,
    });

    if (!rateLimitResult.allowed) {
      const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
      return createJsonResponse(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          errorCode: 'RATE_LIMIT_EXCEEDED',
        },
        {
          status: 429,
          cors: corsOptions,
          headers: rateLimitHeaders,
        }
      );
    }

    // Get caller's profile and organization
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('organization_id')
      .eq('user_id', callerUser.id)
      .single();

    if (profileError || !callerProfile) {
      throw new Error('Unauthorized: Could not verify user profile');
    }

    // Check caller's roles from user_role_assignments
    const { data: callerRoles, error: rolesError } = await supabaseAdmin
      .from('user_role_assignments')
      .select('role_name')
      .eq('user_id', callerUser.id)
      .eq('organization_id', callerProfile.organization_id);

    if (rolesError) {
      throw new Error('Unauthorized: Could not verify user roles');
    }

    type RoleAssignment = { role_name: string };
    const roleNames: string[] = (callerRoles as RoleAssignment[] | null)?.map((r: RoleAssignment) => r.role_name) || [];
    if (!roleNames.includes('superadmin') && !roleNames.includes('admin')) {
      throw new Error('Unauthorized: Only admins can invite users');
    }

    const {
      email,
      firstName,
      lastName,
      role,
      department,
      organizationId,
    }: CreateInvitedUserRequest = await req.json();

    // Validate organization access using shared helper
    await requireOrganizationAccess(supabaseAdmin, callerUser.id, organizationId);

    // CSRF Protection - validate token for sensitive operation
    await requireCsrfTokenForUser(supabaseAdmin, callerUser.id, req);

    console.log('Creating invited user:', { email, role, organizationId });

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u: { email?: string }) => u.email === email);
    
    if (existingUser) {
      throw new Error('A user with this email already exists');
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();
    console.log('Generated temp password for:', email);

    // Create auth user with temp password
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email since they're invited
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        invited: true,
      },
    });

    if (createError) {
      console.error('Failed to create auth user:', createError);
      throw new Error(`Failed to create user: ${createError.message}`);
    }

    console.log('Auth user created:', newUser.user.id);

    // Create or update profile linked to organization
    // Using upsert because the handle_new_user trigger may have already created a profile
    const { error: profileInsertError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        user_id: newUser.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        organization_id: organizationId,
        department: department || null,
        is_organization_creator: false,
        must_change_password: true, // Force password change on first login
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (profileInsertError) {
      console.error('Failed to create profile:', profileInsertError);
      // Rollback: delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error(`Failed to create profile: ${profileInsertError.message}`);
    }

    console.log('Profile created for invited user');

    // Assign role via user_role_assignments
    const { error: roleAssignError } = await supabaseAdmin
      .from('user_role_assignments')
      .insert({
        user_id: newUser.user.id,
        role_name: role,
        organization_id: organizationId,
        assigned_by: callerUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (roleAssignError) {
      console.error('Failed to assign role:', roleAssignError);
      // Rollback: delete the profile and auth user
      await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('user_id', newUser.user.id);
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error(`Failed to assign role: ${roleAssignError.message}`);
    }

    console.log('Role assigned to invited user');

    // Update invitation record if it exists
    await supabaseAdmin
      .from('invitations')
      .update({ 
        status: 'accepted', 
        temp_password_set: true,
        updated_at: new Date().toISOString() 
      })
      .eq('email', email)
      .eq('organization_id', organizationId)
      .eq('status', 'pending');

    // SECURITY: Do NOT return password in API response
    // Password will be sent via secure email channel only
    // Send invitation email server-side (password never leaves server)
    try {
      // Fetch organization name for the email
      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();

      // Fetch inviter's name
      const { data: inviterData } = await supabaseAdmin
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', callerUser.id)
        .single();

      const organizationName = orgData?.name || 'Your Organization';
      const inviterName = inviterData 
        ? `${inviterData.first_name || ''} ${inviterData.last_name || ''}`.trim() || 'Admin'
        : 'Admin';
      
      // Use APP_URL or fallback to kourti.com
      const appUrl = Deno.env.get('APP_URL') || 'https://app.kourti.com';
      const invitationUrl = `${appUrl}/auth?email=${encodeURIComponent(email)}&invited=true`;

      const { error: emailError } = await supabaseAdmin.functions.invoke('send-invitation-email', {
        body: {
          email,
          firstName,
          lastName,
          role,
          department,
          organizationName,
          inviterName,
          invitationUrl,
          tempPassword, // Pass securely server-to-server
        }
      });
      
      if (emailError) {
        console.error('Failed to send invitation email:', emailError);
        // Don't fail the user creation if email fails, but log it
      }
    } catch (emailErr) {
      console.error('Error invoking email function:', emailErr);
      // Continue - user is created, email can be sent later
    }

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      {
        success: true,
        userId: newUser.user.id,
        message: 'User created successfully. Credentials will be sent via email.',
      },
      { 
        status: 200,
        cors: corsOptions,
        headers: rateLimitHeaders,
      }
    );

  } catch (error: unknown) {
    return createErrorResponse(error, corsOptions, {
      function: 'create-invited-user',
    });
  }
};

serve(handler);
