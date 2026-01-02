import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Download, Eye, Edit, Save, X } from 'lucide-react';
import { RichTextEditor } from '@/components/RichTextEditor';
import { exportAsDocx, exportAsPdf } from '@/lib/documentExport';
import { useToast } from '@/hooks/use-toast';
import { sanitizeHTML } from '@/lib/sanitize';
import { supabase } from '@/integrations/supabase/client';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DocumentViewerWithEditProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    document: {
        id: string;
        name: string;
        content?: string;
        file_path?: string;
        mime_type?: string;
    };
    onUpdate?: () => void;
}

export function DocumentViewerWithEdit({ open, onOpenChange, document, onUpdate }: DocumentViewerWithEditProps) {
    const [activeTab, setActiveTab] = useState<'view' | 'edit'>('view');
    const [editedContent, setEditedContent] = useState(document.content || '');
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('documents')
                .update({ content: editedContent })
                .eq('id', document.id);

            if (error) throw error;

            toast({
                title: 'Success',
                description: 'Document updated successfully.',
            });
            setActiveTab('view');
            if (onUpdate) onUpdate();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to save document.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setEditedContent(document.content || '');
        setActiveTab('view');
    };

    const handleDownloadPdf = async () => {
        try {
            await exportAsPdf(
                document.content || '',
                document.name.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
                document.name
            );
            toast({
                title: 'Success',
                description: 'Document downloaded as PDF.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to download PDF.',
            });
        }
    };

    const handleDownloadDocx = async () => {
        try {
            await exportAsDocx(
                document.content || '',
                document.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
            );
            toast({
                title: 'Success',
                description: 'Document downloaded as DOCX.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to download DOCX.',
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <DialogTitle>{document.name}</DialogTitle>
                        <div className="flex gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <Download className="h-4 w-4 mr-2" />
                                        Download
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={handleDownloadPdf}>
                                        Download as PDF
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleDownloadDocx}>
                                        Download as DOCX
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'view' | 'edit')} className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
                        <TabsTrigger value="view">
                            <Eye className="h-4 w-4 mr-2" />
                            View
                        </TabsTrigger>
                        <TabsTrigger value="edit">
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="view" className="flex-1 overflow-auto mt-4">
                        <div
                            className="prose max-w-none p-4"
                            dangerouslySetInnerHTML={{ __html: sanitizeHTML(document.content) || 'No content available' }}
                        />
                    </TabsContent>

                    <TabsContent value="edit" className="flex-1 overflow-auto mt-4">
                        <div className="space-y-4">
                            <RichTextEditor
                                content={editedContent}
                                onChange={setEditedContent}
                                editable={true}
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={handleCancel}>
                                    <X className="h-4 w-4 mr-2" />
                                    Cancel
                                </Button>
                                <Button onClick={handleSave} disabled={isSaving}>
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-4 w-4 mr-2" />
                                            Save Changes
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
