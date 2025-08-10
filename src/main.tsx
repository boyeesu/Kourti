import { createRoot } from 'react-dom/client'
import App from '@/App'
import '@/index.css'
import { ThemeProvider } from '@/hooks/useTheme'

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="kouti-legal-theme">
    <App />
  </ThemeProvider>
);
