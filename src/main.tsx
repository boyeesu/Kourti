import { createRoot } from 'react-dom/client'
import App from './App.js'
import '@/index.css'
import { ThemeProvider } from '@/hooks/useTheme'
import { ErrorBoundary } from './components/ErrorBoundary.js'
import { logInfo } from '@/lib/logger'

logInfo('Logger initialized')

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <ThemeProvider defaultTheme="light" storageKey="kouti-legal-theme">
      <App />
    </ThemeProvider>
  </ErrorBoundary>
);
