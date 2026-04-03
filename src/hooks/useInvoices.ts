import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { invokeNodeApi } from '@/lib/backendApi';

export interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string;
  case_id?: string;
  amount: number;
  vat: number;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  due_date?: string;
  notes?: string;
  items: InvoiceItem[];
  created_by: string;
  organization_id: string;
  created_at: string;
  client?: { id: string; name: string };
  case?: { id: string; title: string };
}

export interface CreateInvoiceData {
  title: string;
  client_id: string;
  case_id?: string;
  vat: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  issue_date?: string;
  due_date?: string;
  notes?: string;
  items: InvoiceItem[];
}

export function useInvoices() {
  const { data: organizationId } = useUserOrganization();
  return useQuery({
    queryKey: ['invoices', organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as Invoice[];

      return invokeNodeApi<Invoice[]>('/api/v1/invoices');
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateInvoiceData) => {
      return invokeNodeApi<Invoice>('/api/v1/invoices', { method: 'POST', body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice Created', { description: 'Invoice was successfully created.' });
    },
    onError: (error: unknown) => {
      toast.error('Error Creating Invoice', {
        description: error instanceof Error ? error.message : 'Failed to create invoice.',
      });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<CreateInvoiceData> & { id: string }) => {
      return invokeNodeApi<Invoice>(`/api/v1/invoices/${id}`, { method: 'PATCH', body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice Updated', { description: 'Invoice was updated.' });
    },
    onError: (error: unknown) => {
      toast.error('Error Updating Invoice', {
        description: error instanceof Error ? error.message : 'Failed to update invoice.',
      });
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await invokeNodeApi(`/api/v1/invoices/${id}`, { method: 'DELETE' });
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice Deleted', { description: 'Invoice was removed.' });
    },
    onError: (error: unknown) => {
      toast.error('Error Deleting Invoice', {
        description: error instanceof Error ? error.message : 'Failed to delete invoice.',
      });
    },
  });
}
