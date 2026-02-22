// @ts-ignore: Deno module
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno module
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ============================================================================
// CORS Headers Helper (inline version)
// ============================================================================
declare const Deno: any;

const DEFAULT_ALLOWED_HEADERS = [
  'authorization',
  'x-client-info',
  'apikey',
  'content-type',
];

const DEFAULT_PERMISSIONS_POLICY = [
  'accelerometer=()',
  'ambient-light-sensor=()',
  'autoplay=()',
  'camera=()',
  'encrypted-media=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'picture-in-picture=(self)',
  'sync-xhr=(self)',
  'usb=()',
].join(', ');

const DEFAULT_HSTS = 'max-age=31536000; includeSubDomains';

function isTrue(value: string | null | undefined): boolean {
  return value !== undefined && value !== null && value.toLowerCase() === 'true';
}

function shouldIncludeHsts(): boolean {
  if (isTrue(Deno.env.get('DISABLE_HSTS')) || isTrue(Deno.env.get('DISABLE_STRICT_TRANSPORT_SECURITY'))) {
    return false;
  }

  const environment = (Deno.env.get('ENVIRONMENT') ?? Deno.env.get('NODE_ENV') ?? '').toLowerCase();
  if (environment === 'development' || environment === 'local') {
    return false;
  }

  const deploymentMode = (Deno.env.get('SUPABASE_FUNCTIONS_ENV') ?? '').toLowerCase();
  if (deploymentMode === 'local') {
    return false;
  }

  return true;
}

interface CorsSecurityHeadersOptions {
  origin?: string;
  requestOrigin?: string | null;
  allowedOrigins?: string[];
  allowMethods?: string[];
  allowHeaders?: string[];
  allowCredentials?: boolean;
  exposeHeaders?: string[];
  varyOrigin?: boolean;
  cacheControl?: string | false;
  includeHsts?: boolean;
  permissionsPolicy?: string;
  referrerPolicy?: string;
}

function resolveOrigin(options: CorsSecurityHeadersOptions): string {
  const { origin, requestOrigin, allowedOrigins } = options;

  if (origin) {
    return origin;
  }

  if (allowedOrigins && allowedOrigins.length > 0) {
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }

    return allowedOrigins[0] ?? '*';
  }

  if (requestOrigin) {
    return requestOrigin;
  }

  return '*';
}

function createCorsSecurityHeaders(options: CorsSecurityHeadersOptions = {}): Record<string, string> {
  const {
    allowMethods = ['POST', 'OPTIONS'],
    allowHeaders = DEFAULT_ALLOWED_HEADERS,
    allowCredentials = false,
    exposeHeaders,
    varyOrigin,
    cacheControl = 'no-store, no-cache, must-revalidate',
    includeHsts,
    permissionsPolicy = DEFAULT_PERMISSIONS_POLICY,
    referrerPolicy = 'strict-origin-when-cross-origin',
  } = options;

  const resolvedOrigin = resolveOrigin(options);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': resolvedOrigin,
    'Access-Control-Allow-Methods': allowMethods.join(', '),
    'Access-Control-Allow-Headers': allowHeaders.join(', '),
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': referrerPolicy,
    'Permissions-Policy': permissionsPolicy,
  };

  if (allowCredentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  if (exposeHeaders && exposeHeaders.length > 0) {
    headers['Access-Control-Expose-Headers'] = exposeHeaders.join(', ');
  }

  const shouldVary = varyOrigin ?? (resolvedOrigin !== '*' && resolvedOrigin !== options.origin);
  if (shouldVary) {
    headers['Vary'] = 'Origin';
  }

  if (cacheControl) {
    headers['Cache-Control'] = cacheControl;
  }

  const applyHsts = includeHsts ?? shouldIncludeHsts();
  if (applyHsts) {
    headers['Strict-Transport-Security'] = DEFAULT_HSTS;
  }

  return headers;
}

interface JsonResponseInit extends Omit<ResponseInit, 'headers'> {
  headers?: HeadersInit;
  cors?: CorsSecurityHeadersOptions;
}

function createJsonResponse(body: unknown, init: JsonResponseInit = {}): Response {
  const corsHeaders = createCorsSecurityHeaders(init.cors);
  const responseHeaders = new Headers({
    ...corsHeaders,
    'Content-Type': 'application/json',
  });

  if (init.headers) {
    const extraHeaders = new Headers(init.headers);
    extraHeaders.forEach((value, key) => {
      responseHeaders.set(key, value);
    });
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers: responseHeaders,
  });
}

function createEmptyResponse(init: JsonResponseInit = {}): Response {
  const corsHeaders = createCorsSecurityHeaders(init.cors);
  const responseHeaders = new Headers(corsHeaders);

  if (init.headers) {
    const extraHeaders = new Headers(init.headers);
    extraHeaders.forEach((value, key) => {
      responseHeaders.set(key, value);
    });
  }

  return new Response(null, {
    ...init,
    headers: responseHeaders,
  });
}

// ============================================================================
// Main Function Code
// ============================================================================

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "http://localhost:3000",
  "http://localhost:5173",
  "https://app.kourti.com",
  "https://kouti-legal-hub-41.lovable.app",
]
  .flatMap((value) => (value ? value.split(",") : []))
  .filter(Boolean);

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
    
    // Create admin client for user creation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create user client to verify the caller
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify caller is authenticated and is admin/superadmin
    const { data: { user: callerUser }, error: callerError } = await supabaseUser.auth.getUser();
    if (callerError || !callerUser) {
      throw new Error('Unauthorized: Invalid or expired token');
    }

    // Check caller's role
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, organization_id')
      .eq('user_id', callerUser.id)
      .single();

    if (profileError || !callerProfile) {
      throw new Error('Unauthorized: Could not verify user profile');
    }

    if (!['superadmin', 'admin'].includes(callerProfile.role)) {
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

    // Validate organization matches caller's org
    if (organizationId !== callerProfile.organization_id) {
      throw new Error('Unauthorized: Cannot invite to a different organization');
    }

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

    // Create profile linked to organization
    const { error: profileInsertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: newUser.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        organization_id: organizationId,
        role: role,
        department: department || null,
        is_organization_creator: false,
        must_change_password: true, // Force password change on first login
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (profileInsertError) {
      console.error('Failed to create profile:', profileInsertError);
      // Rollback: delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error(`Failed to create profile: ${profileInsertError.message}`);
    }

    console.log('Profile created for invited user');

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
      const { error: emailError } = await supabaseAdmin.functions.invoke('send-invitation-email', {
        body: {
          email,
          firstName,
          lastName,
          role,
          department,
          organizationId,
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

    return createJsonResponse(
      {
        success: true,
        userId: newUser.user.id,
        message: 'User created successfully. Credentials will be sent via email.',
      },
      { 
        status: 200,
        cors: corsOptions,
      }
    );

  } catch (error: any) {
    console.error('Error in create-invited-user function:', error);
    return createJsonResponse(
      { 
        success: false,
        error: error.message 
      },
      { 
        status: error.message.includes('Unauthorized') ? 403 : 500,
        cors: corsOptions,
      }
    );
  }
};

serve(handler);
