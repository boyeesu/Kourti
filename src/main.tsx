import { createRoot } from 'react-dom/client'
// Import the main App component without a file extension so Vite/TS can resolve the .tsx file
import App from './App'
import '@/index.css'
import { ThemeProvider } from '@/hooks/useTheme'
// Import the ErrorBoundary component in the same way
import { ErrorBoundary } from './components/ErrorBoundary'
import { logInfo } from '@/lib/logger'

logInfo('Logger initialized')

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <ThemeProvider defaultTheme="light" storageKey="kouti-legal-theme">
      <App />
    </ThemeProvider>
  </ErrorBoundary>
);
