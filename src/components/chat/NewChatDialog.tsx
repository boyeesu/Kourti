import { useState } from 'react';
import { Search, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useOrganizationMembers } from '@/hooks/useOrganization';
import { useGetOrCreateDirectConversation } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversationId: string, recipientName: string) => void;
}

export function NewChatDialog({
  open,
  onOpenChange,
  onConversationCreated,
}: NewChatDialogProps) {
  const { user } = useAuth();
  const { data: members = [], isLoading: membersLoading } = useOrganizationMembers();
  const createConversation = useGetOrCreateDirectConversation();
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  // Filter out current user and filter by search query
  const availableMembers = members.filter((member) => {
    if (member.user_id === user?.id) return false;
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    const name = `${member.first_name || ''} ${member.last_name || ''}`.toLowerCase();
    const email = (member.email || '').toLowerCase();
    const department = (member.department || '').toLowerCase();
    
    return name.includes(query) || email.includes(query) || department.includes(query);
  });

  const handleSelectMember = async (member: any) => {
    try {
      const conversationId = await createConversation.mutateAsync(member.user_id);
      const recipientName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email || 'Unknown';
      onConversationCreated(conversationId, recipientName);
      onOpenChange(false);
      setSearchQuery('');
      toast({
        title: "Conversation started",
        description: `Started a conversation with ${recipientName}`,
      });
    } catch (error: any) {
      console.error('Failed to create conversation:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "Failed to create conversation. Please try again.",
      });
    }
  };

  const getMemberInitials = (member: any) => {
    if (member.first_name && member.last_name) {
      return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
    }
    if (member.email) {
      return member.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const getMemberName = (member: any) => {
    if (member.first_name || member.last_name) {
      return `${member.first_name || ''} ${member.last_name || ''}`.trim();
    }
    return member.email || 'Unknown';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[500px]"
        {...({ highZ: true } as any)}
      >
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>
            Select a team member to start a conversation
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <ScrollArea className="h-[400px]">
            {membersLoading ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                <p className="text-sm text-muted-foreground">Loading team members...</p>
              </div>
            ) : availableMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <User className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No members found' : 'No team members available'}
                </p>
                {!searchQuery && members.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    You need at least one other team member to start a conversation.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {availableMembers.map((member) => (
                  <button
                    key={member.user_id}
                    onClick={() => handleSelectMember(member)}
                    disabled={createConversation.isPending}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                      "hover:bg-muted border border-transparent hover:border-border",
                      createConversation.isPending && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={undefined} />
                      <AvatarFallback className="text-xs">
                        {getMemberInitials(member)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {getMemberName(member)}
                      </p>
                      {member.department && (
                        <p className="text-xs text-muted-foreground truncate">
                          {member.department}
                        </p>
                      )}
                      {member.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {member.email}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
