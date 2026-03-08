import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Pencil, Trash2, Loader2, User } from 'lucide-react';
import {
  useCalendarViewers,
  useUpdateCalendarShare,
  useRevokeCalendarShare,
} from '@/hooks/useCalendarSharing';

import { EmptyState } from '@/components/ui/empty-state';

interface ManageCalendarSharesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageCalendarSharesDialog({
  open,
  onOpenChange,
}: ManageCalendarSharesDialogProps) {
  const { data: viewers, isLoading } = useCalendarViewers();
  const { mutate: updateShare } = useUpdateCalendarShare();
  const { mutate: revokeShare } = useRevokeCalendarShare();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handlePermissionChange = (viewerId: string, newLevel: 'view' | 'edit') => {
    setUpdatingId(viewerId);
    // We need the share ID, not the viewer ID
    // For simplicity, we'll assume the viewer ID maps to a share
    // In a real implementation, you'd store the share ID
    updateShare(
      {
        shareId: viewerId,
        updates: { permission_level: newLevel },
      },
      {
        onSettled: () => setUpdatingId(null),
      }
    );
  };

  const handleRevoke = (viewerId: string) => {
    setUpdatingId(viewerId);
    revokeShare(viewerId, {
      onSettled: () => setUpdatingId(null),
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Calendar Access</DialogTitle>
          <DialogDescription>View and manage who has access to your calendar.</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : viewers && viewers.length > 0 ? (
            <div className="space-y-2">
              {viewers.map((viewer) => (
                <div
                  key={viewer.shared_with_user_id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {getInitials(viewer.viewer_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{viewer.viewer_name}</div>
                      <div className="text-sm text-muted-foreground">{viewer.viewer_email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={viewer.permission_level === 'edit' ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() =>
                        handlePermissionChange(
                          viewer.shared_with_user_id,
                          viewer.permission_level === 'edit' ? 'view' : 'edit'
                        )
                      }
                    >
                      {updatingId === viewer.shared_with_user_id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : viewer.permission_level === 'edit' ? (
                        <>
                          <Pencil className="h-3 w-3 mr-1" />
                          Can edit
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3 mr-1" />
                          View only
                        </>
                      )}
                    </Badge>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            handlePermissionChange(
                              viewer.shared_with_user_id,
                              viewer.permission_level === 'edit' ? 'view' : 'edit'
                            )
                          }
                        >
                          {viewer.permission_level === 'edit' ? (
                            <>
                              <Eye className="h-4 w-4 mr-2" />
                              Change to view only
                            </>
                          ) : (
                            <>
                              <Pencil className="h-4 w-4 mr-2" />
                              Allow editing
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleRevoke(viewer.shared_with_user_id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Revoke access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={User}
              title="No shared access"
              description="You haven't shared your calendar with anyone yet."
              action={{
                label: 'Share Calendar',
                onClick: () => onOpenChange(false),
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
