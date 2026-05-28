import { useParams, Link } from 'react-router-dom';
import { useAgentJob, useAgentJobAudit, useCancelAgentJob } from '@/hooks/useAgentJobs';
import { AgentJobProgress } from '@/components/agents/AgentJobProgress';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Clock, Loader2, XCircle, Ban, Zap, FileText, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';

const agentTypeLabels: Record<string, string> = {
  matter_review: 'Matter Review',
};

const stepIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
};

export default function AgentJobDetails() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data: jobData, isLoading } = useAgentJob(jobId);
  const { data: auditData } = useAgentJobAudit(jobId);
  const cancelJob = useCancelAgentJob();

  const job = jobData?.data;
  const audit = auditData?.data ?? [];

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  if (!job) {
    return (
      <PageContainer>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Job not found</p>
          <Button variant="link" asChild className="mt-2">
            <Link to="/agents">Back to agents</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const output = job.output as Record<string, unknown> | null;
  const riskReport = output?.riskReport as Record<string, unknown> | undefined;
  const statusMemo = output?.statusMemo as string | undefined;
  const totalTokens = job.steps.reduce((sum, s) => sum + (s.tokens_used ?? 0), 0);
  const totalDuration = job.steps.reduce((sum, s) => sum + (s.duration_ms ?? 0), 0);

  return (
    <PageContainer>
      <Breadcrumbs />

      <PageHeader
        title={agentTypeLabels[job.agent_type] ?? job.agent_type}
        description={`Created ${format(new Date(job.created_at), 'PPp')}`}
        backHref="/agents"
        actions={
          (job.status === 'pending' || job.status === 'running') && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => cancelJob.mutate(job.id)}
              disabled={cancelJob.isPending}
            >
              <Ban className="mr-1 h-3 w-3" />
              Cancel
            </Button>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="mt-1">
              <AgentJobProgress
                status={job.status}
                progress={job.progress}
                progressMessage={job.progress_message}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Steps</div>
            <div className="mt-1 text-2xl font-bold">
              {job.steps.filter((s) => s.status === 'completed').length}/{job.steps.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Zap className="h-3 w-3" /> Tokens Used
            </div>
            <div className="mt-1 text-2xl font-bold">{totalTokens.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Duration</div>
            <div className="mt-1 text-2xl font-bold">
              {totalDuration > 0 ? `${(totalDuration / 1000).toFixed(1)}s` : '--'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={statusMemo || riskReport ? 'output' : 'steps'}>
        <TabsList>
          {(statusMemo || riskReport) && <TabsTrigger value="output">Output</TabsTrigger>}
          <TabsTrigger value="steps">Steps</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        {(statusMemo || riskReport) && (
          <TabsContent value="output" className="space-y-4">
            {riskReport && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Shield className="h-5 w-5" />
                    Risk Report
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-sm text-muted-foreground">Risk Score</span>
                      <div className="text-3xl font-bold">
                        {String(riskReport.overallRiskScore ?? 'N/A')}
                        <span className="text-base font-normal text-muted-foreground">/100</span>
                      </div>
                    </div>
                    <Badge
                      variant={
                        riskReport.overallRiskLevel === 'critical'
                          ? 'destructive'
                          : riskReport.overallRiskLevel === 'high'
                            ? 'destructive'
                            : riskReport.overallRiskLevel === 'medium'
                              ? 'secondary'
                              : 'outline'
                      }
                      className="text-sm"
                    >
                      {String(riskReport.overallRiskLevel ?? 'unknown')} risk
                    </Badge>
                  </div>
                  {typeof riskReport.executiveSummary === 'string' && (
                    <p className="text-sm">{riskReport.executiveSummary}</p>
                  )}
                  {Array.isArray(riskReport.topRisks) && riskReport.topRisks.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Top Risks</h4>
                      {(riskReport.topRisks as Array<Record<string, string>>).map((risk, i) => (
                        <div key={i} className="rounded-md border p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{risk.title}</span>
                            <Badge
                              variant={risk.severity === 'critical' ? 'destructive' : 'secondary'}
                            >
                              {risk.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{risk.description}</p>
                          {risk.recommendation && (
                            <p className="text-sm mt-1">
                              <strong>Recommendation:</strong> {risk.recommendation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {Array.isArray(riskReport.recommendations) &&
                    riskReport.recommendations.length > 0 && (
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium">Recommendations</h4>
                        <ul className="list-disc pl-5 text-sm space-y-1">
                          {(riskReport.recommendations as string[]).map(
                            (rec: string, i: number) => (
                              <li key={i}>{rec}</li>
                            )
                          )}
                        </ul>
                      </div>
                    )}
                </CardContent>
              </Card>
            )}

            {statusMemo && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5" />
                    Status Memo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                    {statusMemo}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="steps">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-0">
                {job.steps.map((step, i) => (
                  <div key={step.id}>
                    <div className="flex items-start gap-3 py-3">
                      <div className="mt-0.5">{stepIcons[step.status]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{step.step_name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {step.tokens_used > 0 && (
                              <span>{step.tokens_used.toLocaleString()} tokens</span>
                            )}
                            {step.duration_ms != null && (
                              <span>{(step.duration_ms / 1000).toFixed(1)}s</span>
                            )}
                            {step.model_used && <Badge variant="outline">{step.model_used}</Badge>}
                          </div>
                        </div>
                        {step.error && (
                          <p className="text-sm text-destructive mt-1">{step.error}</p>
                        )}
                      </div>
                    </div>
                    {i < job.steps.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardContent className="pt-6">
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No audit entries yet
                </p>
              ) : (
                <div className="space-y-2">
                  {audit.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 py-2 text-sm">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.created_at), 'HH:mm:ss')}
                      </span>
                      <div>
                        <span className="font-medium">{entry.action}</span>
                        {entry.entity_type && (
                          <span className="text-muted-foreground"> on {entry.entity_type}</span>
                        )}
                        {entry.details && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {Object.entries(entry.details)
                              .filter(([k]) => !['prompt', 'content', 'rawAnalysis'].includes(k))
                              .map(
                                ([k, v]) =>
                                  `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`
                              )
                              .join(' | ')
                              .slice(0, 200)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
