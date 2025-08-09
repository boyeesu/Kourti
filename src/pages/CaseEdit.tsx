import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useCase, useUpdateCase } from "@/hooks/useCases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

export default function CaseEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: caseData, isLoading, error } = useCase(id!);
  const updateCase = useUpdateCase();
  const [form, setForm] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // Bootstrap form once case is loaded
  if (!form && caseData) {
    setForm({
      title: caseData.title,
      status: caseData.status,
      priority: caseData.priority,
      description: caseData.description || '',
      next_hearing_date: caseData.next_hearing_date ? caseData.next_hearing_date.split('T')[0] : '',
    });
  }

  if (isLoading || !form) return (
    <div className="p-6"><div className="animate-spin h-8 w-8 mr-2 border-b-2 border-primary rounded-full mx-auto my-12" /></div>
  );

  if (error || !caseData) return (
    <div className="p-6 text-center text-destructive">Could not load case for editing.</div>
  );

  function handleChange(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: any) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateCase.mutateAsync({ id: caseData.id, ...form });
      navigate(`/cases/${caseData.id}`);
    } catch (err) {
      // error handled by hook
    }
    setSubmitting(false);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Breadcrumbs />
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/cases/${caseData.id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Case
        </Button>
        <h1 className="text-xl font-bold">Edit Case: {caseData.title}</h1>
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle>Edit Case Information</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="font-medium">Case Title</label>
              <Input value={form.title} onChange={e => handleChange('title', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="font-medium">Status</label>
              <Select value={form.status} onValueChange={val => handleChange('status', val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Review">Review</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="font-medium">Priority</label>
              <Select value={form.priority} onValueChange={val => handleChange('priority', val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="font-medium">Next Hearing Date</label>
              <Input type="date" value={form.next_hearing_date} onChange={e => handleChange('next_hearing_date', e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="font-medium">Description</label>
              <Textarea value={form.description} onChange={e => handleChange('description', e.target.value)} rows={4} />
            </div>
            <div className="flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate(`/cases/${caseData.id}`)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>Save Changes</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
