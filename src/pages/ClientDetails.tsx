import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Phone, MapPin, Building, Calendar, FileText, Briefcase, Edit, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Mock data - in real app this would come from database/context
const mockClient = {
  id: "CLIENT-001",
  name: "Acme Corporation",
  type: "Corporate",
  email: "legal@acme.com",
  phone: "+1 (555) 123-4567",
  address: "123 Business Ave, NY, NY 10001",
  status: "Active",
  primaryContact: "John Smith",
  createdDate: "2023-06-15",
  lastActivity: "2024-01-28",
  website: "www.acme.com",
  industry: "Technology",
  description: "Leading technology corporation specializing in enterprise software solutions.",
};

const mockCases = [
  {
    id: "CASE-001",
    name: "Smith vs. Johnson Contract Dispute",
    status: "Active",
    priority: "High",
    assignedTo: "Sarah Wilson",
    startDate: "2024-01-15",
    dueDate: "2024-02-15",
  },
  {
    id: "CASE-005",
    name: "Real Estate Transaction Review", 
    status: "Active",
    priority: "Medium",
    assignedTo: "Sarah Wilson",
    startDate: "2024-01-22",
    dueDate: "2024-03-01",
  }
];

const mockContracts = [
  {
    id: "CONTRACT-001",
    name: "Master Service Agreement",
    type: "Service Agreement",
    status: "Active",
    startDate: "2023-12-01",
    endDate: "2024-12-01",
    value: "$250,000",
  },
  {
    id: "CONTRACT-002", 
    name: "Software License Agreement",
    type: "License",
    status: "Under Review",
    startDate: "2024-01-15",
    endDate: "2025-01-15",
    value: "$100,000",
  }
];

export default function ClientDetails() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active": return "bg-success/10 text-success";
      case "Inactive": return "bg-muted/50 text-muted-foreground";
      case "Under Review": return "bg-warning/10 text-warning";
      default: return "bg-muted/50 text-muted-foreground";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High": return "bg-destructive/10 text-destructive";
      case "Medium": return "bg-warning/10 text-warning";
      case "Low": return "bg-success/10 text-success";
      default: return "bg-muted/10 text-muted-foreground";
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
  };

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
                {getInitials(mockClient.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold text-foreground">{mockClient.name}</h1>
              <p className="text-muted-foreground">{mockClient.id} • {mockClient.type}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="hover-scale">
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
              <DropdownMenuItem>Create New Case</DropdownMenuItem>
              <DropdownMenuItem>Create New Contract</DropdownMenuItem>
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
                <p className="text-sm text-muted-foreground">{mockClient.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Phone</p>
                <p className="text-sm text-muted-foreground">{mockClient.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Address</p>
                <p className="text-sm text-muted-foreground">{mockClient.address}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Building className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Primary Contact</p>
                <p className="text-sm text-muted-foreground">{mockClient.primaryContact}</p>
              </div>
            </div>
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
              <Badge className={getStatusColor(mockClient.status)} variant="outline">
                {mockClient.status}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium">Industry</p>
              <p className="text-sm text-muted-foreground">{mockClient.industry}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Website</p>
              <p className="text-sm text-muted-foreground">{mockClient.website}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Client Since</p>
              <p className="text-sm text-muted-foreground">{mockClient.createdDate}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Last Activity</p>
              <p className="text-sm text-muted-foreground">{mockClient.lastActivity}</p>
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
                <span className="text-sm font-medium">Active Cases</span>
              </div>
              <span className="text-lg font-bold text-primary">{mockCases.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-success" />
                <span className="text-sm font-medium">Contracts</span>
              </div>
              <span className="text-lg font-bold text-success">{mockContracts.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-warning" />
                <span className="text-sm font-medium">Total Value</span>
              </div>
              <span className="text-lg font-bold text-warning">$350K</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{mockClient.description}</p>
        </CardContent>
      </Card>

      {/* Cases */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Active Cases</span>
            <Button variant="outline" size="sm">
              View All Cases
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockCases.map((case_) => (
                <TableRow key={case_.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{case_.name}</p>
                      <p className="text-sm text-muted-foreground">{case_.id}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(case_.status)} variant="outline">
                      {case_.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getPriorityColor(case_.priority)} variant="outline">
                      {case_.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>{case_.assignedTo}</TableCell>
                  <TableCell>{case_.dueDate}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/cases/${case_.id}`)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Contracts */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Contracts</span>
            <Button variant="outline" size="sm">
              View All Contracts
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
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
              {mockContracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{contract.name}</p>
                      <p className="text-sm text-muted-foreground">{contract.id}</p>
                    </div>
                  </TableCell>
                  <TableCell>{contract.type}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(contract.status)} variant="outline">
                      {contract.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{contract.value}</TableCell>
                  <TableCell>{contract.endDate}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/contracts/${contract.id}`)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}