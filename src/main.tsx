import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/index.css';
import { ThemeProvider } from '@/hooks/useTheme';
import { ErrorBoundary } from './components/ErrorBoundary';
import { logInfo, logError } from '@/lib/logger';
import { initCSRFProtection } from '@/lib/csrf';
import { AppError, ErrorCode } from '@/lib/error-handling';
import { env, validateEnv } from '@/lib/env';
import EnvironmentConfigError from '@/components/EnvironmentConfigError';

/**
 * Create a properly typed global error handler
 */
const handleGlobalError = (
  event: ErrorEvent | PromiseRejectionEvent,
  source: 'error' | 'unhandledrejection'
): void => {
  const error =
    source === 'error' ? (event as ErrorEvent).error : (event as PromiseRejectionEvent).reason;

  // Ignore AbortErrors — these are expected during component unmount/navigation
  if (error instanceof DOMException && error.name === 'AbortError') {
    event.preventDefault();
    return;
  }
  if (
    error?.name === 'AbortError' ||
    (typeof error === 'string' && error.includes('signal is aborted'))
  ) {
    event.preventDefault();
    return;
  }

  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  const stack = error instanceof Error ? error.stack || '' : '';

  // Transform to AppError for consistent error handling
  const appError =
    error instanceof AppError
      ? error
      : new AppError(message, ErrorCode.UNEXPECTED_ERROR, { source, stack }, error);

  // Log error to our logging system
  logError(`Global ${source}`, {
    message: appError.message,
    code: appError.code,
    details: appError.details,
    stack,
  });

  // Prevent default browser error handling in production
  if (env.NODE_ENV === 'production') {
    event.preventDefault();
  }
};

// Register global error handlers with proper typing
window.addEventListener('error', (event) => handleGlobalError(event, 'error'));
window.addEventListener('unhandledrejection', (event) =>
  handleGlobalError(event, 'unhandledrejection')
);

/**
 * Auto-recover from stale code-split chunks after a deploy.
 *
 * A new build changes the hashed asset filenames and the old chunks are removed
 * from the server. A tab left open across the deploy still references the old
 * hashes; lazy-loading a route then fails — Vite emits `vite:preloadError`, or a
 * bare `import()` rejects with "Failed to fetch dynamically imported module"
 * (the SPA rewrite serves index.html with a text/html MIME type for the missing
 * asset). A one-time full reload pulls the fresh index.html and current hashes.
 *
 * A 10s sessionStorage window guards against reload loops: if a chunk is
 * genuinely broken (not merely stale) the second failure within the window is
 * left to bubble to the ErrorBoundary instead of reloading forever.
 */
const STALE_CHUNK_RELOAD_KEY = 'kourti:stale-chunk-reload-at';

const reloadForStaleChunk = (): void => {
  const last = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) || 0);
  if (Date.now() - last < 10_000) return; // already reloaded recently — avoid a loop
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()));
  logInfo('Stale code-split chunk detected — reloading to fetch the latest build');
  window.location.reload();
};

const isStaleChunkError = (reason: unknown): boolean => {
  const message =
    reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  return /dynamically imported module|Importing a module script failed|module script failed/i.test(
    message
  );
};

// Vite's documented signal for a failed chunk preload.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  reloadForStaleChunk();
});

// Fallback: a bare import() failure surfaces as an unhandled rejection.
window.addEventListener('unhandledrejection', (event) => {
  if (isStaleChunkError(event.reason)) {
    event.preventDefault();
    reloadForStaleChunk();
  }
});

// Initialize security features with proper error handling
try {
  initCSRFProtection();
} catch (error) {
  const appError = new AppError(
    'Failed to initialize CSRF protection',
    ErrorCode.UNEXPECTED_ERROR,
    {},
    error
  );
  logError(appError.message, appError);
}

// Validate environment variables
const envValidation = validateEnv();
if (!envValidation.valid) {
  logError('Environment validation failed', { errors: envValidation.errors });
}

// Configure React Query client with better defaults and type safety
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
      // Transform errors to AppError for consistent handling
      throwOnError: (error: Error) =>
        error instanceof AppError && error.code !== ErrorCode.VALIDATION_ERROR,
    },
    mutations: {
      // Transform errors to AppError for consistent handling
      throwOnError: false,
    },
  },
});

// Initialize logger with proper typing
logInfo('Application initialized', {
  version: import.meta.env.VITE_APP_VERSION || '1.0.0',
  environment: env.NODE_ENV,
  buildTime: import.meta.env.VITE_BUILD_TIME || new Date().toISOString(),
});

// Force rebuild to resolve dependency timeout issue

// Find and validate root element with proper error handling
const container = document.getElementById('root');
if (!container) {
  throw new AppError(
    'Failed to find the root element. Please check your HTML.',
    ErrorCode.UNEXPECTED_ERROR
  );
}

// Initialize React 18 with new root API
const root = ReactDOM.createRoot(container);

/**
 * Error Boundary fallback component with proper typing
 */
interface ErrorBoundaryFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
const ErrorBoundaryFallback: React.FC<ErrorBoundaryFallbackProps> = ({
  error,
  resetErrorBoundary,
}) => (
  <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
    <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-lg">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-destructive">Application Error</h2>
        <p className="text-muted-foreground mt-2">
          The application encountered a critical error and cannot continue.
        </p>
        {env.NODE_ENV === 'development' && error && (
          <div className="mt-4 p-4 bg-muted rounded-md text-left overflow-auto max-h-32">
            <p className="text-sm font-mono text-destructive">{error.message}</p>
            {error instanceof AppError && (
              <p className="text-xs font-mono text-muted-foreground mt-2">
                Error code: {error.code}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="pt-4 flex justify-center space-x-4">
        <button
          onClick={() => (window.location.href = '/')}
          className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md shadow hover:bg-secondary/90 transition-colors"
        >
          Go to Home
        </button>
        <button
          onClick={() => {
            resetErrorBoundary();
            window.location.reload();
          }}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 transition-colors"
        >
          Reload Application
        </button>
      </div>
    </div>
  </div>
);

const renderApp = async () => {
  const { default: App } = await import('./App');

  root.render(
    <React.StrictMode>
      <ErrorBoundary fallbackRender={(props) => <ErrorBoundaryFallback {...props} />}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="light" storageKey="kourti-legal-theme">
            <App />
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
};

if (!envValidation.valid) {
  root.render(
    <React.StrictMode>
      <EnvironmentConfigError missingVariables={envValidation.missingVariables} />
    </React.StrictMode>
  );
} else {
  renderApp().catch((error) => {
    // Log full error details for debugging
    const errorDetails = {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      name: error?.name,
      error: error,
    };
    logError('Failed to load application bundle', errorDetails);
    console.error('Application bundle load error:', error);

    root.render(
      <React.StrictMode>
        <EnvironmentConfigError missingVariables={envValidation.missingVariables} />
      </React.StrictMode>
    );
  });
}
