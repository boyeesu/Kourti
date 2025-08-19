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
      
      // Transform the raw data to match the Invoice type
      return (data || []).map(item => ({
        ...item,
        // Map database fields to interface fields
        vat: item.tax_amount ?? 0,
        items: [], // This will need to come from invoice_items table
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
      // Get organization ID from user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId || '')
        .single();
        
      if (profileError) throw new Error("Could not retrieve user profile information.");
      if (!profile?.organization_id) throw new Error("No organization associated with your account.");

      const invoiceData = {
        invoice_number: `INV-${Date.now()}`,
        title: `Invoice for ${data.amount}`,
        organization_id: profile.organization_id,
        client_id: data.client_id,
        case_id: data.case_id,
        amount: data.amount,
        tax_rate: data.vat ? (data.vat / data.amount) * 100 : 0,
        tax_amount: data.vat ?? 0,
        total,
        status: data.status,
        due_date: data.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: data.notes,
        created_by: userId || '',
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
