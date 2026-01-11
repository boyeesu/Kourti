import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Building2, Users, BarChart3, FileText } from 'lucide-react';
import { usePlatformAnalytics } from '@/hooks/usePlatformAnalytics';
import { OverviewTab } from '@/components/super-admin/OverviewTab';
import { OrganizationsTab } from '@/components/super-admin/OrganizationsTab';
import { UsersTab } from '@/components/super-admin/UsersTab';
import { AnalyticsTab } from '@/components/super-admin/AnalyticsTab';
import { AuditLogTab } from '@/components/super-admin/AuditLogTab';

export default function ThanosDashboard() {
  const { data: analytics, isLoading } = usePlatformAnalytics();
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
              <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Thanos Dashboard</h1>
              <p className="text-muted-foreground">Platform Administration & Analytics</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="organizations" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Organizations
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewTab analytics={analytics} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="organizations" className="space-y-6">
            <OrganizationsTab />
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <UsersTab />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <AnalyticsTab />
          </TabsContent>

          <TabsContent value="audit" className="space-y-6">
            <AuditLogTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
