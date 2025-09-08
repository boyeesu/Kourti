import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useVoiceTranscription, useUpdateVoiceTranscription, useDeleteVoiceTranscription } from '@/hooks/useVoiceTranscriptions';
import { useCases } from '@/hooks/useCases';
import { useCreateActivity } from '@/features/activities/api/useCreateActivity';
import { 
  ArrowLeft, 
  FileText, 
  Edit3, 
  Trash2, 
  Calendar, 
  Clock, 
  Save, 
  Loader2, 
  Volume2 
} from 'lucide-react';
import { format } from 'date-fns';

const TranscriptionView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  console.log('🔍 TranscriptionView - ID:', id);
  
  const { data: transcription, isLoading, error } = useVoiceTranscription(id!);
  const { data: casesData } = useCases();
  const cases = casesData?.cases || [];
  
  console.log('📄 TranscriptionView - Loading:', isLoading, 'Error:', error, 'Transcription:', transcription?.title);
  
  const updateTranscription = useUpdateVoiceTranscription();
  const deleteTranscription = useDeleteVoiceTranscription();
  const createActivity = useCreateActivity();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedTranscript, setEditedTranscript] = useState('');
  const [editedSummary, setEditedSummary] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('none');

  React.useEffect(() => {
    if (transcription) {
      setEditedTitle(transcription.title);
      setEditedTranscript(transcription.transcript);
      setEditedSummary(transcription.summary || '');
      setSelectedCaseId(transcription.case_id || 'none');
    }
  }, [transcription]);

  const handleSave = async () => {
    if (!transcription || !editedTitle.trim()) {
      toast({
        title: "Validation Error",
        description: "Title is required",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateTranscription.mutateAsync({
        id: transcription.id,
        updates: {
          title: editedTitle,
          transcript: editedTranscript,
          summary: editedSummary,
          case_id: selectedCaseId === 'none' ? undefined : selectedCaseId
        }
      });

      // Create activity if case is linked and changed
      if (selectedCaseId && selectedCaseId !== 'none' && selectedCaseId !== transcription.case_id) {
        await createActivity.mutateAsync({
          caseId: selectedCaseId,
          payload: {
            title: `Voice Recording Updated: ${editedTitle}`,
            description: "Transcription was updated and linked to this case",
            activity_type: 'voice_recording',
            status: 'completed'
          }
        });
      }

      setIsEditing(false);
      toast({
        title: "Success",
        description: "Transcription updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update transcription",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!transcription) return;
    
    if (window.confirm("Are you sure you want to delete this transcription? This action cannot be undone.")) {
      try {
        await deleteTranscription.mutateAsync(transcription.id);
        navigate('/voice-recorder');
        toast({
          title: "Deleted",
          description: "Transcription deleted successfully",
        });
      } catch (error: any) {
        toast({
          title: "Delete Failed",
          description: error.message || "Failed to delete transcription",
          variant: "destructive",
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading transcription...</span>
        </div>
      </div>
    );
  }

  if (error || (!transcription && !isLoading)) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {error?.message === 'User not authenticated' 
                  ? 'Authentication Required'
                  : error 
                    ? 'Error Loading Transcription'
                    : 'Transcription Not Found'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {error?.message === 'User not authenticated'
                  ? 'Please log in to view your transcriptions.'
                  : error 
                    ? 'There was an error loading this transcription.' 
                    : "The transcription you're looking for doesn't exist or has been deleted."
                }
              </p>
              <Button onClick={() => navigate(error?.message === 'User not authenticated' ? '/auth' : '/voice-recorder')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {error?.message === 'User not authenticated' ? 'Go to Login' : 'Back to Voice Recorder'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const linkedCase = cases.find(c => c.id === (selectedCaseId !== 'none' ? selectedCaseId : transcription?.case_id));

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => navigate('/voice-recorder')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        <div>
          <h1 className="text-3xl font-bold">{transcription?.title}</h1>
          <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-1">
            <div className="flex items-center space-x-1">
              <Calendar className="h-4 w-4" />
              <span>{transcription && format(new Date(transcription.created_at), 'MMM d, yyyy at h:mm a')}</span>
            </div>
            {transcription?.duration_seconds && (
              <div className="flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>{transcription.duration_seconds}s</span>
              </div>
            )}
            <Badge variant={transcription?.status === 'completed' ? 'default' : 'secondary'}>
              {transcription?.status}
            </Badge>
          </div>
        </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {!isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Edit3 className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateTranscription.isPending}>
                {updateTranscription.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Case Information */}
      {linkedCase && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Linked Case</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Badge variant="outline">{linkedCase.case_number || 'No number'}</Badge>
              <span className="font-medium">{linkedCase.title}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audio Playback Controls */}
      {transcription?.audio_file_url && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Audio Recording
            </CardTitle>
          </CardHeader>
          <CardContent>
            <audio 
              controls 
              className="w-full"
              preload="metadata"
            >
              <source src={transcription.audio_file_url} type="audio/webm" />
              <source src={transcription.audio_file_url} type="audio/mp3" />
              Your browser does not support the audio element.
            </audio>
            <div className="flex justify-between text-sm text-muted-foreground mt-2">
              <span>Duration: {transcription.duration_seconds ? `${Math.floor(transcription.duration_seconds / 60)}:${(transcription.duration_seconds % 60).toString().padStart(2, '0')}` : 'Unknown'}</span>
              <span>Recorded: {format(new Date(transcription.created_at), 'PPP')}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Form */}
      {isEditing && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Transcription</CardTitle>
            <CardDescription>Update the transcription details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                placeholder="Enter transcription title"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Link to Case (Optional)</label>
              <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a case to link" />
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcript */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Transcript</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Textarea
              value={editedTranscript}
              onChange={(e) => setEditedTranscript(e.target.value)}
              placeholder="Transcript content..."
              className="min-h-[300px] font-mono text-sm"
            />
          ) : (
            <div className="prose max-w-none">
              <div className="whitespace-pre-wrap font-mono text-sm bg-muted p-4 rounded-lg">
                {transcription?.transcript || 'No transcript available'}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {(transcription?.summary || isEditing) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>AI Summary</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Textarea
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                placeholder="Summary content..."
                className="min-h-[200px]"
              />
            ) : (
              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap p-4 bg-muted rounded-lg">
                  {transcription?.summary || 'No summary available'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TranscriptionView;