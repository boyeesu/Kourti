import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { useCreateCaseType } from '@/features/cases/api/createCaseType';
import { Switch } from '@/components/ui/switch';

// Schema for case type validation
const caseTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  is_active: z.boolean(),
});

type CaseTypeFormValues = z.infer<typeof caseTypeSchema>;

interface AddCaseTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (caseTypeId: string) => void;
}

/**
 * Modal for adding a new case type
 */
export function AddCaseTypeModal({ isOpen, onClose, onSuccess }: AddCaseTypeModalProps) {
  const { data: organizationId } = useUserOrganization();
  const createCaseType = useCreateCaseType();

  const form = useForm<CaseTypeFormValues>({
    resolver: zodResolver(caseTypeSchema),
    defaultValues: {
      name: '',
      description: '',
      is_active: true,
    },
  });

  const onSubmit = async (data: CaseTypeFormValues) => {
    if (!organizationId) {
      toast.error('Error', { description: 'Organization ID is required to create a case type' });
      return;
    }

    try {
      const result = await createCaseType.mutateAsync({
        name: data.name,
        description: data.description,
        organization_id: organizationId,
        is_active: data.is_active,
      });

      toast.success('Success', { description: `Case type "${data.name}" created successfully` });

      form.reset();
      onClose();

      // Call success callback with the new case type ID
      if (onSuccess && result.id) {
        onSuccess(result.id);
      }
    } catch (error) {
      console.error('Error creating case type:', error);
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to create case type',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Case Type</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name*</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter case type name" {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Enter description (optional)" {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={createCaseType.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createCaseType.isPending}>
                {createCaseType.isPending ? 'Creating...' : 'Create Case Type'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
