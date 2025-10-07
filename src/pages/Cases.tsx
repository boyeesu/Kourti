import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCases as useContextCases } from "@/context/CasesContext"; // Keep context for compatibility
import { useCases, useDeleteCase } from "@/hooks/useCases"; // Add real data hooks
import { useSearch } from "@/hooks/use-search";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  MoreVertical,
  FileText,
  Calendar,
  User,
  Trash2,
  Upload
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

export default function App() { // Changed to App for React component export
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();

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

  const cases = data?.cases || [];
  const totalCount = data?.count || 0;
  // Ensure totalPages is at least 1 to avoid division by zero or negative pages
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const { statuses } = useContextCases(); // Keep for status options only
  const { term: globalSearch, setTerm } = useSearch(); // Destructure setTerm from useSearch
  const deleteCase = useDeleteCase();
  const [searchParams] = useSearchParams();
  const clientQuery = searchParams.get("client");

  // Effect to display toast notifications for errors and reset global search term
  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to load cases. Please try again.",
      });
    }
    // Reset global search term when the component mounts or if setTerm changes
    setTerm("");
  }, [error, toast, setTerm]); // Added setTerm to dependencies

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

  const caseRows: CaseRow[] = cases.map((c: any) => ({
    id: String(c.id || c.case_number || ''),
    name: (c.title || c.name) as string,
    client: String(c.client?.name || c.client || 'Unknown Client'),
    clientId: c.client_id || c.client?.id,
    status: c.status as string,
    priority: c.priority as string,
    assignedTo:
      c.assigned_user
        ? [c.assigned_user.first_name, c.assigned_user.last_name].filter(Boolean).join(" ")
        : "Unassigned",
    startDate: c.created_at
      ? new Date(c.created_at).toLocaleDateString()
      : '',
    dueDate: c.next_hearing_date
      ? new Date(c.next_hearing_date).toLocaleDateString()
      : 'No date set',
    documentsCount: 0,
  }));

  // Determine the client name if a client query parameter is present
  const clientFilterName = clientQuery
    ? caseRows.find(
        (c) =>
          c.clientId === clientQuery ||
          c.client.toLowerCase() === clientQuery.toLowerCase(),
      )?.client || clientQuery
    : "";

  // Handle case deletion
  const handleDeleteCase = async (caseId: string) => {
    try {
      await deleteCase.mutateAsync(caseId);
      toast({
        title: "Case Deleted",
        description: "The case has been successfully deleted.",
      });
    } catch (error) {
      // The useDeleteCase hook should handle its own error toasts,
      // but a generic fallback is good here if needed.
      toast({
        variant: "destructive",
        title: "Deletion Failed",
        description: "Could not delete the case. Please try again.",
      });
    }
  };

  // Display loading state
  if (isLoading) {
    return (
      <div className="px-6 py-8 flex items-center justify-center min-h-[calc(100vh-100px)]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        <p className="ml-3 text-sm text-muted-foreground">Loading cases...</p>
      </div>
    );
  }

  // Display error state
  if (error) {
    return (
      <div className="px-6 py-8 flex flex-col items-center justify-center min-h-[calc(100vh-100px)]">
        <p className="text-destructive text-sm mb-3 text-center">
          {error instanceof Error
            ? error.message
            : "An unexpected error occurred while loading cases."}
        </p>
        <Button size="sm" onClick={() => refetch()}>Retry Loading Cases</Button>
      </div>
    );
  }

  // Helper function to get status badge color using semantic tokens
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active": return "bg-success text-success-foreground";
      case "review": return "bg-warning text-warning-foreground";
      case "open": return "bg-primary/20 text-primary border border-primary/30";
      case "closed": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  // Helper function to get priority badge color using semantic tokens
  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high": return "bg-destructive text-destructive-foreground";
      case "medium": return "bg-warning text-warning-foreground";
      case "low": return "bg-success/20 text-success border border-success/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const filteredCases = caseRows.filter((case_item) => {
    const matchesLocalSearch =
      searchTerm === "" ||
      case_item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      case_item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      case_item.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesGlobalSearch =
      globalSearch === "" ||
      case_item.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
      case_item.client.toLowerCase().includes(globalSearch.toLowerCase()) ||
      case_item.id.toLowerCase().includes(globalSearch.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || case_item.status.toLowerCase() === statusFilter;

    const matchesClient =
      !clientQuery ||
      case_item.clientId === clientQuery ||
      case_item.client.toLowerCase() === clientQuery.toLowerCase();

    return (
      matchesLocalSearch &&
      matchesGlobalSearch &&
      matchesStatus &&
      matchesClient
    );
  });

  const handlePreviousPage = () => setPage((prev: number) => Math.max(1, prev - 1));
  const handleNextPage = () => setPage((prev: number) => Math.min(totalPages, prev + 1));

  return (
    <div className="px-6 py-4 space-y-4 max-w-[1600px] mx-auto">
      <Breadcrumbs />
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Cases</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage and track all your legal cases</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => navigate("/bulk-import?type=cases")}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Import
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => navigate("/cases/create")}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Case
          </Button>
        </div>
      </div>

      {/* Compact Filters Toolbar */}
      <div className="flex flex-wrap gap-2 items-center bg-card border border-border rounded-lg px-3 py-2.5">
        <div className="relative w-full sm:w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search cases..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 pl-8 pr-3 text-sm bg-background"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {statuses && statuses.length > 0 ? (
              statuses.map((s: string) => (
                <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>
              ))
            ) : (
              <>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
        <Select>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        {clientQuery && (
          <Badge variant="secondary" className="ml-auto h-7 px-2.5 text-xs font-medium">
            Client: {clientFilterName}
          </Badge>
        )}
      </div>

      {/* Cases Table */}
      <Card className="border border-border">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">All Cases</CardTitle>
            <span className="text-sm text-muted-foreground font-medium">{totalCount} total</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-t">
                  <TableHead className="h-9 px-4 text-xs font-medium">Case Name</TableHead>
                  <TableHead className="h-9 px-4 text-xs font-medium">Client</TableHead>
                  <TableHead className="h-9 px-4 text-xs font-medium">Status</TableHead>
                  <TableHead className="h-9 px-4 text-xs font-medium">Priority</TableHead>
                  <TableHead className="h-9 px-4 text-xs font-medium">Assigned To</TableHead>
                  <TableHead className="h-9 px-4 text-xs font-medium">Due Date</TableHead>
                  <TableHead className="h-9 px-4 text-xs font-medium text-center">Docs</TableHead>
                  <TableHead className="h-9 px-4 w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCases.length > 0 ? (
                  filteredCases.map((case_item) => (
                    <TableRow key={case_item.id} className="hover:bg-muted/30 border-b border-border/50">
                      <TableCell className="py-2.5 px-4">
                        <div>
                          <div className="font-medium text-sm text-foreground leading-tight">{case_item.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {case_item.startDate}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-sm">{case_item.client}</TableCell>
                      <TableCell className="py-2.5 px-4">
                        <Badge variant="secondary" className={`text-xs font-medium px-2 py-0.5 ${getStatusColor(case_item.status)}`}>
                          {case_item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        <Badge variant="secondary" className={`text-xs font-medium px-2 py-0.5 ${getPriorityColor(case_item.priority)}`}>
                          {case_item.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5 text-sm">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{case_item.assignedTo}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{case_item.dueDate}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-center">
                        <span className="text-sm font-medium">{case_item.documentsCount}</span>
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[160px]">
                            <DropdownMenuItem asChild>
                              <Link to={`/cases/${case_item.id}`} className="flex items-center cursor-pointer text-sm">
                                <Eye className="h-3.5 w-3.5 mr-2" />
                                View
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/cases/${case_item.id}/edit`} className="flex items-center cursor-pointer text-sm">
                                <Edit className="h-3.5 w-3.5 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/cases/${case_item.id}/documents`} className="flex items-center cursor-pointer text-sm">
                                <FileText className="h-3.5 w-3.5 mr-2" />
                                Documents
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive text-sm">
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Case?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the case
                                    and remove all associated data.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteCase(case_item.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <FileText className="h-8 w-8 mb-2 opacity-40" />
                        <p className="text-sm">No cases found matching your criteria.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination controls */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border/50">
              <div className="text-xs text-muted-foreground">
                Showing {filteredCases.length > 0 ? ((page - 1) * pageSize) + 1 : 0}-{Math.min(page * pageSize, totalCount)} of {totalCount}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={handlePreviousPage}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <div className="text-xs text-muted-foreground px-2 min-w-[80px] text-center">
                  {page} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={handleNextPage}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
