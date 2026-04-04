/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { getSession } from '@/lib/authClient';
import { invokeNodeApi } from '@/lib/backendApi';
import { useOrganizationMembers } from '@/hooks/useOrganization';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { X } from 'lucide-react';

interface InternalShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    name: string;
  };
}

interface FormData {
  recipients: string[];
  message: string;
  access_level: 'view' | 'comment' | 'edit';
}

export function InternalShareDialog({ open, onOpenChange, document }: InternalShareDialogProps) {
  const { data: orgMembers = [] } = useOrganizationMembers();
  const [selectedRecipients, setSelectedRecipients] = React.useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      recipients: [],
      message: '',
      access_level: 'view',
    },
  });

  const handleAddRecipient = (userId: string) => {
    if (!selectedRecipients.includes(userId)) {
      const newRecipients = [...selectedRecipients, userId];
      setSelectedRecipients(newRecipients);
      setValue('recipients', newRecipients);
    }
  };

  const handleRemoveRecipient = (userId: string) => {
    const newRecipients = selectedRecipients.filter((id) => id !== userId);
    setSelectedRecipients(newRecipients);
    setValue('recipients', newRecipients);
  };

  const getSelectedMember = (userId: string) => {
    return orgMembers.find((member: any) => member.user_id === userId);
  };

  async function onSubmit(data: FormData) {
    try {
      const currentUser = getSession()?.user;

      // Create notifications for each recipient via Node backend
      for (const recipientId of data.recipients) {
        await invokeNodeApi('/api/v1/notifications', {
          method: 'POST',
          body: {
            user_id: recipientId,
            type: 'document_shared',
            title: `Document shared: ${document.name}`,
            description:
              data.message ||
              `A document has been shared with you with ${data.access_level} access.`,
            metadata: {
              document_id: document.id,
              document_name: document.name,
              access_level: data.access_level,
              shared_by: currentUser?.id,
            },
          },
        });
      }

      toast.success('Document shared successfully', {
        description: `Shared with ${data.recipients.length} team member(s).`,
      });

      onOpenChange(false);
      reset();
      setSelectedRecipients([]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to share document.';
      toast.error('Error', { description: errorMessage });
    }
  }

  const availableMembers = orgMembers.filter(
    (member: any) => !selectedRecipients.includes(member.user_id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Document Internally</DialogTitle>
          <DialogDescription>
            Share this document with team members in your organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="document-name">Document</Label>
            <div className="mt-1 p-2 bg-muted rounded-md">
              <span className="text-sm font-medium">{document.name}</span>
            </div>
          </div>

          <div>
            <Label>Recipients</Label>

            {/* Selected Recipients */}
            {selectedRecipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedRecipients.map((userId) => {
                  const member = getSelectedMember(userId);
                  if (!member) return null;

                  return (
                    <Badge key={userId} variant="secondary" className="flex items-center gap-1">
                      <Avatar className="h-4 w-4">
                        <AvatarFallback className="text-xs">
                          {member.first_name?.[0]}
                          {member.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs">
                        {member.first_name} {member.last_name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(userId)}
                        className="ml-1 hover:bg-destructive hover:text-destructive-foreground rounded-full p-0.5"
                      >
                        <X className="h-2 w-2" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* Add Recipients Dropdown */}
            <Select onValueChange={handleAddRecipient}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select team members to share with..." />
              </SelectTrigger>
              <SelectContent>
                {availableMembers.map((member: any) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {member.first_name?.[0]}
                          {member.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {member.first_name} {member.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground">{member.email}</div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="access_level">Access Level</Label>
            <Select
              onValueChange={(value: 'view' | 'comment' | 'edit') =>
                setValue('access_level', value)
              }
              defaultValue="view"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View Only</SelectItem>
                <SelectItem value="comment">Can Comment</SelectItem>
                <SelectItem value="edit">Can Edit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="message">Message (optional)</Label>
            <Textarea
              id="message"
              placeholder="Add a message for the recipients..."
              {...register('message', {
                maxLength: { value: 500, message: 'Message is too long' },
              })}
            />
            {errors.message && (
              <p className="text-sm text-destructive mt-1">{errors.message.message}</p>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || selectedRecipients.length === 0}>
              Share Document
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
