import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Users, User, Loader2 } from 'lucide-react';
import { useShareCalendar } from '@/hooks/useCalendarSharing';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  name: string;
  email: string;
  color: string;
}

interface ShareCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
}

export function ShareCalendarDialog({ open, onOpenChange, members }: ShareCalendarDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [permissionLevel, setPermissionLevel] = useState<'view' | 'edit'>('view');
  const { mutate: shareCalendar, isPending } = useShareCalendar();

  const filteredMembers = members.filter(
    (member) =>
      member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleShare = () => {
    if (!selectedUserId) return;

    shareCalendar(
      {
        shared_with_user_id: selectedUserId,
        permission_level: permissionLevel,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSelectedUserId(null);
          setSearchTerm('');
          setPermissionLevel('view');
        },
      }
    );
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share Your Calendar
          </DialogTitle>
          <DialogDescription>
            Share your calendar with team members to collaborate on scheduling.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search">Search team members</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Members List */}
          <div className="space-y-2">
            <Label>Select a team member</Label>
            <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
              {filteredMembers.length > 0 ? (
                filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    onClick={() => setSelectedUserId(member.id)}
                    className={cn(
                      'flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors',
                      selectedUserId === member.id
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-accent/50'
                    )}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback
                        style={{ backgroundColor: member.color }}
                        className="text-white text-xs"
                      >
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{member.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No team members found
                </div>
              )}
            </div>
          </div>

          {/* Permission Level */}
          <div className="space-y-2">
            <Label>Permission level</Label>
            <RadioGroup
              value={permissionLevel}
              onValueChange={(value) => setPermissionLevel(value as 'view' | 'edit')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="view" id="view" />
                <Label htmlFor="view" className="cursor-pointer">
                  <div className="font-medium">View only</div>
                  <div className="text-xs text-muted-foreground">Can see your events</div>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="edit" id="edit" />
                <Label htmlFor="edit" className="cursor-pointer">
                  <div className="font-medium">Can edit</div>
                  <div className="text-xs text-muted-foreground">Can add/edit events</div>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleShare} disabled={!selectedUserId || isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sharing...
              </>
            ) : (
              <>
                <User className="h-4 w-4 mr-2" />
                Share Calendar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
