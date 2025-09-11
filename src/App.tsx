import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
// QueryClient removed - now handled in main.tsx
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
import VoiceRecorder from "./pages/VoiceRecorder";
import TranscriptionView from "./pages/TranscriptionView";
import TranscriptionsList from "./pages/TranscriptionsList";
import BulkImport from "./pages/BulkImport";
import NotFound from "./pages/NotFound";
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import { Suspense, lazy, useEffect } from "react";
import { logInfo } from "./lib/logger";
// ThemeProvider removed - now handled in main.tsx

// Lazy load pages for better performance
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceCreate = lazy(() => import('./pages/InvoiceCreate'));
const InvoiceDetails = lazy(() => import('./pages/InvoiceDetails'));
const Analytics = lazy(() => import('./pages/Analytics'));
const HelpCenter = lazy(() => import('./pages/HelpCenter'));

// Component to track page views for analytics
function PageViewTracker() {
  const location = useLocation();
  
  useEffect(() => {
    logInfo('Page view', { 
      path: location.pathname,
      search: location.search
    });
  }, [location]);
  
  return null;
}

// Organization check component
function OrganizationCheck({ children }: { children: React.ReactNode }) {
  const { data: organizationId, isLoading, error } = useUserOrganization();
  
  console.log('🏢 OrganizationCheck - Loading:', isLoading, 'OrgId:', organizationId, 'Error:', error);
  
  if (isLoading) {
    console.log('🏢 OrganizationCheck: Showing loading fallback');
    return <LoadingFallback />;
  }

  if (error) {
    console.log('🏢 OrganizationCheck: Error detected, showing organization setup');
    return <OrganizationSetup />;
  }
  
  if (!organizationId) {
    console.log('🏢 OrganizationCheck: No organization ID, showing setup');
    return <OrganizationSetup />;
  }
  
  console.log('🏢 OrganizationCheck: Organization found, rendering children');
  return <>{children}</>;
}

// Loading Fallback Component
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-muted-foreground animate-pulse">Loading your workspace...</p>
        <p className="text-xs text-muted-foreground/60">This should only take a moment</p>
      </div>
    </div>
  );
}

// App Component
const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <NotificationsProvider>
      <BrowserRouter>
        <PageViewTracker />
        <AuthProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/auth" element={<Auth />} />
                
                {/* Onboarding */}
                <Route path="/onboarding" element={
                  <ProtectedRoute>
                    <ModuleErrorBoundary name="Onboarding">
                      <Onboarding />
                    </ModuleErrorBoundary>
                  </ProtectedRoute>
                } />
                
                {/* Protected routes */}
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
                              
                              {/* Invoices Module (Lazy loaded) */}
                              <Route path="/invoices" element={
                                <ModuleErrorBoundary name="Invoices">
                                  <Suspense fallback={<LoadingFallback />}>
                                    <Invoices />
                                  </Suspense>
                                </ModuleErrorBoundary>
                              } />
                              <Route path="/invoices/create" element={
                                <ModuleErrorBoundary name="Invoice Create">
                                  <Suspense fallback={<LoadingFallback />}>
                                    <InvoiceCreate />
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
                              
                               {/* Analytics */}
                              <Route path="/analytics" element={
                                <ModuleErrorBoundary name="Analytics">
                                  <Suspense fallback={<LoadingFallback />}>
                                    <Analytics />
                                  </Suspense>
                                </ModuleErrorBoundary>
                              } />
                              
                              {/* AI Assistant */}
                              <Route path="/ream-ai" element={
                                <ModuleErrorBoundary name="Ream AI">
                                  <ReamAI />
                                </ModuleErrorBoundary>
                              } />
                              
                              {/* Voice Recorder */}
                              <Route path="/voice-recorder" element={
                                <ModuleErrorBoundary name="Voice Recorder">
                                  <VoiceRecorder />
                                </ModuleErrorBoundary>
                              } />
                              
                              {/* Transcriptions */}
                              <Route path="/transcriptions" element={
                                <ModuleErrorBoundary name="Transcriptions List">
                                  <TranscriptionsList />
                                </ModuleErrorBoundary>
                              } />
                              
                              <Route path="/transcriptions/:id" element={
                                <ModuleErrorBoundary name="Transcription View">
                                  <TranscriptionView />
                                </ModuleErrorBoundary>
                              } />
                              
                              {/* Bulk Import */}
                              <Route path="/bulk-import" element={
                                <ModuleErrorBoundary name="Bulk Import">
                                  <BulkImport />
                                </ModuleErrorBoundary>
                              } />
                              
                              {/* Help Center */}
                              <Route path="/help-center" element={
                                <ModuleErrorBoundary name="Help Center">
                                  <Suspense fallback={<LoadingFallback />}>
                                    <HelpCenter />
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
);

export default App;