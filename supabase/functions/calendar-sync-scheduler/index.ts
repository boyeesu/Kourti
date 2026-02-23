// @ts-ignore: Deno module
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno module
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const allowedOrigin = Deno.env.get("APP_URL") || "https://app.kourti.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncJob {
  integration_id: string;
  provider: 'google' | 'microsoft';
  sync_direction: 'import' | 'export' | 'bidirectional';
  user_id: string;
  organization_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("calendar-sync-scheduler function invoked");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require service-role authentication (cron jobs only)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader.replace('Bearer ', '').trim() !== supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Forbidden: service-role access required' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get all active integrations that need syncing
    const { data: integrations, error: integrationsError } = await supabase
      .from('user_calendar_integrations')
      .select('*')
      .eq('sync_enabled', true)
      .or('last_sync_at.is.null,last_sync_at.lt.' + new Date(Date.now() - 15 * 60 * 1000).toISOString()); // Sync if never synced or last sync > 15 min ago

    if (integrationsError) {
      throw integrationsError;
    }

    if (!integrations || integrations.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No integrations need syncing' }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const syncJobs: SyncJob[] = [];
    const results: Array<{ integration_id: string; success: boolean; error?: string }> = [];

    // Prepare sync jobs based on sync direction
    for (const integration of integrations) {
      if (integration.sync_direction === 'import' || integration.sync_direction === 'bidirectional') {
        syncJobs.push({
          integration_id: integration.id,
          provider: integration.provider,
          sync_direction: 'import',
          user_id: integration.user_id,
          organization_id: integration.organization_id,
        });
      }

      if (integration.sync_direction === 'export' || integration.sync_direction === 'bidirectional') {
        syncJobs.push({
          integration_id: integration.id,
          provider: integration.provider,
          sync_direction: 'export',
          user_id: integration.user_id,
          organization_id: integration.organization_id,
        });
      }
    }

    // Execute sync jobs
    for (const job of syncJobs) {
      try {
        const functionName = job.provider === 'google' ? 'google-calendar-sync' : 'teams-calendar-sync';
        const action = job.sync_direction === 'import' ? 'sync-import' : 'sync-export';

        // Get user's auth token for the function call
        const { data: { user } } = await supabase.auth.admin.getUserById(job.user_id);
        if (!user) {
          results.push({ integration_id: job.integration_id, success: false, error: 'User not found' });
          continue;
        }

        // Create a service role client to invoke the function
        const { error } = await supabase.functions.invoke(functionName, {
          body: {
            action,
            timeMin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
            timeMax: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Next 30 days
          },
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });

        if (error) {
          throw error;
        }

        results.push({ integration_id: job.integration_id, success: true });
        console.log(`Sync completed for ${job.provider} integration ${job.integration_id}`);
      } catch (error: any) {
        console.error(`Sync failed for integration ${job.integration_id}:`, error);
        results.push({
          integration_id: job.integration_id,
          success: false,
          error: error.message || 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        jobs_processed: syncJobs.length,
        successful: successCount,
        failed: failureCount,
        results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in calendar-sync-scheduler:", error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
