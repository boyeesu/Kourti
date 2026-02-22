
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Case, Document } from "@/types";
import {
  ArrowLeft,
  Edit,
  MoreHorizontal,
  StickyNote,
  Phone,
  Mail,
  MapPin,
  Building,
  User,
  Calendar,
  FileText,
  Briefcase,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { useClientLogs, useCreateClientLog } from "@/hooks/useClientLogs";
import { useCasesByClient } from "@/hooks/useCases";
import { useContractsByClient } from "@/hooks/useContracts";
import { useCalendarEventsByClient } from "@/hooks/useCalendar";
import { useDocumentsByClient } from "@/hooks/useDocuments";
import { DocumentViewer } from "@/components/DocumentViewer";

import Breadcrumbs from "@/components/ui/Breadcrumbs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ClientDetails() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const { data: client, isLoading: clientLoading } = useClient(clientId!);
  const { data: commLogs = [] } = useClientLogs(clientId!);
  const { data: casesData } = useCasesByClient(clientId!);
  const cases = casesData?.cases || [];
  const { data: contracts = [] } = useContractsByClient(clientId!);
  const { data: calEvents = [] } = useCalendarEventsByClient(clientId!);
  const { data: documents = [] } = useDocumentsByClient(clientId!);

  const createLog = useCreateClientLog();
  const [logContent, setLogContent] = useState("");
  const [logType, setLogType] = useState<'email' | 'phone' | 'note'>("note");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'open':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'closed':
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'draft':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (clientLoading) {
    return (
      <div className="px-6 py-8 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="px-6 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Client not found</h1>
        <Button onClick={() => navigate("/clients")}>Back to Clients</Button>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-8 max-w-7xl mx-auto animate-fade-in">
      <Breadcrumbs />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/clients")}
            className="hover-scale"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary font-medium text-xl">
                {getInitials(client.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-4xl font-bold text-foreground">{client.name}</h1>
              <div className="flex items-center gap-4 mt-2">
                {client.company && (
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Building className="h-4 w-4" />
                    {client.company}
                  </p>
                )}
                <Badge className={getStatusColor(client.status)}>
                  {client.status}
                </Badge>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
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
              <DropdownMenuItem onClick={() => navigate(`/matters/create?client=${clientId}`)}>
                Create New Matter
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

      {/* Contact Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {client.email && (
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{client.email}</p>
                </div>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{client.phone}</p>
                </div>
              </div>
            )}
            {client.address && (
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium">{client.address}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{cases.length}</p>
                <p className="text-sm text-muted-foreground">Matters</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{contracts.length}</p>
                <p className="text-sm text-muted-foreground">Contracts</p>
              </div>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Client since</p>
              <p className="font-medium">{new Date(client.created_at).toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {client.notes ? (
              <p className="text-sm text-muted-foreground">{client.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No notes available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Communication Log */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5" /> 
            Communication Log ({commLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-3 items-end">
            <Select value={logType} onValueChange={(v) => setLogType(v as 'email' | 'phone' | 'note')}>
              <SelectTrigger>
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
              placeholder="Enter communication details..."
              value={logContent}
              onChange={(e) => setLogContent(e.target.value)}
            />
            <Button
              disabled={createLog.isPending || !logContent.trim()}
              onClick={() => {
                createLog.mutate({ 
                  type: logType,
                  content: logContent,
                  client_id: clientId!,
                });
                setLogContent("");
              }}
            >
              Add Log
            </Button>
          </div>
          
          {commLogs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No communications logged yet.</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-auto">
              {commLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                  <Badge variant="outline" className="capitalize mt-1">
                    {log.type}
                  </Badge>
                  <div className="flex-1">
                    <p className="text-sm">{log.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Matters Section */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Matters ({cases.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground mb-4">No matters for this client</p>
              <Button onClick={() => navigate(`/matters/create?client=${clientId}`)}>
                Create First Matter
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Next Hearing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c: Case) => (
                  <TableRow key={c.id} className="hover:bg-muted/50">
                    <TableCell>
                      <Button variant="link" onClick={() => navigate(`/matters/${c.id}`)}>
                        {c.title}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(c.status)}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.priority}</TableCell>
                    <TableCell>
                      {c.next_hearing_date ? new Date(c.next_hearing_date).toLocaleDateString() : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Additional sections with similar improvements... */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calendar Events */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendar Events ({calEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {calEvents.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No events scheduled</p>
            ) : (
              <div className="space-y-3">
                {calEvents.slice(0, 5).map(ev => (
                  <div key={ev.id} className="p-3 border rounded-lg hover:bg-muted/30">
                    <p className="font-medium">{ev.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(ev.start_date).toLocaleString()}
                    </p>
                    <Badge variant="outline" className="mt-1">{ev.event_type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documents ({documents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentsSection documents={documents} />
          </CardContent>
        </Card>
      </div>

      {/* Contracts */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Contracts ({contracts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground mb-4">No contracts for this client</p>
              <Button onClick={() => navigate(`/contracts/create?client=${clientId}`)}>
                Create First Contract
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {contracts.map((ct) => (
                <div key={ct.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                  <div>
                    <Button variant="link" onClick={() => navigate(`/contracts/${ct.id}`)}>
                      {ct.title}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      {ct.start_date && ct.end_date && 
                        `${new Date(ct.start_date).toLocaleDateString()} - ${new Date(ct.end_date).toLocaleDateString()}`
                      }
                    </p>
                  </div>
                  <Badge className={getStatusColor(ct.status)}>
                    {ct.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Viewer */}
      {selectedDocument && (
        <DocumentViewer
          open={!!selectedDocument}
          onOpenChange={() => setSelectedDocument(null)}
          document={{ ...selectedDocument, name: selectedDocument.name || selectedDocument.title || 'Untitled' }}
        />
      )}
    </div>
  );
}

// Documents Section Component
function DocumentsSection({ documents }: { documents: Document[] }) {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  const handleView = (doc: Document) => {
    setSelectedDocument(doc);
  };

  return (
    <>
      {documents.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No documents uploaded</p>
      ) : (
        <div className="space-y-3">
          {documents.slice(0, 10).map((d) => (
            <div key={d.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {d.file_size && `${Math.round(d.file_size / 1024)} KB`} • {new Date(d.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleView(d)}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </Button>
            </div>
          ))}
        </div>
      )}
      
      {/* Document Viewer */}
      {selectedDocument && (
        <DocumentViewer
          open={!!selectedDocument}
          onOpenChange={() => setSelectedDocument(null)}
          document={{ ...selectedDocument, name: selectedDocument.name || selectedDocument.title || 'Untitled' }}
        />
      )}
    </>
  );
}
