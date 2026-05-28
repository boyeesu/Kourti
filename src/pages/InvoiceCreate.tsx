import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InvoiceForm } from '@/components/invoices/InvoiceForm';
import { useCreateInvoice } from '@/hooks/useInvoices';
import { ArrowLeft } from 'lucide-react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';

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
    <PageContainer>
      <Breadcrumbs />

      <PageHeader
        title="Create New Invoice"
        description="Generate a professional invoice for your client"
        actions={
          <Button variant="outline" onClick={() => navigate('/invoices')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Invoices
          </Button>
        }
      />

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
    </PageContainer>
  );
}
