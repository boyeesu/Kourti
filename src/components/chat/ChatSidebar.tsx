import { useState } from 'react';
import { MessageCircle, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useConversations, Conversation } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ChatSidebarProps {
  onSelectConversation: (conversationId: string, recipientName?: string) => void;
  onNewChat: () => void;
  selectedConversationId?: string;
}

export function ChatSidebar({
  onSelectConversation,
  onNewChat,
  selectedConversationId,
}: ChatSidebarProps) {
  const { user } = useAuth();
  const { data: conversations = [], isLoading } = useConversations();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    
    // Search in participant names
    const participantNames = conv.participants
      ?.filter(p => p.user_id !== user?.id)
      .map(p => `${p.first_name || ''} ${p.last_name || ''} ${p.email || ''}`.toLowerCase())
      .join(' ') || '';
    
    // Search in last message
    const lastMessage = conv.last_message?.content.toLowerCase() || '';
    
    return participantNames.includes(query) || lastMessage.includes(query);
  });

  const getConversationName = (conv: Conversation) => {
    if (conv.type === 'group' && conv.name) {
      return conv.name;
    }
    
    // For direct conversations, get the other participant's name
    const otherParticipant = conv.participants?.find(p => p.user_id !== user?.id);
    if (otherParticipant) {
      if (otherParticipant.first_name || otherParticipant.last_name) {
        return `${otherParticipant.first_name || ''} ${otherParticipant.last_name || ''}`.trim();
      }
      return otherParticipant.email || 'Unknown';
    }
    
    return 'Chat';
  };

  const getConversationInitials = (conv: Conversation) => {
    if (conv.type === 'group' && conv.name) {
      return conv.name.slice(0, 2).toUpperCase();
    }
    
    const otherParticipant = conv.participants?.find(p => p.user_id !== user?.id);
    if (otherParticipant) {
      if (otherParticipant.first_name && otherParticipant.last_name) {
        return `${otherParticipant.first_name[0]}${otherParticipant.last_name[0]}`.toUpperCase();
      }
      if (otherParticipant.email) {
        return otherParticipant.email.slice(0, 2).toUpperCase();
      }
    }
    
    return 'C';
  };

  return (
    <div className="flex flex-col h-full w-80 shrink-0 border-r border-border bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">Live Chat</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewChat}
            className="h-8 w-8"
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-sm text-muted-foreground">Loading conversations...</div>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground mb-1">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
            {!searchQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={onNewChat}
                className="mt-2"
              >
                <Plus className="h-3 w-3 mr-1" />
                Start a conversation
              </Button>
            )}
          </div>
        ) : (
          <div className="p-2">
            {filteredConversations.map((conv) => {
              const isSelected = conv.id === selectedConversationId;
              const unreadCount = conv.unread_count || 0;
              
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id, getConversationName(conv))}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                    isSelected
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-muted border border-transparent"
                  )}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={undefined} />
                    <AvatarFallback className="text-xs">
                      {getConversationInitials(conv)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className={cn(
                        "text-sm font-medium truncate",
                        isSelected ? "text-primary" : "text-foreground",
                        unreadCount > 0 && "font-semibold"
                      )}>
                        {getConversationName(conv)}
                      </p>
                      {conv.last_message && (
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    {conv.last_message && (
                      <p className={cn(
                        "text-xs truncate",
                        unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                      )}>
                        {conv.last_message.sender_id === user?.id ? 'You: ' : ''}
                        {conv.last_message.content}
                      </p>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <Badge variant="default" className="shrink-0 h-5 min-w-5 px-1.5 text-[10px]">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
