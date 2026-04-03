import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { getSession } from '@/lib/authClient';
import { invokeNodeApi } from '@/lib/backendApi';
import { uploadDocument } from '@/lib/fileApi';
import { useCases } from '@/hooks/useCases';
import { Case } from '@/types';
import { useCreateActivity } from '@/features/activities/api/useCreateActivity';
import { Mic, Play, Pause, Square, Save, FileText, Loader2, List } from 'lucide-react';

// Maximum file size for Whisper API (25MB)
const MAX_RECORDING_SIZE = 25 * 1024 * 1024; // 25MB in bytes

const VoiceTranscriptionModule: React.FC = () => {
  const navigate = useNavigate();
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
  const [recordingSize, setRecordingSize] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseStartTimeRef = useRef<number>(0);
  const totalPausedTimeRef = useRef<number>(0);
  const audioUrlRef = useRef<string | null>(null);

  // Cleanup on component unmount
  React.useEffect(() => {
    return () => {
      // Stop and cleanup MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        const stream = mediaRecorderRef.current.stream;
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
      }

      // Cleanup audio playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }

      // Revoke object URL to prevent memory leak
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

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
      pauseStartTimeRef.current = 0;
      totalPausedTimeRef.current = 0;
      setRecordingSize(0);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);

          // Calculate total recording size
          const totalSize = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
          setRecordingSize(totalSize);

          // Check if size limit exceeded
          if (totalSize > MAX_RECORDING_SIZE) {
            toast.error('Recording Size Limit Reached', {
              description: `Maximum recording size of ${(MAX_RECORDING_SIZE / (1024 * 1024)).toFixed(0)}MB reached. Recording stopped automatically.`,
            });

            // Stop recording automatically
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
              setIsRecording(false);
              setIsPaused(false);
            }
          }
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setDuration(
          Math.round((Date.now() - startTimeRef.current - totalPausedTimeRef.current) / 1000)
        );

        // Stop all tracks to free up the microphone
        stream.getTracks().forEach((track) => track.stop());

        // Auto-transcribe immediately after recording ends
        toast.success('Recording Complete', { description: 'Starting transcription...' });
        await autoTranscribe(blob);
      };

      mediaRecorderRef.current.start(1000); // Collect data every second
      setIsRecording(true);
      setIsPaused(false);

      toast.success('Recording Started', { description: 'Recording legal proceedings...' });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Recording Error', {
        description: 'Could not access microphone. Please check permissions.',
      });
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      pauseStartTimeRef.current = Date.now();
      setIsPaused(true);

      toast.success('Recording Paused', { description: 'Click resume to continue recording' });
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      const pauseDuration = Date.now() - pauseStartTimeRef.current;
      totalPausedTimeRef.current += pauseDuration;
      mediaRecorderRef.current.resume();
      setIsPaused(false);

      toast.success('Recording Resumed', { description: 'Recording continues...' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);

      toast.success('Recording Stopped', { description: 'Processing recording...' });
    }
  };

  const playRecording = () => {
    if (audioBlob && !isPlaying) {
      // Cleanup previous audio instance if exists
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }

      // Revoke previous URL if exists
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      // Create new audio URL and instance
      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;
      audioRef.current = new Audio(audioUrl);

      audioRef.current.onended = () => {
        setIsPlaying(false);
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
      };

      audioRef.current.onerror = () => {
        setIsPlaying(false);
        toast.error('Playback Error', { description: 'Failed to play audio recording' });
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
      };

      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const pausePlayback = () => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0; // Reset to beginning
      setIsPlaying(false);

      // Cleanup audio resources
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    }
  };

  // Auto-transcribe function called immediately after recording
  const autoTranscribe = async (blob: Blob) => {
    // Validate file size before transcription
    if (blob.size > MAX_RECORDING_SIZE) {
      toast.error('File Too Large', {
        description: `Audio file (${(blob.size / (1024 * 1024)).toFixed(2)}MB) exceeds Whisper API limit of ${(MAX_RECORDING_SIZE / (1024 * 1024)).toFixed(0)}MB. Please record a shorter audio.`,
      });
      return;
    }

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

          const data = await invokeNodeApi<{
            error?: string;
            transcript?: string;
          }>('/api/v1/ai/voice-transcription', {
            method: 'POST',
            body: {
              audio: base64Audio,
              action: 'transcribe',
            },
          });

          if (data?.error) {
            throw new Error(data.error);
          }

          if (!data?.transcript) {
            throw new Error('No transcript returned from service');
          }

          setTranscript(data.transcript);

          toast.success('Transcription Complete', {
            description: 'Audio has been transcribed successfully',
          });
        } catch (innerError: unknown) {
          const errorMessage =
            innerError instanceof Error
              ? innerError.message
              : 'Failed to transcribe audio automatically';
          toast.error('Transcription Failed', { description: errorMessage });
        } finally {
          setIsTranscribing(false);
        }
      };

      reader.onerror = () => {
        console.error('❌ FileReader error');
        setIsTranscribing(false);
        toast.error('File Processing Error', { description: 'Failed to process the audio file' });
      };

      reader.readAsDataURL(blob);
    } catch (error: unknown) {
      console.error('❌ Auto-transcription setup error:', error);
      setIsTranscribing(false);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to set up transcription';
      toast.error('Transcription Setup Failed', { description: errorMessage });
    }
  };

  const transcribeAudio = async () => {
    if (!audioBlob) {
      toast.error('No Recording', { description: 'Please record audio first' });
      return;
    }

    // Validate file size before transcription
    if (audioBlob.size > MAX_RECORDING_SIZE) {
      toast.error('File Too Large', {
        description: `Audio file (${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB) exceeds Whisper API limit of ${(MAX_RECORDING_SIZE / (1024 * 1024)).toFixed(0)}MB. Please record a shorter audio.`,
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

        const data = await invokeNodeApi<{
          error?: string;
          transcript?: string;
        }>('/api/v1/ai/voice-transcription', {
          method: 'POST',
          body: {
            audio: base64Audio,
            action: 'transcribe',
          },
        });

        if (data?.error) {
          throw new Error(data.error);
        }

        if (data?.transcript) {
          setTranscript(data.transcript);
        }

        toast.success('Transcription Complete', {
          description: 'Audio has been transcribed successfully',
        });
      };

      reader.readAsDataURL(audioBlob);
    } catch (error: unknown) {
      console.error('Transcription error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to transcribe audio';
      toast.error('Transcription Failed', { description: errorMessage });
    } finally {
      setIsTranscribing(false);
    }
  };

  const generateSummary = async () => {
    if (!transcript.trim()) {
      toast.error('No Transcript', { description: 'Please transcribe audio first' });
      return;
    }

    setIsSummarizing(true);

    try {
      const data = await invokeNodeApi<{ error?: string; summary?: string }>(
        '/api/v1/ai/voice-transcription',
        {
          method: 'POST',
          body: {
            transcript,
            action: 'summarize',
          },
        }
      );

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.summary) {
        setSummary(data.summary);
      }

      toast.success('Summary Generated', { description: 'Transcript summary has been generated' });
    } catch (error: unknown) {
      console.error('Summary error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate summary';
      toast.error('Summary Failed', { description: errorMessage });
    } finally {
      setIsSummarizing(false);
    }
  };

  const saveTranscription = async (saveType: 'transcript' | 'summary') => {
    const contentToSave = saveType === 'summary' ? summary : transcript;

    if (!title.trim() || !contentToSave.trim()) {
      toast.error('Missing Information', {
        description: 'Please provide a title and content to save',
      });
      return;
    }

    setIsSaving(true);

    try {
      // Get current user from session
      const session = getSession();
      const user = session?.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Upload audio file to storage if available
      let audioFilePath = null;
      if (audioBlob) {
        // Validate audio file size (max 50MB for audio)
        const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50MB
        if (audioBlob.size > MAX_AUDIO_SIZE) {
          toast.error('File Too Large', {
            description: `Audio file exceeds maximum size of ${(MAX_AUDIO_SIZE / (1024 * 1024)).toFixed(0)}MB`,
          });
          // Continue without audio file
        } else {
          try {
            const fileName = `audio_${Date.now()}.webm`;
            const audioFile = new File([audioBlob], fileName, { type: 'audio/webm' });
            const uploadResult = await uploadDocument(audioFile);
            audioFilePath = uploadResult.filePath;
          } catch (uploadError) {
            console.error('Error uploading audio:', uploadError);
            toast.error('Audio Upload Warning', {
              description: 'Audio file could not be saved, but transcription will be saved.',
            });
          }
        }
      }

      // Save to voice_transcriptions table via Node backend
      await invokeNodeApi('/api/v1/voice-transcriptions', {
        method: 'POST',
        body: {
          title,
          transcript: saveType === 'transcript' ? transcript : '',
          summary: saveType === 'summary' ? summary : '',
          case_id: selectedCaseId === 'none' ? null : selectedCaseId,
          duration_seconds: duration,
          status: 'completed',
          audio_file_path: audioFilePath,
          metadata: {
            recordingDate: new Date().toISOString(),
            fileType: 'webm',
            source: 'voice_recorder',
          },
        },
      });

      // Create activity if matter is selected
      if (selectedCaseId && selectedCaseId !== 'none') {
        await createActivity.mutateAsync({
          caseId: selectedCaseId,
          payload: {
            title: `Voice Recording: ${title}`,
            description: `${saveType === 'summary' ? 'Summary' : 'Transcript'} saved from voice recording`,
            activity_type: 'voice_recording',
            status: 'completed',
          },
        });
      }

      toast.success('Saved Successfully', {
        description: `${saveType === 'summary' ? 'Summary' : 'Transcript'} has been saved${selectedCaseId && selectedCaseId !== 'none' ? ' and linked to the matter' : ''}`,
      });

      // Reset form
      setTitle('');
      setTranscript('');
      setSummary('');
      setSelectedCaseId('none');
      setAudioBlob(null);
      setDuration(null);
    } catch (error: unknown) {
      console.error('Save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save transcription';
      toast.error('Save Failed', { description: errorMessage });
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
                Microphone access is required for voice recording. Please allow microphone access
                and refresh the page.
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
                  <Button
                    onClick={pauseRecording}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Pause className="h-4 w-4" />
                    <span>Pause</span>
                  </Button>
                ) : (
                  <Button
                    onClick={resumeRecording}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Play className="h-4 w-4" />
                    <span>Resume</span>
                  </Button>
                )}
                <Button
                  onClick={stopRecording}
                  variant="destructive"
                  className="flex items-center space-x-2"
                >
                  <Square className="h-4 w-4" />
                  <span>Stop Recording</span>
                </Button>
              </div>
            )}

            {audioBlob && (
              <div className="flex items-center space-x-2">
                {!isPlaying ? (
                  <Button
                    onClick={playRecording}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Play className="h-4 w-4" />
                    <span>Play</span>
                  </Button>
                ) : (
                  <Button
                    onClick={pausePlayback}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Pause className="h-4 w-4" />
                    <span>Pause</span>
                  </Button>
                )}
                {duration && (
                  <span className="text-sm text-muted-foreground">Duration: {duration}s</span>
                )}
              </div>
            )}
          </div>

          {isRecording && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-red-600">
                <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
                <span className="text-sm font-medium">
                  {isPaused ? 'Recording paused...' : 'Recording in progress...'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Recording size: {(recordingSize / (1024 * 1024)).toFixed(2)} MB /{' '}
                  {(MAX_RECORDING_SIZE / (1024 * 1024)).toFixed(0)} MB
                </span>
                <div className="w-48 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      recordingSize > MAX_RECORDING_SIZE * 0.9
                        ? 'bg-red-600'
                        : recordingSize > MAX_RECORDING_SIZE * 0.7
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{
                      width: `${Math.min((recordingSize / MAX_RECORDING_SIZE) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
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
            <CardDescription>
              Save transcript or summary and optionally link to a matter
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Recording title (e.g., 'Client Meeting - Smith vs Jones')"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
              <SelectTrigger>
                <SelectValue placeholder="Link to matter (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No matter selected</SelectItem>
                {cases?.map((caseItem: Case) => (
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
