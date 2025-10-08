import React, { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificationsProvider } from "@/components/ui/notifications";
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PermissionGate } from "@/components/PermissionGate";
import { Action, Resource } from "@/hooks/usePermissions";
import OrganizationSetup from "@/components/OrganizationSetup";
import { CasesProvider } from "@/context/CasesContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SearchProvider } from "@/hooks/use-search";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
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
import Unauthorized from "./pages/Unauthorized";
import { logInfo, logWarn } from "./lib/logger";
// ThemeProvider removed - now handled in main.tsx

// Lazy load pages for better performance
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceCreate = lazy(() => import('./pages/InvoiceCreate'));
const InvoiceDetails = lazy(() => import('./pages/InvoiceDetails'));
const Analytics = lazy(() => import('./pages/Analytics'));
const HelpCenter = lazy(() => import('./pages/HelpCenter'));
const ContractUpload = lazy(() => import('./pages/ContractUpload'));

type ProtectedRouteConfig = {
  path: string;
  component: React.ComponentType;
  boundaryName?: string;
  suspense?: boolean;
  permission?: {
    resource: Resource;
    action: Action;
  };
};

const protectedRoutes: ProtectedRouteConfig[] = [
  { path: '/', component: DashboardNew, boundaryName: 'Dashboard', permission: { resource: 'cases', action: 'read' } },
  { path: '/dashboard', component: DashboardNew, boundaryName: 'Dashboard', permission: { resource: 'cases', action: 'read' } },
  { path: '/cases', component: Cases, boundaryName: 'Cases', permission: { resource: 'cases', action: 'read' } },
  { path: '/cases/create', component: CaseCreate, boundaryName: 'Case Create', permission: { resource: 'cases', action: 'create' } },
  { path: '/cases/:id', component: CaseDetails, boundaryName: 'Case Details', permission: { resource: 'cases', action: 'read' } },
  { path: '/cases/:id/edit', component: CaseEdit, boundaryName: 'Case Edit', permission: { resource: 'cases', action: 'update' } },
  { path: '/cases/:id/activities', component: CaseActivities, boundaryName: 'Case Activities', permission: { resource: 'cases', action: 'read' } },
  { path: '/matters', component: Cases, boundaryName: 'Matters', permission: { resource: 'cases', action: 'read' } },
  { path: '/matters/create', component: CaseCreate, boundaryName: 'Matter Create', permission: { resource: 'cases', action: 'create' } },
  { path: '/matters/:id', component: CaseDetails, boundaryName: 'Matter Details', permission: { resource: 'cases', action: 'read' } },
  { path: '/matters/:id/edit', component: CaseEdit, boundaryName: 'Matter Edit', permission: { resource: 'cases', action: 'update' } },
  { path: '/matters/:id/activities', component: CaseActivities, boundaryName: 'Matter Activities', permission: { resource: 'cases', action: 'read' } },
  { path: '/clients', component: Clients, boundaryName: 'Clients', permission: { resource: 'clients', action: 'read' } },
  { path: '/clients/create', component: ClientCreate, boundaryName: 'Client Create', permission: { resource: 'clients', action: 'create' } },
  { path: '/clients/:clientId', component: ClientDetails, boundaryName: 'Client Details', permission: { resource: 'clients', action: 'read' } },
  { path: '/clients/:clientId/edit', component: ClientEdit, boundaryName: 'Client Edit', permission: { resource: 'clients', action: 'update' } },
  { path: '/calendar', component: Calendar, boundaryName: 'Calendar', permission: { resource: 'calendars', action: 'read' } },
  { path: '/documents', component: Documents, boundaryName: 'Documents', permission: { resource: 'documents', action: 'read' } },
  { path: '/documents/upload', component: DocumentUpload, boundaryName: 'Document Upload', permission: { resource: 'documents', action: 'create' } },
  { path: '/documents/review', component: DocumentReview, boundaryName: 'Document Review', permission: { resource: 'documents', action: 'update' } },
  { path: '/contracts', component: Contracts, boundaryName: 'Contracts', permission: { resource: 'contracts', action: 'read' } },
  { path: '/contracts/create', component: ContractCreate, boundaryName: 'Contract Create', permission: { resource: 'contracts', action: 'create' } },
  { path: '/contracts/upload', component: ContractUpload, boundaryName: 'Contract Upload', suspense: true, permission: { resource: 'contracts', action: 'create' } },
  { path: '/contracts/compare', component: ContractCompare, boundaryName: 'Contract Compare', permission: { resource: 'contracts', action: 'read' } },
  { path: '/contracts/:id', component: ContractView, boundaryName: 'Contract View', permission: { resource: 'contracts', action: 'read' } },
  { path: '/contracts/:id/edit', component: ContractEdit, boundaryName: 'Contract Edit', permission: { resource: 'contracts', action: 'update' } },
  { path: '/contracts/:id/history', component: ContractHistory, boundaryName: 'Contract History', permission: { resource: 'contracts', action: 'read' } },
  { path: '/contracts/review', component: ContractReview, boundaryName: 'Contract Review', permission: { resource: 'contracts', action: 'update' } },
  { path: '/invoices', component: Invoices, boundaryName: 'Invoices', suspense: true, permission: { resource: 'invoices', action: 'read' } },
  { path: '/invoices/create', component: InvoiceCreate, boundaryName: 'Invoice Create', suspense: true, permission: { resource: 'invoices', action: 'create' } },
  { path: '/invoices/:id', component: InvoiceDetails, boundaryName: 'Invoice Details', suspense: true, permission: { resource: 'invoices', action: 'read' } },
  { path: '/analytics', component: Analytics, boundaryName: 'Analytics', suspense: true, permission: { resource: 'cases', action: 'manage' } },
  { path: '/ream-ai', component: ReamAI, boundaryName: 'Ream AI', permission: { resource: 'documents', action: 'read' } },
  { path: '/voice-recorder', component: VoiceRecorder, boundaryName: 'Voice Recorder', permission: { resource: 'documents', action: 'create' } },
  { path: '/transcriptions', component: TranscriptionsList, boundaryName: 'Transcriptions List', permission: { resource: 'documents', action: 'read' } },
  { path: '/transcriptions/:id', component: TranscriptionView, boundaryName: 'Transcription View', permission: { resource: 'documents', action: 'read' } },
  { path: '/bulk-import', component: BulkImport, boundaryName: 'Bulk Import', permission: { resource: 'documents', action: 'manage' } },
  { path: '/help-center', component: HelpCenter, boundaryName: 'Help Center', suspense: true },
  { path: '/users', component: UserManagement, boundaryName: 'User Management', permission: { resource: 'users', action: 'manage' } },
  { path: '/settings', component: Settings, boundaryName: 'Settings', permission: { resource: 'settings', action: 'manage' } },
  { path: '*', component: NotFound },
];

function createRouteElement({ component: Component, boundaryName, suspense, permission }: ProtectedRouteConfig) {
  const content = suspense ? (
    <Suspense fallback={<LoadingFallback />}>
      <Component />
    </Suspense>
  ) : (
    <Component />
  );

  const wrappedContent = boundaryName ? (
    <ModuleErrorBoundary name={boundaryName}>
      {content}
    </ModuleErrorBoundary>
  ) : content;

  if (!permission) {
    return wrappedContent;
  }

  return (
    <PermissionGate
      resource={permission.resource}
      action={permission.action}
      fallback={<Unauthorized />}
    >
      {wrappedContent}
    </PermissionGate>
  );
}

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

  if (import.meta.env.DEV) {
    logInfo('Organization check status', {
      isLoading,
      organizationId,
      hasError: Boolean(error),
    });
  }

  if (isLoading) {
    return <LoadingFallback />;
  }

  if (error) {
    logWarn('Organization check failed', { error });
    return <OrganizationSetup />;
  }

  if (!organizationId) {
    logWarn('Organization missing for current user');
    return <OrganizationSetup />;
  }

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
function InactivityHandler() {
  const { signOut } = useAuth();
  useInactivityLogout({ onLogout: signOut });
  return null;
}

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <NotificationsProvider>
      <BrowserRouter>
        <PageViewTracker />
        <AuthProvider>
          <InactivityHandler />
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route
                  path="/onboarding"
                  element={(
                    <ProtectedRoute>
                      <ModuleErrorBoundary name="Onboarding">
                        <Onboarding />
                      </ModuleErrorBoundary>
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="/*"
                  element={(
                    <ProtectedRoute>
                      <OrganizationCheck>
                        <SearchProvider>
                          <CasesProvider>
                            <AppLayout>
                              <Routes>
                                {protectedRoutes.map((route) => (
                                  <Route
                                    key={route.path}
                                    path={route.path}
                                    element={createRouteElement(route)}
                                  />
                                ))}
                              </Routes>
                            </AppLayout>
                          </CasesProvider>
                        </SearchProvider>
                      </OrganizationCheck>
                    </ProtectedRoute>
                  )}
                />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </NotificationsProvider>
      </TooltipProvider>
);

export default App;