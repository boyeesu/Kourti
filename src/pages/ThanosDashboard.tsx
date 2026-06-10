import { Routes, Route } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Shield } from 'lucide-react';
import { ThanosSidebar } from '@/components/super-admin/ThanosSidebar';
import { OverviewTab } from '@/components/super-admin/OverviewTab';
import { OrganizationsTab } from '@/components/super-admin/OrganizationsTab';
import { UsersTab } from '@/components/super-admin/UsersTab';
import { PlansTab } from '@/components/super-admin/PlansTab';
import { SubscriptionManagement } from '@/components/super-admin/SubscriptionManagement';
import { AnalyticsTab } from '@/components/super-admin/AnalyticsTab';
import { OrganizationDetail } from '@/components/super-admin/OrganizationDetail';
import { UserDetail } from '@/components/super-admin/UserDetail';
import { BillingOpsTab } from '@/components/super-admin/BillingOpsTab';
import { OrgUsageTab } from '@/components/super-admin/OrgUsageTab';
import { SystemHealthTab } from '@/components/super-admin/SystemHealthTab';
import { EmailLogTab } from '@/components/super-admin/EmailLogTab';
import { MarketingLeadsTab } from '@/components/super-admin/MarketingLeadsTab';
import { AuditLogProTab } from '@/components/super-admin/AuditLogProTab';
import { KbAdminTab } from '@/components/super-admin/KbAdminTab';
import { ClientPortalAdminTab } from '@/components/super-admin/ClientPortalAdminTab';
import { BulkOpsTab } from '@/components/super-admin/BulkOpsTab';
import { LifecycleRulesTab } from '@/components/super-admin/LifecycleRulesTab';
import { GlobalCaseTypesTab } from '@/components/super-admin/GlobalCaseTypesTab';
import { ImpersonationTab } from '@/components/super-admin/ImpersonationTab';
import { usePlatformAnalytics } from '@/hooks/usePlatformAnalytics';

export default function ThanosDashboard() {
  const { data: analytics, isLoading } = usePlatformAnalytics();

  return (
    <SidebarProvider>
      <div className="app-shell flex min-h-screen w-full bg-[hsl(var(--background))]">
        <aside className="hidden shrink-0 px-2 py-3 md:flex md:w-[220px] lg:w-[260px] lg:px-3 lg:py-4">
          <div className="workspace-sidebar h-full w-full overflow-hidden">
            <ThanosSidebar />
          </div>
        </aside>

        <div className="flex flex-col flex-1 min-w-0 gap-3 px-3 py-3 sm:px-4 lg:gap-4 lg:px-6">
          <header className="workspace-header surface-panel px-3 py-3 sm:px-4 lg:px-5">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Platform
                    </span>
                    <div className="flex items-baseline gap-2">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <span className="text-xl font-semibold text-foreground">
                          Administration
                        </span>
                      </div>
                      <span className="hidden text-xs text-muted-foreground/80 sm:inline-flex">
                        System-wide management
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1">
            <Routes>
              <Route index element={<OverviewTab analytics={analytics} isLoading={isLoading} />} />
              <Route path="organizations" element={<OrganizationsTab />} />
              <Route path="organizations/:id" element={<OrganizationDetail />} />
              <Route path="users" element={<UsersTab />} />
              <Route path="users/:id" element={<UserDetail />} />
              <Route path="plans" element={<PlansTab />} />
              <Route path="subscriptions" element={<SubscriptionManagement />} />
              <Route path="billing-ops" element={<BillingOpsTab />} />
              <Route path="usage" element={<OrgUsageTab />} />
              <Route path="analytics" element={<AnalyticsTab />} />
              <Route path="health" element={<SystemHealthTab />} />
              <Route path="email" element={<EmailLogTab />} />
              <Route path="leads" element={<MarketingLeadsTab />} />
              <Route path="audit" element={<AuditLogProTab />} />
              <Route path="knowledge-base" element={<KbAdminTab />} />
              <Route path="client-portal" element={<ClientPortalAdminTab />} />
              <Route path="impersonation" element={<ImpersonationTab />} />
              <Route path="bulk-ops" element={<BulkOpsTab />} />
              <Route path="lifecycle-rules" element={<LifecycleRulesTab />} />
              <Route path="case-types" element={<GlobalCaseTypesTab />} />
            </Routes>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
