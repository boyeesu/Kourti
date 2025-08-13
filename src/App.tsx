import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsProvider } from "@/components/ui/notifications";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { CasesProvider } from "@/context/CasesContext";
import { SearchProvider } from "@/hooks/use-search";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard.js";
import Auth from "./pages/Auth.js";
import Onboarding from "./pages/Onboarding.js";
import Cases from "./pages/Cases.js";
import CaseDetails from "./pages/CaseDetails.js";
import CaseCreate from "./pages/CaseCreate.js";
import ClientCreate from "./pages/ClientCreate.js";
import ClientEdit from "./pages/ClientEdit.js";
import CaseActivities from "./pages/CaseActivitiesNew.js";
import Clients from "./pages/Clients.js";
import ClientDetails from "./pages/ClientDetails.js";
import BulkImport from "./pages/BulkImport.js";
import Calendar from "./pages/Calendar.js";
import Documents from "./pages/Documents.js";
import DocumentUpload from "./pages/DocumentUpload.js";
import Contracts from "./pages/Contracts.js";
import ContractCreate from "./pages/ContractCreate.js";
import ContractCompare from "./pages/ContractCompare.js";
import ContractView from "./pages/ContractView.js";
import ContractEdit from "./pages/ContractEdit.js";
import ContractHistory from "./pages/ContractHistory.js";
import UserManagement from "./pages/UserManagement.js";
import Settings from "./pages/Settings.js";
import Profile from "./pages/Profile.js";
import NotFound from "./pages/NotFound.js";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <NotificationsProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public routes - no layout */}
              <Route path="/auth" element={<Auth />} />
              
              {/* Protected routes with layout */}
              <Route path="/onboarding" element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              } />
              
              <Route path="/*" element={
                <ProtectedRoute>
                  <SearchProvider>
                    <CasesProvider>
                      <AppLayout>
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/cases" element={<Cases />} />
                          <Route path="/cases/create" element={<CaseCreate />} />
                          <Route path="/cases/:id" element={<CaseDetails />} />
                          <Route path="/cases/:id/activities" element={<CaseActivities />} />
                          <Route path="/clients" element={<Clients />} />
                          <Route path="/clients/create" element={<ClientCreate />} />
                          <Route path="/clients/:clientId" element={<ClientDetails />} />
                          <Route path="/clients/:clientId/edit" element={<ClientEdit />} />
                          <Route path="/bulk-import" element={<BulkImport />} />
                          <Route path="/calendar" element={<Calendar />} />
                          <Route path="/documents" element={<Documents />} />
                          <Route path="/documents/upload" element={<DocumentUpload />} />
                          <Route path="/contracts" element={<Contracts />} />
                          <Route path="/contracts/create" element={<ContractCreate />} />
                          <Route path="/contracts/compare" element={<ContractCompare />} />
                          <Route path="/contracts/:id" element={<ContractView />} />
                          <Route path="/contracts/:id/edit" element={<ContractEdit />} />
                          <Route path="/contracts/:id/history" element={<ContractHistory />} />
                          <Route path="/users" element={<UserManagement />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="/profile" element={<Profile />} />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </AppLayout>
                    </CasesProvider>
                  </SearchProvider>
                </ProtectedRoute>
              } />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </NotificationsProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;