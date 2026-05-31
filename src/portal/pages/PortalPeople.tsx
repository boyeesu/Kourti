import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, UserPlus, X, AlertCircle, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';
import { toast } from 'sonner';
import {
  portalGetPeople,
  portalInvitePerson,
  portalRemovePerson,
  type PortalPeopleGroup,
} from '../portalApi';

function FirmPeopleCard({ group }: { group: PortalPeopleGroup }) {
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState({ email: '', fullName: '' });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['portal', 'people'] });

  const inviteMut = useMutation({
    mutationFn: (args: { email: string; fullName?: string }) =>
      portalInvitePerson({ clientId: group.client.clientId, ...args }),
    onSuccess: () => {
      setInvite({ email: '', fullName: '' });
      invalidate();
      toast.success('Colleague invited', {
        description: `They'll get an email to access ${group.client.firmName}.`,
      });
    },
    onError: (err) => {
      toast.error('Could not invite colleague', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    },
  });

  const removeMut = useMutation({
    mutationFn: (clientUserId: string) => portalRemovePerson(group.client.clientId, clientUserId),
    onSuccess: () => {
      invalidate();
      toast.success('Colleague removed');
    },
    onError: (err) => {
      toast.error('Could not remove colleague', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const email = invite.email.trim();
    if (!email) return;
    const fullName = invite.fullName.trim();
    inviteMut.mutate({ email, fullName: fullName || undefined });
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          {group.client.firmName}
          <Badge variant="secondary" className="ml-auto h-5 text-[10px]">
            {group.members.length} {group.members.length === 1 ? 'person' : 'people'}
          </Badge>
        </div>

        <ul className="divide-y divide-border">
          {group.members.map((member) => (
            <li key={member.clientUserId} className="flex items-center gap-3 py-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                  {getInitials(member.fullName || member.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {member.fullName || member.email}
                  </span>
                  {member.pending && (
                    <Badge variant="secondary" className="h-5 text-[10px]">
                      Pending
                    </Badge>
                  )}
                </div>
                {member.fullName && (
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                )}
              </div>
              {member.invitedByMe ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive')}
                  aria-label={`Remove ${member.fullName || member.email}`}
                  disabled={removeMut.isPending}
                  onClick={() => removeMut.mutate(member.clientUserId)}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : (
                <span className="shrink-0 text-[11px] text-muted-foreground">Added by firm</span>
              )}
            </li>
          ))}
        </ul>

        <Separator />

        <form onSubmit={handleInvite} className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            Add a colleague
          </p>
          <p className="text-xs text-muted-foreground">
            They'll be able to view all of this organisation's shared matters and calendar.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              type="email"
              placeholder="colleague@example.com"
              autoComplete="off"
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              disabled={inviteMut.isPending}
              required
            />
            <Input
              type="text"
              placeholder="Full name (optional)"
              autoComplete="off"
              value={invite.fullName}
              onChange={(e) => setInvite({ ...invite, fullName: e.target.value })}
              disabled={inviteMut.isPending}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={inviteMut.isPending || !invite.email.trim()}>
              <UserPlus className="mr-2 h-4 w-4" />
              {inviteMut.isPending ? 'Inviting…' : 'Invite colleague'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function PortalPeople() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['portal', 'people'],
    queryFn: portalGetPeople,
    staleTime: 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">People</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite colleagues from your organisation to follow your matters and calendar.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Unable to load your people.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ShieldCheck className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">No organisation access yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                When a firm gives your organisation portal access, you'll be able to add colleagues
                here. You can still invite guests to a single matter from that matter's Team tab.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="space-y-5">
          {data.map((group) => (
            <FirmPeopleCard key={group.client.clientId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
