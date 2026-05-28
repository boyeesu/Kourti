import { useParams, Link } from 'react-router-dom';
import { useNegotiation, useAIRespond, useEscalateNegotiation } from '@/hooks/useNegotiations';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Bot, ArrowDown, ArrowUp, AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { PageContainer } from '@/components/layout/PageContainer';

export default function NegotiationDetails() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useNegotiation(id);
  const aiRespond = useAIRespond();
  const escalate = useEscalateNegotiation();

  const neg = data?.data;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!neg) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Negotiation not found</p>
      </div>
    );
  }

  const turns = neg.turns ?? [];
  const positions = neg.positions ?? [];

  return (
    <PageContainer>
      <Breadcrumbs />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/negotiations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {neg.contract_title ?? 'Negotiation'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {neg.counterparty_name ? `vs. ${neg.counterparty_name} · ` : ''}
              Round {neg.current_round} · {neg.status}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {neg.status === 'active' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => aiRespond.mutate(neg.id)}
                disabled={aiRespond.isPending}
              >
                {aiRespond.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Bot className="h-3 w-3 mr-1" />
                )}
                AI Counter-Proposal
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => escalate.mutate({ negotiationId: neg.id })}
              >
                <AlertTriangle className="h-3 w-3 mr-1" /> Escalate
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {turns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No turns recorded yet. Record an incoming turn to start.
                </p>
              ) : (
                <div className="space-y-0">
                  {turns.map((turn, i) => (
                    <div key={turn.id}>
                      <div className="flex items-start gap-3 py-3">
                        <div
                          className={`mt-1 rounded-full p-1 ${turn.direction === 'incoming' ? 'bg-amber-500/10' : 'bg-blue-500/10'}`}
                        >
                          {turn.direction === 'incoming' ? (
                            <ArrowDown className="h-3 w-3 text-amber-500" />
                          ) : (
                            <ArrowUp className="h-3 w-3 text-blue-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              Round {turn.round_number} —{' '}
                              {turn.direction === 'incoming' ? 'Counterparty' : 'Our Response'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(turn.created_at), 'PP p')}
                            </span>
                          </div>
                          {turn.changes && turn.changes.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {turn.changes.map((c, ci) => (
                                <div key={ci} className="text-xs rounded border p-2">
                                  <span className="font-medium">{c.clause}:</span>{' '}
                                  <span className="text-red-500 line-through">{c.from}</span>{' '}
                                  <span className="text-green-500">{c.to}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {turn.ai_analysis && (
                            <div className="mt-2 rounded border border-blue-500/20 bg-blue-500/5 p-2">
                              <div className="flex items-center gap-1 text-xs font-medium text-blue-500 mb-1">
                                <Bot className="h-3 w-3" /> AI Analysis
                                {turn.ai_confidence != null && (
                                  <Badge variant="outline" className="ml-1 text-xs">
                                    {Math.round(turn.ai_confidence * 100)}%
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {String(
                                  (turn.ai_analysis as Record<string, unknown>).overallAssessment ??
                                    ''
                                )}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      {i < turns.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Clause Positions</CardTitle>
            </CardHeader>
            <CardContent>
              {positions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No positions tracked yet</p>
              ) : (
                <div className="space-y-3">
                  {positions.map((pos) => (
                    <div key={pos.id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{pos.clause_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {pos.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                        <div>
                          <span className="text-muted-foreground">Ours:</span>
                          <p>{pos.our_position ?? '—'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Theirs:</span>
                          <p>{pos.their_position ?? '—'}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Discussed in {pos.rounds_discussed} round
                        {pos.rounds_discussed !== 1 ? 's' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <Badge variant="outline">{neg.status}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Round:</span> {neg.current_round}
              </div>
              {neg.playbook_name && (
                <div>
                  <span className="text-muted-foreground">Playbook:</span> {neg.playbook_name}
                </div>
              )}
              {neg.escalated_at && (
                <div className="text-amber-500">
                  Escalated {format(new Date(neg.escalated_at), 'PP')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
