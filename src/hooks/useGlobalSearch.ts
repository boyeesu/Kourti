import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type GlobalSearchBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface GlobalSearchItem {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  badge?: {
    label: string;
    variant?: GlobalSearchBadgeVariant;
  };
}

export interface GlobalSearchResults {
  cases: GlobalSearchItem[];
  clients: GlobalSearchItem[];
  calendarEvents: GlobalSearchItem[];
  voiceRecordings: GlobalSearchItem[];
  transcriptions: GlobalSearchItem[];
}

const emptyResults: GlobalSearchResults = {
  cases: [],
  clients: [],
  calendarEvents: [],
  voiceRecordings: [],
  transcriptions: [],
};

function buildLikeClause(fields: string[], value: string) {
  const sanitized = value.trim().replace(/[%,]/g, ' ').replace(/\s+/g, ' ');
  if (!sanitized) return '';
  const likeValue = `%${sanitized}%`;
  return fields.map((field) => `${field}.ilike.${likeValue}`).join(',');
}

function getCaseStatusVariant(status?: string | null): GlobalSearchBadgeVariant {
  switch ((status || '').toLowerCase()) {
    case 'closed':
      return 'destructive';
    case 'active':
      return 'default';
    default:
      return 'secondary';
  }
}

function getVoiceStatusVariant(status?: string | null): GlobalSearchBadgeVariant {
  return (status || '').toLowerCase() === 'completed' ? 'default' : 'outline';
}

export function useGlobalSearch({
  term,
  organizationId,
  enabled = true,
}: {
  term: string;
  organizationId?: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['global-search', term, organizationId],
    enabled: Boolean(enabled && organizationId && term.trim().length >= 2),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!organizationId || term.trim().length < 2) {
        return emptyResults;
      }

      const likeClause = buildLikeClause(
        ['title', 'description', 'case_number'],
        term
      );

      const clientLikeClause = buildLikeClause(
        ['name', 'email', 'phone'],
        term
      );

      const eventLikeClause = buildLikeClause(
        ['title', 'description', 'location'],
        term
      );

      const voiceLikeClause = buildLikeClause(
        ['title', 'summary', 'transcript'],
        term
      );

      const [casesResponse, clientsResponse, eventsResponse, voiceResponse] = await Promise.all([
        likeClause
          ? supabase
              .from('cases')
              .select(
                `id, title, description, status, case_number, next_hearing_date, client:client_id(id, name)`
              )
              .eq('organization_id', organizationId)
              .or(likeClause)
              .order('updated_at', { ascending: false })
              .limit(8)
          : Promise.resolve({ data: [], error: null }),
        clientLikeClause
          ? supabase
              .from('clients')
              .select('id, name, email, phone, organization_id')
              .eq('organization_id', organizationId)
              .or(clientLikeClause)
              .order('updated_at', { ascending: false })
              .limit(8)
          : Promise.resolve({ data: [], error: null }),
        eventLikeClause
          ? supabase
              .from('calendar_events')
              .select('id, title, description, start_date, end_date, event_type, status, organization_id')
              .eq('organization_id', organizationId)
              .or(eventLikeClause)
              .order('start_date', { ascending: true })
              .limit(8)
          : Promise.resolve({ data: [], error: null }),
        voiceLikeClause
          ? supabase
              .from('voice_transcriptions')
              .select(
                'id, title, summary, transcript, status, duration_seconds, audio_file_url, organization_id, created_at'
              )
              .eq('organization_id', organizationId)
              .or(voiceLikeClause)
              .order('created_at', { ascending: false })
              .limit(12)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const cases = !casesResponse.error && casesResponse.data
        ? (casesResponse.data as any[]).map((item: any) => ({
            id: item.id as string,
            title: item.title as string,
            subtitle: [
              item.case_number ? `Case #${item.case_number}` : null,
              item.client?.name ? `Client: ${item.client.name}` : null,
            ]
              .filter(Boolean)
              .join(' • '),
            url: `/cases/${item.id}`,
            badge: item.status
              ? {
                  label: String(item.status),
                  variant: getCaseStatusVariant(item.status),
                }
              : undefined,
          }))
        : [];

      const clients = !clientsResponse.error && clientsResponse.data
        ? (clientsResponse.data as any[]).map((item: any) => ({
            id: item.id as string,
            title: item.name as string,
            subtitle: [item.email, item.phone].filter(Boolean).join(' • '),
            url: `/clients/${item.id}`,
          }))
        : [];

      const calendarEvents = !eventsResponse.error && eventsResponse.data
        ? (eventsResponse.data as any[]).map((item: any) => {
            const start = item.start_date ? new Date(item.start_date) : null;
            const end = item.end_date ? new Date(item.end_date) : null;
            const timeRange = start
              ? `${start.toLocaleDateString()}${
                  start && end && start.toDateString() !== end.toDateString()
                    ? ` - ${end.toLocaleDateString()}`
                    : ''
                }`
              : undefined;

            return {
              id: item.id as string,
              title: item.title as string,
              subtitle: [timeRange, item.description].filter(Boolean).join(' • '),
              url: `/calendar?event=${item.id}`,
              badge: item.event_type
                ? {
                    label: String(item.event_type),
                    variant: 'secondary' as GlobalSearchBadgeVariant,
                  }
                : undefined,
            };
          })
        : [];

      const voiceEntries = !voiceResponse.error && voiceResponse.data ? (voiceResponse.data as any[]) : [];
      const voiceRecordings = voiceEntries
        .filter((item) => Boolean(item.audio_file_url))
        .slice(0, 5)
        .map((item: any) => ({
          id: item.id as string,
          title: item.title as string,
          subtitle: [
            item.duration_seconds ? `${item.duration_seconds}s recording` : null,
            item.summary ? String(item.summary).slice(0, 80) : null,
          ]
            .filter(Boolean)
            .join(' • '),
          url: `/transcriptions/${item.id}`,
          badge: item.status
            ? {
                label: String(item.status),
                variant: getVoiceStatusVariant(item.status),
              }
            : undefined,
        }));

      const transcriptionItems = voiceEntries
        .filter((item) => !item.audio_file_url)
        .slice(0, 5)
        .map((item: any) => ({
          id: item.id as string,
          title: item.title as string,
          subtitle: (item.summary || item.transcript || '')
            ? String(item.summary || item.transcript).slice(0, 120)
            : undefined,
          url: `/transcriptions/${item.id}`,
          badge: item.status
            ? {
                label: String(item.status),
                variant: 'secondary' as GlobalSearchBadgeVariant,
              }
            : undefined,
        }));

      return {
        cases: cases.slice(0, 5),
        clients: clients.slice(0, 5),
        calendarEvents: calendarEvents.slice(0, 5),
        voiceRecordings,
        transcriptions: transcriptionItems,
      } satisfies GlobalSearchResults;
    },
  });
}
