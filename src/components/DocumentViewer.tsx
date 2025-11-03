import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, ExternalLink, FileText, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface DocumentViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    name: string;
    file_path?: string;
    mime_type?: string;
    file_size?: number;
    content?: string;
    metadata?: any;
  };
}

export function DocumentViewer({ open, onOpenChange, document }: DocumentViewerProps) {
  const [loading, setLoading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && document.file_path) {
      loadFile();
    }
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [open, document.file_path]);

  const loadFile = async () => {
    if (!document.file_path) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(document.file_path);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      setFileUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!document.file_path) return;
    
    try {
      const { data } = await supabase.storage
        .from('documents')
        .download(document.file_path);
      
      if (data) {
    const url = URL.createObjectURL(data);
    const a = globalThis.document.createElement('a');
    a.href = url;
    a.download = document.metadata?.original_filename || document.name;
    globalThis.document.body.appendChild(a);
    a.click();
    globalThis.document.body.removeChild(a);
    URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleExternalView = async () => {
    if (!document.file_path) return;
    
    try {
      const { data } = await supabase.storage
        .from('documents')
        .createSignedUrl(document.file_path, 3600);
      
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err) {
      console.error('External view failed:', err);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${Math.round(size * 10) / 10} ${units[unitIndex]}`;
  };

  const renderDocumentContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading document...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-96 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to load document</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={loadFile}>
            Try Again
          </Button>
        </div>
      );
    }

    if (!document.file_path && document.content) {
      // Text content from database
      return (
        <div className="max-h-96 overflow-auto p-4 bg-muted/30 rounded-lg">
          <pre className="whitespace-pre-wrap text-sm">{document.content}</pre>
        </div>
      );
    }

    if (!fileUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-96 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Document preview not available</p>
        </div>
      );
    }

    const mimeType = document.mime_type || '';

    // PDF viewer with inline iframe
    if (mimeType.includes('pdf')) {
      return (
        <div className="h-[70vh] bg-background rounded-lg overflow-hidden">
          <iframe
            src={fileUrl}
            className="w-full h-full border-0"
            title={document.name}
          />
        </div>
      );
    }

    // Image viewer
    if (mimeType.startsWith('image/')) {
      return (
        <div className="max-h-96 overflow-auto flex justify-center">
          <img
            src={fileUrl}
            alt={document.name}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      );
    }

    // Text files
    if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml')) {
      return (
        <div className="max-h-96 overflow-auto p-4 bg-muted/30 rounded-lg">
          <iframe
            src={fileUrl}
            className="w-full h-80 border-0"
            title={document.name}
          />
        </div>
      );
    }

    // Fallback for other file types
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Preview not available</h3>
        <p className="text-muted-foreground mb-4">
          This file type cannot be previewed in the browser
        </p>
        <div className="flex gap-2">
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button variant="outline" onClick={handleExternalView}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Externally
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                {document.mime_type?.startsWith('image/') ? (
                  <ImageIcon className="h-5 w-5" />
                ) : (
                  <FileText className="h-5 w-5" />
                )}
                {document.name}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-2">
                {document.mime_type && (
                  <Badge variant="secondary">{document.mime_type}</Badge>
                )}
                {document.file_size && (
                  <Badge variant="outline">{formatFileSize(document.file_size)}</Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
              <Button size="sm" variant="outline" onClick={handleExternalView}>
                <ExternalLink className="h-4 w-4 mr-1" />
                External
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          {renderDocumentContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}