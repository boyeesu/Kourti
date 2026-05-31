import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Building,
  Mail,
  MoreHorizontal,
  Upload,
  UserCheck,
  Filter,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModuleFilterBar } from '@/components/filters/ModuleFilterBar';
import { DataTable, ColumnDef } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { useClients } from '@/hooks/useClients';
import { useEnableClientPortal, useDisableClientPortal } from '@/features/clientPortal/api';
import { toast } from 'sonner';
import type { Client } from '@/types';
import { TableSkeleton } from '@/components/ui/loading-states';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';

export default function Clients() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading, error } = useClients();
  const clients: Client[] = data?.items ?? [];

  if (isLoading) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <PageHeader title="Clients" description="Manage your client database and relationships" />
        <TableSkeleton rows={6} columns={4} />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <ErrorState
          title="Failed to load clients"
          message={
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred while loading clients.'
          }
          error={error}
        />
      </PageContainer>
    );
  }

  // Filter & aggregations ---------------------------------------------------
  const filtered = clients.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || (c.status?.toLowerCase() ?? '') === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalCases = clients.reduce((sum, c) => sum + (c.cases?.[0]?.count ?? 0), 0);
  const totalContracts = clients.reduce((sum, c) => sum + (c.contracts?.[0]?.count ?? 0), 0);

  // Helpers -----------------------------------------------------------------
  const getStatusColor = (status?: string) => {
    switch ((status ?? '').toLowerCase()) {
      case 'active':
        return 'bg-success/10 text-success';
      case 'inactive':
        return 'bg-muted/50 text-muted-foreground';
      default:
        return 'bg-muted/50 text-muted-foreground';
    }
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  // -------------------------------------------------------------------------
  return (
    <PageContainer className="animate-fade-in">
      <Breadcrumbs />

      <PageHeader
        title="Clients"
        description="Manage your client database and relationships"
        actions={
          <>
            <Button onClick={() => navigate('/clients/create')} className="shadow-md hover-scale">
              <Plus className="h-4 w-4 mr-2" />
              New Client
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/bulk-import?type=clients')}
              className="hover-scale"
            >
              <Upload className="h-4 w-4 mr-2" />
              Bulk Import
            </Button>
          </>
        }
      />

      {/* Metrics ---------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard label="Total Clients" value={clients.length} />
        <MetricCard
          label="Active Clients"
          value={clients.filter((c) => (c.status?.toLowerCase() ?? '') === 'active').length}
        />
        <MetricCard label="Total Cases" value={totalCases} />
        <MetricCard label="Total Contracts" value={totalContracts} />
      </div>

      {/* Filters ---------------------------------------------------------- */}
      <ModuleFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search clients, contacts, or email..."
        searchWidth="w-full sm:w-[280px]"
        filters={[
          {
            key: 'status',
            placeholder: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            width: 'w-[140px]',
            icon: <Filter className="h-4 w-4" />,
            options: [
              { value: 'all', label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
              { value: 'pending', label: 'Pending' },
            ],
          },
        ]}
        onClearAll={() => {
          setSearchTerm('');
          setStatusFilter('all');
        }}
      />

      {/* Table ------------------------------------------------------------ */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Client Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={
              [
                {
                  id: 'client',
                  header: 'Client',
                  accessorKey: 'name',
                  minWidth: '200px',
                  cell: (client) => (
                    <div className="flex items-center gap-3 max-w-[200px]">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                          {getInitials(client.name)}
                        </AvatarFallback>
                      </Avatar>
                      <button
                        onClick={() => navigate(`/clients/${client.id}`)}
                        className="font-medium text-foreground hover:text-primary text-left truncate"
                        title={client.name}
                      >
                        {client.name}
                      </button>
                    </div>
                  ),
                },
                {
                  id: 'contact',
                  header: 'Email',
                  sortable: false,
                  minWidth: '200px',
                  cell: (client) => (
                    <div
                      className="flex items-center gap-2 text-sm truncate max-w-[200px]"
                      title={client.email || 'No email'}
                    >
                      <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{client.email || 'No email'}</span>
                    </div>
                  ),
                },
                {
                  id: 'type',
                  header: 'Type',
                  sortable: false,
                  minWidth: '120px',
                  cell: () => <Badge variant="outline">Individual</Badge>,
                },
                {
                  id: 'status',
                  header: 'Status',
                  accessorKey: 'status',
                  minWidth: '120px',
                  cell: (client) => (
                    <Badge className={getStatusColor(client.status)} variant="outline">
                      {client.status ?? '-'}
                    </Badge>
                  ),
                },
                {
                  id: 'cases',
                  header: 'Cases',
                  accessorFn: (client) => client.cases?.[0]?.count ?? 0,
                  minWidth: '100px',
                  cell: (client) => (
                    <span className="font-medium">{client.cases?.[0]?.count ?? 0}</span>
                  ),
                },
                {
                  id: 'contracts',
                  header: 'Contracts',
                  accessorFn: (client) => client.contracts?.[0]?.count ?? 0,
                  minWidth: '120px',
                  cell: (client) => (
                    <span className="font-medium">{client.contracts?.[0]?.count ?? 0}</span>
                  ),
                },
                {
                  id: 'created',
                  header: 'Created',
                  accessorKey: 'created_at',
                  minWidth: '120px',
                  cell: (client) => (
                    <span className="text-sm text-muted-foreground">
                      {new Date(client.created_at).toLocaleDateString()}
                    </span>
                  ),
                },
                {
                  id: 'actions',
                  header: 'Actions',
                  sortable: false,
                  minWidth: '80px',
                  cell: (client) => <ClientActionsMenu client={client} navigate={navigate} />,
                },
              ] as ColumnDef<Client>[]
            }
            data={filtered}
            emptyMessage="No clients found"
            getRowKey={(row) => row.id}
          />
        </CardContent>
      </Card>

      {/* Empty state ------------------------------------------------------ */}
      {filtered.length === 0 && clients.length === 0 && (
        <EmptyState
          icon={UserCheck}
          title="No clients yet"
          description="Get started by adding your first client to manage relationships and track legal matters."
          action={{
            label: 'Add First Client',
            onClick: () => navigate('/clients/create'),
            icon: Plus,
          }}
        />
      )}
      {filtered.length === 0 && clients.length > 0 && (
        <EmptyState
          icon={UserCheck}
          title="No matching clients"
          description={`No clients match "${searchTerm}". Try adjusting your search or filters.`}
          action={{
            label: 'Clear Filters',
            onClick: () => {
              setSearchTerm('');
              setStatusFilter('all');
            },
          }}
        />
      )}
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Per-row actions menu (extracted so the client portal hooks can be used) ---
// ---------------------------------------------------------------------------
interface ClientActionsMenuProps {
  client: Client;
  navigate: ReturnType<typeof useNavigate>;
}

function ClientActionsMenu({ client, navigate }: ClientActionsMenuProps) {
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const enablePortal = useEnableClientPortal();
  const disablePortal = useDisableClientPortal();

  // The clients list row does not carry portal state, so we always offer both
  // enable (idempotent server-side — it re-sends the invite) and disable, and
  // rely on the mutation toasts + query invalidation for feedback.
  const hasEmail = Boolean(client.email);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}`)}>
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}/edit`)}>
            Edit Client
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/matters?client=${client.id}`)}>
            View Matters
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/contracts?client=${client.id}`)}>
            View Contracts
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!hasEmail || enablePortal.isPending}
            onClick={() => {
              if (!hasEmail) {
                toast.error('An email address is required to enable the client portal');
                return;
              }
              enablePortal.mutate(client.id);
            }}
          >
            <ShieldCheck className="h-4 w-4 mr-2" />
            Enable client portal
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmDisableOpen(true)}
          >
            <ShieldOff className="h-4 w-4 mr-2" />
            Disable client portal
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable client portal?</AlertDialogTitle>
            <AlertDialogDescription>
              This revokes {client.name}&apos;s access to the client portal. They will no longer be
              able to sign in or view case updates. You can re-enable access at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => disablePortal.mutate(client.id)}
            >
              Disable access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reusable metric card component -------------------------------------------
// ---------------------------------------------------------------------------
interface MetricCardProps {
  label: string;
  value: number | string;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-lg">
            <Building className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
