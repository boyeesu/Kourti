
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearch } from "@/hooks/use-search";
import { useDocuments } from "@/hooks/useDocuments";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Upload, 
  Search, 
  Filter, 
  Eye, 
  Download, 
  Share,
  MoreVertical,
  FileText,
  FileImage,
  File,
  MessageSquare,
  Calendar,
  User
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Document } from "@/types";

import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { DocumentViewer } from '@/components/DocumentViewer';
import { InternalShareDialog } from '@/components/InternalShareDialog';

export default function Documents() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [shareDocument, setShareDocument] = useState<Document | null>(null);
  const { term: globalSearch } = useSearch();
  const { data: documents = [], isLoading } = useDocuments();

  // Handler functions
  const handleDownload = async (doc: Document) => {
    if (!doc.file_path) return;
    
    try {
      const { data } = await supabase.storage
        .from('documents')
        .download(doc.file_path);
      
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = (doc as any).metadata?.original_filename || doc.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleShare = (doc: Document) => {
    setShareDocument(doc);
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const getFileIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "pdf": return <FileText className="h-5 w-5 text-destructive" />;
      case "docx":
      case "doc": return <FileText className="h-5 w-5 text-primary" />;
      case "jpg":
      case "jpeg":
      case "png": return <FileImage className="h-5 w-5 text-success" />;
      default: return <File className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const filteredDocuments = documents.filter((doc: Document) => {
    const docTitle = doc.title || doc.name || '';
    const termMatches = (t: string) =>
      docTitle.toLowerCase().includes(t.toLowerCase());

    const matchesLocal = searchTerm === "" || termMatches(searchTerm);
    const matchesGlobal = globalSearch === "" || termMatches(globalSearch);
    const matchesType = typeFilter === "all" || (doc.file_type && doc.file_type.toLowerCase() === typeFilter);
    return matchesLocal && matchesGlobal && matchesType;
  });

  return (
    <div className="px-4 py-6 space-y-6">
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Documents</h1>
          <p className="text-muted-foreground">Manage and review legal documents with AI-powered analysis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="shadow-sm" onClick={() => navigate("/documents/upload")}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Documents</p>
                <p className="text-2xl font-bold">{documents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <MessageSquare className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Under Review</p>
                <p className="text-2xl font-bold">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <Download className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 py-2">
        {/* Search */}
        <div className="relative w-full sm:w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents, cases, or file names..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {/* Type */}
        <div className="sm:w-[130px] w-full">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full h-10">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="docx">Word</SelectItem>
              <SelectItem value="jpg">Images</SelectItem>
            </SelectContent>
          </Select>
        </div>
       
       {/* Date Created */}
        <div className="flex gap-1 items-center">
          <label className="text-xs text-muted-foreground">Created:</label>
          <input type="date" className="h-10 px-2 rounded-md border border-input bg-background text-sm" />
          <span className="px-1 text-xs text-muted-foreground">-</span>
          <input type="date" className="h-10 px-2 rounded-md border border-input bg-background text-sm" />
        </div>
      </div>

      {/* Documents Table */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>All Documents ({filteredDocuments.length})</CardTitle>
          <CardDescription>
            Documents linked to cases with AI-powered review capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Linked Case</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Last Accessed</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc: Document) => (
                  <TableRow key={doc.id}>
                     <TableCell>
                       <div className="flex items-center gap-3">
                         {getFileIcon(doc.file_type || 'file')}
                         <div>
                           <div className="font-medium">{doc.title || doc.name}</div>
                         </div>
                       </div>
                     </TableCell>
                      <TableCell>
                         {(doc as any).case ? (
                           <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80" 
                                  onClick={() => navigate(`/cases/${(doc as any).case.id}`)}>
                             {(doc as any).case.title}
                           </Badge>
                         ) : (
                           <span className="text-muted-foreground text-sm">No case linked</span>
                         )}
                       </TableCell>
                     <TableCell>
                       <Badge className="bg-muted text-muted-foreground" variant="secondary">
                         {doc.status || 'Uploaded'}
                       </Badge>
                     </TableCell>
                     <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm">
                              {(doc as any).profiles?.first_name && (doc as any).profiles?.last_name
                                ? `${(doc as any).profiles.first_name} ${(doc as any).profiles.last_name}`
                                : 'Unknown User'}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(doc.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                     <TableCell>
                       <div className="flex items-center gap-1">
                         <MessageSquare className="h-4 w-4 text-muted-foreground" />
                         <span className="text-sm">0</span>
                       </div>
                     </TableCell>
                     <TableCell className="text-sm text-muted-foreground">
                       {new Date(doc.created_at).toLocaleDateString()}
                     </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedDocument(doc)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Document
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/ream-ai?documentId=${doc.id}`)}>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              AI Review
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownload(doc)}>
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleShare(doc)}>
                              <Share className="h-4 w-4 mr-2" />
                              Share Internally
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredDocuments.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No documents found matching your criteria.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Review Panel */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            AI Document Review
          </CardTitle>
          <CardDescription>
            Get AI-powered insights and analysis for your legal documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">Key Clause Detection</h4>
              <p className="text-sm text-muted-foreground">
                Automatically identify important clauses, terms, and conditions in contracts and agreements.
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">Risk Assessment</h4>
              <p className="text-sm text-muted-foreground">
                Flag potential legal risks and areas that require attorney review or attention.
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">Document Summarization</h4>
              <p className="text-sm text-muted-foreground">
                Generate concise summaries of lengthy legal documents for quick review.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Viewer */}
      {selectedDocument && (
        <DocumentViewer
          open={!!selectedDocument}
          onOpenChange={() => setSelectedDocument(null)}
          document={{
            id: selectedDocument.id,
            name: selectedDocument.name || (selectedDocument as any).title || 'Untitled Document',
            file_path: (selectedDocument as any).file_path,
            mime_type: (selectedDocument as any).mime_type,
            file_size: (selectedDocument as any).file_size,
            content: (selectedDocument as any).content,
            metadata: (selectedDocument as any).metadata,
          }}
        />
      )}

      {/* Internal Share Dialog */}
      {shareDocument && (
        <InternalShareDialog
          open={!!shareDocument}
          onOpenChange={() => setShareDocument(null)}
          document={{
            id: shareDocument.id,
            name: shareDocument.name || (shareDocument as any).title || 'Untitled Document',
          }}
        />
      )}
    </div>
  );
}
