import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  message: string;
  error?: Error | unknown;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
  variant?: "default" | "destructive" | "warning";
  children?: ReactNode;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  error,
  onRetry,
  onDismiss,
  className,
  variant = "destructive",
  children
}: ErrorStateProps) {
  const variantStyles = {
    default: "bg-muted/50",
    destructive: "bg-destructive/10",
    warning: "bg-warning/10"
  };

  const iconStyles = {
    default: "text-muted-foreground",
    destructive: "text-destructive",
    warning: "text-warning"
  };

  const errorMessage = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;

  return (
    <Card className={cn("border", className)}>
      <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className={cn("mx-auto mb-4 h-16 w-16 rounded-full flex items-center justify-center", variantStyles[variant])}>
          <AlertTriangle className={cn("h-8 w-8", iconStyles[variant])} />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-muted-foreground mb-2 max-w-md">{message}</p>
        {errorMessage && (
          <p className="text-xs text-muted-foreground/70 mb-6 max-w-md font-mono bg-muted p-2 rounded">
            {errorMessage}
          </p>
        )}
        {children}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          {onRetry && (
            <Button onClick={onRetry} variant={variant === "destructive" ? "default" : "outline"} className="shadow-sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          )}
          {onDismiss && (
            <Button variant="ghost" onClick={onDismiss}>
              <X className="h-4 w-4 mr-2" />
              Dismiss
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Network error state
export function NetworkErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      title="Connection Error"
      message="Unable to connect to the server. Please check your internet connection and try again."
      onRetry={onRetry}
      variant="destructive"
    />
  );
}

// Permission error state
export function PermissionErrorState({ resource, action }: { resource?: string; action?: string }) {
  return (
    <ErrorState
      title="Access Denied"
      message={`You don't have permission to ${action || "access"} ${resource || "this resource"}. Please contact your administrator.`}
      variant="warning"
    />
  );
}

// Not found error state
export function NotFoundErrorState({ resource = "Resource" }: { resource?: string }) {
  return (
    <ErrorState
      title={`${resource} Not Found`}
      message={`The ${resource.toLowerCase()} you're looking for doesn't exist or has been removed.`}
      variant="default"
    />
  );
}

