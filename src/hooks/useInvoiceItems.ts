import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      
      const { data, error } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      return data as InvoiceItem[];
    },
    enabled: !!invoiceId,
    staleTime: 2 * 60 * 1000,
  });
}