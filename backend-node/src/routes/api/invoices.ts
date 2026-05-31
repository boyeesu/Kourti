import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { recordCaseEvent } from '../../services/caseEvents.js';

const uuidLike = z.string().regex(/^[0-9a-fA-F-]{36}$/);

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.number().min(0),
  unit_price: z.number().min(0),
});

const createInvoiceBodySchema = z.object({
  title: z.string().trim().min(1),
  client_id: uuidLike,
  case_id: uuidLike.optional(),
  vat: z.number().min(0).default(0),
  status: z.enum(['draft', 'sent', 'paid', 'overdue']).default('draft'),
  issue_date: z.string().optional(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(invoiceItemSchema).default([]),
});

const updateInvoiceBodySchema = createInvoiceBodySchema.partial().extend({
  id: uuidLike,
});

const invoiceParamsSchema = z.object({ invoiceId: uuidLike });

export const invoicesRouter = Router();

invoicesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select i.*,
        json_build_object('id', c.id, 'name', c.name) as client,
        case when i.case_id is not null then json_build_object('id', cs.id, 'title', cs.title) else null end as "case"
      from public.invoices i
      left join public.clients c on c.id = i.client_id
      left join public.cases cs on cs.id = i.case_id
      where i.organization_id = $1
      order by i.created_at desc
      `,
      [auth.organizationId]
    );

    const rows = result.rows.map((r: Record<string, unknown>) => ({
      ...r,
      vat: (r.tax_amount as number) ?? 0,
      items: [],
    }));

    res.status(200).json(rows);
  })
);

invoicesRouter.get(
  '/:invoiceId/items',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { invoiceId } = invoiceParamsSchema.parse(req.params);

    const result = await db.query(
      `select * from public.invoice_items where invoice_id = $1 and organization_id = $2 order by created_at asc`,
      [invoiceId, auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

invoicesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = createInvoiceBodySchema.parse(req.body);

    const subtotal = body.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const total = subtotal + body.vat;

    // Generate invoice number
    const numResult = await db
      .query<{
        generate_invoice_number: string;
      }>('select public.generate_invoice_number($1) as generate_invoice_number', [
        auth.organizationId,
      ])
      .catch(async () => {
        // fallback: count-based number
        const countRes = await db.query<{ c: number }>(
          'select count(*)::int as c from public.invoices where organization_id = $1',
          [auth.organizationId]
        );
        const num = (countRes.rows[0]?.c || 0) + 1;
        return { rows: [{ generate_invoice_number: `INV-${String(num).padStart(5, '0')}` }] };
      });

    const invoiceNumber = numResult.rows[0]?.generate_invoice_number || `INV-${Date.now()}`;

    const client = await db.query('begin');
    try {
      const invoiceResult = await db.query(
        `
        insert into public.invoices (
          invoice_number, title, organization_id, client_id, case_id,
          subtotal, tax_rate, tax_amount, total_amount, amount,
          status, issue_date, due_date, notes, created_by,
          created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14,now(),now())
        returning *
        `,
        [
          invoiceNumber,
          body.title,
          auth.organizationId,
          body.client_id,
          body.case_id || null,
          subtotal,
          subtotal > 0 ? (body.vat / subtotal) * 100 : 0,
          body.vat,
          total,
          body.status,
          body.issue_date || new Date().toISOString().split('T')[0],
          body.due_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          body.notes || null,
          auth.userId,
        ]
      );

      const newInvoice = invoiceResult.rows[0];

      if (body.items.length > 0) {
        const itemValues: unknown[] = [];
        const placeholders: string[] = [];
        body.items.forEach((item, idx) => {
          const base = idx * 6;
          placeholders.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
          );
          itemValues.push(
            auth.organizationId,
            item.description,
            item.quantity,
            item.unit_price,
            item.quantity * item.unit_price,
            newInvoice.id
          );
        });

        await db.query(
          `insert into public.invoice_items (organization_id, description, quantity, rate, amount, invoice_id) values ${placeholders.join(', ')}`,
          itemValues
        );
      }

      await db.query('commit');

      // Emit invoice_sent when the invoice is created with status 'sent' and has a case.
      if (body.status === 'sent' && newInvoice.case_id) {
        await recordCaseEvent({
          organizationId: auth.organizationId,
          caseId: newInvoice.case_id,
          eventType: 'invoice_sent',
          title: `Invoice ${newInvoice.invoice_number}`,
          actorType: 'staff',
          actorId: auth.userId,
        });
      }
      // TODO: emit invoice_sent/invoice_paid for invoices without a case_id (no case linkage to record against)

      res.status(201).json({ ...newInvoice, vat: body.vat, items: body.items });
    } catch (err) {
      await db.query('rollback').catch(() => {});
      throw err;
    }
  })
);

invoicesRouter.patch(
  '/:invoiceId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { invoiceId } = invoiceParamsSchema.parse(req.params);
    const body = updateInvoiceBodySchema.omit({ id: true }).parse(req.body);

    // Capture current status + case_id before the update for change detection.
    const preResult = await db.query<{
      status: string;
      case_id: string | null;
      invoice_number: string;
      title: string;
    }>(
      'select status, case_id, invoice_number, title from public.invoices where id = $1 and organization_id = $2 limit 1',
      [invoiceId, auth.organizationId]
    );
    const preInvoice = preResult.rows[0];

    const updates: Array<{ col: string; val: unknown }> = [];
    if (body.title !== undefined) updates.push({ col: 'title', val: body.title });
    if (body.client_id !== undefined) updates.push({ col: 'client_id', val: body.client_id });
    if (body.case_id !== undefined) updates.push({ col: 'case_id', val: body.case_id });
    if (body.status !== undefined) updates.push({ col: 'status', val: body.status });
    if (body.issue_date !== undefined) updates.push({ col: 'issue_date', val: body.issue_date });
    if (body.due_date !== undefined) updates.push({ col: 'due_date', val: body.due_date });
    if (body.notes !== undefined) updates.push({ col: 'notes', val: body.notes });

    if (body.items && body.items.length > 0) {
      const subtotal = body.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      const total = subtotal + (body.vat ?? 0);
      updates.push({ col: 'subtotal', val: subtotal });
      updates.push({ col: 'tax_amount', val: body.vat ?? 0 });
      updates.push({ col: 'total_amount', val: total });
      updates.push({ col: 'amount', val: total });

      // Replace invoice items
      await db.query('delete from public.invoice_items where invoice_id = $1', [invoiceId]);
      if (body.items.length > 0) {
        const itemValues: unknown[] = [];
        const placeholders: string[] = [];
        body.items.forEach((item, idx) => {
          const base = idx * 6;
          placeholders.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
          );
          itemValues.push(
            auth.organizationId,
            item.description,
            item.quantity,
            item.unit_price,
            item.quantity * item.unit_price,
            invoiceId
          );
        });
        await db.query(
          `insert into public.invoice_items (organization_id, description, quantity, rate, amount, invoice_id) values ${placeholders.join(', ')}`,
          itemValues
        );
      }
    }

    if (!updates.length) {
      const current = await db.query(
        'select * from public.invoices where id = $1 and organization_id = $2',
        [invoiceId, auth.organizationId]
      );
      res.status(200).json(current.rows[0]);
      return;
    }

    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);

    const result = await db.query(
      `update public.invoices set ${setClause}, updated_at = now() where id = $${values.length + 1} and organization_id = $${values.length + 2} returning *`,
      [...values, invoiceId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Invoice not found', 404, 'NOT_FOUND');
    }

    const updatedInvoice = result.rows[0];

    // Emit status-transition events when case_id is present.
    if (preInvoice && body.status !== undefined && body.status !== preInvoice.status) {
      const caseId = updatedInvoice.case_id ?? preInvoice.case_id;
      if (caseId) {
        const invoiceLabel = `Invoice ${preInvoice.invoice_number}`;
        if (body.status === 'sent') {
          await recordCaseEvent({
            organizationId: auth.organizationId,
            caseId,
            eventType: 'invoice_sent',
            title: invoiceLabel,
            actorType: 'staff',
            actorId: auth.userId,
          });
        } else if (body.status === 'paid') {
          await recordCaseEvent({
            organizationId: auth.organizationId,
            caseId,
            eventType: 'invoice_paid',
            title: invoiceLabel,
            actorType: 'staff',
            actorId: auth.userId,
          });
        }
      }
      // TODO: emit invoice_sent/invoice_paid for invoices without a case_id (no case linkage to record against)
    }

    res.status(200).json(updatedInvoice);
  })
);

invoicesRouter.delete(
  '/:invoiceId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { invoiceId } = invoiceParamsSchema.parse(req.params);

    const result = await db.query(
      'delete from public.invoices where id = $1 and organization_id = $2 returning id',
      [invoiceId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Invoice not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);
