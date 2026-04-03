/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

export function useInvoicePDF() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      return invokeNodeApi<any>('/api/v1/ai/generate-invoice-pdf', {
        method: 'POST',
        body: { invoiceId },
      });
    },
    onSuccess: () => {
      toast.success('Success', { description: 'Invoice PDF generated successfully' });
    },
    onError: (error: any) => {
      toast.error('Error', { description: error.message || 'Failed to generate PDF' });
    },
  });
}

export function useDownloadInvoicePDF() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      try {
        const data = await invokeNodeApi<any>('/api/v1/ai/generate-invoice-pdf', {
          method: 'POST',
          body: { invoiceId },
        });
        return data;
      } catch (error) {
        logError('PDF download error', error);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Success', { description: 'Invoice PDF downloaded successfully' });
    },
    onError: (error: any) => {
      toast.error('Error', { description: error.message || 'Failed to download PDF' });
    },
  });
}
