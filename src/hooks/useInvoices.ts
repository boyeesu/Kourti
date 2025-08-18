import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/use-toast';

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
  client_id: string;
  case_id?: string;
  amount: number;
  vat: number;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  due_date?: string;
  notes?: string;
  items: InvoiceItem[];
}

export function useInvoices() {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, client:client_id(id, name), case:case_id(id, title)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      // Transform the raw data to match the Invoice type with missing properties
      return (data || []).map(item => ({
        ...item,
        // Add required properties that might be missing from the database
        vat: item.vat ?? 0,
        items: item.items ?? [],
      })) as Invoice[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: CreateInvoiceData) => {
      const userId = await getCurrentUserId();
      // Auto-generate total
      const total = data.amount + (data.vat ?? 0);
      // Ensure required fields for Invoice type
      const invoiceData = {
        ...data,
        total,
        created_by: userId || '',
        // Make sure items exists (required by Invoice type)
        items: data.items || []
      };
      
      const { data: newInvoice, error } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select()
        .single();
      if (error) throw error;
      return newInvoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Invoice Created', description: 'Invoice was successfully created.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error Creating Invoice', variant: 'destructive', description: error.message || 'Failed to create invoice.' });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<CreateInvoiceData> & { id: string }) => {
      const total = (typeof data.amount === 'number' && typeof data.vat === 'number') ? (data.amount + data.vat) : undefined;
      const updateData = total ? { ...data, total } : data;
      const { data: updated, error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Invoice Updated', description: 'Invoice was updated.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error Updating Invoice', variant: 'destructive', description: error.message || 'Failed to update invoice.' });
    }
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Invoice Deleted', description: 'Invoice was removed.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error Deleting Invoice', variant: 'destructive', description: error.message || 'Failed to delete invoice.' });
    }
  });
}
