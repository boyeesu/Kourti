import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Building,
  Mail,
  Phone,
  MoreHorizontal,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { useClients } from "@/hooks/useClients";
import type { Client } from "@/types";

export default function Clients() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, error } = useClients();
  const clients: Client[] = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 text-destructive">
        Error loading clients: {error.message}
      </div>
    );
  }

  // Filter & aggregations ---------------------------------------------------
  const filtered = clients.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus =
      statusFilter === "all" || (c.status?.toLowerCase() ?? "") === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalCases = clients.reduce(
    (sum, c) => sum + (c.cases?.[0]?.count ?? 0),
    0,
  );
  const totalContracts = clients.reduce(
    (sum, c) => sum + (c.contracts?.[0]?.count ?? 0),
    0,
  );

  // Helpers -----------------------------------------------------------------
  const getStatusColor = (status?: string) => {
    switch ((status ?? "").toLowerCase()) {
      case "active":
        return "bg-success/10 text-success";
      case "inactive":
        return "bg-muted/50 text-muted-foreground";
      default:
        return "bg-muted/50 text-muted-foreground";
    }
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  // -------------------------------------------------------------------------
  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in">
      <Breadcrumbs />

      {/* Header ----------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground">
            Manage your client database and relationships
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate("/clients/create")}
            className="shadow-md hover-scale"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Client
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/bulk-import?type=clients")}
            className="hover-scale"
          >
            <Upload className="h-4 w-4 mr-2" />
            Bulk Import
          </Button>
        </div>
      </div>

      {/* Metrics ---------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard label="Total Clients" value={clients.length} />
        <MetricCard
          label="Active Clients"
          value={clients.filter((c) => (c.status?.toLowerCase() ?? "") === "active").length}
        />
        <MetricCard label="Total Cases" value={totalCases} />
        <MetricCard label="Total Contracts" value={totalContracts} />
      </div>

      {/* Filters ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 py-2">
        {/* Search */}
        <div className="relative w-full sm:w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients, contacts, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {/* Status */}
        <div className="sm:w-[130px] w-full">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

      </div>

      {/* Table ------------------------------------------------------------ */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Client Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              {
                id: "client",
                header: "Client",
                accessorKey: "name",
                minWidth: "200px",
                cell: (client) => (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {getInitials(client.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <button
                        onClick={() => navigate(`/clients/${client.id}`)}
                        className="font-medium text-foreground hover:text-primary text-left"
                      >
                        {client.name}
                      </button>
                    </div>
                  </div>
                ),
              },
              {
                id: "contact",
                header: "Contact",
                sortable: false,
                minWidth: "200px",
                cell: (client) => (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      <span>{client.email || "No email"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span>{client.phone || "No phone"}</span>
                    </div>
                  </div>
                ),
              },
              {
                id: "type",
                header: "Type",
                sortable: false,
                minWidth: "120px",
                cell: () => <Badge variant="outline">Individual</Badge>,
              },
              {
                id: "status",
                header: "Status",
                accessorKey: "status",
                minWidth: "120px",
                cell: (client) => (
                  <Badge className={getStatusColor(client.status)} variant="outline">
                    {client.status ?? "-"}
                  </Badge>
                ),
              },
              {
                id: "cases",
                header: "Cases",
                accessorFn: (client) => client.cases?.[0]?.count ?? 0,
                minWidth: "100px",
                cell: (client) => (
                  <span className="font-medium">{client.cases?.[0]?.count ?? 0}</span>
                ),
              },
              {
                id: "contracts",
                header: "Contracts",
                accessorFn: (client) => client.contracts?.[0]?.count ?? 0,
                minWidth: "120px",
                cell: (client) => (
                  <span className="font-medium">{client.contracts?.[0]?.count ?? 0}</span>
                ),
              },
              {
                id: "created",
                header: "Created",
                accessorKey: "created_at",
                minWidth: "120px",
                cell: (client) => (
                  <span className="text-sm text-muted-foreground">
                    {new Date(client.created_at).toLocaleDateString()}
                  </span>
                ),
              },
              {
                id: "actions",
                header: "Actions",
                sortable: false,
                minWidth: "80px",
                cell: (client) => (
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                ),
              },
            ] as ColumnDef<Client>[]}
            data={filtered}
            emptyMessage="No clients found"
            getRowKey={(row) => row.id}
          />
        </CardContent>
      </Card>

      {/* Empty state ------------------------------------------------------ */}
      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Building className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No clients found</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm ? "Try adjusting your search criteria" : "Get started by adding your first client"}
          </p>
          <Button className="hover-scale" onClick={() => navigate("/clients/create")}>
            <Plus className="h-4 w-4 mr-2" /> Add First Client
          </Button>
        </div>
      )}
    </div>
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
