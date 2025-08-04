import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Phone, MapPin, Building, Calendar, FileText, Briefcase, Edit, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useClient } from "@/hooks/useClients";
import { useCasesByClient } from "@/hooks/useCases";
import { useContractsByClient } from "@/hooks/useContracts";

export default function ClientDetails() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  
  const { data: client, isLoading: clientLoading } = useClient(clientId!);
  const { data: cases = [], isLoading: casesLoading } = useCasesByClient(clientId!);
  const { data: contracts = [], isLoading: contractsLoading } = useContractsByClient(clientId!);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active": return "bg-success/10 text-success";
      case "inactive": return "bg-muted/50 text-muted-foreground";
      case "under review": return "bg-warning/10 text-warning";
      case "review": return "bg-warning/10 text-warning";
      case "open": return "bg-info/10 text-info";
      case "closed": return "bg-muted/50 text-muted-foreground";
      case "draft": return "bg-warning/10 text-warning";
      default: return "bg-muted/50 text-muted-foreground";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high": return "bg-destructive/10 text-destructive";
      case "medium": return "bg-warning/10 text-warning";
      case "low": return "bg-success/10 text-success";
      default: return "bg-muted/10 text-muted-foreground";
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
  };

  const formatCurrency = (value: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const calculateTotalValue = () => {
    return contracts.reduce((total, contract) => total + (contract.value || 0), 0);
  };

  if (clientLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="px-4 py-6 text-center">
        <h1 className="text-2xl font-bold mb-4">Client not found</h1>
        <Button onClick={() => navigate("/clients")}>Back to Clients</Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => navigate("/clients")}
            className="hover-scale"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary font-medium text-lg">
                {getInitials(client.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold text-foreground">{client.name}</h1>
              <p className="text-muted-foreground">{client.company ? `${client.company} • ` : ""}Individual Client</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="hover-scale" onClick={() => navigate(`/clients/${clientId}/edit`)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Client
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/cases/create?client=${clientId}`)}>
                Create New Case
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/contracts/create?client=${clientId}`)}>
                Create New Contract
              </DropdownMenuItem>
              <DropdownMenuItem>Send Email</DropdownMenuItem>
              <DropdownMenuItem>Export Data</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Client Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Information */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{client.email || "No email provided"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Phone</p>
                <p className="text-sm text-muted-foreground">{client.phone || "No phone provided"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Address</p>
                <p className="text-sm text-muted-foreground">{client.address || "No address provided"}</p>
              </div>
            </div>
            {client.company && (
              <div className="flex items-center gap-3">
                <Building className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Company</p>
                  <p className="text-sm text-muted-foreground">{client.company}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Details */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Client Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium">Status</p>
              <Badge className={getStatusColor(client.status)} variant="outline">
                {client.status}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium">Client Since</p>
              <p className="text-sm text-muted-foreground">
                {new Date(client.created_at).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Last Updated</p>
              <p className="text-sm text-muted-foreground">
                {new Date(client.updated_at).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Total Cases</span>
              </div>
              <span className="text-lg font-bold text-primary">{cases.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-success" />
                <span className="text-sm font-medium">Contracts</span>
              </div>
              <span className="text-lg font-bold text-success">{contracts.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-warning" />
                <span className="text-sm font-medium">Total Value</span>
              </div>
              <span className="text-lg font-bold text-warning">
                {contracts.length > 0 ? formatCurrency(calculateTotalValue()) : "$0"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {client.notes && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Cases */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Cases ({cases.length})</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate(`/cases/create?client=${clientId}`)}>
                <Plus className="h-4 w-4 mr-2" />
                New Case
              </Button>
              {cases.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/cases?client=${clientId}`)}>
                  View All Cases
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {casesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : cases.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No cases found</h3>
              <p className="text-muted-foreground mb-4">
                This client doesn't have any cases yet.
              </p>
              <Button onClick={() => navigate(`/cases/create?client=${clientId}`)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Case
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((case_: any) => (
                  <TableRow key={case_.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{case_.title}</p>
                        <p className="text-sm text-muted-foreground">{case_.case_number || case_.id}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(case_.status)} variant="outline">
                        {case_.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(case_.priority)} variant="outline">
                        {case_.priority || "Medium"}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(case_.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/cases/${case_.id}`)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Contracts */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Contracts ({contracts.length})</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate(`/contracts/create?client=${clientId}`)}>
                <Plus className="h-4 w-4 mr-2" />
                New Contract
              </Button>
              {contracts.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/contracts?client=${clientId}`)}>
                  View All Contracts
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contractsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : contracts.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No contracts found</h3>
              <p className="text-muted-foreground mb-4">
                This client doesn't have any contracts yet.
              </p>
              <Button onClick={() => navigate(`/contracts/create?client=${clientId}`)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Contract
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract: any) => (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{contract.title}</p>
                        <p className="text-sm text-muted-foreground">{contract.id}</p>
                      </div>
                    </TableCell>
                    <TableCell>{contract.contract_type || "General"}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(contract.status)} variant="outline">
                        {contract.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {contract.value ? formatCurrency(contract.value, contract.currency) : "Not specified"}
                    </TableCell>
                    <TableCell>
                      {contract.end_date ? new Date(contract.end_date).toLocaleDateString() : "No end date"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/contracts/${contract.id}`)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}