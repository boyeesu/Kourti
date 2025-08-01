import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Calendar, User, Clock, CheckCircle2, AlertCircle, XCircle, Upload, FileText, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { useCases } from "@/context/CasesContext";
import { toast } from "sonner";

interface Activity {
  id: string;
  title: string;
  description: string;
  type: string;
  assignedTo: string;
  dueDate: string;
  status: string;
  createdAt: string;
  createdBy: string;
  documents?: ActivityDocument[];
  notes?: string;
  voiceTranscription?: string;
}

interface ActivityDocument {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadedAt: string;
}

export default function CaseActivities() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { cases } = useCases();
  const caseItem = cases.find((c) => c.id === caseId);

  const [activities, setActivities] = useState<Activity[]>([
    {
      id: "ACT-001",
      title: "Initial Client Meeting",
      description: "Meet with client to discuss case details and gather initial documentation",
      type: "Meeting",
      assignedTo: "Sarah Wilson",
      dueDate: "2024-02-05",
      status: "Completed",
      createdAt: "2024-01-20",
      createdBy: "Sarah Wilson",
      documents: [
        {
          id: "DOC-001",
          name: "Meeting_Notes.pdf",
          size: "1.2 MB",
          type: "PDF",
          uploadedAt: "2024-01-20",
        }
      ],
      notes: "Client provided all necessary documentation. Next step is to review contracts.",
    },
    {
      id: "ACT-002",
      title: "Document Review",
      description: "Review all contract documents and identify key issues",
      type: "Research",
      assignedTo: "Michael Chen",
      dueDate: "2024-02-10",
      status: "In Progress",
      createdAt: "2024-01-22",
      createdBy: "Sarah Wilson",
      voiceTranscription: "We need to pay special attention to clauses 3.2 and 7.1 which contain ambiguous language regarding liability. The client mentioned these were their main concerns during our initial meeting.",
    },
    {
      id: "ACT-003",
      title: "Court Filing",
      description: "Prepare and file initial motion with the court",
      type: "Court",
      assignedTo: "Sarah Wilson",
      dueDate: "2024-02-15",
      status: "Pending",
      createdAt: "2024-01-25",
      createdBy: "Sarah Wilson",
    },
  ]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newActivity, setNewActivity] = useState({
    title: "",
    description: "",
    type: "Meeting",
    assignedTo: "",
    dueDate: "",
    status: "Pending",
    notes: "",
    voiceTranscription: "",
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const activityTypes = ["Meeting", "Court", "Research", "Documentation", "Communication", "Filing", "Other"];

  const statusColors = {
    "Completed": "text-success",
    "In Progress": "text-warning",
    "Pending": "text-muted-foreground",
    "Cancelled": "text-destructive"
  };

  const typeColors = {
    "Meeting": "bg-primary/10 text-primary",
    "Court": "bg-destructive/10 text-destructive",
    "Research": "bg-info/10 text-info",
    "Documentation": "bg-warning/10 text-warning",
    "Communication": "bg-success/10 text-success",
    "Filing": "bg-secondary/10 text-secondary",
    "Other": "bg-muted/10 text-muted-foreground"
  };

  if (!caseItem) {
    return (
      <div className="px-4 py-6 animate-fade-in">
        <p className="text-muted-foreground">Case not found.</p>
      </div>
    );
  }

  const handleCreateActivity = () => {
    if (!newActivity.title || !newActivity.description) {
      toast.error("Please fill in title and description");
      return;
    }

    // Process uploaded documents
    const documents: ActivityDocument[] = selectedFiles.map((file, index) => ({
      id: `DOC-${Date.now()}-${index}`,
      name: file.name,
      size: formatFileSize(file.size),
      type: file.type,
      uploadedAt: new Date().toISOString(),
    }));

    const activity: Activity = {
      id: `ACT-${String(activities.length + 1).padStart(3, "0")}`,
      title: newActivity.title,
      description: newActivity.description,
      type: newActivity.type,
      assignedTo: newActivity.assignedTo,
      dueDate: newActivity.dueDate,
      status: newActivity.status,
      createdAt: new Date().toISOString().split("T")[0],
      createdBy: "Current User",
      documents,
      notes: newActivity.notes,
      voiceTranscription: newActivity.voiceTranscription,
    };

    setActivities([...activities, activity]);
    setNewActivity({
      title: "",
      description: "",
      type: "Meeting",
      assignedTo: "",
      dueDate: "",
      status: "Pending",
      notes: "",
      voiceTranscription: "",
    });
    setSelectedFiles([]);
    setDialogOpen(false);
    toast.success("Activity created successfully");
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleVoiceTranscription = (transcription: string) => {
    setNewActivity(prev => ({
      ...prev,
      voiceTranscription: prev.voiceTranscription 
        ? `${prev.voiceTranscription}\n\n${transcription}`
        : transcription
    }));
    toast.success("Voice transcription added");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Completed": return <CheckCircle2 className="h-4 w-4" />;
      case "In Progress": return <Clock className="h-4 w-4" />;
      case "Pending": return <AlertCircle className="h-4 w-4" />;
      case "Cancelled": return <XCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => navigate(`/cases/${caseId}`)}
            className="hover-scale"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Activities & Timeline</h1>
            <p className="text-muted-foreground">{caseItem.name}</p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md hover-scale">
              <Plus className="h-4 w-4 mr-2" />
              Add Activity
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Activity</DialogTitle>
            </DialogHeader>
            
            <Tabs defaultValue="basic" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="voice">Voice Recording</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={newActivity.title}
                      onChange={(e) => setNewActivity({ ...newActivity, title: e.target.value })}
                      placeholder="Activity title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="type">Type</Label>
                    <Select
                      value={newActivity.type}
                      onValueChange={(value) => setNewActivity({ ...newActivity, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {activityTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newActivity.description}
                    onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                    placeholder="Activity description"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="assignedTo">Assigned To</Label>
                    <Input
                      id="assignedTo"
                      value={newActivity.assignedTo}
                      onChange={(e) => setNewActivity({ ...newActivity, assignedTo: e.target.value })}
                      placeholder="Assignee name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dueDate">Due Date</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={newActivity.dueDate}
                      onChange={(e) => setNewActivity({ ...newActivity, dueDate: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={newActivity.status}
                    onValueChange={(value) => setNewActivity({ ...newActivity, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="documents" className="space-y-4">
                <div>
                  <Label>Upload Documents</Label>
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center space-y-4">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Drag and drop files here, or click to select
                      </p>
                      <input
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                        id="file-upload"
                        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('file-upload')?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Choose Files
                      </Button>
                    </div>
                  </div>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="space-y-2">
                    <Label>Selected Files</Label>
                    <div className="space-y-2">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-primary" />
                            <div>
                              <p className="text-sm font-medium">{file.name}</p>
                              <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="notes" className="space-y-4">
                <div>
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    value={newActivity.notes}
                    onChange={(e) => setNewActivity({ ...newActivity, notes: e.target.value })}
                    placeholder="Enter additional notes for this activity..."
                    rows={6}
                  />
                </div>
              </TabsContent>

              <TabsContent value="voice" className="space-y-4">
                <div>
                  <Label>Voice Recording & Transcription</Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Record voice notes that will be automatically transcribed and added to the activity.
                  </p>
                  
                  <VoiceRecorder 
                    onTranscription={handleVoiceTranscription}
                    onRecordingChange={setIsRecording}
                  />
                  
                  {newActivity.voiceTranscription && (
                    <div className="mt-4">
                      <Label>Voice Transcription</Label>
                      <Textarea
                        value={newActivity.voiceTranscription}
                        onChange={(e) => setNewActivity({ ...newActivity, voiceTranscription: e.target.value })}
                        placeholder="Voice transcription will appear here..."
                        rows={4}
                        className="mt-2"
                      />
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateActivity} disabled={isRecording}>
                {isRecording ? "Recording..." : "Create Activity"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Activities List */}
      <div className="space-y-4">
        {activities.map((activity) => (
          <Card key={activity.id} className="shadow-card hover:shadow-elegant transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-foreground">{activity.title}</h3>
                    <Badge className={typeColors[activity.type as keyof typeof typeColors]} variant="outline">
                      {activity.type}
                    </Badge>
                    <div className={`flex items-center gap-1 ${statusColors[activity.status as keyof typeof statusColors]}`}>
                      {getStatusIcon(activity.status)}
                      <span className="text-sm font-medium">{activity.status}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">{activity.description}</div>
                    
                    {activity.documents && activity.documents.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium mb-2">Documents ({activity.documents.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {activity.documents.map((doc) => (
                            <div key={doc.id} className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
                              <FileText className="h-3 w-3" />
                              {doc.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {activity.notes && (
                      <div className="mt-3">
                        <p className="text-sm font-medium mb-1">Notes</p>
                        <p className="text-sm text-muted-foreground">{activity.notes}</p>
                      </div>
                    )}
                    
                    {activity.voiceTranscription && (
                      <div className="mt-3">
                        <div className="flex items-center gap-1 mb-1">
                          <Mic className="h-3 w-3" />
                          <p className="text-sm font-medium">Voice Transcription</p>
                        </div>
                        <p className="text-sm text-muted-foreground italic bg-muted/50 p-2 rounded">
                          "{activity.voiceTranscription}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {activity.assignedTo}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Due: {activity.dueDate}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Created: {activity.createdAt}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {activities.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Activities Yet</h3>
            <p className="text-muted-foreground mb-4">
              Start by creating your first activity for this case.
            </p>
            <Button onClick={() => setDialogOpen(true)} className="hover-scale">
              <Plus className="h-4 w-4 mr-2" />
              Create First Activity
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}