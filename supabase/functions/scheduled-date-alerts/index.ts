import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import OpenAI from 'https://deno.land/x/openai@1.4.2/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const openai = new OpenAI();
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

serve(async () => {
  // Fetch all contracts
  const { data: contracts, error } = await supabase
    .from('documents')
    .select('id,name,content,metadata->>"type" as doc_type, metadata->>"organisation_id" as org_id')
    .eq('metadata->>"type"', 'contract');
  if (error) {
    console.error('Error fetching contracts:', error);
    return new Response('Error', { status: 500 });
  }

  const now = new Date();

  for (const c of contracts || []) {
    // Read user's reminder window from dashboard_prefs
    const { data: pref } = await supabase
      .from('dashboard_prefs')
      .select('reminder_window_days')
      .eq('organisation_id', c.org_id)
      .single();
    const windowDays = pref?.reminder_window_days ?? 90;
    const cutoff = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

    // Extract dates if missing
    let { effective_date, renewal_date, termination_date } = c;
    if (!effective_date || !renewal_date || !termination_date) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Extract effective, renewal, and termination dates in ISO format.' },
          { role: 'user', content: c.content }
        ],
        functions: [{
          name: 'extract_contract_dates',
          description: 'Returns key contract dates',
          parameters: {
            type: 'object',
            properties: {
              effective_date: { type: 'string' },
              renewal_date: { type: 'string' },
              termination_date: { type: 'string' }
            },
            required: ['effective_date','renewal_date','termination_date']
          }
        }],
        function_call: { name: 'extract_contract_dates' }
      });
      const args = JSON.parse(completion.choices[0].message.function_call.arguments);
      effective_date = args.effective_date;
      renewal_date = args.renewal_date;
      termination_date = args.termination_date;
      await supabase.from('documents').update({ effective_date, renewal_date, termination_date }).eq('id', c.id);
    }

    // Alert if dates within window
    const checkAndNotify = async (dateStr: string, label: string) => {
      const date = new Date(dateStr);
      if (date > now && date <= cutoff) {
        await supabase.from('notifications').insert([{ 
          user_id: c.uploaded_by,
          organisation_id: c.org_id,
          type: 'event',
          title: `${c.name}: ${label} due soon`,
          description: `${c.name} ${label} is on ${date.toDateString()}`
        }]);
      }
    };

    await checkAndNotify(renewal_date, 'Renewal Date');
    await checkAndNotify(termination_date, 'Termination Date');
  }

  return new Response('OK', { status: 200 });
});