import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { useInvoiceItems } from "@/hooks/useInvoiceItems";
import { useGetItemById, useUpdateItem } from "@/lib/api";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatDate, formatCurrency, getStatusColor } from "@/lib/utils";

interface Invoice {
  id: string;
  invoice_number: string;
  title: string;
  client_id?: string | null;
  case_id?: string | null;
  status?: string | null;
  issue_date: string;
  due_date: string;
  subtotal?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  total_amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  terms_conditions?: string | null;
  created_at: string;
  client?: {
    id: string;
    name: string;
    email?: string;
    company?: string;
    address?: string;
    phone?: string;
  } | null;
  case?: {
    id: string;
    title: string;
    case_number?: string | null;
  } | null;
  created_by_user?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email?: string;
  } | null;
}
import { 
  Download, 
  Edit, 
  ArrowLeft,
  Clock,
  Calendar,
  User,
  FileText,
  Send,
  Printer,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

export default function InvoiceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  // Fetch the invoice
  const { 
    data: invoice, 
    isLoading, 
    error, 
    refetch 
  } = useGetItemById<Invoice>({
    table: 'invoices',
    id: id || '',
    select: `
      *,
      client:client_id(id, name, email, company, address, phone),
      case:case_id(id, title, case_number),
      created_by_user:created_by(id, first_name, last_name, email)
    `,
  });

  // Fetch invoice items using new hook
  const { data: invoiceItems = [], isLoading: itemsLoading } = useInvoiceItems(id || '');
  
  // Update invoice mutation
  const updateInvoice = useUpdateItem({
    table: 'invoices',
    onSuccess: () => {
      refetch();
    },
  });

  // Handle status updates
  const handleStatusUpdate = async (newStatus: string) => {
    if (!invoice) return;
    
    await updateInvoice.mutateAsync({
      id: invoice.id,
      status: newStatus
    });
  };

  // Handle form submission for edits
  const handleSubmitEdit = async (formData: any) => {
    if (!invoice) return;
    
    // Calculate totals
    const subtotal = formData.items.reduce(
      (sum: number, item: any) => sum + (item.quantity * item.unit_price), 
      0
    );
    
    const payload = {
      ...formData,
      issue_date: formData.issue_date.toISOString(),
      due_date: formData.due_date.toISOString(),
      subtotal,
      tax_amount: formData.vat,
      tax_rate: subtotal > 0 ? (formData.vat / subtotal) * 100 : 0,
      total_amount: subtotal + formData.vat,
      // Items will be handled via a trigger or edge function
    };
    
    await updateInvoice.mutateAsync({
      id: invoice.id,
      ...payload
    });
    
    setIsEditDialogOpen(false);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Error state
  if (error || !invoice) {
    return (
      <div className="px-4 py-6 flex flex-col items-center justify-center space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Error Loading Invoice</h2>
        <p className="text-muted-foreground">
          {error instanceof Error ? error.message : "Invoice not found"}
        </p>
        <div className="flex gap-4">
          <Button onClick={() => navigate("/invoices")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Invoices
          </Button>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Format the invoice dates
  const issueDate = formatDate(invoice.issue_date);
  const dueDate = formatDate(invoice.due_date);
  
  // Determine if invoice is overdue
  const isOverdue = invoice.status !== 'paid' && new Date(invoice.due_date) < new Date();
  
  // Format the status
  const status = isOverdue && invoice.status !== 'overdue' ? 'overdue' : invoice.status;

  return (
    <div className="px-4 py-6 space-y-6">
      <Breadcrumbs />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Invoice #{invoice.invoice_number}</h1>
          <p className="text-muted-foreground">{invoice.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/invoices")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button variant="outline" onClick={() => setIsEditDialogOpen(true)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          <Button variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          {invoice.status !== 'sent' && (
            <Button>
              <Send className="h-4 w-4 mr-2" />
              Send Invoice
            </Button>
          )}
        </div>
      </div>
      
      {/* Status & Key Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center">
              <Badge className={`${getStatusColor(status)} px-3 py-1.5 text-base`}>
                {status === 'draft' ? 'Draft' : 
                  status === 'sent' ? 'Sent' : 
                  status === 'paid' ? 'Paid' : 
                  status === 'overdue' ? 'Overdue' : 'Unknown'}
              </Badge>
              {status !== 'paid' && (
                <div className="flex gap-2 mt-4">
                  {status !== 'sent' && (
                    <Button size="sm" onClick={() => handleStatusUpdate('sent')}>
                      <Send className="h-3 w-3 mr-1" />
                      Mark Sent
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleStatusUpdate('paid')}>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Mark Paid
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Dates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <div className="flex items-center text-sm">
                  <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>Issue Date:</span>
                </div>
                <span>{issueDate}</span>
              </div>
              <div className="flex justify-between">
                <div className="flex items-center text-sm">
                  <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>Due Date:</span>
                </div>
                <span className={isOverdue ? "text-destructive font-medium" : ""}>
                  {dueDate}
                  {isOverdue && " (Overdue)"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-3xl font-bold">{formatCurrency(invoice.total_amount || 0)}</p>
              {invoice.status === 'paid' && (
                <Badge variant="outline" className="mt-2">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Paid in Full
                </Badge>
              )}
              {isOverdue && (
                <Badge variant="destructive" className="mt-2">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Payment Overdue
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Main Invoice Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Details */}
        <div className="lg:col-span-2">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Client and Billing Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-2">From</h3>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">Kourti Legal</p>
                    <p>123 Legal Street</p>
                    <p>Suite 500</p>
                    <p>New York, NY 10001</p>
                    <p>United States</p>
                    <p className="mt-2">contact@kourtilegal.com</p>
                    <p>+1 (555) 123-4567</p>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Bill To</h3>
                  {invoice.client ? (
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">{invoice.client.name}</p>
                      {invoice.client.company && <p>{invoice.client.company}</p>}
                      {invoice.client.address && <p>{invoice.client.address}</p>}
                      <p className="mt-2">{invoice.client.email}</p>
                      {invoice.client.phone && <p>{invoice.client.phone}</p>}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No client information</p>
                  )}
                </div>
              </div>
              
              {/* Related Case */}
              {invoice.case && (
                <div>
                  <h3 className="font-medium mb-2">Related Case</h3>
                  <Link 
                    to={`/cases/${invoice.case.id}`}
                    className="flex items-center gap-2 p-2 border rounded-md hover:bg-accent"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p>{invoice.case.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Case Number: {invoice.case.case_number || 'N/A'}
                      </p>
                    </div>
                  </Link>
                </div>
              )}
              
              {/* Invoice Items */}
              <div>
                <h3 className="font-medium mb-2">Items</h3>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4">
                            <div className="flex justify-center">
                              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : invoiceItems && invoiceItems.length > 0 ? (
                        invoiceItems.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.description}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.rate)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                            No items found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              
              {/* Totals */}
              <div className="border-t pt-4 flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(invoice.subtotal || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax ({invoice.tax_rate?.toFixed(2) || 0}%):</span>
                    <span>{formatCurrency(invoice.tax_amount || 0)}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between font-bold">
                    <span>Total:</span>
                    <span>{formatCurrency(invoice.total_amount || 0)}</span>
                  </div>
                </div>
              </div>
              
              {/* Notes */}
              {invoice.notes && (
                <div className="mt-4 pt-4 border-t">
                  <h3 className="font-medium mb-2">Notes</h3>
                  <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}
              
              {/* Terms & Conditions */}
              {invoice.terms_conditions && (
                <div className="mt-4 pt-4 border-t">
                  <h3 className="font-medium mb-2">Terms & Conditions</h3>
                  <p className="text-sm whitespace-pre-wrap">{invoice.terms_conditions}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Sidebar */}
        <div className="space-y-6">
          {/* Created By */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Created By</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-full">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  {invoice.created_by_user ? (
                    <>
                      <p className="font-medium">
                        {invoice.created_by_user.first_name} {invoice.created_by_user.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.created_by_user.email}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Unknown</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Created on {formatDate(invoice.created_at)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Actions */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start" size="sm">
                <Send className="h-4 w-4 mr-2" />
                Send to Client
              </Button>
              <Button className="w-full justify-start" size="sm" variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <Button className="w-full justify-start" size="sm" variant="outline">
                <Printer className="h-4 w-4 mr-2" />
                Print Invoice
              </Button>
              
              <Separator className="my-2" />
              
              {invoice.status !== 'paid' && (
                <Button className="w-full justify-start" size="sm" variant="outline">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark as Paid
                </Button>
              )}
              
              {invoice.status === 'paid' && (
                <Button className="w-full justify-start" size="sm" variant="outline">
                  <XCircle className="h-4 w-4 mr-2" />
                  Mark as Unpaid
                </Button>
              )}
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full justify-start" size="sm" variant="destructive">
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Invoice
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Invoice</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to cancel this invoice? This action will mark the invoice as cancelled.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>No, Keep It</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleStatusUpdate('cancelled')}>
                      Yes, Cancel Invoice
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Edit Invoice Dialog */}
      <InvoiceForm
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        initialData={{
          title: invoice.title,
          client_id: invoice.client_id || undefined,
          case_id: invoice.case_id || undefined,
          issue_date: new Date(invoice.issue_date),
          due_date: new Date(invoice.due_date),
          status: invoice.status || undefined,
          notes: invoice.notes || undefined,
          vat: invoice.tax_amount || 0,
          currency: invoice.currency || 'USD',
          items: invoiceItems && invoiceItems.length > 0 ? invoiceItems.map((item: any) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.rate
          })) : []
        }}
        onSubmit={handleSubmitEdit}
        isLoading={updateInvoice.isPending}
      />
    </div>
  );
}