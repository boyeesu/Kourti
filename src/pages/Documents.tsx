import { useMemo, useState } from 'react';
import { logError } from '@/lib/logger';
import { useNavigate } from 'react-router-dom';
import { useSearch } from '@/hooks/use-search';
import { useDocuments } from '@/hooks/useDocuments';
import { getNodeDocumentSignedUrl } from '@/lib/backendApi';
import { downloadDocument } from '@/lib/fileApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, ColumnDef } from '@/components/ui/data-table';
import { TableSkeleton } from '@/components/ui/loading-states';
import { EmptyState } from '@/components/ui/empty-state';
import {
  FileText,
  Upload,
  Filter,
  Eye,
  Download,
  Share,
  MoreVertical,
  FileImage,
  File,
  MessageSquare,
  Calendar,
  User,
  ScanSearch,
} from 'lucide-react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Document } from '@/types';
import { DocumentViewer } from '@/components/DocumentViewer';
import { InternalShareDialog } from '@/components/InternalShareDialog';
import { exportAsDocx, exportAsPdf } from '@/lib/documentExport';
import { toast } from 'sonner';
import { ModuleFilterBar } from '@/components/filters/ModuleFilterBar';

export default function Documents() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [shareDocument, setShareDocument] = useState<Document | null>(null);
  const { term: globalSearch } = useSearch();
  const { data: documents = [], isLoading } = useDocuments();
  // Compute filtered documents before any early returns (Rules of Hooks)
  const filteredDocuments = useMemo(() => {
    if (!documents || !Array.isArray(documents)) {
      return [];
    }

    return documents.filter((doc: Document) => {
      const docTitle = doc.title || doc.name || '';
      const matchesTerm = (t: string) => docTitle.toLowerCase().includes(t.toLowerCase());

      const matchesLocal = searchTerm === '' || matchesTerm(searchTerm);
      const matchesGlobal = globalSearch === '' || matchesTerm(globalSearch);
      const matchesType =
        typeFilter === 'all' || (doc.file_type && doc.file_type.toLowerCase() === typeFilter);
      const matchesStatus =
        statusFilter === 'all' || (doc.status && doc.status.toLowerCase() === statusFilter);

      return matchesLocal && matchesGlobal && matchesType && matchesStatus;
    });
  }, [documents, globalSearch, searchTerm, typeFilter, statusFilter]);

  // Helper functions
  const getFileIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'pdf':
        return <FileText className="h-5 w-5 text-destructive" />;
      case 'docx':
      case 'doc':
        return <FileText className="h-5 w-5 text-primary" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
        return <FileImage className="h-5 w-5 text-success" />;
      default:
        return <File className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const handleDownload = async (doc: Document) => {
    if (!doc.file_path) return;

    try {
      try {
        const signed = await getNodeDocumentSignedUrl(doc.id, {
          disposition: 'attachment',
          filename:
            (doc.metadata as { original_filename?: string } | undefined)?.original_filename ||
            doc.name ||
            'download',
        });

        const a = document.createElement('a');
        a.href = signed.signedUrl;
        a.download = signed.fileName || doc.name || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch {
        // Fallback to direct download via fileApi
        const data = await downloadDocument(doc.file_path);
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          (doc.metadata as { original_filename?: string } | undefined)?.original_filename ||
          doc.name ||
          'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      logError('Download failed', err);
    }
  };

  const handleShare = (doc: Document) => {
    setShareDocument(doc);
  };

  // Early return after all hooks
  if (isLoading) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <PageHeader title="Documents" description="Manage and organize your legal documents" />
        <TableSkeleton rows={8} columns={5} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Breadcrumbs />
      <PageHeader
        title="Documents"
        description="Manage and review legal documents with AI-powered analysis"
        actions={
          <>
            <Button
              variant="default"
              className="shadow-md"
              onClick={() => navigate('/contracts/review')}
            >
              <ScanSearch className="h-4 w-4 mr-2" />
              AI Review
            </Button>
            <Button
              variant="outline"
              className="shadow-sm"
              onClick={() => navigate('/documents/upload')}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          </>
        }
      />

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
      <ModuleFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search documents, cases, or file names..."
        searchWidth="w-full sm:w-[280px]"
        filters={[
          {
            key: 'type',
            placeholder: 'Type',
            value: typeFilter,
            onChange: setTypeFilter,
            width: 'w-[130px]',
            icon: <Filter className="h-4 w-4" />,
            options: [
              { value: 'all', label: 'All Types' },
              { value: 'pdf', label: 'PDF' },
              { value: 'docx', label: 'Word' },
              { value: 'doc', label: 'Word (.doc)' },
              { value: 'jpg', label: 'Images' },
              { value: 'png', label: 'PNG' },
            ],
          },
          {
            key: 'status',
            placeholder: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            width: 'w-[150px]',
            options: [
              { value: 'all', label: 'All Status' },
              { value: 'draft', label: 'Draft' },
              { value: 'pending', label: 'Pending' },
              { value: 'signed', label: 'Signed' },
              { value: 'review', label: 'Under Review' },
              { value: 'archived', label: 'Archived' },
            ],
          },
        ]}
        onClearAll={() => {
          setSearchTerm('');
          setTypeFilter('all');
          setStatusFilter('all');
        }}
      />

      {/* Documents Table */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>All Documents ({filteredDocuments.length})</CardTitle>
          <CardDescription>
            Documents linked to cases with AI-powered review capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={
              [
                {
                  id: 'document',
                  header: 'Document',
                  accessorFn: (doc) => doc.title || doc.name,
                  minWidth: '250px',
                  cell: (doc) => (
                    <div className="flex items-center gap-3 max-w-[250px]">
                      {getFileIcon(doc.file_type || 'file')}
                      <div className="font-medium truncate" title={doc.title || doc.name}>
                        {doc.title || doc.name}
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'case',
                  header: 'Linked Case',
                  sortable: false,
                  minWidth: '150px',
                  cell: (doc) => {
                    const docCase = (doc as unknown as { case?: { id: string; title: string } })
                      .case;
                    return docCase ? (
                      <Badge
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80 max-w-[150px] truncate"
                        onClick={() => navigate(`/matters/${docCase.id}`)}
                        title={docCase.title}
                      >
                        {docCase.title}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">No case linked</span>
                    );
                  },
                },
                {
                  id: 'status',
                  header: 'Status',
                  accessorKey: 'status',
                  minWidth: '120px',
                  cell: (doc) => (
                    <Badge className="bg-muted text-muted-foreground" variant="secondary">
                      {doc.status || 'Uploaded'}
                    </Badge>
                  ),
                },
                {
                  id: 'uploadedBy',
                  header: 'Uploaded By',
                  sortable: false,
                  minWidth: '180px',
                  cell: (doc) => (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm">
                          {(() => {
                            const profiles = (
                              doc as unknown as {
                                profiles?: { first_name?: string; last_name?: string };
                              }
                            ).profiles;
                            return profiles?.first_name && profiles?.last_name
                              ? `${profiles.first_name} ${profiles.last_name}`
                              : 'Unknown User';
                          })()}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(doc.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'comments',
                  header: 'Comments',
                  sortable: false,
                  minWidth: '100px',
                  cell: () => (
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">0</span>
                    </div>
                  ),
                },
                {
                  id: 'lastAccessed',
                  header: 'Last Accessed',
                  accessorKey: 'created_at',
                  minWidth: '130px',
                  cell: (doc) => (
                    <span className="text-sm text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                  ),
                },
                {
                  id: 'actions',
                  header: 'Actions',
                  sortable: false,
                  minWidth: '80px',
                  cell: (doc) => (
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
                        <DropdownMenuItem
                          onClick={() => {
                            navigate(`/contracts/review?documentId=${doc.id}`);
                          }}
                        >
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
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              await exportAsPdf(
                                doc.content || '',
                                (doc.name || 'document').replace(/[^a-z0-9]/gi, '_').toLowerCase(),
                                doc.name || 'Document'
                              );
                              toast.success('Success', {
                                description: 'Document exported as PDF.',
                              });
                            } catch {
                              toast.error('Error', { description: 'Failed to export PDF.' });
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Export as PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              await exportAsDocx(
                                doc.content || '',
                                (doc.name || 'document').replace(/[^a-z0-9]/gi, '_').toLowerCase()
                              );
                              toast.success('Success', {
                                description: 'Document exported as DOCX.',
                              });
                            } catch {
                              toast.error('Error', { description: 'Failed to export DOCX.' });
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Export as DOCX
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ),
                },
              ] as ColumnDef<Document>[]
            }
            data={filteredDocuments}
            emptyMessage=""
            getRowKey={(row) => row.id}
          />

          {filteredDocuments.length === 0 && documents.length === 0 && (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Upload your first document to get started with AI-powered document management and analysis."
              action={{
                label: 'Upload Document',
                onClick: () => navigate('/documents/upload'),
                icon: Upload,
              }}
            />
          )}
          {filteredDocuments.length === 0 && documents.length > 0 && (
            <EmptyState
              icon={FileText}
              title="No matching documents"
              description={`No documents match "${searchTerm || globalSearch}". Try adjusting your search or filters.`}
              action={{
                label: 'Clear Filters',
                onClick: () => {
                  setSearchTerm('');
                  setTypeFilter('all');
                },
              }}
            />
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
                Automatically identify important clauses, terms, and conditions in contracts and
                agreements.
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
            name: selectedDocument.name || selectedDocument.title || 'Untitled Document',
            file_path: selectedDocument.file_path,
            mime_type: selectedDocument.file_type,
            file_size: selectedDocument.file_size,
            content: selectedDocument.content,
            metadata: selectedDocument.metadata,
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
            name: shareDocument.name || shareDocument.title || 'Untitled Document',
          }}
        />
      )}
    </PageContainer>
  );
}
