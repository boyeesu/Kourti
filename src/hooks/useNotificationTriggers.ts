/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCreateNotification } from '@/hooks/useNotifications';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { supabase } from '@/integrations/supabase/client';
import { trackEvent, AnalyticsEvents } from '@/lib/analytics';
import { useNotificationPreferences } from '@/hooks/useNotificationsDb';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { logError } from '@/lib/logger';

export function useNotificationTriggers() {
  const createNotification = useCreateNotification();
  const { data: organizationId } = useUserOrganization();
  const { data: preferences } = useNotificationPreferences(organizationId || '');

  /**
   * Send email notification via edge function
   * Now respects user preferences
   */
  const sendEmailNotification = async (params: {
    type:
      | 'task_assigned'
      | 'case_update'
      | 'document_shared'
      | 'calendar_reminder'
      | 'invoice_created'
      | 'general';
    recipientUserId: string;
    title: string;
    message: string;
    actionUrl?: string;
    actionText?: string;
  }) => {
    try {
      // Check preferences if available
      if (preferences && params.recipientUserId === (await getCurrentUserId())) {
        if (!preferences.email_enabled) {
          return;
        }

        // Check email frequency
        if (preferences.email_frequency === 'never') {
          return;
        }

        // Check type-specific preferences
        const typeMap: Record<string, keyof typeof preferences> = {
          task_assigned: 'task_notifications',
          case_update: 'case_notifications',
          document_shared: 'document_notifications',
          calendar_reminder: 'calendar_notifications',
          invoice_created: 'invoice_notifications',
          general: 'general_notifications',
        };

        const preferenceKey = typeMap[params.type];
        if (preferenceKey && preferences[preferenceKey] === false) {
          return;
        }
      }

      const { error } = await supabase.functions.invoke('send-notification-email', {
        body: params,
      });
      if (error) {
        logError('Failed to send email notification', error);
      }
    } catch (err) {
      logError('Email notification error', err);
    }
  };

  const createCaseNotification = async (
    caseData: any,
    action: 'created' | 'updated' | 'deleted'
  ) => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: `Case ${action}`,
      description: `Case "${caseData.title}" has been ${action}`,
      type: 'case',
      user_id: userId,
    });

    trackEvent(AnalyticsEvents.CASE_CREATED, { action });
  };

  const createClientNotification = async (
    clientData: any,
    action: 'created' | 'updated' | 'deleted'
  ) => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: `Client ${action}`,
      description: `Client "${clientData.name}" has been ${action}`,
      type: 'client',
      user_id: userId,
    });

    trackEvent(AnalyticsEvents.CLIENT_CREATED, { action });
  };

  const createDocumentNotification = async (
    documentData: any,
    action: 'created' | 'updated' | 'deleted',
    sharedWithUserId?: string
  ) => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: `Document ${action}`,
      description: `Document "${documentData.name || documentData.title}" has been ${action}`,
      type: 'document',
      user_id: userId,
    });

    trackEvent(AnalyticsEvents.DOCUMENT_UPLOADED, { action });

    // Send email if document is shared with someone
    if (sharedWithUserId && action === 'created') {
      await sendEmailNotification({
        type: 'document_shared',
        recipientUserId: sharedWithUserId,
        title: 'Document Shared With You',
        message: `A document "${documentData.name || documentData.title}" has been shared with you.`,
        actionUrl: documentData.viewUrl,
        actionText: 'View Document',
      });
    }
  };

  const createContractNotification = async (
    contractData: any,
    action: 'created' | 'updated' | 'deleted'
  ) => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: `Contract ${action}`,
      description: `Contract "${contractData.title}" has been ${action}`,
      type: 'contract',
      user_id: userId,
    });

    trackEvent(AnalyticsEvents.CONTRACT_CREATED, { action });
  };

  const createCalendarNotification = async (
    eventData: any,
    action: 'created' | 'updated' | 'deleted',
    attendeeUserIds?: string[]
  ) => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: `Event ${action}`,
      description: `Event "${eventData.title}" has been ${action}`,
      type: 'calendar',
      user_id: userId,
    });

    trackEvent(AnalyticsEvents.EVENT_CREATED, { action });

    // Notify attendees via email
    if (attendeeUserIds && action === 'created') {
      for (const attendeeId of attendeeUserIds) {
        if (attendeeId !== userId) {
          await sendEmailNotification({
            type: 'calendar_reminder',
            recipientUserId: attendeeId,
            title: 'New Calendar Event',
            message: `You have been invited to "${eventData.title}" on ${new Date(eventData.start_date).toLocaleDateString()}.`,
            actionUrl: `/calendar`,
            actionText: 'View Calendar',
          });
        }
      }
    }
  };

  const createTaskNotification = async (
    taskData: any,
    action: 'created' | 'updated' | 'completed' | 'assigned',
    assignedToUserId?: string
  ) => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const notificationType = action === 'completed' ? 'success' : 'info';

    createNotification.mutate({
      title: `Task ${action}`,
      description: `Task "${taskData.title}" has been ${action}`,
      type: notificationType as any,
      user_id: userId,
    });

    trackEvent(
      action === 'assigned' ? AnalyticsEvents.TASK_ASSIGNED : AnalyticsEvents.TASK_CREATED,
      { action }
    );

    // Send email notification when task is assigned to someone else
    if (
      assignedToUserId &&
      assignedToUserId !== userId &&
      (action === 'assigned' || action === 'created')
    ) {
      await sendEmailNotification({
        type: 'task_assigned',
        recipientUserId: assignedToUserId,
        title: 'New Task Assigned',
        message: `You have been assigned a new task: "${taskData.title}". ${taskData.due_date ? `Due: ${new Date(taskData.due_date).toLocaleDateString()}` : ''}`,
        actionUrl: taskData.case_id ? `/cases/${taskData.case_id}` : '/dashboard',
        actionText: 'View Task',
      });
    }
  };

  const createInvoiceNotification = async (
    invoiceData: any,
    action: 'created' | 'sent' | 'paid',
    clientUserId?: string
  ) => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: `Invoice ${action}`,
      description: `Invoice "${invoiceData.invoice_number}" has been ${action}`,
      type: 'info',
      user_id: userId,
    });

    trackEvent(AnalyticsEvents.INVOICE_CREATED, { action });

    // Send email to client when invoice is sent
    if (clientUserId && action === 'sent') {
      await sendEmailNotification({
        type: 'invoice_created',
        recipientUserId: clientUserId,
        title: 'New Invoice',
        message: `A new invoice #${invoiceData.invoice_number} for ${invoiceData.total_amount} has been created.`,
        actionUrl: `/invoices/${invoiceData.id}`,
        actionText: 'View Invoice',
      });
    }
  };

  const createOnboardingNotification = async (organizationName: string) => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    createNotification.mutate({
      title: 'Welcome to Kourti Legal!',
      description: `Your organization "${organizationName}" has been set up successfully. Get started by creating your first case or inviting team members.`,
      type: 'success' as any,
      user_id: userId,
    });

    trackEvent(AnalyticsEvents.ONBOARDING_COMPLETED, {
      organizationName: organizationName.substring(0, 20),
    });
  };

  return {
    createCaseNotification,
    createClientNotification,
    createDocumentNotification,
    createContractNotification,
    createCalendarNotification,
    createTaskNotification,
    createInvoiceNotification,
    createOnboardingNotification,
    sendEmailNotification,
  };
}
