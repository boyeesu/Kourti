import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, File, X, Check, AlertCircle, User, Calendar } from "lucide-react";
import { useCases } from "@/context/CasesContext";
import { useOrganizationMembers } from "@/hooks/useOrganization";
import { useNotifications } from "@/components/ui/notifications";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  type: string;
  status: 'uploading' | 'uploaded' | 'approved' | 'rejected';
  progress: number;
}

export default function DocumentUpload() {
  const { cases } = useCases();
  const { data: orgMembers = [] } = useOrganizationMembers();
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
  const [documentData, setDocumentData] = useState({
    linkedCase: "",
    description: "",
    approver: "",
    tags: "",
  });
  const { addNotification } = useNotifications();

  // Find approver member outside of conditional logic
  const approverMember = orgMembers.find(m => m.user_id === documentData.approver);

  const [dragActive, setDragActive] = useState(false);

  const documentCategories = [
    "Contract",
    "Legal Brief",
    "Evidence",
    "Correspondence",
    "Court Filing",
    "Research",
    "Client Document",
    "Internal Memo",
    "Financial Record",
    "Other"
  ];

  const approvers = [
    "Sarah Wilson",
    "Michael Chen",
    "Jessica Thompson",
    "David Rodriguez",
    "Emily Parker"
  ];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (fileList: FileList) => {
    const files = Array.from(fileList);
    const newFiles: UploadedFile[] = files.map((file, index) => ({
      id: `file-${Date.now()}-${index}`,
      name: file.name,
      size: formatFileSize(file.size),
      type: file.name.split('.').pop()?.toUpperCase() || 'Unknown',
      status: 'uploading',
      progress: 0,
    }));

    setSelectedFiles(prev => [...prev, ...newFiles]);

    // Simulate upload progress
    newFiles.forEach((file, index) => {
      simulateUpload(file.id, index * 500);
    });
  };

  const simulateUpload = (fileId: string, delay: number) => {
    setTimeout(() => {
      const interval = setInterval(() => {
        setSelectedFiles(prev => prev.map(file => {
          if (file.id === fileId) {
            const newProgress = file.progress + 10;
            if (newProgress >= 100) {
              clearInterval(interval);
              return { ...file, progress: 100, status: 'uploaded' };
            }
            return { ...file, progress: newProgress };
          }
          return file;
        }));
      }, 100);
    }, delay);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const removeFile = (fileId: string) => {
    setSelectedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Submit document upload when backend is ready
    console.log("Document upload:", { documentData, files: selectedFiles });
    // Notify approver
    if (documentData.approver) {
      const docName = selectedFiles.length ? selectedFiles[0].name : 'A document';
      addNotification({
        type: 'approval',
        title: 'Document Sent for Your Review',
        description: `The document "${docName}" has been assigned for your approval.${approverMember ? ' (' + approverMember.first_name + ' ' + approverMember.last_name + ')' : ''}`
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploaded':
        return <Check className="h-4 w-4 text-green-600" />;
      case 'approved':
        return <Check className="h-4 w-4 text-green-600" />;
      case 'rejected':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'uploading':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs />
      <div>
        <h1 className="text-2xl font-semibold">Upload Documents</h1>
        <p className="text-muted-foreground">Upload and manage documents for approval</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Document Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Linked Case</Label>
                <Select value={documentData.linkedCase} onValueChange={(value) => setDocumentData({ ...documentData, linkedCase: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a case" />
                  </SelectTrigger>
                  <SelectContent>
                    {cases.map((case_) => (
                      <SelectItem key={case_.id} value={case_.id}>
                        {case_.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category field removed as requested */}

              <div className="space-y-2">
                <Label>Approver</Label>
                <Select value={documentData.approver} onValueChange={(value) => setDocumentData({ ...documentData, approver: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select approver" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgMembers.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {member.first_name} {member.last_name} ({member.email})
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Document description"
                  value={documentData.description}
                  onChange={(e) => setDocumentData({ ...documentData, description: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  placeholder="e.g. urgent, confidential, draft"
                  value={documentData.tags}
                  onChange={(e) => setDocumentData({ ...documentData, tags: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>File Upload</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center transition-colors border-muted-foreground/25 hover:border-primary/50 relative"
              >
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <div className="space-y-2">
                  <p className="text-lg font-medium">Select files to upload</p>
                  <p className="text-muted-foreground">Click the button below to choose files from your device.</p>
                </div>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                />
                <Button type="button" onClick={() => document.getElementById('file-upload')?.click()} className="mt-4">
                  Browse Files
                </Button>
                <p className="text-xs text-muted-foreground mt-4">
                  Supports: PDF, DOC, DOCX, TXT, JPG, PNG (Max 10MB each)
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {selectedFiles.length > 0 && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Uploaded Files ({selectedFiles.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {selectedFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-4 p-4 border rounded-lg">
                    <File className="h-8 w-8 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">{file.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {file.type}
                        </Badge>
                        <Badge variant="outline" className={getStatusColor(file.status)}>
                          {getStatusIcon(file.status)}
                          {file.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{file.size}</p>
                      {file.status === 'uploading' && (
                        <Progress value={file.progress} className="h-2" />
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(file.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline">
            Save as Draft
          </Button>
          <Button type="submit" disabled={selectedFiles.length === 0}>
            Submit for Approval
          </Button>
        </div>
      </form>
    </div>
  );
}