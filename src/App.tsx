import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsProvider } from "@/components/ui/notifications";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { CasesProvider } from "@/context/CasesContext";
import { SearchProvider } from "@/hooks/use-search";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import OrganizationSetup from "@/components/OrganizationSetup";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import DashboardNew from "./pages/DashboardNew";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Cases from "./pages/Cases";
import CaseDetails from "./pages/CaseDetails";
import CaseCreate from "./pages/CaseCreate";
import CaseEdit from "./pages/CaseEdit";
import ClientCreate from "./pages/ClientCreate";
import ClientEdit from "./pages/ClientEdit";
import CaseActivities from "./pages/CaseActivitiesNew";
import Clients from "./pages/Clients";
import ClientDetails from "./pages/ClientDetails";
import BulkImport from "./pages/BulkImport";
import Calendar from "./pages/Calendar";
import Documents from "./pages/Documents";
import DocumentUpload from "./pages/DocumentUpload";
import Contracts from "./pages/Contracts";
import ContractCreate from "./pages/ContractCreate";
import ContractCompare from "./pages/ContractCompare";
import ContractView from "./pages/ContractView";
import ContractEdit from "./pages/ContractEdit";
import ContractHistory from "./pages/ContractHistory";
import ContractReview from "./pages/ContractReview";
import DocumentReview from "./pages/DocumentReview";
import UserManagement from "./pages/UserManagement";
import Settings from "./pages/Settings";
import ReamAI from "./pages/ReamAI";
import NotFound from "./pages/NotFound";
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import { Suspense, lazy, useEffect } from "react";
import { logInfo } from "./lib/logger";
import { ThemeProvider } from "@/hooks/useTheme";

// Lazy load pages for better performance
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceDetails = lazy(() => import('./pages/InvoiceDetails'));

// Create a query client with better defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30 * 1000, // 30 seconds
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  },
});

// Component to track page views for analytics
function PageViewTracker() {
  const location = useLocation();
  
  useEffect(() => {
    // Log page view for analytics
    logInfo('Page view', { 
      path: location.pathname,
      search: location.search
    });
  }, [location]);
  
  return null;
}

// Organization check component - will show organization setup if needed
function OrganizationCheck({ children }: { children: React.ReactNode }) {
  const { data: organizationId, isLoading } = useUserOrganization();
  
  if (isLoading) {
    return <LoadingFallback />;
  }
  
  // If no organization is found, show the setup page
  if (!organizationId) {
    return <OrganizationSetup />;
  }
  
  // Otherwise, render the children
  return <>{children}</>;
}

// Loading Fallback Component
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-muted-foreground animate-pulse">Loading...</p>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="kouti-legal-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <NotificationsProvider>
          <BrowserRouter>
            <PageViewTracker />
            <AuthProvider>
              <Routes>
                {/* Public routes - no layout */}
                <Route path="/auth" element={<Auth />} />
                
                {/* Protected routes with layout */}
                <Route path="/onboarding" element={
                  <ProtectedRoute>
                    <ModuleErrorBoundary name="Onboarding">
                      <Onboarding />
                    </ModuleErrorBoundary>
                  </ProtectedRoute>
                } />
                
                <Route path="/*" element={
                  <ProtectedRoute>
                    <OrganizationCheck>
                      <SearchProvider>
                        <CasesProvider>
                          <AppLayout>
                          <Routes>
                            {/* Dashboard */}
                            <Route path="/" element={
                              <ModuleErrorBoundary name="Dashboard">
                                <DashboardNew />
                              </ModuleErrorBoundary>
                            } />
                            <Route path="/dashboard" element={
                              <ModuleErrorBoundary name="Dashboard">
                                <DashboardNew />
                              </ModuleErrorBoundary>
                            } />
                          
                          {/* Cases Module */}
                          <Route path="/cases" element={
                            <ModuleErrorBoundary name="Cases">
                              <Cases />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/cases/create" element={
                            <ModuleErrorBoundary name="Case Create">
                              <CaseCreate />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/cases/:id" element={
                            <ModuleErrorBoundary name="Case Details">
                              <CaseDetails />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/cases/:id/edit" element={
                            <ModuleErrorBoundary name="Case Edit">
                              <CaseEdit />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/cases/:id/activities" element={
                            <ModuleErrorBoundary name="Case Activities">
                              <CaseActivities />
                            </ModuleErrorBoundary>
                          } />
                          
                          {/* Clients Module */}
                          <Route path="/clients" element={
                            <ModuleErrorBoundary name="Clients">
                              <Clients />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/clients/create" element={
                            <ModuleErrorBoundary name="Client Create">
                              <ClientCreate />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/clients/:clientId" element={
                            <ModuleErrorBoundary name="Client Details">
                              <ClientDetails />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/clients/:clientId/edit" element={
                            <ModuleErrorBoundary name="Client Edit">
                              <ClientEdit />
                            </ModuleErrorBoundary>
                          } />
                          
                          {/* Bulk Import */}
                          <Route path="/bulk-import" element={
                            <ModuleErrorBoundary name="Bulk Import">
                              <BulkImport />
                            </ModuleErrorBoundary>
                          } />
                          
                          {/* Calendar Module */}
                          <Route path="/calendar" element={
                            <ModuleErrorBoundary name="Calendar">
                              <Calendar />
                            </ModuleErrorBoundary>
                          } />
                          
                          {/* Documents Module */}
                          <Route path="/documents" element={
                            <ModuleErrorBoundary name="Documents">
                              <Documents />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/documents/upload" element={
                            <ModuleErrorBoundary name="Document Upload">
                              <DocumentUpload />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/documents/review" element={
                            <ModuleErrorBoundary name="Document Review">
                              <DocumentReview />
                            </ModuleErrorBoundary>
                          } />
                          
                          {/* Contracts Module */}
                          <Route path="/contracts" element={
                            <ModuleErrorBoundary name="Contracts">
                              <Contracts />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/contracts/create" element={
                            <ModuleErrorBoundary name="Contract Create">
                              <ContractCreate />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/contracts/compare" element={
                            <ModuleErrorBoundary name="Contract Compare">
                              <ContractCompare />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/contracts/:id" element={
                            <ModuleErrorBoundary name="Contract View">
                              <ContractView />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/contracts/:id/edit" element={
                            <ModuleErrorBoundary name="Contract Edit">
                              <ContractEdit />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/contracts/:id/history" element={
                            <ModuleErrorBoundary name="Contract History">
                              <ContractHistory />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/contracts/review" element={
                            <ModuleErrorBoundary name="Contract Review">
                              <ContractReview />
                            </ModuleErrorBoundary>
                          } />
                          
                          {/* AI Assistant */}
                          <Route path="/ream-ai" element={
                            <ModuleErrorBoundary name="Ream AI">
                              <ReamAI />
                            </ModuleErrorBoundary>
                          } />
                          
                          {/* Invoices Module (Lazy loaded) */}
                          <Route path="/invoices" element={
                            <ModuleErrorBoundary name="Invoices">
                              <Suspense fallback={<LoadingFallback />}>
                                <Invoices />
                              </Suspense>
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/invoices/:id" element={
                            <ModuleErrorBoundary name="Invoice Details">
                              <Suspense fallback={<LoadingFallback />}>
                                <InvoiceDetails />
                              </Suspense>
                            </ModuleErrorBoundary>
                          } />
                          
                          {/* User Management & Settings */}
                          <Route path="/users" element={
                            <ModuleErrorBoundary name="User Management">
                              <UserManagement />
                            </ModuleErrorBoundary>
                          } />
                          <Route path="/settings" element={
                            <ModuleErrorBoundary name="Settings">
                              <Settings />
                            </ModuleErrorBoundary>
                          } />
                          
                          {/* 404 Not Found */}
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                        </AppLayout>
                      </CasesProvider>
                    </SearchProvider>
                  </OrganizationCheck>
                </ProtectedRoute>
              } />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </NotificationsProvider>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
