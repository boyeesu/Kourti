import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, Search } from 'lucide-react';
import { useAdminActions } from '@/hooks/useAdminActions';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

export function AuditLogTab() {
  const [filters, setFilters] = useState<{
    action_type?: string;
    target_type?: string;
    start_date?: string;
    end_date?: string;
  }>({});
  const [searchQuery, setSearchQuery] = useState('');

  const { data: actions = [], isLoading } = useAdminActions(filters);

  const filteredActions = actions.filter((action) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      action.action_type.toLowerCase().includes(searchLower) ||
      action.target_type.toLowerCase().includes(searchLower) ||
      action.target_id?.toLowerCase().includes(searchLower)
    );
  });

  const exportToCSV = () => {
    const headers = ['Date', 'Admin User', 'Action Type', 'Target Type', 'Target ID', 'Details'];
    const rows = filteredActions.map((action) => [
      format(new Date(action.created_at), 'yyyy-MM-dd HH:mm:ss'),
      action.admin_user_id,
      action.action_type,
      action.target_type,
      action.target_id || '',
      JSON.stringify(action.details),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-actions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Audit Log</h2>
          <p className="text-muted-foreground">
            Track all actions performed by platform administrators
          </p>
        </div>
        <Button onClick={exportToCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search actions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filters.action_type || 'all'}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    action_type: e.target.value === 'all' ? undefined : e.target.value,
                  })
                }
                className="px-3 py-2 border rounded-md bg-background"
              >
                <option value="all">All Actions</option>
                <option value="user_approved">User Approved</option>
                <option value="user_disabled">User Disabled</option>
                <option value="user_deleted">User Deleted</option>
                <option value="org_created">Org Created</option>
              </select>
              <select
                value={filters.target_type || 'all'}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    target_type: e.target.value === 'all' ? undefined : e.target.value,
                  })
                }
                className="px-3 py-2 border rounded-md bg-background"
              >
                <option value="all">All Targets</option>
                <option value="user">User</option>
                <option value="organization">Organization</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredActions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No actions found
            </div>
          ) : (
            <div className="space-y-2">
              {filteredActions.map((action) => (
                <div
                  key={action.id}
                  className="flex flex-col gap-2 p-4 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{action.action_type}</div>
                      <div className="text-sm text-muted-foreground">
                        {action.target_type} {action.target_id && `• ${action.target_id.substring(0, 8)}...`}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(action.created_at), 'MMM dd, yyyy HH:mm')}
                    </div>
                  </div>
                  {Object.keys(action.details).length > 0 && (
                    <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
                      {JSON.stringify(action.details, null, 2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
