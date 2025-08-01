import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useCases } from "@/context/CasesContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ArrowLeft, FileText, User, Calendar as CalendarIcon } from "lucide-react";

export default function CaseDetails() {
  const { caseId } = useParams();
  const { cases, statuses, updateCaseStatus } = useCases();
  const caseItem = cases.find((c) => c.id === caseId);
  const [currentStatus, setCurrentStatus] = useState(caseItem?.status || "");

  if (!caseItem) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Case not found.</p>
      </div>
    );
  }

  const handleStatusChange = (value: string) => {
    setCurrentStatus(value);
    updateCaseStatus(caseItem.id, value);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="outline" className="mb-2 hover-scale" asChild>
          <Link to="/cases">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Cases
          </Link>
        </Button>
        <Button variant="outline" className="mb-2 hover-scale" asChild>
          <Link to={`/cases/${caseItem.id}/activities`}>
            Activities & Timeline
          </Link>
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-4">
            {caseItem.name}
            <Badge variant="secondary">{caseItem.id}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Client</p>
              <p className="font-medium">{caseItem.client}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stage</p>
              <p className="font-medium">{caseItem.stage}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Assigned To</p>
              <p className="font-medium">{caseItem.assignedTo}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Due Date</p>
              <p className="font-medium">{caseItem.dueDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Status</p>
            <Select value={currentStatus} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[180px] ml-2">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Documents ({caseItem.documents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {caseItem.documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {doc.name}
                    </TableCell>
                    <TableCell>{doc.type}</TableCell>
                    <TableCell className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {doc.uploadedBy}
                    </TableCell>
                    <TableCell className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      {doc.uploadDate}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
