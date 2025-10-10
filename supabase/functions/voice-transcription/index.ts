const voiceCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_CHAT_MODEL = 'gpt-4.1';
const DEFAULT_FALLBACK_MODEL = 'gpt-4o-mini';

function getChatModelCandidates() {
  const configuredModel = Deno.env.get('OPENAI_CHAT_MODEL')?.trim();
  const configuredFallbackModel = Deno.env.get('OPENAI_FALLBACK_CHAT_MODEL')?.trim();

  const models = [
    configuredModel || DEFAULT_CHAT_MODEL,
    configuredFallbackModel || DEFAULT_FALLBACK_MODEL,
    DEFAULT_CHAT_MODEL,
    DEFAULT_FALLBACK_MODEL,
  ];

  return Array.from(new Set(models.filter(Boolean)));
}

async function requestChatCompletion(apiKey: string, body: Record<string, unknown>) {
  const modelCandidates = getChatModelCandidates();
  let lastError: Error | null = null;

  for (const model of modelCandidates) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, model }),
      });

      if (response.ok) {
        const data = await response.json();
        return { data, modelUsed: model };
      }

      const errorData = await response.text();
      console.error(`OpenAI chat error for model ${model}:`, response.status, errorData);

      if ([400, 404, 422].includes(response.status)) {
        lastError = new Error(`Model ${model} unavailable: ${errorData}`);
        continue;
      }

      throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Failed to call OpenAI model ${model}:`, lastError.message);
    }
  }

  throw lastError ?? new Error('Unable to reach OpenAI API for summarization');
}

export const voiceTranscriptionHandler = async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: voiceCorsHeaders });
  }

  try {
    const { audio, action, transcript } = await req.json();
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    if (action === 'transcribe') {
      if (!audio) {
        throw new Error('Audio data is required for transcription');
      }

      console.log('Starting voice transcription...');

      // Decode base64 audio
      const binaryAudio = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
      
      // Prepare form data for OpenAI Whisper
      const formData = new FormData();
      const blob = new Blob([binaryAudio], { type: 'audio/webm' });
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'json');

      // Send to OpenAI Whisper
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI transcription error:', errorText);
        throw new Error(`OpenAI transcription failed: ${errorText}`);
      }

      const transcriptionResult = await response.json();
      console.log('Transcription completed successfully');

      return new Response(JSON.stringify({ 
        success: true,
        transcript: transcriptionResult.text,
        duration: transcriptionResult.duration || null
      }), {
        headers: { ...voiceCorsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'summarize') {
      if (!transcript) {
        throw new Error('Transcript is required for summarization');
      }

      console.log('Generating summary for transcript...');

      const { data: summaryResult, modelUsed } = await requestChatCompletion(OPENAI_API_KEY, {
        messages: [
          {
            role: 'system',
            content: 'You are a legal assistant. Summarize the following transcript of legal proceedings in a clear, professional format. Focus on key points, decisions, actions required, and important details.'
          },
          {
            role: 'user',
            content: `Please summarize this legal proceeding transcript:\n\n${transcript}`
          }
        ],
        max_completion_tokens: 1000,
      });

      const summary = summaryResult.choices?.[0]?.message?.content;

      if (!summary) {
        throw new Error('Summary generation failed: Empty response from OpenAI');
      }

      console.log('Summary generated successfully');

      return new Response(JSON.stringify({
        success: true,
        summary,
        modelUsed,
      }), {
        headers: { ...voiceCorsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      throw new Error('Invalid action. Must be "transcribe" or "summarize"');
    }

  } catch (error: any) {
    console.error('Error in voice-transcription function:', error);
    return new Response(JSON.stringify({ 
      error: error?.message || 'Voice transcription failed'
    }), {
      status: 500,
      headers: { ...voiceCorsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

if (import.meta.main) {
  Deno.serve(voiceTranscriptionHandler);
}
