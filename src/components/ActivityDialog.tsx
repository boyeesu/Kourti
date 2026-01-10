import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateActivity, useUpdateActivity } from '@/features/activities/api/useCreateActivity';
import { useOrganizationMembers } from '@/hooks/useOrganization';
import { useActivityTypes } from '@/hooks/useActivityTypes';
import { CaseActivity } from '@/features/activities/types';

interface ActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  activity?: CaseActivity;
}

export function ActivityDialog({ open, onOpenChange, caseId, activity }: ActivityDialogProps) {
  const isEdit = !!activity;
  const { data: users = [] } = useOrganizationMembers();
  const { data: activityTypes = [] } = useActivityTypes();
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();
  
  const [form, setForm] = useState(() => activity ? {
    title: activity.title,
    description: activity.description || '',
    activity_type: activity.activity_type,
    due_date: activity.due_date || '',
    assigned_to: activity.assigned_to || 'unassigned',
    status: activity.status || 'pending',
  } : {
    title: '',
    description: '',
    activity_type: activityTypes[0]?.value || 'meeting',
    due_date: '',
    assigned_to: 'unassigned',
    status: 'pending',
  });

  const [submitting, setSubmitting] = useState(false);

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (isEdit && activity) {
        await updateActivity.mutateAsync({
          id: activity.id,
          ...form,
          assigned_to: form.assigned_to === 'unassigned' ? null : form.assigned_to,
          due_date: form.due_date || null,
        });
      } else {
        await createActivity.mutateAsync({
          caseId,
          payload: {
            ...form,
            assigned_to: form.assigned_to === 'unassigned' ? null : form.assigned_to,
            due_date: form.due_date || null,
          }
        });
      }
      
      onOpenChange(false);
      if (!isEdit) {
        setForm({
          title: '',
          description: '',
          activity_type: activityTypes[0]?.value || 'meeting',
          due_date: '',
          assigned_to: 'unassigned',
          status: 'pending',
        });
      }
    } catch (error) {
      console.error('Failed to save activity:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Activity' : 'Create New Activity'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4" id="activity-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Activity Title *</label>
              <Input
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="Enter activity title"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Activity Type</label>
              <Select value={form.activity_type} onValueChange={(value) => setForm(prev => ({ ...prev, activity_type: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select activity type" />
                </SelectTrigger>
                <SelectContent>
                  {activityTypes.map(type => (
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
                value={form.due_date}
                onChange={handleChange}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <Select value={form.status} onValueChange={(value) => setForm(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(status => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Assign To</label>
              <Select value={form.assigned_to} onValueChange={(value) => setForm(prev => ({ ...prev, assigned_to: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.first_name} {user.last_name} ({user.email})
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
                placeholder="Enter activity description (optional)"
                rows={3}
              />
            </div>
          </div>
        </form>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="activity-form" disabled={submitting}>
            {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Activity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}