import { Component, ErrorInfo, ReactNode } from 'react';
import { logError } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { sanitizeErrorForLogging } from '@/lib/utils';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  fallbackRender?: (props: { error: Error; resetErrorBoundary: () => void }) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Enhanced Error Boundary component with customizable fallback UI
 * and error reset capability.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { 
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error) {
    return { 
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to our error reporting service
    logError(error.message, { 
      error: sanitizeErrorForLogging(error), 
      errorInfo,
      location: window.location.href
    });
  }

  resetErrorBoundary = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  }

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, fallbackRender } = this.props;

    if (hasError && error) {
      if (fallbackRender) {
        return fallbackRender({ 
          error, 
          resetErrorBoundary: this.resetErrorBoundary 
        });
      }

      if (fallback) {
        return fallback;
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-muted/20 rounded-lg">
          <h2 className="text-2xl font-bold text-destructive mb-4">Something went wrong</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            An unexpected error occurred. Our team has been notified.
          </p>
          <div className="space-y-2">
            <Button 
              onClick={() => window.location.reload()}
              variant="outline"
              className="mr-2"
            >
              Refresh Page
            </Button>
            <Button 
              onClick={this.resetErrorBoundary}
            >
              Try Again
            </Button>
          </div>
          <div className="mt-8 p-4 bg-muted/30 rounded text-left max-w-lg overflow-auto">
            <p className="text-sm font-mono text-muted-foreground">
              {error.name}: {error.message}
            </p>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Module-level Error Boundary component for use within individual features/modules
 */
export function ModuleErrorBoundary({ 
  children, 
  name,
  onReset 
}: { 
  children: ReactNode; 
  name: string;
  onReset?: () => void;
}) {
  return (
    <ErrorBoundary
      onReset={onReset}
      fallbackRender={({ resetErrorBoundary }) => (
        <div className="flex flex-col items-center justify-center p-6 border rounded-lg bg-muted/20">
          <h3 className="text-xl font-semibold mb-2">Error in {name}</h3>
          <p className="text-muted-foreground mb-4">
            This section encountered an error.
          </p>
          <Button onClick={resetErrorBoundary}>
            Retry
          </Button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
