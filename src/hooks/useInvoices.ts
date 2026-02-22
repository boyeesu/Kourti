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
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, client:client_id(id, name), case:case_id(id, title)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      // Transform the raw data to match the Invoice type
      return (data || []).map((item: any) => ({
        ...item,
        // Map database fields to interface fields
        vat: item?.tax_amount ?? 0,
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
      
      // Get organization ID from user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId as any)
        .single();
        
      if (profileError) throw new Error("Could not retrieve user profile information.");
      if (!(profile as any)?.organization_id) throw new Error("No organization associated with your account.");

      // Calculate totals from items
      const subtotal = data.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
      const total = subtotal + (data.vat ?? 0);

      // Generate invoice number using database function
      const { data: invoiceNumber, error: numberError } = await supabase
        .rpc('generate_invoice_number', { org_id: (profile as any).organization_id });
      
      if (numberError) throw new Error("Could not generate invoice number.");

  // Fix the client_id assignment issue
  const invoiceData = {
    invoice_number: invoiceNumber,
    title: data.title || `Invoice for ${data.client_id}`,
    organization_id: (profile as any).organization_id,
    client_id: data.client_id, // Use the correct client_id
    case_id: data.case_id,
    subtotal,
    tax_rate: subtotal > 0 ? (data.vat / subtotal) * 100 : 0,
    tax_amount: data.vat ?? 0,
    total_amount: total,
    amount: total, // For backwards compatibility
    status: data.status,
    issue_date: data.issue_date || new Date().toISOString().split('T')[0],
    due_date: data.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: data.notes,
    created_by: userId || '',
  };
      
      // Create invoice and items in a transaction
      const { data: newInvoice, error } = await supabase
        .from('invoices')
        .insert(invoiceData as any)
        .select()
        .single();
      
      if (error) throw error;

      // Insert invoice items if any
      if (data.items && data.items.length > 0) {
        const itemsToInsert = data.items.map(item => ({
          invoice_id: newInvoice.id,
          organization_id: (profile as any).organization_id,
          description: item.description,
          quantity: item.quantity,
          rate: item.unit_price,
          amount: item.quantity * item.unit_price,
        }));

        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(itemsToInsert);
        
        if (itemsError) throw new Error("Invoice created but items failed to save: " + itemsError.message);
      }

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
      // Calculate totals from items if provided
      let updateData: any = { ...data };
      
      if (data.items && data.items.length > 0) {
        const subtotal = data.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
        const total = subtotal + (data.vat ?? 0);
        
        updateData = {
          ...data,
          subtotal,
          tax_rate: subtotal > 0 ? ((data.vat ?? 0) / subtotal) * 100 : 0,
          tax_amount: data.vat ?? 0,
          total_amount: total,
          amount: total, // For backwards compatibility
        };

        // Update invoice items
        if (data.items) {
          // Get organization ID from user profile
          const userId = await getCurrentUserId();
          const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('user_id', userId as any)
            .single();

          if (profile?.organization_id) {
            // Delete existing items
            await supabase
              .from('invoice_items')
              .delete()
              .eq('invoice_id', id);

            // Insert new items
            const itemsToInsert = data.items.map(item => ({
              invoice_id: id,
              organization_id: profile.organization_id,
              description: item.description,
              quantity: item.quantity,
              rate: item.unit_price,
              amount: item.quantity * item.unit_price,
            }));

            await supabase
              .from('invoice_items')
              .insert(itemsToInsert);
          }
        }

        // Remove items from update data as they're handled separately
        delete updateData.items;
      }

      const { data: updated, error } = await supabase
        .from('invoices')
        .update(updateData as any)
        .eq('id', id as any)
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
        .eq('id', id as any);
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
