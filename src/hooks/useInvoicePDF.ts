import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useInvoicePDF() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', {
        body: { invoiceId }
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate PDF');
      }

      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Invoice PDF generated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate PDF',
        variant: 'destructive',
      });
    }
  });
}

export function useDownloadInvoicePDF() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (invoiceId: string) => {
      try {
        // For now, we'll create a simple PDF download link
        // In production, this would call the PDF generation service
        const response = await supabase.functions.invoke('generate-invoice-pdf', {
          body: { invoiceId }
        });

        if (response.error) {
          throw new Error(response.error.message || 'Failed to generate PDF');
        }

        // Create a download link
        const element = document.createElement('a');
        element.href = `data:application/pdf;base64,${btoa('PDF content would be here')}`;
        element.download = `invoice-${invoiceId}.pdf`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);

        return response.data;
      } catch (error) {
        console.error('PDF download error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Invoice PDF downloaded successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to download PDF',
        variant: 'destructive',
      });
    }
  });
}