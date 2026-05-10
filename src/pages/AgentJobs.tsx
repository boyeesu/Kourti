import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAgentJobs } from '@/hooks/useAgentJobs';
import { AgentJobProgress } from '@/components/agents/AgentJobProgress';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/loading-states';
import { EmptyState } from '@/components/ui/empty-state';
import { Bot, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AgentNav } from '@/components/agents/AgentNav';

const agentTypeLabels: Record<string, string> = {
  matter_review: 'Matter Review',
};

export default function AgentJobs() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAgentJobs({
    status: statusFilter,
    page,
    pageSize: 20,
  });

  const jobs = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Agent Jobs</h1>
          <p className="text-sm text-muted-foreground">Monitor and manage autonomous agent tasks</p>
        </div>
      </div>

      <AgentNav />

      <div className="flex items-center gap-3">
        <Select
          value={statusFilter ?? 'all'}
          onValueChange={(v) => {
            setStatusFilter(v === 'all' ? undefined : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No agent jobs yet"
          description="Agent jobs will appear here when you trigger AI reviews from your cases."
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      {agentTypeLabels[job.agent_type] ?? job.agent_type}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                      {job.completed_at &&
                        ` · Completed ${formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AgentJobProgress status={job.status} progress={job.progress} compact />
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/agents/${job.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {job.status === 'running' && (
                <CardContent className="pt-0">
                  <AgentJobProgress
                    status={job.status}
                    progress={job.progress}
                    progressMessage={job.progress_message}
                  />
                </CardContent>
              )}
              {job.error && (
                <CardContent className="pt-0">
                  <p className="text-sm text-destructive">{job.error}</p>
                </CardContent>
              )}
            </Card>
          ))}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pagination.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
