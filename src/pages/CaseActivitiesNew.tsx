/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useActivities } from '@/features/activities/api/useActivities';
import { useCreateActivity } from '@/features/activities/api/useCreateActivity';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer } from '@/components/layout/PageContainer';

const activityTypes = [
  'Meeting',
  'Court',
  'Research',
  'Documentation',
  'Communication',
  'Filing',
  'Other',
];

export default function CaseActivities() {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const { data: activities = [], isLoading } = useActivities(caseId);
  const createActivity = useCreateActivity();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newActivity, setNewActivity] = useState({
    title: '',
    description: '',
    activity_type: 'Meeting',
    assigned_to: '',
    due_date: '',
    status: 'pending',
  });

  const statusColors: Record<string, string> = {
    completed: 'text-success',
    in_progress: 'text-warning',
    pending: 'text-muted-foreground',
  };

  const typeColors: Record<string, string> = {
    Meeting: 'bg-primary/10 text-primary',
    Court: 'bg-destructive/10 text-destructive',
    Research: 'bg-info/10 text-info',
    Documentation: 'bg-warning/10 text-warning',
    Communication: 'bg-success/10 text-success',
    Filing: 'bg-secondary/10 text-secondary',
    Other: 'bg-muted/10 text-muted-foreground',
  };

  const handleCreateActivity = async () => {
    if (!newActivity.title || !newActivity.description) {
      toast.error('Missing info', { description: 'Please fill in title and description' });
      return;
    }
    try {
      await createActivity.mutateAsync({
        caseId,
        payload: {
          ...newActivity,
          status: newActivity.status || 'pending',
        } as any,
      });
      setNewActivity({
        title: '',
        description: '',
        activity_type: 'Meeting',
        assigned_to: '',
        due_date: '',
        status: 'pending',
      });
      setDialogOpen(false);
      toast.success('Activity created');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create activity');
    }
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex justify-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/matters/${caseId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Matter Activities
          </h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> New Activity
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Activity</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input
                  value={newActivity.title}
                  onChange={(e) => setNewActivity({ ...newActivity, title: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea
                  rows={4}
                  value={newActivity.description}
                  onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={newActivity.activity_type}
                    onValueChange={(v) => setNewActivity({ ...newActivity, activity_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activityTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={newActivity.due_date}
                    onChange={(e) => setNewActivity({ ...newActivity, due_date: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={handleCreateActivity} disabled={createActivity.isPending}>
                {createActivity.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Activities List */}
      <div className="space-y-4">
        {activities.map((act) => (
          <Card key={act.id} className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className={typeColors[act.activity_type || ''] || 'bg-muted'}>
                    {act.activity_type}
                  </Badge>
                  <CardTitle>{act.title}</CardTitle>
                </div>
                <span className={statusColors[act.status || ''] || ''}>{act.status}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-2">{act.description}</p>
              {/* additional details could go here */}
            </CardContent>
          </Card>
        ))}
        {activities.length === 0 && (
          <p className="text-muted-foreground text-center">No activities yet.</p>
        )}
      </div>
    </PageContainer>
  );
}
