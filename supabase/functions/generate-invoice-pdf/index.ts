declare const Deno: any;

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createCorsSecurityHeaders, createEmptyResponse, createJsonResponse } from "../_shared/responseHeaders.ts";

const corsOptions = {
  allowMethods: ['POST', 'OPTIONS'],
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    console.log('Generate invoice PDF request received');
    
    const { invoiceId } = await req.json();
    
    if (!invoiceId) {
      throw new Error('Invoice ID is required');
    }

    // Get user info from request headers
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization required');
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      throw new Error('Invalid authorization');
    }

    console.log('Fetching invoice data for user:', user.id);

    // Fetch invoice with related data
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices' as any)
      .select(`
        *,
        client:client_id(id, name, email, address, phone),
        case:case_id(id, title),
        invoice_items(*)
      `)
      .eq('id', invoiceId)
      .single() as { data: any; error: any };

    if (invoiceError || !invoice) {
      console.error('Failed to fetch invoice:', invoiceError);
      throw new Error('Invoice not found');
    }

    // Fetch organization details
    const { data: profile } = await supabase
      .from('profiles' as any)
      .select('organization_id')
      .eq('user_id', user.id)
      .single() as { data: { organization_id: string } | null; error: any };

    const { data: organization } = await supabase
      .from('organizations' as any)
      .select('*')
      .eq('id', profile?.organization_id)
      .single() as { data: any; error: any };

    console.log('Generating PDF for invoice:', invoice.invoice_number);

    // Generate HTML for PDF
    const htmlContent = generateInvoiceHTML(invoice, organization);

    // For now, return the HTML content directly
    // In a production environment, you would use a PDF generation service
    const pdfBuffer = await generatePDFFromHTML(htmlContent);

    console.log('PDF generated successfully');

    const headers = new Headers(createCorsSecurityHeaders(corsOptions));
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);

    return new Response(pdfBuffer as unknown as BodyInit, {
      headers,
    });

  } catch (error: any) {
    console.error('Error generating invoice PDF:', error);
    return createJsonResponse(
      {
        error: error.message || 'PDF generation failed',
        success: false,
      },
      { status: 500, cors: corsOptions },
    );
  }
});

function generateInvoiceHTML(invoice: any, organization: any): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: invoice.currency || 'USD'
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice ${invoice.invoice_number}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 20px;
        }
        .company-info {
            flex: 1;
        }
        .company-name {
            font-size: 28px;
            font-weight: bold;
            color: #2563eb;
            margin-bottom: 10px;
        }
        .invoice-info {
            text-align: right;
            flex: 1;
        }
        .invoice-title {
            font-size: 32px;
            font-weight: bold;
            color: #2563eb;
            margin-bottom: 10px;
        }
        .invoice-number {
            font-size: 18px;
            color: #666;
            margin-bottom: 5px;
        }
        .invoice-details {
            display: flex;
            justify-content: space-between;
            margin: 30px 0;
        }
        .bill-to, .invoice-meta {
            flex: 1;
        }
        .bill-to {
            margin-right: 40px;
        }
        .section-title {
            font-size: 18px;
            font-weight: bold;
            color: #2563eb;
            margin-bottom: 10px;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 5px;
        }
        .client-info, .meta-info {
            background: #f9fafb;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #2563eb;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 30px 0;
            background: white;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .items-table th {
            background: #2563eb;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: bold;
        }
        .items-table th:last-child,
        .items-table td:last-child {
            text-align: right;
        }
        .items-table td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
        }
        .items-table tr:nth-child(even) {
            background: #f9fafb;
        }
        .totals {
            margin-top: 20px;
            text-align: right;
        }
        .totals-table {
            width: 300px;
            margin-left: auto;
            border-collapse: collapse;
        }
        .totals-table td {
            padding: 8px 12px;
            border-bottom: 1px solid #e5e7eb;
        }
        .totals-table .total-row {
            font-weight: bold;
            font-size: 18px;
            background: #2563eb;
            color: white;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        .notes {
            margin: 30px 0;
            padding: 15px;
            background: #f0f9ff;
            border-radius: 8px;
            border-left: 4px solid #0ea5e9;
        }
        .notes-title {
            font-weight: bold;
            color: #0c4a6e;
            margin-bottom: 10px;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .status-draft { background: #f3f4f6; color: #374151; }
        .status-sent { background: #dbeafe; color: #1e40af; }
        .status-paid { background: #d1fae5; color: #065f46; }
        .status-overdue { background: #fee2e2; color: #991b1b; }
        .status-cancelled { background: #f3f4f6; color: #6b7280; }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-info">
            <div class="company-name">${organization?.name || 'Your Company'}</div>
            <div>${organization?.address || ''}</div>
            <div>${organization?.email || ''}</div>
            <div>${organization?.phone || ''}</div>
        </div>
        <div class="invoice-info">
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-number">${invoice.invoice_number}</div>
            <div class="status-badge status-${invoice.status || 'draft'}">${(invoice.status || 'draft').replace('_', ' ')}</div>
        </div>
    </div>

    <div class="invoice-details">
        <div class="bill-to">
            <div class="section-title">Bill To</div>
            <div class="client-info">
                <strong>${invoice.client?.name || 'N/A'}</strong><br>
                ${invoice.client?.address || ''}<br>
                ${invoice.client?.email || ''}<br>
                ${invoice.client?.phone || ''}
            </div>
        </div>
        <div class="invoice-meta">
            <div class="section-title">Invoice Details</div>
            <div class="meta-info">
                <strong>Issue Date:</strong> ${formatDate(invoice.issue_date)}<br>
                <strong>Due Date:</strong> ${formatDate(invoice.due_date)}<br>
                ${invoice.case ? `<strong>Related Case:</strong> ${invoice.case.title}<br>` : ''}
                <strong>Currency:</strong> ${invoice.currency || 'USD'}
            </div>
        </div>
    </div>

    <table class="items-table">
        <thead>
            <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Rate</th>
                <th>Amount</th>
            </tr>
        </thead>
        <tbody>
            ${invoice.invoice_items?.map((item: any) => `
                <tr>
                    <td>${item.description}</td>
                    <td>${item.quantity}</td>
                    <td>${formatCurrency(item.rate)}</td>
                    <td>${formatCurrency(item.amount)}</td>
                </tr>
            `).join('') || '<tr><td colspan="4">No items found</td></tr>'}
        </tbody>
    </table>

    <div class="totals">
        <table class="totals-table">
            <tr>
                <td>Subtotal:</td>
                <td>${formatCurrency(invoice.subtotal || 0)}</td>
            </tr>
            <tr>
                <td>Tax (${((invoice.tax_rate || 0) * 100).toFixed(1)}%):</td>
                <td>${formatCurrency(invoice.tax_amount || 0)}</td>
            </tr>
            <tr class="total-row">
                <td>Total:</td>
                <td>${formatCurrency(invoice.total_amount || 0)}</td>
            </tr>
        </table>
    </div>

    ${invoice.notes ? `
    <div class="notes">
        <div class="notes-title">Notes</div>
        <div>${invoice.notes}</div>
    </div>
    ` : ''}

    ${invoice.terms_conditions ? `
    <div class="notes">
        <div class="notes-title">Terms & Conditions</div>
        <div>${invoice.terms_conditions}</div>
    </div>
    ` : ''}

    <div class="footer">
        <p>Thank you for your business!</p>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
    </div>
</body>
</html>`;
}

// Simple HTML to PDF conversion (for demo purposes)
// In production, you would use a proper PDF generation service
async function generatePDFFromHTML(html: string): Promise<Uint8Array> {
  // This is a placeholder implementation
  // In a real application, you would use a service like:
  // - Puppeteer
  // - Playwright
  // - HTML/CSS to PDF API service
  
  // For now, we'll return the HTML content as a simple PDF-like response
  // In production, replace this with actual PDF generation
  const encoder = new TextEncoder();
  return encoder.encode(`PDF Content would be generated here from HTML:

${html}`);
}