import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Clock, Loader2, XCircle, Ban } from 'lucide-react';

interface AgentJobProgressProps {
  status: string;
  progress: number;
  progressMessage?: string | null;
  compact?: boolean;
}

const statusConfig: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: React.ReactNode;
  }
> = {
  pending: { label: 'Pending', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  running: {
    label: 'Running',
    variant: 'default',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    label: 'Completed',
    variant: 'outline',
    icon: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  },
  failed: { label: 'Failed', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: 'Cancelled', variant: 'secondary', icon: <Ban className="h-3 w-3" /> },
};

export function AgentJobProgress({
  status,
  progress,
  progressMessage,
  compact,
}: AgentJobProgressProps) {
  const config = statusConfig[status] ?? statusConfig.pending;

  if (compact) {
    return (
      <Badge variant={config.variant} className="gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant={config.variant} className="gap-1">
          {config.icon}
          {config.label}
        </Badge>
        {status === 'running' && <span className="text-xs text-muted-foreground">{progress}%</span>}
      </div>
      {status === 'running' && (
        <>
          <Progress value={progress} className="h-2" />
          {progressMessage && <p className="text-xs text-muted-foreground">{progressMessage}</p>}
        </>
      )}
    </div>
  );
}
