import { useState } from 'react';
import { ReamAIChatWidget } from './ReamAIChatWidget';
import { Badge } from '@/components/ui/badge';

interface FloatingChatWidgetProps {
  documentContext?: {
    id: string;
    title: string;
    content?: string;
  } | null;
}

export function FloatingChatWidget({ documentContext }: FloatingChatWidgetProps) {
  const [isMinimized, setIsMinimized] = useState(true); // Start minimized/closed by default
  const [unreadCount, setUnreadCount] = useState(0);

  return (
    <>
      <ReamAIChatWidget
        variant="floating"
        isMinimized={isMinimized}
        onMinimize={() => setIsMinimized(true)}
        onMaximize={() => {
          setIsMinimized(false);
          setUnreadCount(0);
        }}
        documentContext={documentContext}
      />
      {isMinimized && unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="fixed bottom-24 right-4 h-6 w-6 rounded-full p-0 flex items-center justify-center z-[60] text-xs font-bold animate-pulse"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </Badge>
      )}
    </>
  );
}

