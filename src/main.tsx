import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import '@/index.css';
import { ThemeProvider } from '@/hooks/useTheme';
import { ErrorBoundary } from './components/ErrorBoundary';
import { logInfo, logError } from '@/lib/logger';
import { initCSRFProtection } from '@/lib/csrf';

// Create a global error handler
const handleGlobalError = (
  event: ErrorEvent | PromiseRejectionEvent, 
  source: 'error' | 'unhandledrejection'
) => {
  const error = source === 'error' 
    ? (event as ErrorEvent).error 
    : (event as PromiseRejectionEvent).reason;
  
  const message = error?.message || 'Unknown error occurred';
  const stack = error?.stack || '';
  
  // Log error to our logging system
  logError(`Global ${source}`, { message, stack });
  
  // Prevent default browser error handling in production
  if (import.meta.env.PROD) {
    event.preventDefault();
  }
};

// Register global error handlers
window.addEventListener('error', (event) => handleGlobalError(event, 'error'));
window.addEventListener('unhandledrejection', (event) => handleGlobalError(event, 'unhandledrejection'));

// Initialize security features
try {
  initCSRFProtection();
} catch (error) {
  logError('Failed to initialize CSRF protection', error);
}

// Configure React Query client with better defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
      onError: (err) => {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
        logError('Query error', { message: errorMessage });
      }
    },
    mutations: {
      onError: (err) => {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
        logError('Mutation error', { message: errorMessage });
      }
    }
  }
});

// Initialize logger
logInfo('Application initialized', { 
  version: import.meta.env.VITE_APP_VERSION || '1.0.0',
  environment: import.meta.env.MODE,
  buildTime: import.meta.env.VITE_BUILD_TIME || new Date().toISOString()
});

// Find and validate root element
const container = document.getElementById('root');
if (!container) {
  throw new Error("Failed to find the root element. Please check your HTML.");
}

// Initialize React 18 with new root API
const root = ReactDOM.createRoot(container);

// Render the application
root.render(
  <React.StrictMode>
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
          <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-lg">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-destructive">Application Error</h2>
              <p className="text-muted-foreground mt-2">
                The application encountered a critical error and cannot continue.
              </p>
              {import.meta.env.DEV && error && (
                <div className="mt-4 p-4 bg-muted rounded-md text-left overflow-auto max-h-32">
                  <p className="text-sm font-mono text-destructive">{error.message}</p>
                </div>
              )}
            </div>
            <div className="pt-4 flex justify-center space-x-4">
              <button
                onClick={() => window.location.href = '/'}
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
      )}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light" storageKey="kouti-legal-theme">
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);