import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Receipt, Loader2 } from 'lucide-react';
import { usePaymentHistory, type PaymentTransaction } from '@/hooks/useSubscription';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const STATUS_CONFIG: Record<PaymentTransaction['status'], { label: string; className: string }> = {
  successful: {
    label: 'Successful',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  pending: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
  refunded: {
    label: 'Refunded',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  },
};

const TYPE_LABELS: Record<PaymentTransaction['payment_type'], string> = {
  subscription: 'Subscription',
  one_time: 'One-time',
  upgrade: 'Upgrade',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaymentHistory() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data: transactions = [], isLoading } = usePaymentHistory(limit);

  const canLoadMore = transactions.length === limit;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Payment History
        </CardTitle>
        <CardDescription>Recent billing transactions for your organization</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading transactions...</span>
          </div>
        ) : transactions.length === 0 ? (
          /* ---- Empty state ---- */
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="rounded-full bg-muted p-3">
              <Receipt className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No transactions yet</p>
              <p className="text-sm text-muted-foreground">
                Your payment history will appear here once you subscribe to a plan.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ---- Transactions table ---- */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden sm:table-cell">Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => {
                    const statusConfig = STATUS_CONFIG[tx.status];
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(tx.created_at)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatAmount(tx.amount, tx.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusConfig.className}>{statusConfig.label}</Badge>
                        </TableCell>
                        <TableCell>{TYPE_LABELS[tx.payment_type] ?? tx.payment_type}</TableCell>
                        <TableCell className="hidden max-w-[180px] truncate font-mono text-xs sm:table-cell">
                          {tx.flutterwave_tx_ref}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* ---- Load more ---- */}
            {canLoadMore && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
                >
                  Load More
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
