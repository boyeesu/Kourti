import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { X, CheckCircle2, AlertCircle, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Operation {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "error" | "cancelled";
  progress?: number;
  message?: string;
  error?: string;
  estimatedTime?: number; // in seconds
  startTime?: Date;
}

interface OperationQueueProps {
  operations: Operation[];
  onCancel?: (id: string) => void;
  onDismiss?: (id: string) => void;
  maxVisible?: number;
  className?: string;
}

export function OperationQueue({
  operations,
  onCancel,
  onDismiss,
  maxVisible = 5,
  className,
}: OperationQueueProps) {
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      const times: Record<string, number> = {};
      operations.forEach((op) => {
        if (op.startTime && op.status === "running") {
          times[op.id] = Math.floor(
            (Date.now() - op.startTime.getTime()) / 1000
          );
        }
      });
      setElapsedTimes(times);
    }, 1000);

    return () => clearInterval(interval);
  }, [operations]);

  const visibleOperations = operations.slice(0, maxVisible);
  const hasMore = operations.length > maxVisible;

  if (operations.length === 0) return null;

  const getStatusIcon = (status: Operation["status"]) => {
    switch (status) {
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "cancelled":
        return <X className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Card className={cn("border", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>Background Operations</span>
          {hasMore && (
            <span className="text-xs text-muted-foreground font-normal">
              +{operations.length - maxVisible} more
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {visibleOperations.map((operation) => (
          <div
            key={operation.id}
            className={cn(
              "p-3 rounded-lg border transition-all",
              operation.status === "running" && "bg-primary/5 border-primary/20",
              operation.status === "error" && "bg-destructive/5 border-destructive/20",
              operation.status === "completed" && "bg-success/5 border-success/20"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <div className="mt-0.5">{getStatusIcon(operation.status)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{operation.name}</p>
                  {operation.message && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {operation.message}
                    </p>
                  )}
                  {operation.error && (
                    <p className="text-xs text-destructive mt-1">
                      {operation.error}
                    </p>
                  )}
                  {operation.status === "running" && (
                    <div className="mt-2 space-y-1">
                      {operation.progress !== undefined && (
                        <Progress value={operation.progress} className="h-1.5" />
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {elapsedTimes[operation.id]
                            ? `Elapsed: ${formatTime(elapsedTimes[operation.id])}`
                            : "Starting..."}
                        </span>
                        {operation.estimatedTime && (
                          <span>
                            Est: {formatTime(operation.estimatedTime)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {operation.status === "running" && onCancel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onCancel(operation.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
                {(operation.status === "completed" ||
                  operation.status === "error" ||
                  operation.status === "cancelled") &&
                  onDismiss && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onDismiss(operation.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Hook to manage operations
export function useOperationQueue() {
  const [operations, setOperations] = useState<Operation[]>([]);

  const addOperation = (operation: Omit<Operation, "status" | "startTime">) => {
    const newOp: Operation = {
      ...operation,
      status: "pending",
      startTime: new Date(),
    };
    setOperations((prev) => [...prev, newOp]);
    return newOp.id;
  };

  const updateOperation = (
    id: string,
    updates: Partial<Operation>
  ) => {
    setOperations((prev) =>
      prev.map((op) =>
        op.id === id
          ? { ...op, ...updates }
          : op
      )
    );
  };

  const removeOperation = (id: string) => {
    setOperations((prev) => prev.filter((op) => op.id !== id));
  };

  const startOperation = (id: string) => {
    updateOperation(id, { status: "running", startTime: new Date() });
  };

  const completeOperation = (id: string, message?: string) => {
    updateOperation(id, { status: "completed", message, progress: 100 });
  };

  const failOperation = (id: string, error: string) => {
    updateOperation(id, { status: "error", error });
  };

  const cancelOperation = (id: string) => {
    updateOperation(id, { status: "cancelled" });
  };

  return {
    operations,
    addOperation,
    updateOperation,
    removeOperation,
    startOperation,
    completeOperation,
    failOperation,
    cancelOperation,
  };
}

