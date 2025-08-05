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

export default function Cases() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();

  // Use real data hooks only
  const { data: cases = [], isLoading, error } = useCases();
  const { statuses } = useContextCases(); // Keep for status options only
  const { term: globalSearch, setTerm } = useSearch();
  const deleteCase = useDeleteCase();
  const [searchParams] = useSearchParams();
  const clientQuery = searchParams.get("client");

  useEffect(() => {
    setTerm("");
  }, [setTerm]);

  const caseRows = cases.map(c => ({
    id: c.id || c.case_number,
    name: c.title || c.name,
    client: c.client?.name || c.client || "Unknown Client",
    clientId: c.client_id || c.client?.id,
    status: c.status,
    priority: c.priority,
    assignedTo:
      c.assigned_user?.first_name && c.assigned_user?.last_name
        ? `${c.assigned_user.first_name} ${c.assigned_user.last_name}`
        : c.assignedTo || "Unassigned",
    startDate: c.created_at
      ? new Date(c.created_at).toLocaleDateString()
      : c.startDate,
    dueDate: c.next_hearing_date
      ? new Date(c.next_hearing_date).toLocaleDateString()
      : c.dueDate || "No date set",
    documentsCount: c.documents?.length || 0,
  }));

  const clientFilterName = clientQuery
    ?
        caseRows.find(
          (c) =>
            c.clientId === clientQuery ||
            c.client.toLowerCase() === clientQuery.toLowerCase(),
        )?.client || clientQuery
    : "";

  const handleDeleteCase = async (caseId: string) => {
    try {
      await deleteCase.mutateAsync(caseId);
    } catch (error) {
      // Error handled by the mutation
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active": return "bg-success text-success-foreground";
      case "review": return "bg-warning text-warning-foreground";
      case "open": return "bg-blue-500 text-blue-50";
      case "closed": return "bg-destructive text-destructive-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high": return "bg-destructive text-destructive-foreground";
      case "medium": return "bg-warning text-warning-foreground";
      case "low": return "bg-success text-success-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  // Combine filtering logic from both branches
  const filteredCases = caseRows.filter(case_item => {
    // Local search term
    const matchesLocalSearch = case_item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                               case_item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                               case_item.id.toLowerCase().includes(searchTerm.toLowerCase());

    // Global search term (from useSearch hook)
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
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Cases</h1>
          <p className="text-muted-foreground">Manage and track all your legal cases</p>
        </div>
        <Button className="shadow-md" onClick={() => navigate("/cases/create")}>
          <Plus className="h-4 w-4 mr-2" />
          New Case
        </Button>
      </div>

      {/* Filters */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Filter Cases</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cases, clients, or case IDs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {clientQuery && (
            <div className="mt-4">
              <Badge variant="secondary">Client: {clientFilterName}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cases Table */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>All Cases ({filteredCases.length})</CardTitle>
          <CardDescription>
            Overview of all cases in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case ID</TableHead>
                  <TableHead>Case Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCases.map((case_item) => (
                  <TableRow key={case_item.id}>
                    <TableCell className="font-medium">{case_item.id}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{case_item.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Started {case_item.startDate}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{case_item.client}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(case_item.status)} variant="secondary">
                        {case_item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(case_item.priority)} variant="outline">
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
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            {/* Use Link component for navigation */}
                            <Link to={`/cases/${case_item.id}`} className="flex items-center">
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Case
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <FileText className="h-4 w-4 mr-2" />
                            View Documents
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
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
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredCases.length === 0 && cases.length === 0 && (
            <div className="text-center py-12">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No cases yet</h3>
              <p className="text-muted-foreground mb-4">Get started by creating your first case.</p>
              <Button onClick={() => navigate("/cases/create")}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Case
              </Button>
            </div>
          )}
          
          {filteredCases.length === 0 && cases.length > 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No cases found matching your criteria.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}