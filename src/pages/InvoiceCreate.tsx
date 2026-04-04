import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InvoiceForm } from '@/components/invoices/InvoiceForm';
import { useCreateInvoice } from '@/hooks/useInvoices';
import { ArrowLeft } from 'lucide-react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

export default function InvoiceCreate() {
  const navigate = useNavigate();
  const createInvoice = useCreateInvoice();

  // Handle form submission
  const handleSubmitInvoice = async (formData: {
    title: string;
    client_id: string;
    case_id?: string;
    vat: number;
    status: string;
    issue_date: Date;
    due_date: Date;
    notes?: string;
    items: Array<{ description: string; quantity: number; unit_price: number }>;
  }) => {
    const payload = {
      title: formData.title,
      client_id: formData.client_id,
      case_id: formData.case_id,
      vat: formData.vat,
      status: formData.status as 'draft' | 'sent' | 'paid' | 'overdue',
      issue_date: formData.issue_date.toISOString().split('T')[0],
      due_date: formData.due_date.toISOString().split('T')[0],
      notes: formData.notes,
      items: formData.items,
    };

    try {
      const newInvoice = await createInvoice.mutateAsync(payload);
      navigate(`/invoices/${newInvoice.id}`);
    } catch {
      // Error handling is done in the hook
    }
  };

  return (
    <div className="space-y-4">
      <Breadcrumbs />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Create New Invoice</h1>
          <p className="text-muted-foreground">Generate a professional invoice for your client</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/invoices')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Invoices
        </Button>
      </div>

      <Card className="shadow-card max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Invoice Information</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceForm
            isOpen={true}
            onOpenChange={() => {}} // Not used in page context
            onSubmit={handleSubmitInvoice}
            isLoading={createInvoice.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
