import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { CasesProvider } from "@/context/CasesContext";
import { SearchProvider } from "@/hooks/use-search";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Cases from "./pages/Cases";
import CaseDetails from "./pages/CaseDetails";
import CaseCreate from "./pages/CaseCreate";
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
import UserManagement from "./pages/UserManagement";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
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
                        <Route path="/clients/:clientId" element={<ClientDetails />} />
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
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;