import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { NewChatDialog } from '@/components/chat/NewChatDialog';

// Hook to detect mobile viewport
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < breakpoint);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}

export default function LiveChatPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState<string>('');
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const isMobile = useIsMobile();
  
  // On mobile: show sidebar when no conversation selected, show chat when selected
  const showSidebar = !isMobile || !selectedConversationId;
  const showChat = !isMobile || selectedConversationId;

  const handleSelectConversation = (conversationId: string, recipientName?: string) => {
    setSelectedConversationId(conversationId);
    setRecipientName(recipientName || '');
  };

  const handleNewConversation = (conversationId: string, recipientName?: string) => {
    setSelectedConversationId(conversationId);
    setRecipientName(recipientName || '');
    setShowNewChatDialog(false);
  };

  const handleBackToSidebar = () => {
    setSelectedConversationId(null);
    setRecipientName('');
  };

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[400px] md:min-h-[500px] rounded-lg border border-border bg-background overflow-hidden">
      {/* Sidebar - full width on mobile when visible, fixed width on desktop */}
      {showSidebar && (
        <ChatSidebar
          onSelectConversation={handleSelectConversation}
          onNewChat={() => setShowNewChatDialog(true)}
          selectedConversationId={selectedConversationId || undefined}
          className={isMobile ? 'w-full' : undefined}
        />
      )}
      
      {/* Chat area - shown on desktop always, on mobile only when conversation selected */}
      {showChat && (
        <>
          {selectedConversationId ? (
            <ChatWindow
              conversationId={selectedConversationId}
              onClose={handleBackToSidebar}
              recipientName={recipientName}
              showBackButton={isMobile}
            />
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center border-l border-border bg-muted/20">
              <div className="text-center p-8 max-w-md">
                <div className="mb-4">
                  <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <svg
                      className="h-8 w-8 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Welcome to Live Chat
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Select a conversation from the sidebar to start chatting, or create a new conversation to begin.
                </p>
                <Button
                  onClick={() => setShowNewChatDialog(true)}
                  className="mt-2"
                >
                  Start New Conversation
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      
      <NewChatDialog
        open={showNewChatDialog}
        onOpenChange={setShowNewChatDialog}
        onConversationCreated={handleNewConversation}
      />
    </div>
  );
}
