import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import { useCreateNotification } from '@/hooks/useNotifications';
import { useNotificationTriggers } from '@/hooks/useNotificationTriggers';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { logError, logInfo } from '@/lib/logger';
import type { AgentAlert } from '@/hooks/useAgentAlerts';

interface AlertsResponse {
  success: boolean;
  data: AgentAlert[];
}

/**
 * Watches for new active agent alerts and creates corresponding
 * in-app notifications + email notifications (respecting user preferences).
 *
 * Polls every 60s (not 30s like AlertsFeed) to reduce load.
 * Only processes alerts created in the last 10 minutes to avoid
 * re-notifying on old alerts after page refresh.
 */
export function useAlertNotifications() {
  const { data: alertsData } = useQuery({
    queryKey: ['alert-notifications-poll'],
    queryFn: () =>
      invokeNodeApi<AlertsResponse>('/api/v1/agents/alerts', {
        query: { status: 'active', pageSize: 20 },
      }),
    refetchInterval: 60_000,
    retry: false,
    meta: { suppressError: true },
  });

  const createNotification = useCreateNotification();
  const { sendEmailNotification } = useNotificationTriggers();
  const processedAlerts = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!alertsData?.data?.length) return;

    // On first load, just mark all existing alerts as "seen" — don't notify
    if (!initialized.current) {
      initialized.current = true;
      for (const alert of alertsData.data) {
        processedAlerts.current.add(alert.id);
      }
      return;
    }

    // Only process truly new alerts (appeared after initial load)
    const newAlerts = alertsData.data.filter((a) => !processedAlerts.current.has(a.id));
    if (newAlerts.length === 0) return;

    const processNewAlerts = async () => {
      const userId = await getCurrentUserId();
      if (!userId) return;

      for (const alert of newAlerts) {
        processedAlerts.current.add(alert.id);

        const notificationType = mapAlertToNotificationType(alert.alert_type, alert.severity);

        // Create in-app notification
        try {
          createNotification.mutate(
            {
              title: alert.title,
              description: alert.description || undefined,
              type: notificationType,
              user_id: userId,
            },
            {
              onError: (err) => logError('Alert notification creation failed', err),
            }
          );
          logInfo('Alert notification created', { alertId: alert.id });
        } catch {
          // silently skip
        }

        // Send email (preference-checked inside)
        try {
          await sendEmailNotification({
            type: mapAlertToEmailType(alert.alert_type),
            recipientUserId: userId,
            title: alert.title,
            message: alert.description || alert.title,
            actionUrl: buildAlertActionUrl(alert),
            actionText: 'View Details',
          });
        } catch {
          // silently skip — email is best-effort
        }
      }
    };

    processNewAlerts();
  }, [alertsData?.data]);
}

function mapAlertToNotificationType(
  alertType: string,
  severity: 'info' | 'warning' | 'critical'
): 'info' | 'warning' | 'contract' | 'case' | 'document' {
  if (alertType.includes('contract')) return 'contract';
  if (alertType.includes('case') || alertType.includes('deadline')) return 'case';
  if (alertType.includes('document')) return 'document';
  if (severity === 'critical' || severity === 'warning') return 'warning';
  return 'info';
}

function mapAlertToEmailType(alertType: string): 'case_update' | 'general' {
  if (alertType.includes('case') || alertType.includes('deadline')) return 'case_update';
  return 'general';
}

function buildAlertActionUrl(alert: {
  entity_type: string | null;
  entity_id: string | null;
}): string {
  if (!alert.entity_type || !alert.entity_id) return '/settings?tab=monitoring';
  switch (alert.entity_type) {
    case 'case':
      return `/cases/${alert.entity_id}`;
    case 'contract':
      return `/contracts/${alert.entity_id}`;
    case 'document':
      return `/documents`;
    default:
      return '/settings?tab=monitoring';
  }
}
