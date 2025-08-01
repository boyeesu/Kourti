import { useState } from "react";
import { useSearch } from "@/hooks/use-search";
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
  ExternalLink,
  Calendar,
  User
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Documents() {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const { term: globalSearch } = useSearch();

  const documents = [
    {
      id: "DOC-001",
      name: "Smith_Contract_Amendment_v2.pdf",
      type: "PDF",
      size: "2.4 MB",
      uploadedBy: "Sarah Wilson",
      uploadDate: "2024-01-28",
      linkedCase: "CASE-001",
      googleDriveId: "1abc123def456",
      comments: 5,
      lastAccessed: "2 hours ago",
      status: "Under Review"
    },
    {
      id: "DOC-002", 
      name: "Corporate_Merger_Analysis.docx",
      type: "DOCX",
      size: "1.8 MB",
      uploadedBy: "Michael Chen",
      uploadDate: "2024-01-27",
      linkedCase: "CASE-002",
      googleDriveId: "2def456ghi789",
      comments: 3,
      lastAccessed: "1 day ago",
      status: "Approved"
    },
    {
      id: "DOC-003",
      name: "Employment_Agreement_Template.pdf",
      type: "PDF", 
      size: "892 KB",
      uploadedBy: "Jessica Thompson",
      uploadDate: "2024-01-26",
      linkedCase: "CASE-003",
      googleDriveId: "3ghi789jkl012",
      comments: 1,
      lastAccessed: "3 days ago",
      status: "Draft"
    },
    {
      id: "DOC-004",
      name: "Patent_Application_Draft.pdf",
      type: "PDF",
      size: "5.2 MB", 
      uploadedBy: "David Rodriguez",
      uploadDate: "2024-01-25",
      linkedCase: "CASE-004",
      googleDriveId: "4jkl012mno345",
      comments: 8,
      lastAccessed: "5 days ago",
      status: "Final"
    },
    {
      id: "DOC-005",
      name: "Property_Deed_Review.pdf",
      type: "PDF",
      size: "3.1 MB",
      uploadedBy: "Sarah Wilson",
      uploadDate: "2024-01-24",
      linkedCase: "CASE-005",
      googleDriveId: "5mno345pqr678",
      comments: 2,
      lastAccessed: "1 week ago",
      status: "Under Review"
    }
  ];

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Approved": return "bg-success text-success-foreground";
      case "Under Review": return "bg-warning text-warning-foreground";
      case "Draft": return "bg-muted text-muted-foreground";
      case "Final": return "bg-primary text-primary-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const handleViewDocument = (driveId: string) => {
    const url = `https://drive.google.com/file/d/${driveId}/view`;
    window.open(url, "_blank", "noopener");
  };

  const handleDownloadDocument = (driveId: string) => {
    const url = `https://drive.google.com/uc?export=download&id=${driveId}`;
    window.open(url, "_blank", "noopener");
  };

  const filteredDocuments = documents.filter(doc => {
    const termMatches = (t: string) =>
      doc.name.toLowerCase().includes(t.toLowerCase()) ||
      doc.linkedCase.toLowerCase().includes(t.toLowerCase());

    const matchesLocal = searchTerm === "" || termMatches(searchTerm);
    const matchesGlobal = globalSearch === "" || termMatches(globalSearch);
    const matchesType = typeFilter === "all" || doc.type.toLowerCase() === typeFilter;
    return matchesLocal && matchesGlobal && matchesType;
  });

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Documents</h1>
          <p className="text-muted-foreground">Manage and review legal documents with Google Drive integration</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="shadow-sm">
            <ExternalLink className="h-4 w-4 mr-2" />
            Connect Google Drive
          </Button>
          <Button className="shadow-md">
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
                <p className="text-2xl font-bold">156</p>
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
                <p className="text-2xl font-bold">23</p>
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
                <p className="text-2xl font-bold">12</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <ExternalLink className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Google Drive</p>
                <p className="text-2xl font-bold">89%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Filter Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents, cases, or file names..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="docx">Word Documents</SelectItem>
                <SelectItem value="jpg">Images</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

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
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Linked Case</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Last Accessed</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {getFileIcon(doc.type)}
                        <div>
                          <div className="font-medium">{doc.name}</div>
                          <div className="text-sm text-muted-foreground">ID: {doc.id}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{doc.type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{doc.size}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{doc.linkedCase}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(doc.status)} variant="secondary">
                        {doc.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm">{doc.uploadedBy}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {doc.uploadDate}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{doc.comments}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.lastAccessed}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => handleViewDocument(doc.googleDriveId)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Document
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <MessageSquare className="h-4 w-4 mr-2" />
                            AI Review
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleDownloadDocument(doc.googleDriveId)}>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Share className="h-4 w-4 mr-2" />
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleViewDocument(doc.googleDriveId)}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open in Google Drive
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
    </div>
  );
}