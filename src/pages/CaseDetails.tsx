import { useParams, useNavigate } from "react-router-dom";
import { useCase } from "@/hooks/useCases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User, Building, Gavel } from "lucide-react";

export default function CaseDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: caseData, isLoading, error } = useCase(id!);

  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="px-4 py-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-foreground mb-2">Case Not Found</h2>
          <p className="text-muted-foreground mb-4">The case you're looking for doesn't exist or you don't have access to it.</p>
          <Button onClick={() => navigate("/cases")}>
            Back to Cases
          </Button>
        </div>
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

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cases")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground">{caseData.title}</h1>
          <p className="text-muted-foreground">Case #{caseData.case_number || caseData.id}</p>
        </div>
        <div className="flex gap-2">
          <Badge className={getStatusColor(caseData.status)} variant="secondary">
            {caseData.status}
          </Badge>
          <Badge className={getPriorityColor(caseData.priority)} variant="outline">
            {caseData.priority} Priority
          </Badge>
        </div>
      </div>

      {/* Case Information */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Case Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {caseData.client && (
            <div className="flex items-center gap-3">
              <Building className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Client</p>
                <p className="font-medium">{caseData.client.name}</p>
              </div>
            </div>
          )}

          {caseData.court && (
            <div className="flex items-center gap-3">
              <Gavel className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Court</p>
                <p className="font-medium">{caseData.court}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-medium">
                {new Date(caseData.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {caseData.next_hearing_date && (
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Next Hearing</p>
                <p className="font-medium">
                  {new Date(caseData.next_hearing_date).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Description */}
      {caseData.description && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground whitespace-pre-wrap">{caseData.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button onClick={() => navigate(`/cases/${caseData.id}/edit`)}>
              Edit Case
            </Button>
            <Button variant="outline" onClick={() => navigate("/documents")}>
              View Documents
            </Button>
            <Button variant="outline" onClick={() => navigate("/calendar")}>
              Schedule Event
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
