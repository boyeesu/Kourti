import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSearch } from "@/hooks/use-search";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useContracts } from "@/hooks/useContracts";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
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
  FileCheck,
  Calendar,
  User,
  Clock,
  AlertTriangle,
  GitBranch,
  Zap,
  
  RefreshCw
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "react-router-dom";

// Status options constant for consistency
const CONTRACT_STATUSES = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "signed", label: "Signed" },
  { value: "draft", label: "Draft" },
  { value: "expired", label: "Expired" },
  { value: "under_review", label: "Under Review" }
];

export default function Contracts() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const { term: globalSearch } = useSearch();
  
  // Use pagination parameters in the hook
  const { 
    data, 
    isLoading, 
    error, 
    refetch 
  } = useContracts(page, pageSize, statusFilter !== "all" ? statusFilter : undefined);
  
  const contracts = data?.contracts || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  
  const clientFilter = searchParams.get("client")?.toLowerCase() || "";

  // Create a memoized function to determine expiry status
  const getExpiryStatus = (contract: any) => {
    if (!contract.end_date) return { isExpiring: false, isExpired: false };
    
    const today = new Date();
    const expiryDate = new Date(contract.end_date);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    
    return {
      isExpiring: expiryDate > today && expiryDate <= thirtyDaysFromNow,
      isExpired: expiryDate < today
    };
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center min-h-[calc(100vh-200px)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="ml-4 text-lg text-muted-foreground">Loading contracts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 flex flex-col items-center justify-center space-y-4 min-h-[calc(100vh-200px)]">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-destructive text-lg font-medium">Failed to load contracts.</p>
        <p className="text-muted-foreground text-center max-w-md">
          {error instanceof Error ? error.message : "An unexpected error occurred."}
        </p>
        <Button onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case "active": return "bg-success text-success-foreground";
      case "signed": return "bg-primary text-primary-foreground";
      case "draft": return "bg-muted text-muted-foreground";
      case "expired": return "bg-destructive text-destructive-foreground";
      case "under_review":
      case "under review": return "bg-warning text-warning-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  // Client-side filtering only for the search term and client filter
  // (status filtering is handled server-side for better performance)
  const filteredContracts = contracts.filter(contract => {
    const termMatches = (t: string) =>
      contract.title.toLowerCase().includes(t.toLowerCase()) ||
      String(contract.id).toLowerCase().includes(t.toLowerCase());

    const matchesLocal = searchTerm === "" || termMatches(searchTerm);
    const matchesGlobal = globalSearch === "" || termMatches(globalSearch);
    const matchesClient =
      clientFilter === "" ||
      String(contract.client_id).toLowerCase() === clientFilter ||
      (contract as any).client?.name?.toLowerCase().includes(clientFilter);
      
    return matchesLocal && matchesGlobal && matchesClient;
  });

  // Calculate contract statistics
  const contractStats = {
    total: totalCount,
    active: contracts.filter(c => c.status.toLowerCase() === "active").length,
    expiringSoon: contracts.filter(c => getExpiryStatus(c).isExpiring).length,
    expired: contracts.filter(c => getExpiryStatus(c).isExpired).length
  };

  // Pagination handlers
  const handlePreviousPage = () => setPage(prev => Math.max(1, prev - 1));
  const handleNextPage = () => setPage(prev => Math.min(totalPages, prev + 1));


  return (
    <div className="px-4 py-6 space-y-6 max-w-7xl mx-auto">
      <Breadcrumbs />
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contracts</h1>
          <p className="text-muted-foreground">Manage contracts with version control and AI-powered analysis</p>
          {clientFilter && (
            <div className="mt-2">
              <Badge variant="outline" className="px-2 py-1">
                Client: {clientFilter}
                <button 
                  className="ml-2 hover:text-destructive" 
                  onClick={() => navigate("/contracts")}
                  aria-label="Clear client filter"
                >
                  ×
                </button>
              </Badge>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button variant="outline" className="shadow-sm flex-1 sm:flex-none" onClick={() => navigate("/contracts/create")}> 
            <Plus className="h-4 w-4 mr-2" />
            New Contract
          </Button>
          <Button variant="default" className="shadow-md flex-1 sm:flex-none" onClick={() => navigate("/contracts/compare")}> 
            <GitBranch className="h-4 w-4 mr-2" />
            Compare Contracts
          </Button>
          <Button variant="secondary" className="shadow-md flex-1 sm:flex-none" onClick={() => navigate("/ream-ai")}> 
            <Zap className="h-4 w-4 mr-2" />
            Ream AI Analysis
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Contracts</p>
                <p className="text-2xl font-bold">{contractStats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <Clock className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{contractStats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expiring Soon</p>
                <p className="text-2xl font-bold">{contractStats.expiringSoon}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold">{contractStats.expired}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Filter Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contracts, clients, or contract IDs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  aria-label="Search contracts"
                />
              </div>
            </div>
            <Select 
              value={statusFilter} 
              onValueChange={(value) => {
                setStatusFilter(value);
                setPage(1); // Reset to first page when filter changes
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_STATUSES.map(status => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Contracts Table */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>All Contracts ({totalCount})</CardTitle>
          <CardDescription>
            Comprehensive contract management with version control and expiry tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Contract</TableHead>
                  <TableHead className="min-w-[150px]">Client</TableHead>
                  <TableHead className="min-w-[100px]">Status</TableHead>
                  <TableHead className="min-w-[100px]">Value</TableHead>
                  <TableHead className="min-w-[130px]">Effective Date</TableHead>
                  <TableHead className="min-w-[130px]">Expiry</TableHead>
                  <TableHead className="min-w-[100px]">Versions</TableHead>
                  <TableHead className="min-w-[150px]">Created By</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.length > 0 ? (
                  filteredContracts.map((contract) => {
                    const { isExpiring, isExpired } = getExpiryStatus(contract);
                    
                    return (
                      <TableRow key={contract.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div>
                            <div className="font-medium">{contract.title}</div>
                            {contract.description && (
                              <div className="text-xs text-muted-foreground mt-1 max-w-xs truncate">
                                {contract.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(contract as any).client?.name || contract.client_id || 'No client'}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(contract.status)} variant="secondary">
                            {contract.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {contract.currency} {contract.value ? Number(contract.value).toLocaleString() : '0'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {contract.start_date ? new Date(contract.start_date).toLocaleDateString() : 'No date'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className={`h-4 w-4 ${
                              isExpired ? 'text-destructive' : 
                              isExpiring ? 'text-warning' : 
                              'text-muted-foreground'
                            }`} />
                            <span className={
                              isExpired ? 'text-destructive' : 
                              isExpiring ? 'text-warning' : ''
                            }>
                              {contract.end_date ? new Date(contract.end_date).toLocaleDateString() : 'No date'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-muted-foreground" />
                            {(contract as any).version || 'v1'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="text-sm">
                                {(contract as any).created_by_user?.first_name || 'User'}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(contract.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="More options">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={`/contracts/${contract.id}`} className="flex items-center">
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Contract
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to={`/contracts/${contract.id}/edit`} className="flex items-center">
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Contract
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to={`/contracts/${contract.id}/history`} className="flex items-center">
                                  <GitBranch className="h-4 w-4 mr-2" />
                                  Version History
                                </Link>
                              </DropdownMenuItem>
                               <DropdownMenuItem asChild>
                                 <Link to={`/ream-ai?contract=${contract.id}`} className="flex items-center">
                                   <Zap className="h-4 w-4 mr-2" />
                                   Ream AI Analysis
                                 </Link>
                               </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <FileCheck className="h-8 w-8 mb-2" />
                        <p>No contracts found matching your criteria.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between mt-6">
              <Button
                variant="outline"
                onClick={handlePreviousPage}
                disabled={page <= 1}
                aria-label="Previous page"
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
                aria-label="Next page"
              >
                Next
              </Button>
            </div>
          )}
          
          {/* Empty state for zero contracts */}
          {totalCount === 0 && (
            <div className="text-center py-12">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <FileCheck className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No contracts yet</h3>
              <p className="text-muted-foreground mb-4">Get started by creating your first contract.</p>
              <Button onClick={() => navigate("/contracts/create")} className="shadow-md">
                <Plus className="h-4 w-4 mr-2" />
                Create First Contract
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Contract Features */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            AI Contract Analysis
          </CardTitle>
          <CardDescription>
            Leverage AI to enhance your contract management workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">Contract Intelligence</h4>
              <p className="text-sm text-muted-foreground">
                Extract key terms, obligations, and deadlines automatically from contract documents.
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">Risk Detection</h4>
              <p className="text-sm text-muted-foreground">
                Identify potential risks, missing clauses, and areas requiring legal attention.
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">Renewal Alerts</h4>
              <p className="text-sm text-muted-foreground">
                Smart notifications for contract renewals, expiries, and important milestone dates.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}