import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useInvoices, useCreateInvoice, useUpdateInvoice, useDeleteInvoice } from "@/hooks/useInvoices";
import { useClients } from "@/hooks/useClients";
import { useCases } from "@/hooks/useCases";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Plus, Edit2, Trash, X } from "lucide-react";

export default function Invoices() {
  const { data: invoices = [], isLoading } = useInvoices();
  const [showDialog, setShowDialog] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Invoicing & Billing</h1>
        <Button onClick={() => setShowDialog(true)} variant="default" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Invoice
        </Button>
      </div>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Loading…</div>
          ) : invoices.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No invoices yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>VAT</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.invoice_number}</TableCell>
                    <TableCell>{inv.client?.name || '-'}</TableCell>
                    <TableCell>{inv.case?.title || '-'}</TableCell>
                    <TableCell>
                      <Badge className="capitalize" variant={getStatusVariant(inv.status)}>{inv.status}</Badge>
                    </TableCell>
                    <TableCell>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>${inv.amount.toFixed(2)}</TableCell>
                    <TableCell>${inv.vat.toFixed(2)}</TableCell>
                    <TableCell>${inv.total.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => setEditingInvoice(inv)}><Edit2 className="h-4 w-4" /></Button>
                      {/* Delete can be implemented here if desired */}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showDialog && (
        <InvoiceDialog open={showDialog} onOpenChange={setShowDialog} />
      )}
      {editingInvoice && (
        <InvoiceDialog open={!!editingInvoice} onOpenChange={() => setEditingInvoice(null)} existing={editingInvoice} />
      )}
    </div>
  );
}

function getStatusVariant(status: string) {
  switch (status) {
    case 'paid': return 'success';
    case 'overdue': return 'destructive';
    case 'sent': return 'secondary';
    default: return 'outline';
  }
}

// --- Invoice Dialog ---
function InvoiceDialog({ open, onOpenChange, existing }: { open: boolean, onOpenChange: (b: boolean) => void, existing?: any }) {
  const { data: clients = [] } = useClients();
  const { data: casesData = [] } = useCases();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const isEdit = !!existing;
  const [form, setForm] = useState(() =>
    existing
      ? { ...existing, items: existing.items ?? [] }
      : { client_id: '', case_id: '', amount: 0, vat: 0, status: 'draft', due_date: '', notes: '', items: [] }
  );
  const [submitting, setSubmitting] = useState(false);
  const [item, setItem] = useState({ description: '', quantity: 1, unit_price: 0 });
  const cases = Array.isArray(casesData) ? casesData : casesData?.cases || [];

  function handleChange(e: any) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }
  function handleItemChange(e: any) {
    setItem(i => ({ ...i, [e.target.name]: e.target.name === 'description' ? e.target.value : Number(e.target.value) }));
  }
  function addItem() {
    setForm(f => ({ ...f, items: [...(f.items || []), { ...item }] }));
    setItem({ description: '', quantity: 1, unit_price: 0 });
  }
  function removeItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_i: any, i: number) => i !== idx) }));
  }
  const totalItemsAmount = (form.items || []).reduce((sum: number, i: any) => sum + (i.quantity * i.unit_price), 0);
  const total = totalItemsAmount + Number(form.vat || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      ...form,
      amount: totalItemsAmount,
      vat: Number(form.vat),
      total,
      items: form.items,
      status: form.status,
      due_date: form.due_date || null,
      notes: form.notes,
    };
    if (isEdit) {
      updateInvoice.mutate(
        { ...payload, id: existing.id },
        {
          onSuccess: () => { setSubmitting(false); onOpenChange(false); },
          onError: () => setSubmitting(false)
        }
      );
    } else {
      createInvoice.mutate(
        payload,
        {
          onSuccess: () => { setSubmitting(false); onOpenChange(false); },
          onError: () => setSubmitting(false)
        }
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Invoice" : "New Invoice"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-3">
            <select name="client_id" value={form.client_id} onChange={handleChange} required className="w-1/2 border rounded p-2">
              <option value="">Select Client</option>
              {clients.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select name="case_id" value={form.case_id} onChange={handleChange} className="w-1/2 border rounded p-2">
              <option value="">No Case</option>
              {cases.map((c: any) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-xs">Line Items</label>
            <div className="flex gap-2">
              <Input name="description" value={item.description} onChange={handleItemChange} placeholder="Description" className="w-1/2" required />
              <Input name="quantity" type="number" value={item.quantity} onChange={handleItemChange} min={1} className="w-20" required />
              <Input name="unit_price" type="number" value={item.unit_price} onChange={handleItemChange} min={0} step={0.01} className="w-24" required />
              <Button type="button" onClick={addItem}>Add</Button>
            </div>
            <ul>
              {(form.items || []).map((li: any, idx: number) => (
                <li key={idx} className="flex items-center gap-3 text-sm">
                  {li.description} – Qty: {li.quantity}, Unit: ${li.unit_price.toFixed(2)}
                  <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}><X className="h-3 w-3" /></Button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-2">
            <Input name="vat" type="number" value={form.vat} onChange={handleChange} placeholder="VAT" className="w-1/2" min={0} step={0.01} />
            <Input name="due_date" type="date" value={form.due_date ? form.due_date.substring(0, 10) : ''} onChange={handleChange} className="w-1/2" />
          </div>
          <textarea
            name="notes"
            value={form.notes || ''}
            onChange={handleChange}
            placeholder="Notes/details…"
            className="border rounded w-full p-2 min-h-[40px]"
          />
          <div className="flex gap-2">
            <select name="status" value={form.status} onChange={handleChange} className="w-1/2 border rounded p-2">
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
            <div className="flex items-center gap-2 w-1/2 justify-end">
              <span className="text-xs">Total:</span>
              <span className="font-bold text-lg">${total.toFixed(2)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)} variant="ghost">Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
