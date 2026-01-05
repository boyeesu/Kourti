import { ReamAIChatWidget } from './ReamAIChatWidget';
import { cn } from '@/lib/utils';

interface EmbeddedChatWidgetProps {
  className?: string;
  documentContext?: {
    id: string;
    title: string;
    content?: string;
  } | null;
  height?: string;
}

export function EmbeddedChatWidget({
  className,
  documentContext,
  height = '600px',
}: EmbeddedChatWidgetProps) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ReamAIChatWidget
        variant="embedded"
        documentContext={documentContext}
        className="h-full"
      />
    </div>
  );
}

