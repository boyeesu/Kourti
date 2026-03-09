import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { useCreateContract } from '@/hooks/useContracts';
import { useCases } from '@/hooks/useCases';
import { useClients } from '@/hooks/useClients';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUserOrganization } from '@/hooks/useUserOrganization';

interface ContractUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContractUploadDialog({ open, onOpenChange }: ContractUploadDialogProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [contractData, setContractData] = useState({
    title: '',
    description: '',
    contract_type: '',
    client_id: '',
    case_id: '',
    value: '',
    currency: 'USD',
  });

  const { toast } = useToast();
  const createContract = useCreateContract();
  const { data: casesData } = useCases();
  const { data: clientsData } = useClients();
  const { data: organizationId } = useUserOrganization();

  const cases = Array.isArray(casesData) ? casesData : casesData?.cases || [];
  const clients = Array.isArray(clientsData) ? clientsData : clientsData?.items || [];

  const contractTypes = [
    'Service Agreement',
    'Non-Disclosure Agreement',
    'Employment Contract',
    'Purchase Agreement',
    'Lease Agreement',
    'Partnership Agreement',
    'Licensing Agreement',
    'Consulting Agreement',
    'Supply Agreement',
    'Distribution Agreement',
  ];

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setUploadedFile(file);
        if (!contractData.title) {
          setContractData((prev) => ({
            ...prev,
            title: file.name.replace(/\.(pdf|doc|docx)$/i, ''),
          }));
        }

        // Extract text content from file for analysis
        extractTextFromFile(file);
      }
    },
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxFiles: 1,
  });

  const extractTextFromFile = async (file: File) => {
    try {
      if (file.type === 'text/plain') {
        const text = await file.text();
        // Could analyze text here to auto-fill contract details
        // For PDF and DOC files, you would need additional libraries
        void text; // Text extraction for analysis (currently unused)
      }
      // For now, we'll just store the file for upload
    } catch {
      // Text extraction failed silently - file will still be uploaded
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadedFile) {
      toast({
        title: 'Error',
        description: 'Please select a file to upload',
        variant: 'destructive',
      });
      return;
    }

    if (!contractData.title || !contractData.contract_type) {
      toast({
        title: 'Error',
        description: 'Title and contract type are required',
        variant: 'destructive',
      });
      return;
    }

    if (!organizationId) {
      toast({
        title: 'Error',
        description: 'Organization not found',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      // Validate file before upload
      const { validateFile, MAX_CONTRACT_FILE_SIZE } = await import('@/lib/fileValidation');
      const validation = validateFile(uploadedFile, { maxSize: MAX_CONTRACT_FILE_SIZE });
      if (!validation.valid) {
        throw new Error(validation.error || 'File validation failed');
      }

      // Upload file to Supabase storage
      const sanitizedName = uploadedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `${organizationId}/${Date.now()}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, uploadedFile, {
          contentType: uploadedFile.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`File upload failed: ${uploadError.message}`);
      }

      // Extract text content for searchability
      let extractedText = '';
      if (uploadedFile.type === 'text/plain') {
        extractedText = await uploadedFile.text();
      }

      // Create contract with file path
      const contractPayload = {
        title: contractData.title,
        description: contractData.description,
        contract_type: contractData.contract_type,
        client_id: contractData.client_id || undefined,
        case_id: contractData.case_id || undefined,
        value: contractData.value ? parseFloat(contractData.value) : undefined,
        currency: contractData.currency,
        status: 'draft',
        terms:
          extractedText ||
          `Contract document uploaded: ${uploadedFile.name}\n\nFile path: ${fileName}`,
      };

      await createContract.mutateAsync(contractPayload);

      toast({
        title: 'Success',
        description: 'Contract uploaded successfully',
      });

      // Reset form
      setUploadedFile(null);
      setContractData({
        title: '',
        description: '',
        contract_type: '',
        client_id: '',
        case_id: '',
        value: '',
        currency: 'USD',
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload contract',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Upload Contract</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File Upload */}
          <div className="space-y-4">
            <Label>Contract File</Label>
            {!uploadedFile ? (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary bg-primary/10'
                    : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <div className="space-y-2">
                  <p className="text-lg font-medium">
                    {isDragActive ? 'Drop the file here' : 'Upload Contract Document'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Drag & drop or click to select PDF, DOC, DOCX, or TXT files
                  </p>
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <FileText className="h-10 w-10 text-primary" />
                      <div>
                        <p className="font-medium">{uploadedFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={removeFile}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Contract Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Contract Title *</Label>
              <Input
                id="title"
                value={contractData.title}
                onChange={(e) => setContractData({ ...contractData, title: e.target.value })}
                placeholder="Enter contract title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Contract Type *</Label>
              <Select
                value={contractData.contract_type}
                onValueChange={(value) =>
                  setContractData({ ...contractData, contract_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select contract type" />
                </SelectTrigger>
                <SelectContent>
                  {contractTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={contractData.description}
              onChange={(e) => setContractData({ ...contractData, description: e.target.value })}
              placeholder="Brief description of the contract"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Client (Optional)</Label>
              <Select
                value={contractData.client_id || 'none'}
                onValueChange={(value) =>
                  setContractData({ ...contractData, client_id: value === 'none' ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Client</SelectItem>
                  {clients.map((client: { id: string; name: string }) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Related Case (Optional)</Label>
              <Select
                value={contractData.case_id || 'none'}
                onValueChange={(value) =>
                  setContractData({ ...contractData, case_id: value === 'none' ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select case" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Case</SelectItem>
                  {cases.map((case_: { id: string; title: string }) => (
                    <SelectItem key={case_.id} value={case_.id}>
                      {case_.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="value">Contract Value</Label>
              <Input
                id="value"
                type="number"
                step="0.01"
                value={contractData.value}
                onChange={(e) => setContractData({ ...contractData, value: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label>Currency</Label>
              <Select
                value={contractData.currency}
                onValueChange={(value) => setContractData({ ...contractData, currency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                  <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isUploading || !uploadedFile}>
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Contract
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
