import React, { useState } from 'react';
import { z } from 'zod';
import { useFormWithValidation } from '@/hooks/useFormWithValidation';
import { Button } from '@/components/ui/button';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { CalendarIcon, Plus, TrashIcon } from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useCases } from '@/hooks/useCases';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, formatCurrency } from '@/lib/utils';
import { ModuleErrorBoundary } from '@/components/ErrorBoundary';

// Define invoice item schema
const invoiceItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  unit_price: z.number().min(0, "Unit price cannot be negative"),
});

// Define invoice schema
const invoiceSchema = z.object({
  title: z.string().min(1, "Title is required"),
  client_id: z.string().min(1, "Client is required"),
  case_id: z.string().optional(),
  issue_date: z.date(),
  due_date: z.date(),
  status: z.string(),
  notes: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
  vat: z.number().min(0, "VAT cannot be negative"),
  currency: z.string().default('USD'),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  onSubmit: (data: InvoiceFormValues) => void;
  initialData?: Partial<InvoiceFormValues>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading?: boolean;
}

export function InvoiceForm({
  onSubmit,
  initialData,
  isOpen,
  onOpenChange,
  isLoading = false,
}: InvoiceFormProps) {
  const [newItem, setNewItem] = useState({
    description: '',
    quantity: 1,
    unit_price: 0,
  });

  // Get clients and cases data
  const { data: clientsData } = useClients();
  const clients = Array.isArray(clientsData) ? clientsData : clientsData?.items ?? [];
  
  const { data: casesData = [] } = useCases();
  const cases = Array.isArray(casesData) ? casesData : casesData?.cases || [];

  // Setup form with validation
  const form = useFormWithValidation({
    schema: invoiceSchema,
    defaultValues: {
      title: initialData?.title || '',
      client_id: initialData?.client_id || '',
      case_id: initialData?.case_id || '',
      issue_date: initialData?.issue_date || new Date(),
      due_date: initialData?.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days
      status: initialData?.status || 'draft',
      notes: initialData?.notes || '',
      items: initialData?.items || [],
      vat: initialData?.vat || 0,
      currency: initialData?.currency || 'USD',
    },
    onSubmit: onSubmit,
    successMessage: initialData?.title ? 'Invoice updated successfully' : 'Invoice created successfully',
  });

  // Calculate subtotal
  const subtotal = form.watch('items').reduce(
    (sum, item) => sum + (item.quantity * item.unit_price), 
    0
  );
  
  const vat = form.watch('vat');
  const total = subtotal + vat;

  // Handle adding a new item
  const handleAddItem = () => {
    if (!newItem.description || newItem.quantity < 1 || newItem.unit_price < 0) {
      return; // Basic validation
    }

    form.setValue('items', [
      ...form.watch('items'),
      { ...newItem }
    ]);

    // Reset the new item form
    setNewItem({
      description: '',
      quantity: 1,
      unit_price: 0,
    });
  };

  // Handle removing an item
  const handleRemoveItem = (index: number) => {
    const currentItems = form.watch('items');
    form.setValue('items', currentItems.filter((_, i) => i !== index));
  };

  // Handle new item form change
  const handleNewItemChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewItem({
      ...newItem,
      [name]: name === 'description' ? value : Number(value),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <ModuleErrorBoundary name="Invoice Form">
          <DialogHeader>
            <DialogTitle>{initialData?.title ? 'Edit Invoice' : 'Create New Invoice'}</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(form.submitHandler)} className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Title</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Legal Services - August 2025" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="client_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client</FormLabel>
                        <Select 
                          value={field.value} 
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a client" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {clients.map((client: any) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="case_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Related Case (Optional)</FormLabel>
                        <Select 
                          value={field.value} 
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a case" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">No Case</SelectItem>
                            {cases.map((caseItem: any) => (
                              <SelectItem key={caseItem.id} value={caseItem.id}>
                                {caseItem.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="issue_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Issue Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date > new Date() || date < new Date("1900-01-01")
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="due_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Due Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date("1900-01-01")
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select 
                        value={field.value} 
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Line Items */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Line Items</h3>
                  <p className="text-xs text-muted-foreground mb-2">Add items to your invoice</p>
                  
                  {/* Line items list */}
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2 pl-3">Description</th>
                          <th className="text-center p-2 w-20">Qty</th>
                          <th className="text-center p-2 w-24">Unit Price</th>
                          <th className="text-right p-2 pr-3 w-24">Amount</th>
                          <th className="w-10 p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.watch('items').map((item, index) => (
                          <tr key={index} className="border-t">
                            <td className="p-2 pl-3">{item.description}</td>
                            <td className="p-2 text-center">{item.quantity}</td>
                            <td className="p-2 text-center">{formatCurrency(item.unit_price)}</td>
                            <td className="p-2 pr-3 text-right">
                              {formatCurrency(item.quantity * item.unit_price)}
                            </td>
                            <td className="p-2 text-center">
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon"
                                onClick={() => handleRemoveItem(index)}
                              >
                                <TrashIcon className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                        
                        {/* New item form */}
                        <tr className="border-t bg-accent/30">
                          <td className="p-2 pl-3">
                            <Input
                              name="description"
                              value={newItem.description}
                              onChange={handleNewItemChange}
                              placeholder="Item description"
                              className="h-8"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              name="quantity"
                              type="number"
                              value={newItem.quantity}
                              onChange={handleNewItemChange}
                              min={1}
                              className="h-8"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              name="unit_price"
                              type="number"
                              value={newItem.unit_price}
                              onChange={handleNewItemChange}
                              min={0}
                              step={0.01}
                              className="h-8"
                            />
                          </td>
                          <td className="p-2 pr-3 text-right">
                            {formatCurrency(newItem.quantity * newItem.unit_price)}
                          </td>
                          <td className="p-2 text-center">
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon"
                              onClick={handleAddItem}
                            >
                              <Plus className="h-4 w-4 text-primary" />
                            </Button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Error message for items */}
                  {form.formState.errors.items && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.items.message}
                    </p>
                  )}
                </div>
                
                {/* Totals */}
                <div className="space-y-2 ml-auto w-60">
                  <div className="flex justify-between">
                    <span className="text-sm">Subtotal:</span>
                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">VAT:</span>
                    <div className="w-24">
                      <FormField
                        control={form.control}
                        name="vat"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input 
                                {...field}
                                type="number" 
                                min={0} 
                                step={0.01}
                                className="h-8 text-right"
                                onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-between pt-2 border-t">
                    <span className="font-medium">Total:</span>
                    <span className="font-bold text-lg">{formatCurrency(total)}</span>
                  </div>
                </div>
                
                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <textarea
                          {...field}
                          rows={3}
                          className="w-full p-2 border rounded-md resize-none"
                          placeholder="Additional notes or payment instructions..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={isLoading || form.isSubmitting}
                >
                  {isLoading || form.isSubmitting ? 'Saving...' : (initialData?.title ? 'Update Invoice' : 'Create Invoice')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </ModuleErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}