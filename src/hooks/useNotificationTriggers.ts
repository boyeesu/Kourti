import { useCreateNotification } from '@/hooks/useNotifications';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

export function useNotificationTriggers() {
  const createNotification = useCreateNotification();

  const createCaseNotification = async (caseData: any, action: 'created' | 'updated' | 'deleted') => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: `Case ${action}`,
      description: `Case "${caseData.title}" has been ${action}`,
      type: 'case',
      user_id: userId,
    });
  };

  const createClientNotification = async (clientData: any, action: 'created' | 'updated' | 'deleted') => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: `Client ${action}`,
      description: `Client "${clientData.name}" has been ${action}`,
      type: 'client',
      user_id: userId,
    });
  };

  const createDocumentNotification = async (documentData: any, action: 'created' | 'updated' | 'deleted') => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: `Document ${action}`,
      description: `Document "${documentData.name || documentData.title}" has been ${action}`,
      type: 'document',
      user_id: userId,
    });
  };

  const createContractNotification = async (contractData: any, action: 'created' | 'updated' | 'deleted') => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: `Contract ${action}`,
      description: `Contract "${contractData.title}" has been ${action}`,
      type: 'contract',
      user_id: userId,
    });
  };

  const createCalendarNotification = async (eventData: any, action: 'created' | 'updated' | 'deleted') => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: `Event ${action}`,
      description: `Event "${eventData.title}" has been ${action}`,
      type: 'calendar',
      user_id: userId,
    });
  };

  return {
    createCaseNotification,
    createClientNotification,
    createDocumentNotification,
    createContractNotification,
    createCalendarNotification,
  };
}