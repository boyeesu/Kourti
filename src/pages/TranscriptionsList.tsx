import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useVoiceTranscriptions } from '@/hooks/useVoiceTranscriptions';
import {
  FileAudio,
  Plus,
  Clock,
  Calendar,
  FileText,
  Loader2,
  Mic
} from 'lucide-react';
import { format } from 'date-fns';

const TranscriptionsList: React.FC = () => {
  const navigate = useNavigate();
  const { data: transcriptions, isLoading, error } = useVoiceTranscriptions();

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading transcriptions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Mic className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Voice Transcriptions</h1>
        </div>
        <Button onClick={() => navigate('/voice-recorder')}>
          <Plus className="h-4 w-4 mr-2" />
          New Recording
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <FileAudio className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {error.message === 'User not authenticated'
                  ? 'Authentication Required'
                  : 'Error Loading Transcriptions'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {error.message === 'User not authenticated'
                  ? 'Please log in to view your transcriptions.'
                  : 'There was an error loading your transcriptions. Please try again.'}
              </p>
              {error.message === 'User not authenticated' && (
                <Button onClick={() => navigate('/auth')}>
                  Go to Login
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!error && (!transcriptions || transcriptions.length === 0) ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <FileAudio className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Transcriptions Yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by creating your first voice recording to see transcriptions here.
              </p>
              <Button onClick={() => navigate('/voice-recorder')}>
                <Mic className="h-4 w-4 mr-2" />
                Create First Recording
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {transcriptions?.map((transcription) => (
            <Card
              key={transcription.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/transcriptions/${transcription.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl mb-1">{transcription.title}</CardTitle>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>{format(new Date(transcription.created_at), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                      {transcription.duration_seconds && (
                        <div className="flex items-center space-x-1">
                          <Clock className="h-4 w-4" />
                          <span>{transcription.duration_seconds}s</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant={transcription.status === 'completed' ? 'default' : 'secondary'}>
                    {transcription.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Transcript Preview */}
                  {transcription.transcript && (
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Transcript</span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {transcription.transcript.length > 200
                          ? `${transcription.transcript.substring(0, 200)}...`
                          : transcription.transcript
                        }
                      </p>
                    </div>
                  )}

                  {/* Summary Preview */}
                  {transcription.summary && (
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Summary</span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {transcription.summary.length > 150
                          ? `${transcription.summary.substring(0, 150)}...`
                          : transcription.summary
                        }
                      </p>
                    </div>
                  )}

                  {!transcription.transcript && !transcription.summary && (
                    <p className="text-sm text-muted-foreground italic">
                      No content available
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TranscriptionsList;