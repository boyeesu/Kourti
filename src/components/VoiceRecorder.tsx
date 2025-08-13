import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Square, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface VoiceRecorderProps {
  onTranscription: (transcription: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
}

export function VoiceRecorder({ onTranscription, onRecordingChange }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    checkMicrophonePermission();
  }, []);

  const checkMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);
      stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately
    } catch (error) {
      setHasPermission(false);
      console.error("Microphone permission denied:", error);
    }
  };

  const startRecording = async () => {
    try {
      if (!hasPermission) {
        await checkMicrophonePermission();
        if (!hasPermission) {
          toast.error("Microphone permission is required for voice recording");
          return;
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        // Transcribe the audio
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      onRecordingChange?.(true);
      toast.success("Recording started");
    } catch (error) {
      console.error("Error starting recording:", error);
      toast.error("Failed to start recording");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      onRecordingChange?.(false);
      toast.success("Recording stopped");
    }
  };

  const transcribeAudio = async (_audioBlob: Blob) => {
    setIsTranscribing(true);
    
    try {
      // Check if Web Speech API is available
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        // Use Web Speech API for real-time transcription (Chrome/Edge)
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
        // Convert blob to audio element for recognition
          const transcript = event.results[0][0].transcript;
          onTranscription(transcript);
          toast.success("Audio transcribed successfully");
        };
        
        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          // Fallback to manual transcription entry
          fallbackTranscription();
        };
        
        recognition.start();
      } else {
        // Fallback for browsers without Web Speech API
        fallbackTranscription();
      }
    } catch (error) {
      console.error("Transcription error:", error);
      fallbackTranscription();
    } finally {
      setIsTranscribing(false);
    }
  };

  const fallbackTranscription = () => {
    // For now, we'll prompt the user to manually enter transcription
    // In a production app, you'd send the audio to a transcription service
    const transcript = prompt("Please enter the transcription manually (automatic transcription not available):");
    if (transcript) {
      onTranscription(transcript);
      toast.success("Transcription added manually");
    } else {
      toast.error("No transcription provided");
    }
  };

  const playRecording = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play();
    }
  };

  if (hasPermission === null) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking microphone permissions...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (hasPermission === false) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-center space-y-2">
            <MicOff className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Microphone access is required for voice recording
            </p>
            <Button size="sm" onClick={checkMicrophonePermission}>
              Grant Permission
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-4">
            {!isRecording ? (
              <Button
                onClick={startRecording}
                className="bg-red-500 hover:bg-red-600 text-white hover-scale"
                size="lg"
              >
                <Mic className="h-5 w-5 mr-2" />
                Start Recording
              </Button>
            ) : (
              <Button
                onClick={stopRecording}
                variant="destructive"
                size="lg"
                className="hover-scale"
              >
                <Square className="h-5 w-5 mr-2" />
                Stop Recording
              </Button>
            )}
          </div>

          {isRecording && (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-red-500">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">Recording in progress...</span>
              </div>
            </div>
          )}

          {isTranscribing && (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Transcribing audio...</span>
              </div>
            </div>
          )}

          {audioUrl && !isRecording && (
            <div className="text-center">
              <Button variant="outline" onClick={playRecording} size="sm">
                <Play className="h-4 w-4 mr-2" />
                Play Recording
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}