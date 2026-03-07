import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NotificationsProvider } from '@/components/ui/notifications';
import { ModuleErrorBoundary } from '@/components/ErrorBoundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PermissionGate } from '@/components/PermissionGate';
import { Action, Resource } from '@/hooks/usePermissions';
import OrganizationSetup from '@/components/OrganizationSetup';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { SearchProvider } from '@/hooks/use-search';
import { useInactivityLogout } from '@/hooks/useInactivityLogout';
import { useUserOrganization } from '@/hooks/useUserOrganization';
// All pages lazy-loaded for code splitting
import { logInfo, logWarn } from './lib/logger';
import { FloatingChatWidget } from '@/components/ream-ai/FloatingChatWidget';
import { SuperAdminRoute } from '@/components/SuperAdminRoute';
// LiveChat overlay removed - now using LiveChatPage as a proper route
// ThemeProvider removed - now handled in main.tsx

// Lazy load all pages for code splitting
const DashboardNew = lazy(() => import('./pages/DashboardNew'));
const Auth = lazy(() => import('./pages/Auth'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Cases = lazy(() => import('./pages/Cases'));
const CaseDetails = lazy(() => import('./pages/CaseDetails'));
const CaseCreate = lazy(() => import('./pages/CaseCreate'));
const CaseEdit = lazy(() => import('./pages/CaseEdit'));
const ClientCreate = lazy(() => import('./pages/ClientCreate'));
const ClientEdit = lazy(() => import('./pages/ClientEdit'));
const CaseActivities = lazy(() => import('./pages/CaseActivitiesNew'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientDetails = lazy(() => import('./pages/ClientDetails'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Documents = lazy(() => import('./pages/Documents'));
const DocumentUpload = lazy(() => import('./pages/DocumentUpload'));
const Contracts = lazy(() => import('./pages/Contracts'));
const ContractCreate = lazy(() => import('./pages/ContractCreate'));
const ContractCompare = lazy(() => import('./pages/ContractCompare'));
const ContractView = lazy(() => import('./pages/ContractView'));
const ContractEdit = lazy(() => import('./pages/ContractEdit'));
const ContractHistory = lazy(() => import('./pages/ContractHistory'));
const ContractReview = lazy(() => import('./pages/ContractReview'));
const ContractUpload = lazy(() => import('./pages/ContractUpload'));
const DocumentReview = lazy(() => import('./pages/DocumentReview'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Settings = lazy(() => import('./pages/Settings'));
const ReamAI = lazy(() => import('./pages/ReamAI'));
const VoiceRecorder = lazy(() => import('./pages/VoiceRecorder'));
const TranscriptionView = lazy(() => import('./pages/TranscriptionView'));
const TranscriptionsList = lazy(() => import('./pages/TranscriptionsList'));
const BulkImport = lazy(() => import('./pages/BulkImport'));
const LiveChatPage = lazy(() => import('./pages/LiveChatPage'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Unauthorized = lazy(() => import('./pages/Unauthorized'));
const ThanosDashboard = lazy(() => import('./pages/ThanosDashboard'));
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceCreate = lazy(() => import('./pages/InvoiceCreate'));
const InvoiceDetails = lazy(() => import('./pages/InvoiceDetails'));
const Analytics = lazy(() => import('./pages/Analytics'));
const HelpCenter = lazy(() => import('./pages/HelpCenter'));
const Changelog = lazy(() => import('./pages/Changelog'));

type ProtectedRouteConfig = {
  path: string;
  component: React.ComponentType;
  boundaryName?: string;
  permission?: {
    resource: Resource;
    action: Action;
  };
};

const protectedRoutes: ProtectedRouteConfig[] = [
  {
    path: '/',
    component: DashboardNew,
    boundaryName: 'Dashboard',
    permission: { resource: 'cases', action: 'read' },
  },
  {
    path: '/dashboard',
    component: DashboardNew,
    boundaryName: 'Dashboard',
    permission: { resource: 'cases', action: 'read' },
  },
  {
    path: '/cases',
    component: Cases,
    boundaryName: 'Cases',
    permission: { resource: 'cases', action: 'read' },
  },
  {
    path: '/cases/create',
    component: CaseCreate,
    boundaryName: 'Case Create',
    permission: { resource: 'cases', action: 'create' },
  },
  {
    path: '/cases/:id',
    component: CaseDetails,
    boundaryName: 'Case Details',
    permission: { resource: 'cases', action: 'read' },
  },
  {
    path: '/cases/:id/edit',
    component: CaseEdit,
    boundaryName: 'Case Edit',
    permission: { resource: 'cases', action: 'update' },
  },
  {
    path: '/cases/:id/activities',
    component: CaseActivities,
    boundaryName: 'Case Activities',
    permission: { resource: 'cases', action: 'read' },
  },
  {
    path: '/matters',
    component: Cases,
    boundaryName: 'Matters',
    permission: { resource: 'cases', action: 'read' },
  },
  {
    path: '/matters/create',
    component: CaseCreate,
    boundaryName: 'Matter Create',
    permission: { resource: 'cases', action: 'create' },
  },
  {
    path: '/matters/:id',
    component: CaseDetails,
    boundaryName: 'Matter Details',
    permission: { resource: 'cases', action: 'read' },
  },
  {
    path: '/matters/:id/edit',
    component: CaseEdit,
    boundaryName: 'Matter Edit',
    permission: { resource: 'cases', action: 'update' },
  },
  {
    path: '/matters/:id/activities',
    component: CaseActivities,
    boundaryName: 'Matter Activities',
    permission: { resource: 'cases', action: 'read' },
  },
  {
    path: '/clients',
    component: Clients,
    boundaryName: 'Clients',
    permission: { resource: 'clients', action: 'read' },
  },
  {
    path: '/clients/create',
    component: ClientCreate,
    boundaryName: 'Client Create',
    permission: { resource: 'clients', action: 'create' },
  },
  {
    path: '/clients/:clientId',
    component: ClientDetails,
    boundaryName: 'Client Details',
    permission: { resource: 'clients', action: 'read' },
  },
  {
    path: '/clients/:clientId/edit',
    component: ClientEdit,
    boundaryName: 'Client Edit',
    permission: { resource: 'clients', action: 'update' },
  },
  {
    path: '/calendar',
    component: Calendar,
    boundaryName: 'Calendar',
    permission: { resource: 'calendars', action: 'read' },
  },
  {
    path: '/documents',
    component: Documents,
    boundaryName: 'Documents',
    permission: { resource: 'documents', action: 'read' },
  },
  {
    path: '/documents/upload',
    component: DocumentUpload,
    boundaryName: 'Document Upload',
    permission: { resource: 'documents', action: 'create' },
  },
  {
    path: '/documents/review',
    component: DocumentReview,
    boundaryName: 'Document Review',
    permission: { resource: 'documents', action: 'update' },
  },
  {
    path: '/contracts',
    component: Contracts,
    boundaryName: 'Contracts',
    permission: { resource: 'contracts', action: 'read' },
  },
  {
    path: '/contracts/create',
    component: ContractCreate,
    boundaryName: 'Contract Create',
    permission: { resource: 'contracts', action: 'create' },
  },
  {
    path: '/contracts/upload',
    component: ContractUpload,
    boundaryName: 'Contract Upload',
    permission: { resource: 'contracts', action: 'create' },
  },
  {
    path: '/contracts/compare',
    component: ContractCompare,
    boundaryName: 'Contract Compare',
    permission: { resource: 'contracts', action: 'read' },
  },
  {
    path: '/contracts/:id',
    component: ContractView,
    boundaryName: 'Contract View',
    permission: { resource: 'contracts', action: 'read' },
  },
  {
    path: '/contracts/:id/edit',
    component: ContractEdit,
    boundaryName: 'Contract Edit',
    permission: { resource: 'contracts', action: 'update' },
  },
  {
    path: '/contracts/:id/history',
    component: ContractHistory,
    boundaryName: 'Contract History',
    permission: { resource: 'contracts', action: 'read' },
  },
  {
    path: '/contracts/review',
    component: ContractReview,
    boundaryName: 'Contract Review',
    permission: { resource: 'contracts', action: 'update' },
  },
  {
    path: '/invoices',
    component: Invoices,
    boundaryName: 'Invoices',
    permission: { resource: 'invoices', action: 'read' },
  },
  {
    path: '/invoices/create',
    component: InvoiceCreate,
    boundaryName: 'Invoice Create',
    permission: { resource: 'invoices', action: 'create' },
  },
  {
    path: '/invoices/:id',
    component: InvoiceDetails,
    boundaryName: 'Invoice Details',
    permission: { resource: 'invoices', action: 'read' },
  },
  {
    path: '/analytics',
    component: Analytics,
    boundaryName: 'Analytics',
    permission: { resource: 'cases', action: 'manage' },
  },
  {
    path: '/ream-ai',
    component: ReamAI,
    boundaryName: 'Ream AI',
    permission: { resource: 'documents', action: 'read' },
  },
  {
    path: '/voice-recorder',
    component: VoiceRecorder,
    boundaryName: 'Voice Recorder',
    permission: { resource: 'documents', action: 'create' },
  },
  {
    path: '/transcriptions',
    component: TranscriptionsList,
    boundaryName: 'Transcriptions List',
    permission: { resource: 'documents', action: 'read' },
  },
  {
    path: '/transcriptions/:id',
    component: TranscriptionView,
    boundaryName: 'Transcription View',
    permission: { resource: 'documents', action: 'read' },
  },
  {
    path: '/bulk-import',
    component: BulkImport,
    boundaryName: 'Bulk Import',
    permission: { resource: 'documents', action: 'manage' },
  },
  { path: '/live-chat', component: LiveChatPage, boundaryName: 'Live Chat' },
  { path: '/help-center', component: HelpCenter, boundaryName: 'Help Center' },
  { path: '/changelog', component: Changelog, boundaryName: 'Changelog' },
  {
    path: '/users',
    component: UserManagement,
    boundaryName: 'User Management',
    permission: { resource: 'users', action: 'manage' },
  },
  {
    path: '/settings',
    component: Settings,
    boundaryName: 'Settings',
    permission: { resource: 'settings', action: 'manage' },
  },
  { path: '*', component: NotFound },
];

function createRouteElement({
  component: Component,
  boundaryName,
  permission,
}: ProtectedRouteConfig) {
  const content = (
    <Suspense fallback={<LoadingFallback />}>
      <Component />
    </Suspense>
  );

  const wrappedContent = boundaryName ? (
    <ModuleErrorBoundary name={boundaryName}>{content}</ModuleErrorBoundary>
  ) : (
    content
  );

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
      search: location.search,
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

// Password change check component - shown after org check
function PasswordChangeCheck({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mustChangePassword, setMustChangePassword] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function checkPasswordStatus() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await import('@/integrations/supabase/client').then((m) =>
          m.supabase.from('profiles').select('must_change_password').eq('user_id', user.id).single()
        );

        if (error) {
          logWarn('Failed to check password status', { error });
          setMustChangePassword(false); // Don't block on error
        } else if (data) {
          setMustChangePassword(data.must_change_password ?? false);
        } else {
          setMustChangePassword(false);
        }
      } catch (err) {
        logWarn('Password check failed', { err });
        setMustChangePassword(false);
      } finally {
        setLoading(false);
      }
    }

    checkPasswordStatus();
  }, [user?.id]);

  if (loading) {
    return <LoadingFallback />;
  }

  if (mustChangePassword) {
    return <ForcePasswordChange onPasswordChanged={() => setMustChangePassword(false)} />;
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
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PageViewTracker />
        <AuthProvider>
          <InactivityHandler />
          <Routes>
            <Route
              path="/auth"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <Auth />
                </Suspense>
              }
            />
            <Route
              path="/auth/callback"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <AuthCallback />
                </Suspense>
              }
            />
            <Route
              path="/auth/set-password"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <SetPassword />
                </Suspense>
              }
            />
            <Route
              path="/auth/reset-password"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <ResetPassword />
                </Suspense>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <ForgotPassword />
                </Suspense>
              }
            />
            <Route
              path="/login"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <Login />
                </Suspense>
              }
            />
            <Route
              path="/register"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <Register />
                </Suspense>
              }
            />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<LoadingFallback />}>
                    <ModuleErrorBoundary name="Onboarding">
                      <Onboarding />
                    </ModuleErrorBoundary>
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/thanos/*"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <SuperAdminRoute>
                    <ModuleErrorBoundary name="Thanos Dashboard">
                      <ThanosDashboard />
                    </ModuleErrorBoundary>
                  </SuperAdminRoute>
                </Suspense>
              }
            />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <OrganizationCheck>
                    <PasswordChangeCheck>
                      <SearchProvider>
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
                          <FloatingChatWidget />
                        </AppLayout>
                      </SearchProvider>
                    </PasswordChangeCheck>
                  </OrganizationCheck>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </NotificationsProvider>
  </TooltipProvider>
);

export default App;
