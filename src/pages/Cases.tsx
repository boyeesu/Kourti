import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCases as useContextCases } from "@/context/CasesContext"; // Keep context for compatibility
import { useCases, useDeleteCase } from "@/hooks/useCases"; // Add real data hooks
import { useSearch } from "@/hooks/use-search";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Trash2
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

  // Map raw case data to a more usable format for the table
  const caseRows = cases.map(c => ({
    id: c.id || c.case_number,
    name: c.title || c.name,
    client: c.client?.name || c.client || "Unknown Client",
    clientId: c.client_id || c.client?.id,
    status: c.status,
    priority: c.priority,
    assignedTo:
      c.assigned_user
        ? [c.assigned_user.first_name, c.assigned_user.last_name].filter(Boolean).join(" ")
        : "Unassigned",
    startDate: c.created_at
      ? new Date(c.created_at).toLocaleDateString()
      : c.startDate,
    dueDate: c.next_hearing_date
      ? new Date(c.next_hearing_date).toLocaleDateString()
      : c.dueDate || "No date set",
    documentsCount: c.documents?.length || 0,
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
      <div className="px-4 py-6 flex items-center justify-center min-h-[calc(100vh-100px)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="ml-4 text-lg text-muted-foreground">Loading cases...</p>
      </div>
    );
  }

  // Display error state
  if (error) {
    return (
      <div className="px-4 py-6 flex flex-col items-center justify-center min-h-[calc(100vh-100px)]">
        <p className="text-destructive text-lg mb-4 text-center">
          {error instanceof Error
            ? error.message
            : "An unexpected error occurred while loading cases."}
        </p>
        <Button onClick={() => refetch()} className="shadow-md">Retry Loading Cases</Button>
      </div>
    );
  }

  // Helper function to get status badge color
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active": return "bg-green-500 text-white"; // Using direct Tailwind classes for better control
      case "review": return "bg-yellow-500 text-white";
      case "open": return "bg-blue-500 text-white";
      case "closed": return "bg-red-500 text-white";
      default: return "bg-gray-400 text-white";
    }
  };

  // Helper function to get priority badge color
  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high": return "bg-red-600 text-white";
      case "medium": return "bg-orange-500 text-white";
      case "low": return "bg-green-600 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  // Combine all filtering logic
  const filteredCases = caseRows.filter(case_item => {
    // Local search term filter
    const matchesLocalSearch = searchTerm === "" ||
                               case_item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                               case_item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                               case_item.id.toLowerCase().includes(searchTerm.toLowerCase());

    // Global search term (from useSearch hook) filter
    const matchesGlobalSearch = globalSearch === "" ||
                                case_item.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
                                case_item.client.toLowerCase().includes(globalSearch.toLowerCase()) ||
                                case_item.id.toLowerCase().includes(globalSearch.toLowerCase());

    // Status filter
    const matchesStatus = statusFilter === "all" || case_item.status.toLowerCase() === statusFilter;

    // Client query filter
    const matchesClient =
      !clientQuery ||
      case_item.clientId === clientQuery ||
      case_item.client.toLowerCase() === clientQuery.toLowerCase();

    return matchesLocalSearch && matchesGlobalSearch && matchesStatus && matchesClient;
  });

  return (
    <div className="px-4 py-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Cases</h1>
          <p className="text-muted-foreground">Manage and track all your legal cases</p>
        </div>
        <Button className="shadow-md w-full sm:w-auto" onClick={() => navigate("/cases/create")}>
          <Plus className="h-4 w-4 mr-2" />
          New Case
        </Button>
      </div>

      {/* Filters */}
      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Filter Cases</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search cases, clients, or case IDs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 rounded-md border border-input focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px] h-10">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {/* Dynamically render statuses from context if available, otherwise use hardcoded */}
                {statuses && statuses.length > 0 ? (
                  statuses.map((statusOption: string) => (
                    <SelectItem key={statusOption} value={statusOption.toLowerCase()}>
                      {statusOption}
                    </SelectItem>
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
          </div>
          {clientQuery && (
            <div className="mt-4">
              <Badge variant="secondary" className="px-3 py-1 text-base rounded-full">
                Client: <span className="font-semibold ml-1">{clientFilterName}</span>
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cases Table */}
      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">All Cases ({totalCount})</CardTitle>
          <CardDescription>
            Overview of all cases in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto"> {/* Added overflow-x-auto for responsiveness */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[100px]">Case ID</TableHead>
                  <TableHead className="min-w-[150px]">Case Name</TableHead>
                  <TableHead className="min-w-[120px]">Client</TableHead>
                  <TableHead className="min-w-[100px]">Status</TableHead>
                  <TableHead className="min-w-[100px]">Priority</TableHead>
                  <TableHead className="min-w-[150px]">Assigned To</TableHead>
                  <TableHead className="min-w-[120px]">Due Date</TableHead>
                  <TableHead className="min-w-[100px]">Documents</TableHead>
                  <TableHead className="w-[50px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCases.length > 0 ? (
                  filteredCases.map((case_item) => (
                    <TableRow key={case_item.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{case_item.id}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium text-foreground">{case_item.name}</div>
                          <div className="text-sm text-muted-foreground">
                            Started {case_item.startDate}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{case_item.client}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(case_item.status)}>
                          {case_item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPriorityColor(case_item.priority)}>
                          {case_item.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {case_item.assignedTo}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {case_item.dueDate}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {case_item.documentsCount}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="hover:bg-gray-100">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[180px]">
                            <DropdownMenuItem asChild>
                              <Link to={`/cases/${case_item.id}`} className="flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-muted rounded-sm">
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/cases/${case_item.id}/edit`} className="flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-muted rounded-sm">
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Case
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/cases/${case_item.id}/documents`} className="flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-muted rounded-sm">
                                <FileText className="h-4 w-4 mr-2" />
                                View Documents
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-destructive/10 rounded-sm">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Case
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
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
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                      No cases found matching your criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Conditional rendering for empty states */}
          {filteredCases.length === 0 && cases.length === 0 && (
            <div className="text-center py-12">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No cases yet</h3>
              <p className="text-muted-foreground mb-4">Get started by creating your first case.</p>
              <Button onClick={() => navigate("/cases/create")} className="shadow-md">
                <Plus className="h-4 w-4 mr-2" />
                Create First Case
              </Button>
            </div>
          )}

          {/* Pagination controls */}
          {totalCount > 0 && ( // Only show pagination if there are cases
            <div className="flex items-center justify-between mt-6">
              <Button
                variant="outline"
                onClick={() => setPage(prev => Math.max(1, prev - 1))} // Ensure page doesn't go below 1
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
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} // Ensure page doesn't exceed totalPages
                disabled={page >= totalPages}
                className="shadow-sm"
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
