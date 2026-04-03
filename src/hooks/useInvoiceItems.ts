import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

export function useInvoiceItems(invoiceId: string) {
  return useQuery({
    queryKey: ['invoice-items', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [];

      return invokeNodeApi<InvoiceItem[]>(`/api/v1/invoices/${invoiceId}/items`);
    },
    enabled: !!invoiceId,
    staleTime: 2 * 60 * 1000,
  });
}
