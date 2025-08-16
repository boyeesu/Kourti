import { createRoot } from 'react-dom/client'
// Import the main App component without a file extension so Vite/TS can resolve the .tsx file
import App from './App'
import '@/index.css'
import { ThemeProvider } from '@/hooks/useTheme'
// Import the ErrorBoundary component in the same way
import { ErrorBoundary } from './components/ErrorBoundary'
import { logInfo } from '@/lib/logger'
import { initCSRFProtection } from '@/lib/csrf'

// Initialize security features
initCSRFProtection();

// Initialize logger
logInfo('Application initialized', { 
  version: import.meta.env.VITE_APP_VERSION || '1.0.0',
  environment: import.meta.env.MODE,
  buildTime: import.meta.env.VITE_BUILD_TIME || new Date().toISOString()
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary
    fallbackRender={() => (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
        <div className="w-full max-w-md p-8 space-y-6 text-center bg-card rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-destructive">Application Error</h2>
          <p className="text-muted-foreground">
            The application encountered a critical error and cannot continue.
          </p>
          <div className="pt-4">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      </div>
    )}
  >
    <ThemeProvider defaultTheme="light" storageKey="kouti-legal-theme">
      <App />
    </ThemeProvider>
  </ErrorBoundary>
);
