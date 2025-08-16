import React, { useState } from "react";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useFetchData, useCreateItem, useUpdateItem, useDeleteItem } from "@/lib/api";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash, 
  FileText, 
  DollarSign, 
  Download, 
  MoreVertical,
  Calendar,
  User,
  ArrowUpDown,
  Check,
  ChevronRight
} from "lucide-react";
import { formatDate, formatCurrency, getStatusColor } from "@/lib/utils";
import { 
  Select, 
  SelectContent, 
  SelectGroup, 
  SelectItem, 
  SelectLabel, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import { useNavigate } from "react-router-dom";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

export default function Invoices() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  // Fetch invoices with pagination
  const { data, isLoading, error, refetch } = useFetchData({
    table: 'invoices',
    queryKey: ['invoices', page, statusFilter],
    select: '*, client:client_id(id, name), case:case_id(id, title), created_by_user:created_by(id, first_name, last_name)',
    filters: statusFilter !== 'all' ? { status: statusFilter } : {},
    pagination: { page, pageSize: 10 },
  });

  // Setup mutations
  const createInvoice = useCreateItem({
    table: 'invoices',
    invalidateQueries: [['invoices']],
    successToast: 'Invoice created successfully',
  });

  const updateInvoice = useUpdateItem({
    table: 'invoices',
    invalidateQueries: [['invoices']],
    successToast: 'Invoice updated successfully',
  });

  const deleteInvoice = useDeleteItem({
    table: 'invoices',
    invalidateQueries: [['invoices']],
    successToast: 'Invoice deleted successfully',
  });

  // Handle form submission
  const handleSubmitInvoice = async (formData: any) => {
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
      items: formData.items, // Will be handled in edge function/trigger
    };

    if (editingInvoice) {
      await updateInvoice.mutateAsync({ id: editingInvoice.id, data: payload });
      setEditingInvoice(null);
    } else {
      await createInvoice.mutateAsync(payload);
    }
    
    setIsCreateDialogOpen(false);
  };

  // Handle invoice deletion
  const handleDeleteInvoice = async (id: string) => {
    await deleteInvoice.mutateAsync(id);
  };

  // Filter invoices by search term
  const filteredInvoices = data?.data ? data.data.filter((invoice: any) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (invoice.title && invoice.title.toLowerCase().includes(searchLower)) ||
      (invoice.invoice_number && invoice.invoice_number.toLowerCase().includes(searchLower)) ||
      (invoice.client?.name && invoice.client.name.toLowerCase().includes(searchLower))
    );
  }) : [];

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in">
      <Breadcrumbs />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Invoicing & Billing</h1>
          <p className="text-muted-foreground">Manage invoices and track payments</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="shadow-md">
          <Plus className="h-4 w-4 mr-2" />
          New Invoice
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Invoices</p>
                <p className="text-2xl font-bold">{isLoading ? "—" : data?.count || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Paid</p>
                <p className="text-2xl font-bold">{isLoading ? "—" : 
                  data?.data?.filter((inv: any) => inv.status === 'paid').length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <Calendar className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{isLoading ? "—" : 
                  data?.data?.filter((inv: any) => ['draft', 'sent'].includes(inv.status)).length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <Trash className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold">{isLoading ? "—" : 
                  data?.data?.filter((inv: any) => inv.status === 'overdue').length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Filter Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice number, client name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Status</SelectLabel>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <ModuleErrorBoundary name="Invoices Table">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Manage your client invoices and billing history</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-destructive mb-2">Failed to load invoices</p>
                <Button variant="outline" onClick={() => refetch()}>Retry</Button>
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-8 bg-muted/20 rounded-md">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  {searchTerm || statusFilter !== 'all' 
                    ? "No invoices match your search criteria" 
                    : "No invoices created yet"}
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Invoice
                </Button>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Invoice #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[70px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice: any) => (
                      <TableRow key={invoice.id} className="hover:bg-accent/30 cursor-pointer">
                        <TableCell 
                          className="font-medium"
                          onClick={() => navigate(`/invoices/${invoice.id}`)}
                        >
                          {invoice.invoice_number}
                        </TableCell>
                        <TableCell 
                          onClick={() => navigate(`/invoices/${invoice.id}`)}
                        >
                          <div className="flex flex-col">
                            <span>{invoice.title}</span>
                            {invoice.case && (
                              <span className="text-xs text-muted-foreground">
                                Case: {invoice.case.title}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell 
                          onClick={() => navigate(`/invoices/${invoice.id}`)}
                        >
                          {invoice.client?.name || 'N/A'}
                        </TableCell>
                        <TableCell 
                          onClick={() => navigate(`/invoices/${invoice.id}`)}
                        >
                          <Badge className={getStatusColor(invoice.status)}>
                            {invoice.status || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell 
                          onClick={() => navigate(`/invoices/${invoice.id}`)}
                        >
                          {formatDate(invoice.issue_date)}
                        </TableCell>
                        <TableCell 
                          onClick={() => navigate(`/invoices/${invoice.id}`)}
                        >
                          {formatDate(invoice.due_date)}
                        </TableCell>
                        <TableCell 
                          className="text-right font-medium"
                          onClick={() => navigate(`/invoices/${invoice.id}`)}
                        >
                          {formatCurrency(invoice.total_amount)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/invoices/${invoice.id}`)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditingInvoice(invoice)}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled={invoice.status === 'paid'}>
                                <Check className="h-4 w-4 mr-2" />
                                Mark as Paid
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                    <Trash className="h-4 w-4 mr-2" />
                                    Delete Invoice
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete Invoice #{invoice.invoice_number}.
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleDeleteInvoice(invoice.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {!isLoading && !error && data?.count > 0 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing <span className="font-medium">{(page - 1) * 10 + 1}</span> to{" "}
                  <span className="font-medium">
                    {Math.min(page * 10, data.count)}
                  </span> of{" "}
                  <span className="font-medium">{data.count}</span> invoices
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * 10 >= data.count}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </ModuleErrorBoundary>

      {/* Invoice Form Dialog */}
      <InvoiceForm
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={handleSubmitInvoice}
        isLoading={createInvoice.isPending}
      />

      {/* Edit Invoice Dialog */}
      {editingInvoice && (
        <InvoiceForm
          isOpen={!!editingInvoice}
          onOpenChange={(open) => {
            if (!open) setEditingInvoice(null);
          }}
          initialData={{
            ...editingInvoice,
            issue_date: new Date(editingInvoice.issue_date),
            due_date: new Date(editingInvoice.due_date),
            vat: editingInvoice.tax_amount || 0,
            items: [] // TODO: Fetch invoice items
          }}
          onSubmit={handleSubmitInvoice}
          isLoading={updateInvoice.isPending}
        />
      )}
    </div>
  );
}