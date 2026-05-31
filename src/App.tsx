import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NotificationsProvider } from '@/components/ui/notifications';
import { ModuleErrorBoundary } from '@/components/ErrorBoundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PermissionGate } from '@/components/PermissionGate';
import { FeatureGate } from '@/components/billing/FeatureGate';
import type { FeatureKey } from '@/hooks/useEntitlements';
import { Action, Resource } from '@/hooks/usePermissions';
import OrganizationSetup from '@/components/OrganizationSetup';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { PortalAuthProvider } from '@/portal/PortalAuthContext';
import { PortalProtectedRoute } from '@/portal/PortalProtectedRoute';
import { PortalLayout } from '@/portal/PortalLayout';
import { SearchProvider } from '@/hooks/use-search';
import { useInactivityLogout } from '@/hooks/useInactivityLogout';
import { useUserOrganization } from '@/hooks/useUserOrganization';
// All pages lazy-loaded for code splitting
import { logInfo, logWarn, sanitizeUrl } from './lib/logger';
import { SuperAdminRoute } from '@/components/SuperAdminRoute';
import { CookieConsent } from '@/components/CookieConsent';
import { MessageCircle } from 'lucide-react';
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
const AgentJobs = lazy(() => import('./pages/AgentJobs'));
const AgentJobDetails = lazy(() => import('./pages/AgentJobDetails'));
const AgentMonitors = lazy(() => import('./pages/AgentMonitors'));
const AgentApprovals = lazy(() => import('./pages/AgentApprovals'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'));
const NegotiationsPage = lazy(() => import('./pages/Negotiations'));
const NegotiationDetails = lazy(() => import('./pages/NegotiationDetails'));
const IntelligenceDashboard = lazy(() => import('./pages/IntelligenceDashboard'));
const TabularReviews = lazy(() => import('./pages/TabularReviews'));
const TabularReviewCreate = lazy(() => import('./pages/TabularReviewCreate'));
const TabularReviewDetail = lazy(() => import('./pages/TabularReviewDetail'));
const DocumentRedline = lazy(() => import('./pages/DocumentRedline'));
const HelpCenter = lazy(() => import('./pages/HelpCenter'));
const Changelog = lazy(() => import('./pages/Changelog'));
const Pricing = lazy(() => import('./pages/Pricing'));
const BillingCallback = lazy(() => import('./pages/BillingCallback'));

// Client Portal (separate auth surface — see src/portal/)
const PortalLogin = lazy(() => import('./portal/pages/PortalLogin'));
const PortalAcceptInvite = lazy(() => import('./portal/pages/PortalAcceptInvite'));
const PortalForgotPassword = lazy(() => import('./portal/pages/PortalForgotPassword'));
const PortalResetPassword = lazy(() => import('./portal/pages/PortalResetPassword'));
const PortalMatters = lazy(() => import('./portal/pages/PortalMatters'));
const PortalMatterDetail = lazy(() => import('./portal/pages/PortalMatterDetail'));
const PortalCalendar = lazy(() => import('./portal/pages/PortalCalendar'));
const PortalPeople = lazy(() => import('./portal/pages/PortalPeople'));

type ProtectedRouteConfig = {
  path: string;
  component: React.ComponentType;
  boundaryName?: string;
  permission?: {
    resource: Resource;
    action: Action;
  };
  /** Plan feature required to access this route (shows upgrade screen if not). */
  feature?: FeatureKey;
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
    permission: { resource: 'documents', action: 'read' },
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
  {
    path: '/live-chat',
    component: LiveChatPage,
    boundaryName: 'Live Chat',
    permission: { resource: 'chat', action: 'read' },
  },
  { path: '/help-center', component: HelpCenter, boundaryName: 'Help Center' },
  { path: '/changelog', component: Changelog, boundaryName: 'Changelog' },
  { path: '/billing/callback', component: BillingCallback, boundaryName: 'Billing Callback' },
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
  {
    path: '/agents',
    component: AgentJobs,
    boundaryName: 'Agent Jobs',
    permission: { resource: 'agents', action: 'read' },
    feature: 'agents',
  },
  {
    path: '/agents/monitors',
    component: AgentMonitors,
    boundaryName: 'Agent Monitors',
    permission: { resource: 'agents', action: 'read' },
    feature: 'agents',
  },
  {
    path: '/agents/approvals',
    component: AgentApprovals,
    boundaryName: 'Agent Approvals',
    permission: { resource: 'agents', action: 'read' },
    feature: 'agents',
  },
  {
    path: '/agents/dashboard',
    component: AgentDashboard,
    boundaryName: 'Agent Dashboard',
    permission: { resource: 'agents', action: 'read' },
    feature: 'agents',
  },
  {
    path: '/negotiations',
    component: NegotiationsPage,
    boundaryName: 'Negotiations',
    permission: { resource: 'negotiations', action: 'read' },
    feature: 'negotiations',
  },
  {
    path: '/negotiations/:id',
    component: NegotiationDetails,
    boundaryName: 'Negotiation Details',
    permission: { resource: 'negotiations', action: 'read' },
    feature: 'negotiations',
  },
  {
    path: '/intelligence',
    component: IntelligenceDashboard,
    boundaryName: 'Intelligence Dashboard',
    permission: { resource: 'cases', action: 'read' },
    feature: 'intelligence',
  },
  {
    path: '/agents/:jobId',
    component: AgentJobDetails,
    boundaryName: 'Agent Job Details',
    permission: { resource: 'agents', action: 'read' },
    feature: 'agents',
  },
  {
    path: '/tabular-reviews',
    component: TabularReviews,
    boundaryName: 'Tabular Reviews',
    permission: { resource: 'cases', action: 'read' },
    feature: 'tabular_review',
  },
  {
    path: '/tabular-reviews/new',
    component: TabularReviewCreate,
    boundaryName: 'New Tabular Review',
    permission: { resource: 'cases', action: 'create' },
    feature: 'tabular_review',
  },
  {
    path: '/tabular-reviews/:reviewId',
    component: TabularReviewDetail,
    boundaryName: 'Tabular Review',
    permission: { resource: 'cases', action: 'read' },
    feature: 'tabular_review',
  },
  {
    path: '/documents/:id/redline',
    component: DocumentRedline,
    boundaryName: 'Document Redline',
    permission: { resource: 'documents', action: 'update' },
    feature: 'redline',
  },
  { path: '*', component: NotFound },
];

function createRouteElement({
  component: Component,
  boundaryName,
  permission,
  feature,
}: ProtectedRouteConfig) {
  const content = (
    <Suspense fallback={<LoadingFallback />}>
      <Component />
    </Suspense>
  );

  const boundaried = boundaryName ? (
    <ModuleErrorBoundary name={boundaryName}>{content}</ModuleErrorBoundary>
  ) : (
    content
  );

  // Plan-feature gate (shows an upgrade screen if the plan lacks the feature).
  const wrappedContent = feature ? (
    <FeatureGate feature={feature}>{boundaried}</FeatureGate>
  ) : (
    boundaried
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
      // Redact reset/invite tokens, OAuth codes, email before logging (M7).
      search: sanitizeUrl(location.search),
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
        const { invokeNodeApi } = await import('@/lib/backendApi');
        const data = await invokeNodeApi<{ must_change_password?: boolean }>(
          '/api/v1/users/me/password-status'
        );

        setMustChangePassword(data?.must_change_password ?? false);
      } catch (err) {
        logWarn('Password check failed', { err });
        setMustChangePassword(true); // Fail closed on catch too
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

function FloatingLiveChatButton() {
  const [open, setOpen] = React.useState(false);
  const location = useLocation();
  if (location.pathname === '/live-chat') return null;
  return (
    <PermissionGate resource="chat" action="read" fallback={null}>
      <>
        {/* Floating trigger */}
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="fixed z-50 bottom-5 right-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#afc8f0] to-[#79a5ea] text-white shadow-lg transition-all hover:shadow-xl hover:brightness-110 active:scale-95"
            aria-label="Open Live Chat"
          >
            <MessageCircle className="h-5 w-5" />
          </button>
        )}
        {/* Chat modal - centered overlay */}
        {open && (
          <>
            <div
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] h-[85vh] max-w-[1100px] rounded-xl border border-border/60 bg-[hsl(var(--surface))] shadow-2xl flex flex-col overflow-hidden">
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                }
              >
                <LiveChatPage />
              </Suspense>
              <button
                onClick={() => setOpen(false)}
                className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors z-10"
                aria-label="Close chat"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </>
        )}
      </>
    </PermissionGate>
  );
}

const App = () => (
  <TooltipProvider>
    <Sonner />
    <CookieConsent />
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
              path="/pricing"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <Pricing />
                </Suspense>
              }
            />
            <Route
              path="/onboarding"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <ModuleErrorBoundary name="Onboarding">
                    <Onboarding />
                  </ModuleErrorBoundary>
                </Suspense>
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
            {/* Client Portal — isolated auth surface (own provider, NOT staff ProtectedRoute/AppLayout) */}
            <Route
              path="/portal/*"
              element={
                <PortalAuthProvider>
                  <Routes>
                    <Route
                      path="login"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <PortalLogin />
                        </Suspense>
                      }
                    />
                    <Route
                      path="accept-invite"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <PortalAcceptInvite />
                        </Suspense>
                      }
                    />
                    <Route
                      path="forgot-password"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <PortalForgotPassword />
                        </Suspense>
                      }
                    />
                    <Route
                      path="reset-password"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <PortalResetPassword />
                        </Suspense>
                      }
                    />
                    <Route
                      path=""
                      element={
                        <PortalProtectedRoute>
                          <PortalLayout>
                            <ModuleErrorBoundary name="Portal Matters">
                              <Suspense fallback={<LoadingFallback />}>
                                <PortalMatters />
                              </Suspense>
                            </ModuleErrorBoundary>
                          </PortalLayout>
                        </PortalProtectedRoute>
                      }
                    />
                    <Route
                      path="calendar"
                      element={
                        <PortalProtectedRoute>
                          <PortalLayout>
                            <ModuleErrorBoundary name="Portal Calendar">
                              <Suspense fallback={<LoadingFallback />}>
                                <PortalCalendar />
                              </Suspense>
                            </ModuleErrorBoundary>
                          </PortalLayout>
                        </PortalProtectedRoute>
                      }
                    />
                    <Route
                      path="people"
                      element={
                        <PortalProtectedRoute>
                          <PortalLayout>
                            <ModuleErrorBoundary name="Portal People">
                              <Suspense fallback={<LoadingFallback />}>
                                <PortalPeople />
                              </Suspense>
                            </ModuleErrorBoundary>
                          </PortalLayout>
                        </PortalProtectedRoute>
                      }
                    />
                    <Route
                      path="matters/:caseId"
                      element={
                        <PortalProtectedRoute>
                          <PortalLayout>
                            <ModuleErrorBoundary name="Portal Matter Detail">
                              <Suspense fallback={<LoadingFallback />}>
                                <PortalMatterDetail />
                              </Suspense>
                            </ModuleErrorBoundary>
                          </PortalLayout>
                        </PortalProtectedRoute>
                      }
                    />
                  </Routes>
                </PortalAuthProvider>
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
                          {/* FloatingChatWidget hidden - replaced by Live Chat trigger */}
                          {/* <FloatingChatWidget /> */}
                          <FloatingLiveChatButton />
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
