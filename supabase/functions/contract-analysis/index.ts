import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import OpenAI from 'https://deno.land/x/openai@1.4.2/mod.ts';

const openai = new OpenAI();

serve(async (req) => {
  try {
    const { text, analysisType } = await req.json();

    if (!text || !analysisType) {
      return new Response(JSON.stringify({ error: 'Missing text or analysisType' }), { status: 400 });
    }

    let promptSystem = '';
    let promptUser = '';

    // configure prompts by analysisType
    switch (analysisType) {
      case 'summarize':
        promptSystem = 'You are an expert legal assistant.';
        promptUser = `Summarize the following legal document. Provide a concise summary with key facts, dates, entities, and main legal arguments in bullet points:\n\n${text}`;
        break;
      case 'extractClauses':
        promptSystem = 'You are a contract analysis expert.';
        promptUser = `Extract and list the key clauses from this contract text:\n\n${text}`;
        break;
      case 'redline':
        promptSystem = 'You are a contract risk detection specialist.';
        promptUser = `Compare this contract against best practice standards and flag any risky or unusual clauses. Explain each risk and suggest better wording:\n\n${text}`;
        break;
      default:
        return new Response(JSON.stringify({ error: 'Unknown analysisType' }), { status: 400 });
    }

    let analysis = '';
    let completion: any = null;
    let usedModel = 'gpt-4o';
    try {
      completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: promptSystem },
          { role: 'user', content: promptUser }
        ],
        temperature: 0.2
      });
      analysis = completion.choices[0].message?.content || '';
    } catch (err) {
      // Try fallback GPT-3.5 if GPT-4o failed
      try {
        usedModel = 'gpt-3.5-turbo';
        completion = await openai.chat.completions.create({
          model: usedModel,
          messages: [
            { role: 'system', content: promptSystem },
            { role: 'user', content: promptUser }
          ],
          temperature: 0.2
        });
        analysis = completion.choices[0].message?.content || '';
      } catch (fallbackErr) {
        // Compose a detailed error for the frontend
        const openAiErr = (err as Error)?.message || String(err);
        const fallbackAiErr = (fallbackErr as Error)?.message || String(fallbackErr);
        const fullError = `OpenAI error (GPT-4o): ${openAiErr}\nFallback error (GPT-3.5): ${fallbackAiErr}`;
        console.error('Function contract-analysis error:', fullError);
        return new Response(JSON.stringify({ error: fullError }), { status: 500 });
      }
    }
    return new Response(JSON.stringify({ analysis, model: usedModel }), { status: 200 });
  } catch (err) {
    console.error('Function contract-analysis error:', err);
    // More user-friendly error
    return new Response(JSON.stringify({ error: `AI Service error: ${(err as Error)?.message || err}` }), { status: 500 });
  }
});