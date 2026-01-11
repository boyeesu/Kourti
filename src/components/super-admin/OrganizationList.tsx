import { Organization } from '@/hooks/useAllOrganizations';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Users, Mail, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface OrganizationListProps {
  organizations: Organization[];
}

export function OrganizationList({ organizations }: OrganizationListProps) {
  return (
    <div className="space-y-4">
      {organizations.map((org) => (
        <Card key={org.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">{org.name}</h3>
                  <Badge
                    variant={
                      org.status === 'active'
                        ? 'default'
                        : org.status === 'empty'
                        ? 'secondary'
                        : 'destructive'
                    }
                  >
                    {org.status}
                  </Badge>
                </div>
                {org.description && (
                  <p className="text-sm text-muted-foreground mb-3">{org.description}</p>
                )}
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {org.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      {org.email}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {org.user_count} users
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(org.created_at), 'MMM dd, yyyy')}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
