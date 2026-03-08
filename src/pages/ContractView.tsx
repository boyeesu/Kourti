import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useContract } from '@/hooks/useContracts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import {
  Download,
  Edit,
  GitBranch,
  FileText,
  Calendar,
  Building,
  DollarSign,
  Clock,
  Eye,
  Share,
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Bot,
  Save,
  X,
  FileDown,
} from 'lucide-react';
import { RichTextEditor } from '@/components/RichTextEditor';
import { exportAsDocx, exportContractAsPdf } from '@/lib/documentExport';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AIReviewDialog } from '@/components/AIReviewDialog';

export default function ContractView() {
  const { id } = useParams();
  const { data: contract, isLoading, error } = useContract(id!);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading contract...</p>
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="p-6">
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Contract Not Found</h3>
            <p className="text-muted-foreground mb-4">
              {error
                ? 'Error loading contract'
                : "The contract you're looking for doesn't exist or has been removed."}
            </p>
            <Button asChild>
              <Link to="/contracts">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Contracts
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSaveEdit = async () => {
    if (!contract || !editedContent) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('contracts')
        .update({ terms: editedContent })
        .eq('id', contract.id);

      if (error) throw error;

      toast.success('Contract updated successfully');
      setIsEditMode(false);
      // Refresh the contract data
      window.location.reload();
    } catch (err) {
      logError('Save failed', err);
      toast.error('Failed to save contract');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedContent('');
  };

  const handleStartEdit = () => {
    setEditedContent(contract?.terms || '');
    setIsEditMode(true);
  };

  const handleDownloadPDF = async () => {
    if (!contract) return;

    try {
      await exportContractAsPdf(
        {
          title: contract.title,
          content: contract.terms || '',
          type: contract.contract_type,
          value: contract.value,
          currency: contract.currency,
          startDate: contract.start_date,
          endDate: contract.end_date,
        },
        contract.title
      );
      toast.success('Contract downloaded as PDF');
    } catch (err) {
      logError('PDF download failed', err);
      toast.error('Failed to download PDF');
    }
  };

  const handleDownloadDOCX = async () => {
    if (!contract) return;

    try {
      await exportAsDocx(contract.terms || '', contract.title);
      toast.success('Contract downloaded as DOCX');
    } catch (err) {
      logError('DOCX download failed', err);
      toast.error('Failed to download DOCX');
    }
  };

  const handleDownload = async () => {
    if (!contract.terms) return;
    const blob = new Blob([contract.terms], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${contract.title}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'signed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (amount: number | null | undefined, currency: string) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/contracts">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{contract.title}</h1>
            <Badge variant="outline" className={getStatusColor(contract.status)}>
              {contract.status}
            </Badge>
            {contract.terms && (
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                <Bot className="h-3 w-3 mr-1" />
                AI Generated
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">{contract.contract_type || 'Contract'}</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Share className="h-4 w-4 mr-2" />
            Share
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!contract.terms}>
                <FileDown className="h-4 w-4 mr-2" />
                Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDownloadPDF}>
                <FileText className="h-4 w-4 mr-2" />
                Download as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadDOCX}>
                <FileText className="h-4 w-4 mr-2" />
                Download as DOCX
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download as TXT
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" asChild>
            <Link to={`/contracts/${contract.id}/history`}>
              <GitBranch className="h-4 w-4 mr-2" />
              History
            </Link>
          </Button>

          {isEditMode ? (
            <>
              <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleStartEdit} disabled={!contract.terms}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="document">Document</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Contract Summary */}
            <Card className="lg:col-span-2 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Contract Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Contract Value</p>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">
                        {formatCurrency(contract.value, contract.currency || 'USD')}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Start Date</p>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{formatDate(contract.start_date)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">End Date</p>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{formatDate(contract.end_date)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{formatDate(contract.created_at)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Updated</p>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{formatDate(contract.updated_at)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Type</p>
                    <p className="font-medium">{contract.contract_type || 'Standard Contract'}</p>
                  </div>
                </div>

                {contract.description && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Description</p>
                      <p className="text-sm leading-relaxed">{contract.description}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Status & Info */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Status & Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Contract Status</p>
                  <Badge className={getStatusColor(contract.status)}>{contract.status}</Badge>
                </div>

                {contract.client_id && (
                  <div>
                    <p className="text-sm text-muted-foreground">Client</p>
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {(contract as unknown as { client?: { name?: string } }).client?.name ||
                          contract.client_id}
                      </span>
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Contract ID</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                    {contract.id}
                  </code>
                </div>

                {contract.terms && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-blue-700">
                      <Bot className="h-4 w-4" />
                      <span className="text-sm font-medium">AI Generated</span>
                    </div>
                    <p className="text-xs text-blue-600 mt-1">
                      This contract was created using AI and should be reviewed by legal counsel.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="document" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Contract Document
                </CardTitle>
                <div className="flex items-center gap-2">
                  {!isEditMode && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      Read-only view
                    </div>
                  )}
                  {isEditMode && (
                    <Badge
                      variant="secondary"
                      className="bg-amber-50 text-amber-700 border-amber-200"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Editing Mode
                    </Badge>
                  )}
                  {contract.terms && !isEditMode && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="default" className="flex gap-1 items-center">
                          <Sparkles className="h-4 w-4" /> AI Review
                        </Button>
                      </DialogTrigger>
                      <AIReviewDialog contractText={contract.terms} />
                    </Dialog>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {contract.terms ? (
                isEditMode ? (
                  <RichTextEditor
                    content={editedContent}
                    onChange={setEditedContent}
                    editable={true}
                  />
                ) : (
                  <div className="prose max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-muted/30 p-6 rounded-lg border max-h-96 overflow-y-auto">
                      {contract.terms}
                    </pre>
                  </div>
                )
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No contract document available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Contract Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Financial Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contract Value:</span>
                      <span className="font-medium">
                        {formatCurrency(contract.value, contract.currency || 'USD')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Currency:</span>
                      <span className="font-medium">{contract.currency || 'USD'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Timeline</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Effective Date:</span>
                      <span className="font-medium">{formatDate(contract.start_date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expiration Date:</span>
                      <span className="font-medium">{formatDate(contract.end_date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created:</span>
                      <span className="font-medium">{formatDate(contract.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
