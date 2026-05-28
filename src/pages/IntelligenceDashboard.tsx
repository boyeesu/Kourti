import {
  useLatestIntelligence,
  useIntelligenceRecommendations,
  useGenerateIntelligence,
  useDismissRecommendation,
} from '@/hooks/useIntelligence';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import {
  Brain,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Clock,
  TrendingUp,
  Target,
  Check,
  X,
  Eye,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const categoryIcons: Record<string, React.ReactNode> = {
  deadline: <Clock className="h-4 w-4" />,
  risk: <AlertTriangle className="h-4 w-4" />,
  workload: <TrendingUp className="h-4 w-4" />,
  opportunity: <Target className="h-4 w-4" />,
};

const priorityColors: Record<string, string> = {
  high: 'border-red-500/30 bg-red-500/5',
  medium: 'border-amber-500/30 bg-amber-500/5',
  low: 'border-blue-500/30 bg-blue-500/5',
};

const entityLinks: Record<string, string> = {
  case: '/cases',
  contract: '/contracts',
};

export default function IntelligenceDashboard() {
  const { data: snapshotData, isLoading: snapshotLoading } = useLatestIntelligence();
  const { data: recsData } = useIntelligenceRecommendations();
  const generate = useGenerateIntelligence();
  const dismiss = useDismissRecommendation();

  const snapshot = snapshotData?.data;
  const recommendations = recsData?.data ?? [];
  const intel = (snapshot?.data ?? {}) as Record<string, unknown>;
  const riskAgg = (intel.riskAggregation ?? {}) as Record<string, unknown>;
  const priorityMatrix = (intel.priorityMatrix ?? []) as Array<Record<string, unknown>>;
  const workloadInsights = (intel.workloadInsights ?? {}) as Record<string, unknown>;

  return (
    <PageContainer>
      <Breadcrumbs />

      <PageHeader
        title="Intelligence"
        description="AI-synthesized overview of your organization's legal operations"
        actions={
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Generate Now
          </Button>
        }
      />

      {snapshotLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !snapshot ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No intelligence snapshot yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click "Generate Now" to create your first organizational intelligence report
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            Last updated: {formatDistanceToNow(new Date(snapshot.created_at), { addSuffix: true })}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {/* Risk Overview */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Risk Level
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge
                  variant={
                    riskAgg.overallRiskLevel === 'critical' || riskAgg.overallRiskLevel === 'high'
                      ? 'destructive'
                      : riskAgg.overallRiskLevel === 'medium'
                        ? 'secondary'
                        : 'outline'
                  }
                  className="text-lg px-3 py-1"
                >
                  {String(riskAgg.overallRiskLevel ?? 'unknown')}
                </Badge>
                {Array.isArray(riskAgg.patterns) && riskAgg.patterns.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {(riskAgg.patterns as string[]).slice(0, 3).map((p: string, i: number) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Priority Items */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4" /> Priority Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{priorityMatrix.length}</div>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-red-500">
                    {priorityMatrix.filter((p) => p.urgency === 'immediate').length} immediate
                  </span>
                  <span className="text-xs text-amber-500">
                    {priorityMatrix.filter((p) => p.urgency === 'this_week').length} this week
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Workload */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Workload
                </CardTitle>
              </CardHeader>
              <CardContent>
                {Array.isArray(workloadInsights.observations) &&
                workloadInsights.observations.length > 0 ? (
                  <ul className="space-y-1">
                    {(workloadInsights.observations as string[])
                      .slice(0, 3)
                      .map((o: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          {o}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No workload data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              {recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No active recommendations
                </p>
              ) : (
                <div className="space-y-2">
                  {recommendations.map((rec) => (
                    <div
                      key={rec.id}
                      className={`rounded-lg border p-3 ${priorityColors[rec.priority] ?? ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 text-muted-foreground">
                            {categoryIcons[rec.category] ?? categoryIcons.risk}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{rec.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {rec.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className="text-xs">
                            {rec.priority}
                          </Badge>
                          {rec.entity_type && rec.entity_id && entityLinks[rec.entity_type] && (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild>
                              <Link to={`${entityLinks[rec.entity_type]}/${rec.entity_id}`}>
                                <Eye className="h-3 w-3" />
                              </Link>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => dismiss.mutate({ id: rec.id, status: 'acted_on' })}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => dismiss.mutate({ id: rec.id, status: 'dismissed' })}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
