import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building,
  Calendar,
  FileText,
  Briefcase,
  Edit,
  MoreHorizontal,
  Plus,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useClient } from "@/hooks/useClients";
import { useCasesByClient } from "@/hooks/useCases";
import { useContractsByClient } from "@/hooks/useContracts";
import {
  useCommLogs,
  useCreateCommLog,
} from "@/features/clients/api/useCommLogs";
import { getCurrentUserId } from "@/hooks/useCurrentUser";

export default function ClientDetails() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const { data: client, isLoading: clientLoading } = useClient(clientId!);
  const { data: cases = [], isLoading: casesLoading } = useCasesByClient(clientId!);
  const { data: contracts = [], isLoading: contractsLoading } =
    useContractsByClient(clientId!);

  // communication logs
  const { data: commLogs = [] } = useCommLogs(clientId!);
  const createLog = useCreateCommLog(clientId!);
  const [logContent, setLogContent] = useState("");
  const [logType, setLogType] = useState<'email' | 'phone' | 'note'>("note");

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "bg-success/10 text-success";
      case "inactive":
        return "bg-muted/50 text-muted-foreground";
      case "under review":
      case "review":
        return "bg-warning/10 text-warning";
      case "open":
        return "bg-info/10 text-info";
      case "closed":
        return "bg-muted/50 text-muted-foreground";
      case "draft":
        return "bg-warning/10 text-warning";
      default:
        return "bg-muted/50 text-muted-foreground";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return "bg-destructive/10 text-destructive";
      case "medium":
        return "bg-warning/10 text-warning";
      case "low":
        return "bg-success/10 text-success";
      default:
        return "bg-muted/10 text-muted-foreground";
    }
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const formatCurrency = (value: number, currency: string = "USD") =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const calculateTotalValue = () =>
    contracts.reduce((total, contract) => total + (contract.value || 0), 0);

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
              <p className="text-muted-foreground">
                {client.company ? `${client.company} • ` : ""}Individual Client
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="hover-scale"
            onClick={() => navigate(`/clients/${clientId}/edit`)}
          >
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

      {/* Info cards ... (unchanged) */}

      {/* Communication Log */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5" /> Communication Log ({commLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-2 items-end">
            <Select value={logType} onValueChange={(v) => setLogType(v as any)}>
              <SelectTrigger className="col-span-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="note">Note</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="col-span-2"
              placeholder="Enter note"
              value={logContent}
              onChange={(e) => setLogContent(e.target.value)}
            />
            <Button
              size="sm"
              className="col-span-1"
              disabled={createLog.isLoading}
              onClick={async () => {
                if (!logContent.trim()) return;
                const userId = (await getCurrentUserId())!;
                createLog.mutate({ type: logType, content: logContent, user_id: userId });
                setLogContent("");
              }}
            >
              Add
            </Button>
          </div>
          {commLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No communications yet.</p>
          ) : (
            <ul className="space-y-2 max-h-52 overflow-auto pr-2">
              {commLogs.map((l) => (
                <li key={l.id} className="text-sm">
                  <span className="font-medium capitalize mr-2">[{l.type}]</span>
                  {l.content}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {new Date(l.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* existing Notes, Cases, Contracts sections stay here (omitted for brevity) */}
    </div>
  );
}
