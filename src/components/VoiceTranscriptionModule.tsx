import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCases } from '@/hooks/useCases';
import { useCreateActivity } from '@/features/activities/api/useCreateActivity';
import { Mic, Play, Pause, Square, Save, FileText, Loader2, List } from 'lucide-react';

const VoiceTranscriptionModule: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: casesData } = useCases();
  const cases = casesData?.cases || [];
  const createActivity = useCreateActivity();
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('none');
  const [duration, setDuration] = useState<number | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  // Check microphone permissions on component mount
  React.useEffect(() => {
    const checkPermissions = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasPermission(true);
      } catch (error) {
        setHasPermission(false);
        console.error('Microphone permission denied:', error);
      }
    };
    checkPermissions();
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();
      pausedTimeRef.current = 0;
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setDuration(Math.round((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000));
        
        // Stop all tracks to free up the microphone
        stream.getTracks().forEach(track => track.stop());
        
        // Auto-transcribe immediately after recording ends
        toast({
          title: "Recording Complete",
          description: "Starting transcription...",
        });
        await autoTranscribe(blob);
      };
      
      mediaRecorderRef.current.start(1000); // Collect data every second
      setIsRecording(true);
      setIsPaused(false);
      
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

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      pausedTimeRef.current += Date.now();
      
      toast({
        title: "Recording Paused",
        description: "Click resume to continue recording",
      });
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      pausedTimeRef.current = Date.now() - pausedTimeRef.current;
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      
      toast({
        title: "Recording Resumed",
        description: "Recording continues...",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      
      toast({
        title: "Recording Stopped",
        description: "Processing recording...",
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

  const pausePlayback = () => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Auto-transcribe function called immediately after recording
  const autoTranscribe = async (blob: Blob) => {
    setIsTranscribing(true);
    
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Audio = reader.result?.toString().split(',')[1];
          
          if (!base64Audio) {
            throw new Error('Failed to process audio file');
          }

          console.log('🎙️ Starting auto-transcription...');
          const { data, error } = await supabase.functions.invoke('voice-transcription', {
            body: {
              audio: base64Audio,
              action: 'transcribe'
            }
          });

          if (error) {
            console.error('❌ Supabase function error:', error);
            throw error;
          }
          
          if (data?.error) {
            console.error('❌ Transcription service error:', data.error);
            throw new Error(data.error);
          }

          if (!data?.transcript) {
            throw new Error('No transcript returned from service');
          }

          setTranscript(data.transcript);
          console.log('✅ Auto-transcription completed');
          
          toast({
            title: "Transcription Complete",
            description: "Audio has been transcribed successfully",
          });
        } catch (innerError: any) {
          console.error('❌ Auto-transcription processing error:', innerError);
          toast({
            title: "Transcription Failed",
            description: innerError.message || "Failed to transcribe audio automatically",
            variant: "destructive",
          });
        } finally {
          setIsTranscribing(false);
        }
      };
      
      reader.onerror = () => {
        console.error('❌ FileReader error');
        setIsTranscribing(false);
        toast({
          title: "File Processing Error",
          description: "Failed to process the audio file",
          variant: "destructive",
        });
      };
      
      reader.readAsDataURL(blob);
    } catch (error: any) {
      console.error('❌ Auto-transcription setup error:', error);
      setIsTranscribing(false);
      toast({
        title: "Transcription Setup Failed",
        description: error.message || "Failed to set up transcription",
        variant: "destructive",
      });
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
      // Get current user data
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get user's organization from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error('User organization not found');
      }

      // Save to voice_transcriptions table
      const { error: transcriptionError } = await supabase
        .from('voice_transcriptions')
        .insert({
          title,
          transcript: saveType === 'transcript' ? transcript : '',
          summary: saveType === 'summary' ? summary : '',
          case_id: selectedCaseId === 'none' ? null : selectedCaseId,
          duration_seconds: duration,
          status: 'completed' as const,
          organization_id: profile.organization_id,
          created_by: user.id
        });

      if (transcriptionError) throw transcriptionError;

      // Create activity if case is selected
      if (selectedCaseId && selectedCaseId !== 'none') {
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
        description: `${saveType === 'summary' ? 'Summary' : 'Transcript'} has been saved${selectedCaseId && selectedCaseId !== 'none' ? ' and linked to the case' : ''}`,
      });

      // Reset form
      setTitle('');
      setTranscript('');
      setSummary('');
      setSelectedCaseId('none');
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Mic className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Legal Proceedings Recorder</h1>
        </div>
        <Button variant="outline" onClick={() => navigate('/transcriptions')}>
          <List className="h-4 w-4 mr-2" />
          View All Transcriptions
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Voice Recording</CardTitle>
          <CardDescription>
            Record legal proceedings and generate accurate transcripts with AI-powered summaries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasPermission === false && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                Microphone access is required for voice recording. Please allow microphone access and refresh the page.
              </p>
            </div>
          )}

          <div className="flex items-center space-x-4">
            {!isRecording ? (
              <Button 
                onClick={startRecording} 
                disabled={hasPermission === false}
                className="flex items-center space-x-2"
              >
                <Mic className="h-4 w-4" />
                <span>Start Recording</span>
              </Button>
            ) : (
              <div className="flex items-center space-x-2">
                {!isPaused ? (
                  <Button onClick={pauseRecording} variant="outline" className="flex items-center space-x-2">
                    <Pause className="h-4 w-4" />
                    <span>Pause</span>
                  </Button>
                ) : (
                  <Button onClick={resumeRecording} variant="outline" className="flex items-center space-x-2">
                    <Play className="h-4 w-4" />
                    <span>Resume</span>
                  </Button>
                )}
                <Button onClick={stopRecording} variant="destructive" className="flex items-center space-x-2">
                  <Square className="h-4 w-4" />
                  <span>Stop Recording</span>
                </Button>
              </div>
            )}

            {audioBlob && (
              <div className="flex items-center space-x-2">
                {!isPlaying ? (
                  <Button onClick={playRecording} variant="outline" className="flex items-center space-x-2">
                    <Play className="h-4 w-4" />
                    <span>Play</span>
                  </Button>
                ) : (
                  <Button onClick={pausePlayback} variant="outline" className="flex items-center space-x-2">
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
              <span className="text-sm font-medium">
                {isPaused ? 'Recording paused...' : 'Recording in progress...'}
              </span>
            </div>
          )}

          {isTranscribing && (
            <div className="flex items-center space-x-2 text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">Transcribing audio...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {(audioBlob || transcript) && (
        <Card>
          <CardHeader>
            <CardTitle>Processing</CardTitle>
            <CardDescription>Your recording has been automatically transcribed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {audioBlob && !transcript && !isTranscribing && (
              <Button 
                onClick={transcribeAudio} 
                disabled={isTranscribing}
                className="flex items-center space-x-2"
              >
                <FileText className="h-4 w-4" />
                <span>Re-transcribe Audio</span>
              </Button>
            )}

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
                <SelectItem value="none">No case selected</SelectItem>
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