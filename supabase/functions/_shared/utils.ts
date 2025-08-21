import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function handleOptions(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

export async function verifyRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {
      user: null,
      errorResponse: new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return {
      user: null,
      errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  return { user, errorResponse: null };
}

export async function enforceRateLimit(userId: string) {
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

  // Get current count
  const { data: existing, error: fetchError } = await supabase
    .from('usage_counters')
    .select('count')
    .eq('user_id', userId)
    .eq('window_start', windowStart.toISOString())
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw new Error('Failed to check rate limit');
  }

  const currentCount = existing?.count || 0;
  const limit = 100; // requests per hour

  if (currentCount >= limit) {
    throw new Error('Rate limit exceeded. Try again later.');
  }

  // Increment counter
  if (existing) {
    await supabase
      .from('usage_counters')
      .update({ count: currentCount + 1 })
      .eq('user_id', userId)
      .eq('window_start', windowStart.toISOString());
  } else {
    await supabase
      .from('usage_counters')
      .insert({ user_id: userId, window_start: windowStart.toISOString(), count: 1 });
  }
}

export function getOpenAI() {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not found');
  }

  return {
    chat: {
      completions: {
        create: async (params: any) => {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${error}`);
          }

          return await response.json();
        }
      }
    }
  };
}

export async function logOpenAIUsage(userId: string, analysisType: string, model: string, usage: any) {
  if (!usage) return;

  try {
    await supabase
      .from('openai_usage')
      .insert({
        user_id: userId,
        analysis_type: analysisType,
        model: model,
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
      });
  } catch (error) {
    console.error('Failed to log OpenAI usage:', error);
  }
}