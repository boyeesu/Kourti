import { useState } from 'react';
import { useApprovals, useApproveRequest, useRejectRequest } from '@/hooks/useAgentApprovals';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Check, X, Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const variant = pct >= 90 ? 'outline' : pct >= 70 ? 'secondary' : 'destructive';
  return <Badge variant={variant}>{pct}% confidence</Badge>;
}

export default function AgentApprovals() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>('pending');
  const [page, setPage] = useState(1);
  const [reviewDialog, setReviewDialog] = useState<{
    id: string;
    action: 'approve' | 'reject';
  } | null>(null);
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useApprovals({ status: statusFilter, page });
  const approve = useApproveRequest();
  const reject = useRejectRequest();

  const approvals = data?.data ?? [];
  const pagination = data?.pagination;

  const handleReview = () => {
    if (!reviewDialog) return;
    if (reviewDialog.action === 'approve') {
      approve.mutate({ approvalId: reviewDialog.id, notes: notes || undefined });
    } else {
      reject.mutate({ approvalId: reviewDialog.id, notes: notes || undefined });
    }
    setReviewDialog(null);
    setNotes('');
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Approval Queue</h1>
          <p className="text-sm text-muted-foreground">Review and approve agent-proposed actions</p>
        </div>
        {data?.pendingCount ? (
          <Badge variant="destructive" className="text-sm">
            {data.pendingCount} pending
          </Badge>
        ) : null}
      </div>

      <Select
        value={statusFilter ?? 'all'}
        onValueChange={(v) => {
          setStatusFilter(v === 'all' ? undefined : v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
        </SelectContent>
      </Select>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
      ) : approvals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No approval requests</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{a.summary}</CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Agent: {a.requested_by_agent}</span>
                      <span>Action: {a.action_type}</span>
                      <span>
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ConfidenceBadge confidence={a.confidence} />
                    <Badge
                      variant={
                        a.status === 'pending'
                          ? 'secondary'
                          : a.status === 'approved'
                            ? 'outline'
                            : 'destructive'
                      }
                    >
                      {a.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              {a.status === 'pending' && (
                <CardContent className="pt-0 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setReviewDialog({ id: a.id, action: 'approve' });
                      setNotes('');
                    }}
                  >
                    <Check className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setReviewDialog({ id: a.id, action: 'reject' });
                      setNotes('');
                    }}
                  >
                    <X className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </CardContent>
              )}
              {a.review_notes && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">Notes: {a.review_notes}</p>
                </CardContent>
              )}
            </Card>
          ))}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pagination.totalPages}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.action === 'approve' ? 'Approve Action' : 'Reject Action'}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Optional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={reviewDialog?.action === 'approve' ? 'default' : 'destructive'}
              onClick={handleReview}
            >
              {reviewDialog?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
