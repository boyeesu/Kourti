import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Download, Check, X, Trash2, Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAllUsers, PlatformUser } from '@/hooks/useAllUsers';
import { useBulkUserAction, downloadAdminCsv, BulkAction } from '@/hooks/useAdminBulk';

const STATUS_OPTIONS = ['all', 'active', 'pending', 'approved', 'disabled', 'deleted'];

export function BulkOpsTab() {
  const { data: users = [], isLoading } = useAllUsers();
  const bulkAction = useBulkUserAction();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [dialogAction, setDialogAction] = useState<BulkAction | null>(null);
  const [reason, setReason] = useState('');
  const [exporting, setExporting] = useState(false);

  const organizations = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => {
      if (u.organization_id) {
        map.set(u.organization_id, u.organization_name || u.organization_id);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !q ||
        user.email?.toLowerCase().includes(q) ||
        user.first_name?.toLowerCase().includes(q) ||
        user.last_name?.toLowerCase().includes(q) ||
        user.organization_name?.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      const matchesOrg = orgFilter === 'all' || user.organization_id === orgFilter;
      return matchesSearch && matchesStatus && matchesOrg;
    });
  }, [users, searchQuery, statusFilter, orgFilter]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allVisibleSelected =
    filteredUsers.length > 0 && filteredUsers.every((u) => selected.has(u.user_id));

  const toggleOne = (userId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => {
        if (checked) next.add(u.user_id);
        else next.delete(u.user_id);
      });
      return next;
    });
  };

  const openActionDialog = (action: BulkAction) => {
    if (selectedIds.length === 0) {
      toast.error('No users selected');
      return;
    }
    setReason('');
    setDialogAction(action);
  };

  const confirmAction = () => {
    if (!dialogAction) return;
    if (reason.trim().length < 3) {
      toast.error('A reason of at least 3 characters is required');
      return;
    }
    bulkAction.mutate(
      { action: dialogAction, userIds: selectedIds, reason: reason.trim() },
      {
        onSuccess: () => {
          setSelected(new Set());
          setDialogAction(null);
        },
      }
    );
  };

  const handleExport = async (kind: 'users' | 'organizations') => {
    setExporting(true);
    try {
      if (kind === 'users') {
        await downloadAdminCsv('/api/v1/admin/export/users.csv', 'users.csv', {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          organization_id: orgFilter !== 'all' ? orgFilter : undefined,
          q: searchQuery.trim() || undefined,
        });
      } else {
        await downloadAdminCsv('/api/v1/admin/export/organizations.csv', 'organizations.csv');
      }
    } catch (err) {
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : 'Unexpected error',
      });
    } finally {
      setExporting(false);
    }
  };

  const actionLabel: Record<BulkAction, string> = {
    approve: 'Approve',
    disable: 'Disable',
    delete: 'Delete',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bulk Operations</h2>
          <p className="text-muted-foreground">
            Select multiple users to approve, disable, or delete in one action — and export data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport('users')} disabled={exporting}>
            <Download className="h-4 w-4 mr-2" />
            Export Users CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport('organizations')}
            disabled={exporting}
          >
            <Download className="h-4 w-4 mr-2" />
            Export Orgs CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name, email, or organization..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border rounded-md bg-background"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
              <select
                value={orgFilter}
                onChange={(e) => setOrgFilter(e.target.value)}
                className="px-3 py-2 border rounded-md bg-background max-w-[220px]"
              >
                <option value="all">All Organizations</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{selectedIds.length} selected</Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openActionDialog('approve')}
              disabled={selectedIds.length === 0 || bulkAction.isPending}
            >
              <Check className="h-4 w-4 mr-2" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openActionDialog('disable')}
              disabled={selectedIds.length === 0 || bulkAction.isPending}
            >
              <X className="h-4 w-4 mr-2" />
              Disable
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => openActionDialog('delete')}
              disabled={selectedIds.length === 0 || bulkAction.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <UsersIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No users found matching filters</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={(c) => toggleAll(Boolean(c))}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user: PlatformUser) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(user.user_id)}
                          onCheckedChange={(c) => toggleOne(user.user_id, Boolean(c))}
                          aria-label={`Select ${user.email ?? user.user_id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {user.first_name} {user.last_name}
                      </TableCell>
                      <TableCell>{user.email || '—'}</TableCell>
                      <TableCell>{user.organization_name || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.status || 'unknown'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogAction !== null} onOpenChange={(open) => !open && setDialogAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAction ? actionLabel[dialogAction] : ''} {selectedIds.length} user
              {selectedIds.length === 1 ? '' : 's'}
            </DialogTitle>
            <DialogDescription>
              {dialogAction === 'delete'
                ? 'This will soft-delete the selected users. A reason is required and recorded in the audit log.'
                : 'A reason is required and recorded in the audit log.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-reason">Reason</Label>
            <Textarea
              id="bulk-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you performing this action? (min 3 characters)"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAction(null)}>
              Cancel
            </Button>
            <Button
              variant={dialogAction === 'delete' ? 'destructive' : 'default'}
              onClick={confirmAction}
              disabled={bulkAction.isPending || reason.trim().length < 3}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
