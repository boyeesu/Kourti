import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { UserPlus2Icon, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAllRoles } from '@/hooks/useAllRoles';
import { useInviteUser } from '@/hooks/useUserManagement';
import { toast } from 'sonner';

const inviteSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  role: z.string().min(1, 'Please select a role'),
  department: z.string().optional(),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface BulkInviteRow {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  status?: 'pending' | 'success' | 'error';
  error?: string;
}

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [bulkData, setBulkData] = useState<BulkInviteRow[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const { data: allRoles = [] } = useAllRoles();
  const inviteUser = useInviteUser();

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      role: '',
      department: '',
    },
  });

  const availableRoles = [
    ...allRoles
      .filter((role) => role.source === 'global')
      .map((role) => ({
        value: role.role || role.role_name,
        label: role.display_name || role.role_name || role.role,
      })),
    ...allRoles
      .filter((role) => role.source === 'custom')
      .map((role) => ({
        value: role.role || role.role_name,
        label: role.display_name || role.role_name || role.role,
      })),
  ];

  const handleSubmit = async (data: InviteFormData) => {
    try {
      await inviteUser.mutateAsync({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        department: data.department,
      });
      form.reset();
      setOpen(false);
      toast.success('Success', { description: 'Invitation sent successfully' });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send invitation';
      toast.error('Error', { description: errorMessage });
    }
  };

  const handleBulkImport = (text: string) => {
    // Parse CSV-like format: email,firstName,lastName,role,department
    const lines = text.split('\n').filter((line) => line.trim());
    const rows: BulkInviteRow[] = [];

    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length >= 4) {
        rows.push({
          email: parts[0],
          firstName: parts[1],
          lastName: parts[2],
          role: parts[3] || 'user',
          department: parts[4] || '',
          status: 'pending',
        });
      }
    }

    setBulkData(rows);
  };

  const handleBulkInvite = async () => {
    if (bulkData.length === 0) return;

    setBulkProcessing(true);
    const results: BulkInviteRow[] = [];

    for (const row of bulkData) {
      try {
        await inviteUser.mutateAsync({
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          role: row.role,
          department: row.department,
        });
        results.push({ ...row, status: 'success' });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to invite';
        results.push({
          ...row,
          status: 'error',
          error: errorMessage,
        });
      }
    }

    setBulkData(results);
    setBulkProcessing(false);

    const successCount = results.filter((r) => r.status === 'success').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    toast.success('Bulk Invite Complete', {
      description: `${successCount} successful, ${errorCount} failed`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus2Icon className="h-4 w-4 mr-2" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send an invitation to join your organization. They'll receive an email with setup
            instructions.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'single' | 'bulk')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single">Single Invite</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john.doe@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableRoles.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Legal, Finance, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={inviteUser.isPending}>
                    {inviteUser.isPending ? 'Sending...' : 'Send Invitation'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4">
            <div className="space-y-2">
              <Label>Bulk Import Format</Label>
              <p className="text-sm text-muted-foreground">
                Enter users in CSV format: email,firstName,lastName,role,department
              </p>
              <Textarea
                placeholder="john.doe@example.com,John,Doe,user,Legal&#10;jane.smith@example.com,Jane,Smith,admin,Finance"
                className="min-h-[200px] font-mono text-sm"
                onChange={(e) => handleBulkImport(e.target.value)}
              />
            </div>

            {bulkData.length > 0 && (
              <div className="space-y-2">
                <Label>Preview ({bulkData.length} users)</Label>
                <div className="max-h-[200px] overflow-y-auto border rounded-md p-2 space-y-1">
                  {bulkData.map((row, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded text-sm"
                    >
                      <div className="flex-1">
                        <span className="font-medium">
                          {row.firstName} {row.lastName}
                        </span>
                        <span className="text-muted-foreground ml-2">({row.email})</span>
                        <Badge variant="secondary" className="ml-2">
                          {row.role}
                        </Badge>
                      </div>
                      {row.status === 'success' && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {row.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleBulkInvite} disabled={bulkProcessing || bulkData.length === 0}>
                {bulkProcessing ? 'Processing...' : `Invite ${bulkData.length} Users`}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
