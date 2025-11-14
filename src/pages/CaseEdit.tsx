import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCase, useUpdateCase } from "@/hooks/useCases";
import { useCaseTypes } from "@/features/cases/api/useCaseTypes";
import { useCaseIssues } from "@/features/cases/api/useCaseIssues";
import { useCaseFields } from "@/features/cases/api/useCaseFields";
import { DynamicForm, DynamicField } from "@/shared/components/DynamicForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { useNotificationTriggers } from '@/hooks/useNotificationTriggers';

export default function CaseEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: caseData, isLoading, error } = useCase(id!);
  const updateCase = useUpdateCase();
  const { createCaseNotification } = useNotificationTriggers();

  const [form, setForm] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // case type, issues & fields
  const { data: caseTypes = [] } = useCaseTypes();
  const [caseTypeId, setCaseTypeId] = useState<string>("");
  const { data: caseIssues = [] } = useCaseIssues(caseTypeId);
  const [caseIssueId, setCaseIssueId] = useState<string>("");
  const { data: caseFields = [] } = useCaseFields(caseTypeId);
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});
  
  // Update case type and issue IDs when case data is loaded
  useEffect(() => {
    if (caseData) {
      const typeId = (caseData as any)?.case_type_id || "";
      const issueId = (caseData as any)?.case_issue_id || "";
      setCaseTypeId(typeId);
      setCaseIssueId(issueId);
    }
  }, [caseData]);

  // Bootstrap form once case is loaded
  useEffect(() => {
    if (caseData) {
      setForm({
        title: caseData.title,
        status: caseData.status,
        priority: caseData.priority,
        description: caseData.description || "",
        next_hearing_date: caseData.next_hearing_date ? caseData.next_hearing_date.split("T")[0] : "",
      });
      setDynamicValues((caseData as any).custom_fields || {});
    }
  }, [caseData]);

  if (isLoading || !form) {
    return (
      <div className="p-6"><div className="animate-spin h-8 w-8 mr-2 border-b-2 border-primary rounded-full mx-auto my-12" /></div>
    );
  }

  if (error || !caseData) {
    return <div className="p-6 text-center text-destructive">Could not load case for editing.</div>;
  }

  function handleChange(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const updatedCase = await updateCase.mutateAsync({
        id: caseData!.id,
        ...form,
        case_type_id: caseTypeId,
        case_issue_id: caseIssueId,
        custom_fields: dynamicValues,
      } as any);
      // Create notification
      await createCaseNotification(updatedCase, 'updated');
      navigate(`/matters/${caseData!.id}`);
    } catch {
      /* handled in hook */
    }
    setSubmitting(false);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Breadcrumbs />
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/matters/${caseData.id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Matter
        </Button>
        <h1 className="text-xl font-bold">Edit Matter: {caseData.title}</h1>
      </div>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Edit Matter Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="font-medium">Matter Title</label>
              <Input value={form.title} onChange={(e) => handleChange("title", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="font-medium">Status</label>
              <Select value={form.status} onValueChange={(val) => handleChange("status", val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="font-medium">Priority</label>
              <Select value={form.priority} onValueChange={(val) => handleChange("priority", val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="font-medium">Next Hearing Date</label>
              <Input type="date" value={form.next_hearing_date} onChange={(e) => handleChange("next_hearing_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="font-medium">Description</label>
              <Textarea value={form.description} onChange={(e) => handleChange("description", e.target.value)} rows={4} />
            </div>
            
            {/* Matter Type and Issue selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-medium">Matter Type</label>
                <Select 
                  value={caseTypeId} 
                  onValueChange={(value) => {
                    setCaseTypeId(value);
                    // Reset case issue when type changes
                    if (value !== caseTypeId) {
                      setCaseIssueId("");
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select matter type" /></SelectTrigger>
                  <SelectContent>
                    {caseTypes.map(ct => <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              
              {caseTypeId && (
                <div className="space-y-2">
                  <label className="font-medium">Matter Issue</label>
                  <Select 
                    value={caseIssueId} 
                    onValueChange={setCaseIssueId}
                    disabled={!caseTypeId || caseIssues.length === 0}
                  >
                    <SelectTrigger><SelectValue placeholder="Select matter issue" /></SelectTrigger>
                    <SelectContent>
                      {caseIssues.map(issue => (
                        <SelectItem key={issue.id} value={issue.id}>{issue.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Dynamic Fields */}
            {caseTypeId && caseFields.length > 0 && (
              <DynamicForm
                fields={caseFields.map(field => ({
                  ...field,
                  required: field.is_required ?? false
                })) as DynamicField[]}
                initialValues={dynamicValues}
                onSubmit={setDynamicValues}
                hideSubmit
              />
            )}

            <div className="flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate(`/matters/${caseData.id}`)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>Save Changes</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
