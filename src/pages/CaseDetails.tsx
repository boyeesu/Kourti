
import { useParams, useNavigate } from "react-router-dom";
import { useCase, useUpdateCase } from "@/hooks/useCases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ArrowLeft, Calendar, Building, Gavel, Plus, Check, Trash, Edit2, X } from "lucide-react";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/useTasks";
import { useOrganizationMembers } from "@/hooks/useOrganization";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";

export default function CaseDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: caseData, isLoading, error } = useCase(id!);
  const updateCase = useUpdateCase();

  // Define status stages and compute progress percentage
  const STAGES = ["open", "active", "review", "closed"] as const;
  const idx = caseData ? STAGES.indexOf(caseData.status as any) : -1;
  const pct = idx >= 0 ? (100 * idx) / (STAGES.length - 1) : 0;

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
          <p className="text-muted-foreground mb-4">
            The case you're looking for doesn't exist or you don't have access to it.
          </p>
          <Button onClick={() => navigate("/cases")}>Back to Cases</Button>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "in_progress":
        return "bg-warning text-warning-foreground";
      case "review":
        return "bg-info text-info-foreground";
      case "completed":
        return "bg-success text-success-foreground";
      case "pending":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return "bg-destructive text-destructive-foreground";
      case "medium":
        return "bg-warning text-warning-foreground";
      case "low":
        return "bg-success text-success-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="px-4 py-6 space-y-6">
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cases")}> 
          <ArrowLeft className="h-4 w-4" /> 
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground">{caseData.title}</h1>
          <p className="text-muted-foreground">
            Case #{caseData.case_number || caseData.id}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge className={getStatusColor(caseData.status)}>
            {caseData.status.replace('_', ' ')}
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
            <p className="text-foreground whitespace-pre-wrap">
              {caseData.description}
            </p>
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

      {/* Tasks Section - replaces "Activities" */}
      <Card className="shadow-card">
        <CardHeader className="flex gap-4 items-center">
          <CardTitle className="flex-1">Tasks</CardTitle>
          <Button size="sm" onClick={() => setShowTaskDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Task
          </Button>
        </CardHeader>
        <CardContent>
          <TasksSection caseId={caseData.id} />
        </CardContent>
      </Card>

      {/* Quick Actions */}
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

      <NewTaskDialog
        open={showTaskDialog}
        onOpenChange={setShowTaskDialog}
        caseId={caseData.id}
      />
    </div>
  );
}

// --- Tasks Section ---
function TasksSection({ caseId }: { caseId: string }) {
  const { data: tasks = [], isLoading } = useTasks(caseId);
  const total = tasks.length;
  const done = tasks.filter(t => t.completed).length;
  const pct = total === 0 ? 0 : Math.round((100 * done) / total);
  const [editTask, setEditTask] = useState<any>(null);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: users = [] } = useOrganizationMembers();

  if (isLoading) return <div>Loading tasks…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Progress value={pct} className="h-3 flex-1" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">{done} of {total} complete</span>
      </div>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Task</th>
            <th className="text-left py-2">Due</th>
            <th className="text-left py-2">Assignee</th>
            <th className="text-left py-2">Priority</th>
            <th className="text-left py-2">Status</th>
            <th className="text-left py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => (
            <tr key={task.id} className={task.completed ? "opacity-60" : ""}>
              <td>{task.title}</td>
              <td>{task.due_date ? new Date(task.due_date).toLocaleDateString() : "-"}</td>
              <td>{task.assignee ? `${task.assignee.first_name} ${task.assignee.last_name}` : "Unassigned"}</td>
              <td className="capitalize">{task.priority || "-"}</td>
              <td>
                <Button size="sm" variant={task.completed ? "success" : "outline"} onClick={() => updateTask.mutate({ id: task.id, completed: !task.completed })}>
                  {task.completed ? <Check className="h-4 w-4" /> : "Mark Done"}
                </Button>
              </td>
              <td>
                <Button size="icon" variant="ghost" onClick={() => setEditTask(task)}><Edit2 className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => deleteTask.mutate({ id: task.id, case_id: caseId })}><Trash className="h-4 w-4" /></Button>
              </td>
            </tr>
          ))}
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
function NewTaskDialog({ open, onOpenChange, caseId, existing }: { open: boolean, onOpenChange: (b: boolean) => void, caseId: string, existing?: any }) {
  const isEdit = !!existing;
  const { data: users = [] } = useUserManagement();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const [form, setForm] = useState(() => existing ? { ...existing } : { title: "", description: "", due_date: "", priority: "medium", assigned_to: "" });
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e: any) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }
  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setSubmitting(true);
    if (isEdit) {
      updateTask.mutate({ ...form, case_id: caseId, id: existing.id }, {
        onSuccess: () => {
          setSubmitting(false);
          onOpenChange(false);
        },
        onError: () => setSubmitting(false)
      });
    } else {
      createTask.mutate({ ...form, case_id: caseId }, {
        onSuccess: () => {
          setSubmitting(false);
          onOpenChange(false);
        },
        onError: () => setSubmitting(false)
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input name="title" value={form.title} onChange={handleChange} placeholder="Title" required />
          <Input name="description" value={form.description} onChange={handleChange} placeholder="Description" />
          <Input name="due_date" type="date" value={form.due_date ? form.due_date.substring(0, 10) : ""} onChange={handleChange} />
          <select name="priority" value={form.priority} onChange={handleChange} className="w-full border rounded p-2">
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          <select name="assigned_to" value={form.assigned_to} onChange={handleChange} className="w-full border rounded p-2">
            <option value="">Unassigned</option>
            {users.map((u: any) => (
              <option key={u.user_id} value={u.user_id}>
                {u.first_name} {u.last_name} ({u.email})
              </option>
            ))}
          </select>
        </form>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost"><X className="h-4 w-4" /> Cancel</Button>
          <Button type="submit" form="task-form" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}