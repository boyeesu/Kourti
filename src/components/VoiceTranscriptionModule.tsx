import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCases } from '@/hooks/useCases';
import { useCreateActivity } from '@/features/activities/api/useCreateActivity';
import { Mic, Play, Pause, Square, Save, FileText, Loader2 } from 'lucide-react';

const VoiceTranscriptionModule: React.FC = () => {
  const { toast } = useToast();
  const { data: casesData } = useCases();
  const cases = casesData?.cases || [];
  const createActivity = useCreateActivity();
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [duration, setDuration] = useState<number | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
        
        // Stop all tracks to free up the microphone
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start(1000); // Collect data every second
      setIsRecording(true);
      
      toast({
        title: "Recording Started",
        description: "Recording legal proceedings...",
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      toast({
        title: "Recording Stopped",
        description: `Recording completed (${Math.round((Date.now() - startTimeRef.current) / 1000)}s)`,
      });
    }
  };

  const playRecording = () => {
    if (audioBlob && !isPlaying) {
      const audioUrl = URL.createObjectURL(audioBlob);
      audioRef.current = new Audio(audioUrl);
      
      audioRef.current.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const pauseRecording = () => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const transcribeAudio = async () => {
    if (!audioBlob) {
      toast({
        title: "No Recording",
        description: "Please record audio first",
        variant: "destructive",
      });
      return;
    }

    setIsTranscribing(true);
    
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = reader.result?.toString().split(',')[1];
        
        if (!base64Audio) {
          throw new Error('Failed to process audio');
        }

        const { data, error } = await supabase.functions.invoke('voice-transcription', {
          body: {
            audio: base64Audio,
            action: 'transcribe'
          }
        });

        if (error) throw error;
        
        if (data.error) {
          throw new Error(data.error);
        }

        setTranscript(data.transcript);
        
        toast({
          title: "Transcription Complete",
          description: "Audio has been transcribed successfully",
        });
      };
      
      reader.readAsDataURL(audioBlob);
    } catch (error: any) {
      console.error('Transcription error:', error);
      toast({
        title: "Transcription Failed",
        description: error.message || "Failed to transcribe audio",
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const generateSummary = async () => {
    if (!transcript.trim()) {
      toast({
        title: "No Transcript",
        description: "Please transcribe audio first",
        variant: "destructive",
      });
      return;
    }

    setIsSummarizing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('voice-transcription', {
        body: {
          transcript,
          action: 'summarize'
        }
      });

      if (error) throw error;
      
      if (data.error) {
        throw new Error(data.error);
      }

      setSummary(data.summary);
      
      toast({
        title: "Summary Generated",
        description: "Transcript summary has been generated",
      });
    } catch (error: any) {
      console.error('Summary error:', error);
      toast({
        title: "Summary Failed",
        description: error.message || "Failed to generate summary",
        variant: "destructive",
      });
    } finally {
      setIsSummarizing(false);
    }
  };

  const saveTranscription = async (saveType: 'transcript' | 'summary') => {
    const contentToSave = saveType === 'summary' ? summary : transcript;
    
    if (!title.trim() || !contentToSave.trim()) {
      toast({
        title: "Missing Information", 
        description: "Please provide a title and content to save",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      // Save to voice_transcriptions table
      const { error: transcriptionError } = await supabase
        .from('voice_transcriptions')
        .insert({
          title,
          transcript: saveType === 'transcript' ? transcript : '',
          summary: saveType === 'summary' ? summary : '',
          case_id: selectedCaseId || null,
          duration_seconds: duration,
          status: 'completed',
          organization_id: (await supabase.auth.getUser()).data.user?.user_metadata?.organization_id,
          created_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (transcriptionError) throw transcriptionError;

      // Create activity if case is selected
      if (selectedCaseId) {
        await createActivity.mutateAsync({
          caseId: selectedCaseId,
          payload: {
            title: `Voice Recording: ${title}`,
            description: `${saveType === 'summary' ? 'Summary' : 'Transcript'} saved from voice recording`,
            activity_type: 'voice_recording',
            status: 'completed'
          }
        });
      }

      toast({
        title: "Saved Successfully",
        description: `${saveType === 'summary' ? 'Summary' : 'Transcript'} has been saved${selectedCaseId ? ' and linked to the case' : ''}`,
      });

      // Reset form
      setTitle('');
      setTranscript('');
      setSummary('');
      setSelectedCaseId('');
      setAudioBlob(null);
      setDuration(null);
      
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save transcription",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-2 mb-6">
        <Mic className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Legal Proceedings Recorder</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Voice Recording</CardTitle>
          <CardDescription>
            Record legal proceedings and generate accurate transcripts with AI-powered summaries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            {!isRecording ? (
              <Button onClick={startRecording} className="flex items-center space-x-2">
                <Mic className="h-4 w-4" />
                <span>Start Recording</span>
              </Button>
            ) : (
              <Button onClick={stopRecording} variant="destructive" className="flex items-center space-x-2">
                <Square className="h-4 w-4" />
                <span>Stop Recording</span>
              </Button>
            )}

            {audioBlob && (
              <div className="flex items-center space-x-2">
                {!isPlaying ? (
                  <Button onClick={playRecording} variant="outline" className="flex items-center space-x-2">
                    <Play className="h-4 w-4" />
                    <span>Play</span>
                  </Button>
                ) : (
                  <Button onClick={pauseRecording} variant="outline" className="flex items-center space-x-2">
                    <Pause className="h-4 w-4" />
                    <span>Pause</span>
                  </Button>
                )}
                {duration && (
                  <span className="text-sm text-muted-foreground">
                    Duration: {duration}s
                  </span>
                )}
              </div>
            )}
          </div>

          {isRecording && (
            <div className="flex items-center space-x-2 text-red-600">
              <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
              <span className="text-sm font-medium">Recording in progress...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {audioBlob && (
        <Card>
          <CardHeader>
            <CardTitle>Processing</CardTitle>
            <CardDescription>Convert your recording to text and generate summaries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={transcribeAudio} 
              disabled={isTranscribing}
              className="flex items-center space-x-2"
            >
              {isTranscribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span>{isTranscribing ? 'Transcribing...' : 'Generate Transcript'}</span>
            </Button>

            {transcript && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Transcript</h3>
                  <Textarea 
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Transcript will appear here..."
                    className="min-h-[200px]"
                  />
                </div>

                <Button 
                  onClick={generateSummary}
                  disabled={isSummarizing}
                  variant="outline"
                  className="flex items-center space-x-2"
                >
                  {isSummarizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  <span>{isSummarizing ? 'Summarizing...' : 'Generate Summary'}</span>
                </Button>
              </div>
            )}

            {summary && (
              <div className="space-y-2">
                <h3 className="font-semibold">AI Summary</h3>
                <Textarea 
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Summary will appear here..."
                  className="min-h-[150px]"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(transcript || summary) && (
        <Card>
          <CardHeader>
            <CardTitle>Save Recording</CardTitle>
            <CardDescription>Save transcript or summary and optionally link to a case</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Recording title (e.g., 'Client Meeting - Smith vs Jones')"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
              <SelectTrigger>
                <SelectValue placeholder="Link to case (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No case selected</SelectItem>
                {cases?.map((caseItem: any) => (
                  <SelectItem key={caseItem.id} value={caseItem.id}>
                    {caseItem.title} - {caseItem.case_number || 'No number'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex space-x-4">
              {transcript && (
                <Button 
                  onClick={() => saveTranscription('transcript')}
                  disabled={isSaving}
                  className="flex items-center space-x-2"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Save Transcript</span>
                </Button>
              )}

              {summary && (
                <Button 
                  onClick={() => saveTranscription('summary')}
                  disabled={isSaving}
                  variant="outline"
                  className="flex items-center space-x-2"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Save Summary</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default VoiceTranscriptionModule;