import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useNegotiations } from '@/hooks/useNegotiations';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Handshake, Filter } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ModuleFilterBar } from '@/components/filters/ModuleFilterBar';

const statusColors: Record<string, string> = {
  active: 'bg-blue-500/10 text-blue-500',
  agreed: 'bg-green-500/10 text-green-500',
  terminated: 'bg-red-500/10 text-red-500',
  escalated: 'bg-amber-500/10 text-amber-500',
};

export default function Negotiations() {
  const { data, isLoading } = useNegotiations();
  const negotiations = useMemo(() => data?.data ?? [], [data?.data]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [playbookFilter, setPlaybookFilter] = useState('all');

  // Derive unique playbook names for the filter
  const playbookOptions = useMemo(() => {
    const names = new Set<string>();
    negotiations.forEach((n) => {
      if (n.playbook_name) names.add(n.playbook_name);
    });
    return [
      { value: 'all', label: 'All Playbooks' },
      ...Array.from(names).map((name) => ({ value: name, label: name })),
    ];
  }, [negotiations]);

  const filtered = useMemo(() => {
    return negotiations.filter((neg) => {
      const matchesSearch =
        searchTerm === '' ||
        (neg.contract_title ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (neg.counterparty_name ?? '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || neg.status === statusFilter;

      const matchesPlaybook = playbookFilter === 'all' || neg.playbook_name === playbookFilter;

      return matchesSearch && matchesStatus && matchesPlaybook;
    });
  }, [negotiations, searchTerm, statusFilter, playbookFilter]);

  return (
    <PageContainer>
      <Breadcrumbs />

      <PageHeader
        title="Negotiations"
        description="Track and manage contract negotiations with AI assistance"
      />

      {/* Filters */}
      <ModuleFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search contracts or counterparties..."
        searchWidth="w-full sm:w-[300px]"
        filters={[
          {
            key: 'status',
            placeholder: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            width: 'w-[150px]',
            icon: <Filter className="h-4 w-4" />,
            options: [
              { value: 'all', label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'agreed', label: 'Agreed' },
              { value: 'terminated', label: 'Terminated' },
              { value: 'escalated', label: 'Escalated' },
            ],
          },
          {
            key: 'playbook',
            placeholder: 'Playbook',
            value: playbookFilter,
            onChange: setPlaybookFilter,
            width: 'w-[170px]',
            options: playbookOptions,
          },
        ]}
        onClearAll={() => {
          setSearchTerm('');
          setStatusFilter('all');
          setPlaybookFilter('all');
        }}
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Handshake className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {negotiations.length === 0
                ? 'No negotiations yet'
                : 'No negotiations match your filters'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {negotiations.length === 0
                ? 'Start a negotiation from any contract page'
                : 'Try adjusting your search or filters'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((neg) => (
            <Card key={neg.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {neg.contract_title ?? 'Untitled Contract'}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      {neg.counterparty_name && <span>vs. {neg.counterparty_name}</span>}
                      <span>Round {neg.current_round}</span>
                      {neg.playbook_name && (
                        <Badge variant="outline" className="text-xs">
                          {neg.playbook_name}
                        </Badge>
                      )}
                      <span>
                        {formatDistanceToNow(new Date(neg.updated_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[neg.status] ?? 'bg-secondary'}>
                      {neg.status}
                    </Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/negotiations/${neg.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
