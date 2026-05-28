import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCases, useDeleteCase } from '@/hooks/useCases'; // Add real data hooks
import { useSearch } from '@/hooks/use-search';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, ColumnDef } from '@/components/ui/data-table';
import { TableSkeleton } from '@/components/ui/loading-states';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Briefcase } from 'lucide-react';
import {
  Plus,
  Filter,
  Eye,
  Edit,
  MoreVertical,
  FileText,
  Calendar,
  User,
  Trash2,
  Upload,
} from 'lucide-react';
import { ModuleFilterBar } from '@/components/filters/ModuleFilterBar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

export default function App() {
  // Changed to App for React component export
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Use real data hooks, combining error handling and pagination logic
  const {
    data,
    isLoading,
    error,
    refetch, // For retrying on error
    page,
    pageSize,
    setPage,
  } = useCases();

  const cases = useMemo(() => data?.cases || [], [data?.cases]);
  const totalCount = data?.count || 0;
  // Ensure totalPages is at least 1 to avoid division by zero or negative pages
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const statuses = ['Active', 'Review', 'Draft', 'Closed'];
  const { term: globalSearch, setTerm } = useSearch(); // Destructure setTerm from useSearch
  const deleteCase = useDeleteCase();
  const [searchParams] = useSearchParams();
  const clientQuery = searchParams.get('client');

  // Effect to display toast notifications for errors and reset global search term
  useEffect(() => {
    if (error) {
      toast.error('Error', {
        description:
          error instanceof Error ? error.message : 'Failed to load matters. Please try again.',
      });
    }
    // Reset global search term when the component mounts or if setTerm changes
    setTerm('');
  }, [error, setTerm]); // Added setTerm to dependencies

  type CaseRow = {
    id: string;
    name: string;
    client: string;
    clientId?: string;
    status: string;
    priority: string;
    assignedTo: string;
    startDate: string;
    dueDate: string;
    documentsCount: number;
  };

  const caseRows: CaseRow[] = cases.map((c) => ({
    id: String(c.id || c.case_number || ''),
    name: c.title as string,
    client: String(c.client?.name || c.client || 'Unknown Client'),
    clientId: c.client_id || c.client?.id,
    status: c.status as string,
    priority: c.priority as string,
    assignedTo: c.assigned_user
      ? [c.assigned_user.first_name, c.assigned_user.last_name].filter(Boolean).join(' ')
      : 'Unassigned',
    startDate: c.created_at ? new Date(c.created_at).toLocaleDateString() : '',
    dueDate: c.next_hearing_date
      ? new Date(c.next_hearing_date).toLocaleDateString()
      : 'No date set',
    documentsCount: 0,
  }));

  // Determine the client name if a client query parameter is present
  const clientFilterName = clientQuery
    ? caseRows.find(
        (c) => c.clientId === clientQuery || c.client.toLowerCase() === clientQuery.toLowerCase()
      )?.client || clientQuery
    : '';

  // Handle matter deletion
  const handleDeleteCase = async (caseId: string) => {
    try {
      await deleteCase.mutateAsync(caseId);
      toast.success('Matter Deleted', {
        description: 'The matter has been successfully deleted.',
      });
    } catch {
      // The useDeleteCase hook should handle its own error toasts,
      // but a generic fallback is good here if needed.
      toast.error('Deletion Failed', {
        description: 'Could not delete the matter. Please try again.',
      });
    }
  };

  // Display loading state
  if (isLoading) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <PageHeader title="Matters" description="Manage and track all your legal matters" />
        <TableSkeleton rows={8} columns={6} />
      </PageContainer>
    );
  }

  // Display error state
  if (error) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <ErrorState
          title="Failed to load matters"
          message={
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred while loading matters.'
          }
          error={error}
          onRetry={() => refetch()}
        />
      </PageContainer>
    );
  }

  // Helper function to get status badge color
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-500 text-white'; // Using direct Tailwind classes for better control
      case 'review':
        return 'bg-yellow-500 text-white';
      case 'open':
        return 'bg-blue-500 text-white';
      case 'closed':
        return 'bg-red-500 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  // Helper function to get priority badge color
  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-red-600 text-white';
      case 'medium':
        return 'bg-orange-500 text-white';
      case 'low':
        return 'bg-green-600 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const filteredCases = caseRows.filter((case_item) => {
    const matchesLocalSearch =
      searchTerm === '' ||
      case_item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      case_item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      case_item.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesGlobalSearch =
      globalSearch === '' ||
      case_item.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
      case_item.client.toLowerCase().includes(globalSearch.toLowerCase()) ||
      case_item.id.toLowerCase().includes(globalSearch.toLowerCase());

    const matchesStatus = statusFilter === 'all' || case_item.status.toLowerCase() === statusFilter;

    const matchesClient =
      !clientQuery ||
      case_item.clientId === clientQuery ||
      case_item.client.toLowerCase() === clientQuery.toLowerCase();

    const matchesPriority =
      priorityFilter === 'all' || case_item.priority.toLowerCase() === priorityFilter;

    return (
      matchesLocalSearch && matchesGlobalSearch && matchesStatus && matchesClient && matchesPriority
    );
  });

  const handlePreviousPage = () => setPage((prev: number) => Math.max(1, prev - 1));
  const handleNextPage = () => setPage((prev: number) => Math.min(totalPages, prev + 1));

  return (
    <PageContainer>
      <Breadcrumbs />
      <PageHeader
        title="Matters"
        description="Manage and track all your legal matters"
        actions={
          <>
            <Button
              variant="outline"
              className="shadow-md flex-1 sm:flex-none"
              onClick={() => navigate('/bulk-import?type=matters')}
            >
              <Upload className="h-4 w-4 mr-2" />
              Bulk Import
            </Button>
            <Button
              className="shadow-md flex-1 sm:flex-none"
              onClick={() => navigate('/matters/create')}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Matter
            </Button>
          </>
        }
      />

      {/* Compact Filters Toolbar */}
      <ModuleFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search matters, clients, or IDs..."
        searchWidth="w-full sm:w-[320px]"
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
              ...statuses.map((s) => ({ value: s.toLowerCase(), label: s })),
            ],
          },
          {
            key: 'priority',
            placeholder: 'Priority',
            value: priorityFilter,
            onChange: setPriorityFilter,
            width: 'w-[140px]',
            options: [
              { value: 'all', label: 'All Priorities' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ],
          },
        ]}
        onClearAll={() => {
          setSearchTerm('');
          setStatusFilter('all');
          setPriorityFilter('all');
        }}
        trailing={
          clientQuery ? (
            <Badge variant="secondary" className="px-3 py-1 text-base rounded-full">
              Client: <span className="font-semibold ml-1">{clientFilterName}</span>
            </Badge>
          ) : undefined
        }
      />

      {/* Matters Table */}
      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">All Matters ({totalCount})</CardTitle>
          <CardDescription>Overview of all matters in your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={
              [
                {
                  id: 'name',
                  header: 'Matter Name',
                  accessorKey: 'name',
                  minWidth: '200px',
                  cell: (case_item) => (
                    <Link
                      to={`/matters/${case_item.id}`}
                      className="font-medium text-foreground outline-none transition hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary focus-visible:ring-offset-background rounded-sm truncate block max-w-[200px]"
                      title={case_item.name}
                    >
                      {case_item.name}
                    </Link>
                  ),
                },
                {
                  id: 'client',
                  header: 'Client',
                  accessorKey: 'client',
                  minWidth: '150px',
                  cell: (case_item) => (
                    <div className="truncate max-w-[150px]" title={case_item.client}>
                      {case_item.client}
                    </div>
                  ),
                },
                {
                  id: 'status',
                  header: 'Status',
                  accessorKey: 'status',
                  minWidth: '120px',
                  cell: (case_item) => (
                    <Badge className={getStatusColor(case_item.status)}>{case_item.status}</Badge>
                  ),
                },
                {
                  id: 'priority',
                  header: 'Priority',
                  accessorKey: 'priority',
                  minWidth: '120px',
                  cell: (case_item) => (
                    <Badge className={getPriorityColor(case_item.priority)}>
                      {case_item.priority}
                    </Badge>
                  ),
                },
                {
                  id: 'assignedTo',
                  header: 'Assigned To',
                  accessorKey: 'assignedTo',
                  minWidth: '150px',
                  cell: (case_item) => (
                    <div className="flex items-center gap-2 max-w-[150px]">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate" title={case_item.assignedTo}>
                        {case_item.assignedTo}
                      </span>
                    </div>
                  ),
                },
                {
                  id: 'dueDate',
                  header: 'Due Date',
                  accessorKey: 'dueDate',
                  minWidth: '150px',
                  cell: (case_item) => (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {case_item.dueDate}
                    </div>
                  ),
                },
                {
                  id: 'documentsCount',
                  header: 'Documents',
                  accessorKey: 'documentsCount',
                  minWidth: '120px',
                  cell: (case_item) => (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {case_item.documentsCount}
                    </div>
                  ),
                },
                {
                  id: 'actions',
                  header: 'Actions',
                  sortable: false,
                  minWidth: '80px',
                  className: 'text-right',
                  cell: (case_item) => (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-gray-100"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[180px]">
                        <DropdownMenuItem asChild>
                          <Link
                            to={`/matters/${case_item.id}`}
                            className="flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to={`/matters/${case_item.id}/edit`}
                            className="flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Matter
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to={`/matters/${case_item.id}/documents`}
                            className="flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            View Documents
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="text-destructive flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-destructive/10 rounded-sm"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Matter
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the
                                matter and remove all associated data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteCase(case_item.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete Matter
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ),
                },
              ] as ColumnDef<CaseRow>[]
            }
            data={filteredCases}
            emptyMessage="No matters found matching your criteria."
            getRowKey={(row) => row.id}
          />

          {/* Conditional rendering for empty states */}
          {filteredCases.length === 0 && cases.length === 0 && (
            <EmptyState
              icon={Briefcase}
              title="No matters yet"
              description="Get started by creating your first matter to track legal cases and manage client work."
              action={{
                label: 'Create First Matter',
                onClick: () => navigate('/matters/create'),
                icon: Plus,
              }}
            />
          )}
          {filteredCases.length === 0 && cases.length > 0 && (
            <EmptyState
              icon={Briefcase}
              title="No matching matters"
              description={`No matters match your current filters. Try adjusting your search or filter criteria.`}
              action={{
                label: 'Clear Filters',
                onClick: () => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setPriorityFilter('all');
                },
              }}
            />
          )}

          {/* Pagination controls */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between mt-6">
              <Button
                variant="outline"
                onClick={handlePreviousPage}
                disabled={page === 1}
                className="shadow-sm"
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={handleNextPage}
                disabled={page >= totalPages}
                className="shadow-sm"
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
