import { useAlertSummary } from '@/hooks/useAgentAlerts';

export function AlertBadge() {
  const { data } = useAlertSummary();
  const count = data?.data?.active ?? 0;

  if (count === 0) return null;

  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-medium text-destructive-foreground">
      {count > 99 ? '99+' : count}
    </span>
  );
}
