import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatSidebar } from './ChatSidebar';
import { ChatWindow } from './ChatWindow';
import { NewChatDialog } from './NewChatDialog';
import { cn } from '@/lib/utils';

interface LiveChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LiveChat({ isOpen, onClose }: LiveChatProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState<string>('');
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);

  // No longer blocking body scroll - allows sidebar to remain interactive

  const handleSelectConversation = (conversationId: string, recipientName?: string) => {
    setSelectedConversationId(conversationId);
    setRecipientName(recipientName || '');
  };

  const handleNewConversation = (conversationId: string, recipientName?: string) => {
    setSelectedConversationId(conversationId);
    setRecipientName(recipientName || '');
    setShowNewChatDialog(false);
  };

  const modalContent = (
    <>
      {/* Full-screen modal that preserves sidebar - pointer-events-none on container */}
      <div className="fixed inset-0 z-[50] flex pointer-events-none" style={{ isolation: 'isolate' }}>
        {/* Backdrop - only covers main content area, not sidebar */}
        {/* On mobile: covers full screen, on desktop: starts after sidebar */}
        <div
          className={cn(
            "fixed top-0 right-0 bottom-0 bg-background/95 backdrop-blur-sm transition-opacity z-[50] pointer-events-auto",
            "left-0 md:left-[220px] lg:left-[260px]"
          )}
          onClick={onClose}
        />
        
        {/* Chat Container - Full screen starting after sidebar */}
        <div className={cn(
          "relative flex w-full h-full bg-background border-l border-border overflow-hidden z-[51] pointer-events-auto",
          "md:ml-[220px] lg:ml-[260px]",
          "animate-in slide-in-from-right-full duration-300"
        )}>
          <ChatSidebar
            onSelectConversation={handleSelectConversation}
            onNewChat={() => setShowNewChatDialog(true)}
            selectedConversationId={selectedConversationId || undefined}
          />
          
          {selectedConversationId ? (
            <ChatWindow
              conversationId={selectedConversationId}
              onClose={() => {
                setSelectedConversationId(null);
                setRecipientName('');
              }}
              recipientName={recipientName}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center border-l border-border bg-muted/20">
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
          
          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 h-9 w-9 hover:bg-destructive/10 hover:text-destructive"
            aria-label="Close chat"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </>
  );

  if (!isOpen) return null;

  return (
    <>
      {typeof document !== 'undefined' && createPortal(modalContent, document.body)}
      <NewChatDialog
        open={showNewChatDialog}
        onOpenChange={setShowNewChatDialog}
        onConversationCreated={handleNewConversation}
      />
    </>
  );
}
