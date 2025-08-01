import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { CasesProvider } from "@/context/CasesContext";
import { SearchProvider } from "@/hooks/use-search";
import Dashboard from "./pages/Dashboard";
import Cases from "./pages/Cases";
import CaseDetails from "./pages/CaseDetails";
import Calendar from "./pages/Calendar";
import Documents from "./pages/Documents";
import Contracts from "./pages/Contracts";
import ContractView from "./pages/ContractView"; // Keep this import
import ContractEdit from "./pages/ContractEdit"; // Keep this import
import ContractHistory from "./pages/ContractHistory"; // Keep this import
import Users from "./pages/Users"; // Keep this import
import Settings from "./pages/Settings"; // Keep this import
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
                <Route path="/cases" element={<Cases />} />
                <Route path="/cases/:caseId" element={<CaseDetails />} /> {/* From previous merge */}
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/contracts" element={<Contracts />} />
                {/* Contract-related routes from 'codex/add-contract-view-and-editing-features' */}
                <Route path="/contracts/:id" element={<ContractView />} />
                <Route path="/contracts/:id/edit" element={<ContractEdit />} />
                <Route path="/contracts/:id/history" element={<ContractHistory />} />
                {/* User and Settings routes from 'main' (and previous merges) */}
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