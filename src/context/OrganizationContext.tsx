import { createContext, useContext, ReactNode } from 'react';
import { useUserOrganization } from '@/hooks/useUserOrganization';

interface OrganizationContextValue {
  organizationId: string | null;
  isLoading: boolean;
  error: unknown;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useUserOrganization();
  return (
    <OrganizationContext.Provider value={{ organizationId: data ?? null, isLoading, error }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizationContext() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganizationContext must be used within an OrganizationProvider');
  }
  return context;
}

