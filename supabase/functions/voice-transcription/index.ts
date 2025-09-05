const voiceCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
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

      // Generate summary using GPT
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5-2025-08-07',
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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI summary error:', errorData);
        throw new Error(`Summary generation failed: ${errorData.error?.message || 'Unknown error'}`);
      }

      const summaryResult = await response.json();
      const summary = summaryResult.choices[0].message.content;

      console.log('Summary generated successfully');

      return new Response(JSON.stringify({ 
        success: true,
        summary
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
});