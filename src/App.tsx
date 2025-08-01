import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { CasesProvider } from "@/context/CasesContext";
import { SearchProvider } from "@/hooks/use-search";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import Cases from "./pages/Cases";
import CaseDetails from "./pages/CaseDetails";
import CaseActivities from "./pages/CaseActivities";
import Calendar from "./pages/Calendar";
import Documents from "./pages/Documents";
import DocumentUpload from "./pages/DocumentUpload";
import Contracts from "./pages/Contracts";
import ContractCreate from "./pages/ContractCreate";
import ContractCompare from "./pages/ContractCompare";
import ContractView from "./pages/ContractView";
import ContractEdit from "./pages/ContractEdit";
import ContractHistory from "./pages/ContractHistory";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* Retain both SearchProvider and CasesProvider, nesting them appropriately */}
        <SearchProvider>
          <CasesProvider>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/cases" element={<Cases />} />
                <Route path="/cases/:caseId" element={<CaseDetails />} />
                <Route path="/cases/:caseId/activities" element={<CaseActivities />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/documents/upload" element={<DocumentUpload />} />
                <Route path="/contracts" element={<Contracts />} />
                <Route path="/contracts/create" element={<ContractCreate />} />
                <Route path="/contracts/compare" element={<ContractCompare />} />
                <Route path="/contracts/:id" element={<ContractView />} />
                <Route path="/contracts/:id/edit" element={<ContractEdit />} />
                <Route path="/contracts/:id/history" element={<ContractHistory />} />
                <Route path="/users" element={<Users />} />
                <Route path="/settings" element={<Settings />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppLayout>
          </CasesProvider>
        </SearchProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;