import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSearch } from "@/hooks/use-search";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useContracts } from "@/hooks/useContracts";
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
  Upload
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Contracts() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { term: globalSearch } = useSearch();
  const { data: contracts = [], isLoading } = useContracts();
  const clientFilter = searchParams.get("client")?.toLowerCase() || "";

  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active": return "bg-success text-success-foreground";
      case "Signed": return "bg-primary text-primary-foreground";
      case "Draft": return "bg-muted text-muted-foreground";
      case "Expired": return "bg-destructive text-destructive-foreground";
      case "Under Review": return "bg-warning text-warning-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getExpiryStatus = (daysToExpiry: number) => {
    if (daysToExpiry < 0) return { color: "text-destructive", text: "Expired" };
    if (daysToExpiry <= 30) return { color: "text-destructive", text: "Expires Soon" };
    if (daysToExpiry <= 90) return { color: "text-warning", text: "Expires in 3 months" };
    return { color: "text-success", text: "Active" };
  };

  const filteredContracts = contracts.filter(contract => {
    const termMatches = (t: string) =>
      contract.title.toLowerCase().includes(t.toLowerCase()) ||
      contract.id.toLowerCase().includes(t.toLowerCase());

    const matchesLocal = searchTerm === "" || termMatches(searchTerm);
    const matchesGlobal = globalSearch === "" || termMatches(globalSearch);
    const matchesStatus =
      statusFilter === "all" || contract.status.toLowerCase() === statusFilter;
    const matchesClient =
      clientFilter === "" ||
      contract.client_id?.toLowerCase() === clientFilter ||
      (contract as any).client_name?.toLowerCase() === clientFilter ||
      (contract as any).client?.name?.toLowerCase() === clientFilter;
    return matchesLocal && matchesGlobal && matchesStatus && matchesClient;
  });

  const contractStats = {
    total: contracts.length,
    active: contracts.filter(c => c.status === "active").length,
    expiringSoon: 0,
    expired: 0
  };

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contracts</h1>
          <p className="text-muted-foreground">Manage contracts with version control and AI-powered analysis</p>
          {clientFilter && (
            <div className="mt-2">
              <Badge variant="outline">Client: {clientFilter}</Badge>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="shadow-sm" onClick={() => navigate("/contracts/create")}>
            <Plus className="h-4 w-4 mr-2" />
            New Contract
          </Button>
          <Button variant="outline" className="shadow-md" onClick={() => navigate("/bulk-import?type=contracts")}>
            <Upload className="h-4 w-4 mr-2" />
            Bulk Import
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-card">
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
        <Card className="shadow-card">
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
        <Card className="shadow-card">
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
        <Card className="shadow-card">
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
      <Card className="shadow-card">
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
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="signed">Signed</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Contracts Table */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>All Contracts ({filteredContracts.length})</CardTitle>
          <CardDescription>
            Comprehensive contract management with version control and expiry tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Versions</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.map((contract) => {
                  return (
                    <TableRow key={contract.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{contract.title}</div>
                          <div className="text-sm text-muted-foreground">{contract.id}</div>
                          {contract.description && (
                            <div className="text-xs text-muted-foreground mt-1 max-w-xs truncate">
                              {contract.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{contract.client_id || 'No client'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(contract.status)} variant="secondary">
                            {contract.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{contract.currency} {contract.value || '0'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {contract.start_date ? new Date(contract.start_date).toLocaleDateString() : 'No date'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {contract.end_date ? new Date(contract.end_date).toLocaleDateString() : 'No date'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-muted-foreground" />
                          v1
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm">User</div>
                            <div className="text-xs text-muted-foreground">
                              Created {new Date(contract.created_at).toLocaleDateString()}
                            </div>
                          </div>
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
                            <DropdownMenuItem>
                              <Eye className="h-4 w-4 mr-2" />
                              View Contract
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Contract
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <GitBranch className="h-4 w-4 mr-2" />
                              Version History
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Zap className="h-4 w-4 mr-2" />
                              AI Analysis
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {filteredContracts.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No contracts found matching your criteria.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Contract Features */}
      <Card className="shadow-card">
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