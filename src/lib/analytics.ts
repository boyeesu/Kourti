/**
 * Analytics utility for Mixpanel tracking
 * Privacy-focused implementation for legal system compliance
 */

declare global {
  interface Window {
    mixpanel?: {
      track: (event: string, properties?: Record<string, unknown>) => void;
      identify: (userId: string) => void;
      people: {
        set: (properties: Record<string, unknown>) => void;
      };
      reset: () => void;
      register: (properties: Record<string, unknown>) => void;
      opt_out_tracking: () => void;
      opt_in_tracking: () => void;
      has_opted_out_tracking: () => boolean;
    };
  }
}

// Sanitize properties to remove PII
function sanitizeProperties(properties?: Record<string, unknown>): Record<string, unknown> {
  if (!properties) return {};
  
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ['email', 'phone', 'address', 'name', 'firstName', 'lastName', 'ssn', 'password'];
  
  for (const [key, value] of Object.entries(properties)) {
    // Skip sensitive keys
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      continue;
    }
    // Hash IDs if they look like UUIDs (for privacy)
    if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      sanitized[key] = value.substring(0, 8) + '...'; // Truncate UUID
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Track an analytics event safely
 */
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  try {
    if (window.mixpanel && !window.mixpanel.has_opted_out_tracking?.()) {
      window.mixpanel.track(event, {
        ...sanitizeProperties(properties),
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.warn('Analytics tracking error:', error);
  }
}

/**
 * Identify a user (without PII)
 */
export function identifyUser(userId: string, orgId?: string) {
  try {
    if (window.mixpanel) {
      // Use hashed ID for privacy
      const hashedId = userId.substring(0, 8);
      window.mixpanel.identify(hashedId);
      if (orgId) {
        window.mixpanel.register({ org_id: orgId.substring(0, 8) });
      }
    }
  } catch (error) {
    console.warn('Analytics identify error:', error);
  }
}

/**
 * Reset analytics on logout
 */
export function resetAnalytics() {
  try {
    if (window.mixpanel) {
      window.mixpanel.reset();
    }
  } catch (error) {
    console.warn('Analytics reset error:', error);
  }
}

// Pre-defined events for the legal system
export const AnalyticsEvents = {
  // Auth events
  LOGIN: 'User Login',
  LOGOUT: 'User Logout',
  SIGNUP: 'User Signup',
  ONBOARDING_COMPLETED: 'Onboarding Completed',
  
  // Case events
  CASE_CREATED: 'Case Created',
  CASE_UPDATED: 'Case Updated',
  CASE_DELETED: 'Case Deleted',
  CASE_VIEWED: 'Case Viewed',
  
  // Client events
  CLIENT_CREATED: 'Client Created',
  CLIENT_UPDATED: 'Client Updated',
  CLIENT_DELETED: 'Client Deleted',
  
  // Document events
  DOCUMENT_UPLOADED: 'Document Uploaded',
  DOCUMENT_ANALYZED: 'Document Analyzed',
  DOCUMENT_DOWNLOADED: 'Document Downloaded',
  
  // Contract events
  CONTRACT_CREATED: 'Contract Created',
  CONTRACT_SIGNED: 'Contract Signed',
  CONTRACT_ANALYZED: 'Contract Analyzed',
  
  // Task events
  TASK_CREATED: 'Task Created',
  TASK_COMPLETED: 'Task Completed',
  TASK_ASSIGNED: 'Task Assigned',
  
  // Calendar events
  EVENT_CREATED: 'Calendar Event Created',
  EVENT_UPDATED: 'Calendar Event Updated',
  
  // Invoice events
  INVOICE_CREATED: 'Invoice Created',
  INVOICE_SENT: 'Invoice Sent',
  
  // AI events
  AI_CHAT_STARTED: 'AI Chat Started',
  AI_DOCUMENT_ANALYSIS: 'AI Document Analysis',
  
  // Navigation
  PAGE_VIEW: 'Page View',
} as const;
