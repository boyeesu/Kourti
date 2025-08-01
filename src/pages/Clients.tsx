import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Building, Mail, Phone, MapPin, MoreHorizontal, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Mock client data - in real app this would come from database
const mockClients = [
  {
    id: "CLIENT-001",
    name: "Acme Corporation",
    type: "Corporate",
    email: "legal@acme.com",
    phone: "+1 (555) 123-4567",
    address: "123 Business Ave, NY, NY 10001",
    status: "Active",
    totalCases: 3,
    totalContracts: 8,
    lastActivity: "2024-01-28",
    primaryContact: "John Smith",
  },
  {
    id: "CLIENT-002", 
    name: "Tech Solutions Inc",
    type: "Corporate",
    email: "contact@techsolutions.com",
    phone: "+1 (555) 234-5678",
    address: "456 Innovation Dr, CA, CA 94105",
    status: "Active",
    totalCases: 1,
    totalContracts: 12,
    lastActivity: "2024-01-25",
    primaryContact: "Sarah Johnson",
  },
  {
    id: "CLIENT-003",
    name: "StartupXYZ",
    type: "Startup",
    email: "hello@startupxyz.com", 
    phone: "+1 (555) 345-6789",
    address: "789 Startup Blvd, TX, TX 78701",
    status: "Active",
    totalCases: 2,
    totalContracts: 3,
    lastActivity: "2024-01-20",
    primaryContact: "Mike Chen",
  },
  {
    id: "CLIENT-004",
    name: "Innovation Labs",
    type: "Research",
    email: "research@innovationlabs.org",
    phone: "+1 (555) 456-7890", 
    address: "321 Research Way, MA, MA 02139",
    status: "Inactive",
    totalCases: 1,
    totalContracts: 5,
    lastActivity: "2023-12-15",
    primaryContact: "Dr. Lisa Wong",
  },
  {
    id: "CLIENT-005",
    name: "Property Group Ltd",
    type: "Real Estate",
    email: "office@propertygroup.com",
    phone: "+1 (555) 567-8901",
    address: "654 Property St, FL, FL 33101", 
    status: "Active",
    totalCases: 1,
    totalContracts: 15,
    lastActivity: "2024-01-22",
    primaryContact: "Robert Davis",
  },
];

export default function Clients() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active": return "bg-success/10 text-success";
      case "Inactive": return "bg-muted/50 text-muted-foreground";
      default: return "bg-muted/50 text-muted-foreground";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Corporate": return "bg-primary/10 text-primary";
      case "Startup": return "bg-warning/10 text-warning";
      case "Research": return "bg-info/10 text-info";
      case "Real Estate": return "bg-secondary/10 text-secondary";
      default: return "bg-muted/10 text-muted-foreground";
    }
  };

  const filteredClients = mockClients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         client.primaryContact.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || client.status.toLowerCase() === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground">Manage your client database and relationships</p>
        </div>
        <div className="flex gap-2">
          <Button className="shadow-md hover-scale">
            <Plus className="h-4 w-4 mr-2" />
            New Client
          </Button>
          <Button variant="outline" className="hover-scale" onClick={() => navigate("/bulk-import")}>
            <Upload className="h-4 w-4 mr-2" />
            Bulk Import
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Building className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{mockClients.length}</p>
                <p className="text-sm text-muted-foreground">Total Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-success/10 rounded-lg">
                <Building className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {mockClients.filter(c => c.status === "Active").length}
                </p>
                <p className="text-sm text-muted-foreground">Active Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-warning/10 rounded-lg">
                <Building className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {mockClients.reduce((sum, client) => sum + client.totalCases, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Total Cases</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-info/10 rounded-lg">
                <Building className="h-6 w-6 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {mockClients.reduce((sum, client) => sum + client.totalContracts, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Total Contracts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Filter Clients</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients, contacts, or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="md:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clients Table */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Client Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cases</TableHead>
                <TableHead>Contracts</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="w-[50px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => (
                <TableRow key={client.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                          {getInitials(client.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <button 
                          onClick={() => navigate(`/clients/${client.id}`)}
                          className="font-medium text-foreground hover:text-primary story-link text-left"
                        >
                          {client.name}
                        </button>
                        <p className="text-sm text-muted-foreground">{client.id}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span>{client.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span>{client.phone}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{client.primaryContact}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getTypeColor(client.type)} variant="outline">
                      {client.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(client.status)} variant="outline">
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{client.totalCases}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{client.totalContracts}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{client.lastActivity}</span>
                  </TableCell>
                  <TableCell>
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
                        <DropdownMenuItem>Edit Client</DropdownMenuItem>
                        <DropdownMenuItem>View Cases</DropdownMenuItem>
                        <DropdownMenuItem>View Contracts</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredClients.length === 0 && (
            <div className="text-center py-12">
              <Building className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No clients found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm ? "Try adjusting your search criteria" : "Get started by adding your first client"}
              </p>
              <Button className="hover-scale">
                <Plus className="h-4 w-4 mr-2" />
                Add First Client
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}