/* eslint-disable @typescript-eslint/no-explicit-any */

import { useParams, useNavigate } from 'react-router-dom';
import { useCase, useUpdateCase } from '@/hooks/useCases';
import { useCaseTypes } from '@/features/cases/api/useCaseTypes';
import { useCaseIssues } from '@/features/cases/api/useCaseIssues';
import { useDocumentsByCase, useUploadDocument } from '@/hooks/useDocuments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Calendar,
  Building,
  Gavel,
  Plus,
  Check,
  Trash,
  Edit2,
  FileText,
  Download,
  Eye,
} from 'lucide-react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks';
import { useOrganizationMembers } from '@/hooks/useOrganization';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useState } from 'react';
import { getNodeDocumentSignedUrl } from '@/lib/backendApi';
import { downloadDocument as downloadDocumentFile } from '@/lib/fileApi';
import { useActivities } from '@/features/activities/api/useActivities';
import { useDeleteActivity } from '@/features/activities/api/useDeleteActivity';
import { ActivityDialog } from '@/components/ActivityDialog';
import { DocumentViewer } from '@/components/DocumentViewer';
import { getActivityIcon, getActivityStatusColor } from '@/utils/activityUtils';
import { MatterReviewButton } from '@/components/agents/MatterReviewButton';

export default function CaseDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: caseData, isLoading, error } = useCase(id!);
  const updateCase = useUpdateCase();
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [showActivityDialog, setShowActivityDialog] = useState(false);

  // Get case type and issue data
  const caseTypeId = (caseData as any)?.case_type_id || '';
  const caseIssueId = (caseData as any)?.case_issue_id || '';
  const { data: caseTypes = [] } = useCaseTypes();
  const { data: caseIssues = [] } = useCaseIssues(caseTypeId);

  // Find the selected case type and issue names
  const caseType = caseTypes.find((type) => type.id === caseTypeId)?.name || '';
  const caseIssue = caseIssues.find((issue) => issue.id === caseIssueId)?.name || '';

  // Define status stages and compute progress percentage
  const STAGES = ['open', 'active', 'review', 'closed'] as const;
  const idx = caseData ? STAGES.indexOf(caseData.status as any) : -1;
  const pct = idx >= 0 ? (100 * idx) / (STAGES.length - 1) : 0;

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </PageContainer>
    );
  }

  if (error || !caseData) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-foreground mb-2">Matter Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The matter you're looking for doesn't exist or you don't have access to it.
          </p>
          <Button onClick={() => navigate('/matters')}>Back to Matters</Button>
        </div>
      </PageContainer>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'in_progress':
        return 'bg-warning text-warning-foreground';
      case 'review':
        return 'bg-info text-info-foreground';
      case 'completed':
        return 'bg-success text-success-foreground';
      case 'pending':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-destructive text-destructive-foreground';
      case 'medium':
        return 'bg-warning text-warning-foreground';
      case 'low':
        return 'bg-success text-success-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <PageContainer>
      <Breadcrumbs />
      <PageHeader
        title={caseData.title}
        description={`Matter #${caseData.case_number || caseData.id}`}
        backHref="/matters"
        actions={
          <>
            <MatterReviewButton caseId={caseData.id} caseTitle={caseData.title} />
            <Badge className={getStatusColor(caseData.status)}>
              {caseData.status.replace('_', ' ')}
            </Badge>
            <Badge className={getPriorityColor(caseData.priority)} variant="outline">
              {caseData.priority} Priority
            </Badge>
          </>
        }
      />

      {/* Matter Information */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Matter Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Matter Type and Issue */}
          {caseType && (
            <div className="flex items-center gap-3">
              <Gavel className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Matter Type</p>
                <p className="font-medium">{caseType}</p>
              </div>
            </div>
          )}

          {caseIssue && (
            <div className="flex items-center gap-3">
              <Gavel className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Matter Issue</p>
                <p className="font-medium">{caseIssue}</p>
              </div>
            </div>
          )}

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
              <p className="font-medium">{new Date(caseData.created_at).toLocaleDateString()}</p>
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

      {/* Progress Tracking */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={pct} className="h-3" />
          <div className="flex items-center gap-4">
            <span className="capitalize text-sm text-muted-foreground">
              {caseData.status.replace('_', ' ')}
            </span>
            <Select
              value={caseData.status}
              onValueChange={(v) => updateCase.mutate({ id: caseData.id, status: v })}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Section */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tasks</CardTitle>
          <Button size="sm" onClick={() => setShowTaskDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Task
          </Button>
        </CardHeader>
        <CardContent>
          <TasksSection caseId={caseData.id} />
        </CardContent>
      </Card>

      {/* Activities Section */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Activities</CardTitle>
          <Button size="sm" onClick={() => setShowActivityDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Activity
          </Button>
        </CardHeader>
        <CardContent>
          <ActivitiesSection caseId={caseData.id} />
        </CardContent>
      </Card>

      {/* Documents Section */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Matter Documents</CardTitle>
          <Button size="sm" onClick={() => setShowDocumentDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Attach Document
          </Button>
        </CardHeader>
        <CardContent>
          <DocumentsSection caseId={caseData.id} />
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button onClick={() => navigate(`/matters/${caseData.id}/edit`)}>Edit Matter</Button>
            <Button variant="outline" onClick={() => navigate('/documents')}>
              View Documents
            </Button>
            <Button variant="outline" onClick={() => navigate('/calendar')}>
              Schedule Event
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Task Creation Dialog */}
      <NewTaskDialog open={showTaskDialog} onOpenChange={setShowTaskDialog} caseId={caseData.id} />

      {/* Document Attachment Dialog */}
      <DocumentAttachDialog
        open={showDocumentDialog}
        onOpenChange={setShowDocumentDialog}
        caseId={caseData.id}
      />

      {/* Activity Creation Dialog */}
      <ActivityDialog
        open={showActivityDialog}
        onOpenChange={setShowActivityDialog}
        caseId={caseData.id}
      />
    </PageContainer>
  );
}

function TasksSection({ caseId }: { caseId: string }) {
  const { data: tasks = [], isLoading } = useTasks(caseId);
  const { data: users = [] } = useOrganizationMembers();
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const pct = total === 0 ? 0 : Math.round((100 * done) / total);
  const [editTask, setEditTask] = useState<any>(null);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  if (isLoading) return <div>Loading tasks…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Progress value={pct} className="h-3 flex-1" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {done} of {total} complete
        </span>
      </div>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Task</th>
            <th className="text-left py-2">Type</th>
            <th className="text-left py-2">Due</th>
            <th className="text-left py-2">Assignee</th>
            <th className="text-left py-2">Priority</th>
            <th className="text-left py-2">Status</th>
            <th className="text-left py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const taskTypeLabels: Record<string, string> = {
              general: 'General',
              court_appearance: 'Court',
              client_visit: 'Visit',
              document_review: 'Doc Review',
              research: 'Research',
              filing: 'Filing',
              deposition: 'Deposition',
              meeting: 'Meeting',
              phone_call: 'Call',
              investigation: 'Investigation',
              negotiation: 'Negotiation',
              contract_draft: 'Drafting',
            };

            return (
              <tr key={task.id} className={task.completed ? 'opacity-60' : ''}>
                <td className="py-2">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                    )}
                  </div>
                </td>
                <td className="py-2">
                  <Badge variant="secondary" className="text-xs">
                    {taskTypeLabels[(task as any).task_type] || 'General'}
                  </Badge>
                </td>
                <td className="py-2">
                  {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                </td>
                <td className="py-2">
                  {task.assigned_to && task.assigned_to !== 'unassigned' ? (
                    <span className="text-sm">
                      {users.find((u: any) => u.user_id === task.assigned_to)?.first_name ||
                        'Unknown'}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">Unassigned</span>
                  )}
                </td>
                <td className="py-2">
                  <Badge
                    variant={
                      task.priority === 'high'
                        ? 'destructive'
                        : task.priority === 'medium'
                          ? 'default'
                          : 'outline'
                    }
                    className="text-xs capitalize"
                  >
                    {task.priority || 'Medium'}
                  </Badge>
                </td>
                <td className="py-2">
                  <Button
                    size="sm"
                    variant={task.completed ? 'secondary' : 'outline'}
                    onClick={() =>
                      updateTask.mutate({
                        id: task.id,
                        case_id: caseId!,
                        completed: !task.completed,
                      })
                    }
                  >
                    {task.completed ? <Check className="h-4 w-4" /> : 'Mark Done'}
                  </Button>
                </td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditTask(task)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteTask.mutate({ id: task.id, case_id: caseId })}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Edit Task Dialog */}
      {editTask && (
        <NewTaskDialog
          open={!!editTask}
          onOpenChange={() => setEditTask(null)}
          caseId={caseId}
          existing={editTask}
        />
      )}
    </div>
  );
}

// --- Create/Edit Task Dialog ---
function NewTaskDialog({
  open,
  onOpenChange,
  caseId,
  existing,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  caseId: string;
  existing?: any;
}) {
  const isEdit = !!existing;
  const { data: users = [] } = useOrganizationMembers();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const [form, setForm] = useState(() =>
    existing
      ? { ...existing }
      : {
          title: '',
          description: '',
          due_date: '',
          priority: 'medium',
          assigned_to: 'unassigned',
          task_type: 'general',
        }
  );
  const [submitting, setSubmitting] = useState(false);

  // Task types for legal practice
  const taskTypes = [
    { value: 'general', label: 'General Task' },
    { value: 'court_appearance', label: 'Court Appearance' },
    { value: 'client_visit', label: 'Client Visit' },
    { value: 'document_review', label: 'Document Review' },
    { value: 'research', label: 'Legal Research' },
    { value: 'filing', label: 'Court Filing' },
    { value: 'deposition', label: 'Deposition' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'phone_call', label: 'Phone Call' },
    { value: 'investigation', label: 'Investigation' },
    { value: 'negotiation', label: 'Negotiation' },
    { value: 'contract_draft', label: 'Contract Drafting' },
  ];

  function handleChange(e: any) {
    setForm((prev: any) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setSubmitting(true);
    if (isEdit) {
      updateTask.mutate(
        { ...form, case_id: caseId, id: existing.id },
        {
          onSuccess: () => {
            setSubmitting(false);
            onOpenChange(false);
          },
          onError: () => setSubmitting(false),
        }
      );
    } else {
      createTask.mutate(
        { ...form, case_id: caseId },
        {
          onSuccess: () => {
            setSubmitting(false);
            onOpenChange(false);
            setForm({
              title: '',
              description: '',
              due_date: '',
              priority: 'medium',
              assigned_to: 'unassigned',
              task_type: 'general',
            });
          },
          onError: () => setSubmitting(false),
        }
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Task' : 'Create New Task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" id="task-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Task Title *</label>
              <Input
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="Enter task title"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Task Type</label>
              <Select
                value={form.task_type}
                onValueChange={(value) => setForm((prev: any) => ({ ...prev, task_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select task type" />
                </SelectTrigger>
                <SelectContent>
                  {taskTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Due Date</label>
              <Input
                name="due_date"
                type="date"
                value={form.due_date ? form.due_date.substring(0, 10) : ''}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Priority</label>
              <Select
                value={form.priority}
                onValueChange={(value) => setForm((prev: any) => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High Priority</SelectItem>
                  <SelectItem value="medium">Medium Priority</SelectItem>
                  <SelectItem value="low">Low Priority</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Assign To</label>
              <Select
                value={form.assigned_to}
                onValueChange={(value) => setForm((prev: any) => ({ ...prev, assigned_to: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.map((u: any) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.first_name} {u.last_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Description</label>
              <Textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Enter task description (optional)"
                rows={3}
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button type="submit" form="task-form" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Documents Section ---
function DocumentsSection({ caseId }: { caseId: string }) {
  const { data: caseDocuments = [], isLoading } = useDocumentsByCase(caseId);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);

  if (isLoading) return <div>Loading documents…</div>;

  const handleView = (doc: any) => {
    setSelectedDocument(doc);
  };

  const handleDownload = async (doc: any) => {
    if (doc.file_path) {
      try {
        const signed = await getNodeDocumentSignedUrl(doc.id, {
          disposition: 'attachment',
          filename: doc.metadata?.original_filename || doc.name,
        });

        const a = document.createElement('a');
        a.href = signed.signedUrl;
        a.download = signed.fileName || doc.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch {
        // Fallback to direct download via fileApi
        const data = await downloadDocumentFile(doc.file_path);
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.metadata?.original_filename || doc.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
  };

  return (
    <div className="space-y-4">
      {caseDocuments.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No documents attached to this case</p>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {caseDocuments.map((doc: any) => (
            <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{doc.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Uploaded {new Date(doc.created_at).toLocaleDateString()}
                    {doc.file_size && ` • ${Math.round(doc.file_size / 1024)} KB`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleView(doc)}>
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDownload(doc)}>
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDocument && (
        <DocumentViewer
          open={!!selectedDocument}
          onOpenChange={() => setSelectedDocument(null)}
          document={selectedDocument}
        />
      )}
    </div>
  );
}

function ActivitiesSection({ caseId }: { caseId: string }) {
  const { data: activities = [], isLoading } = useActivities(caseId);
  const { data: users = [] } = useOrganizationMembers();
  const deleteActivity = useDeleteActivity();
  const [editActivity, setEditActivity] = useState<any>(null);

  if (isLoading) return <div>Loading activities…</div>;

  return (
    <div className="space-y-4">
      {activities.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No activities for this case</p>
      ) : (
        <div className="space-y-3">
          {activities.map((activity: any) => (
            <div
              key={activity.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getActivityIcon(activity.activity_type)}</span>
                <div>
                  <h4 className="font-medium">{activity.title}</h4>
                  <p className="text-sm text-muted-foreground capitalize">
                    {activity.activity_type.replace('_', ' ')}
                    {activity.due_date &&
                      ` • Due: ${new Date(activity.due_date).toLocaleDateString()}`}
                  </p>
                  {activity.description && (
                    <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
                  )}
                  {activity.assigned_to && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Assigned to:{' '}
                      {users.find((u: any) => u.user_id === activity.assigned_to)?.first_name ||
                        'Unknown'}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={getActivityStatusColor(activity.status)}>{activity.status}</Badge>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditActivity(activity)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteActivity.mutate(activity.id)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editActivity && (
        <ActivityDialog
          open={!!editActivity}
          onOpenChange={() => setEditActivity(null)}
          caseId={caseId}
          activity={editActivity}
        />
      )}
    </div>
  );
}

// --- Document Attachment Dialog ---
function DocumentAttachDialog({
  open,
  onOpenChange,
  caseId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  caseId: string;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const uploadDocument = useUploadDocument();

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleAttach = () => {
    if (selectedFile) {
      uploadDocument.mutate(
        {
          name: selectedFile.name,
          file: selectedFile,
          case_id: caseId,
          metadata: {
            attached_to_case: true,
            upload_date: new Date().toISOString(),
          },
        },
        {
          onSuccess: () => {
            onOpenChange(false);
            setSelectedFile(null);
          },
        }
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Attach Document to Case</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="space-y-2">
                <FileText className="h-12 w-12 mx-auto text-primary" />
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {Math.round(selectedFile.size / 1024)} KB
                </p>
                <Button variant="outline" size="sm" onClick={() => setSelectedFile(null)}>
                  Remove
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
                <p>Drag and drop a file here, or</p>
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('file-input')?.click()}
                >
                  Browse Files
                </Button>
              </div>
            )}
            <input
              id="file-input"
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
              accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Supported formats: PDF, Word documents, images, and text files
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleAttach} disabled={!selectedFile || uploadDocument.isPending}>
            {uploadDocument.isPending ? 'Uploading...' : 'Attach Document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
