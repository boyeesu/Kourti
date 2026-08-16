import { sanitizeErrorForLogging } from '@/lib/error';
import { addCSRFToRequest } from '@/lib/csrf';
import { getSession } from '@/lib/authClient';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  level: LogLevel;
  message: string;
  error?: unknown;
  timestamp: string;
  meta?: Record<string, unknown>;
  sessionId?: string;
  userId?: string;
  organizationId?: string;
  url?: string;
  userAgent?: string;
}

// Constants for logger configuration
const MAX_LOGS = 200; // Reduced to prevent excessive localStorage usage
const LOG_STORAGE_KEY = 'kourti_legal_logs';

/**
 * True only when running on a local development host. Used to gate features that
 * could leak data on deployed environments (localStorage log persistence,
 * `window.__KOURTI_LOGS__`). We deliberately key off the hostname rather than
 * `import.meta.env.MODE`, because staging/preview deploys also build in
 * non-production modes and must NOT persist logs to the browser. (M7)
 */
const IS_LOCALHOST =
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(window.location.hostname);

const SHOULD_PERSIST_TO_LOCAL = IS_LOCALHOST;
const SHOULD_SEND_TO_SERVER = true;
const SERVER_LOG_ENDPOINT = import.meta.env.VITE_LOG_API_ENDPOINT || null;
const LOG_BATCH_SIZE = 20; // Number of logs to collect before sending to server
const ENABLE_CONSOLE_LOGS = import.meta.env.MODE !== 'production';

/** Query params that must never be recorded in logs (M7). */
const SENSITIVE_QUERY_PARAMS = ['token', 'access_token', 'refresh_token', 'code', 'state', 'email'];

/**
 * Strip sensitive query parameters (reset/invite tokens, OAuth codes, email)
 * from a URL before it is logged. Returns the URL with offending params replaced
 * by `[redacted]`. Falls back to the path-only form if parsing fails.
 */
export function sanitizeUrl(rawUrl: string | undefined | null): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : undefined);
    for (const key of SENSITIVE_QUERY_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    return url.toString();
  } catch {
    // Not a parseable URL (e.g. a bare search string) — redact defensively.
    return rawUrl.replace(
      new RegExp(`([?&](?:${SENSITIVE_QUERY_PARAMS.join('|')})=)[^&#]*`, 'gi'),
      '$1[redacted]'
    );
  }
}

// Generate a unique session ID for better tracking (lazy-loaded to avoid initialization issues)
let _sessionId: string | null = null;

function getSessionId(): string {
  if (_sessionId) return _sessionId;

  if (typeof window === 'undefined') {
    _sessionId = 'server-session';
    return _sessionId;
  }

  const storedId = localStorage.getItem('kourti_session_id');
  if (storedId) {
    _sessionId = storedId;
    return _sessionId;
  }

  const newId = crypto.randomUUID();
  localStorage.setItem('kourti_session_id', newId);
  _sessionId = newId;
  return _sessionId;
}

// In-memory log collection
const logs: LogEntry[] = (() => {
  if (typeof window !== 'undefined' && SHOULD_PERSIST_TO_LOCAL) {
    try {
      const stored = localStorage.getItem(LOG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LogEntry[];
        if (parsed.length > MAX_LOGS) {
          return parsed.slice(parsed.length - MAX_LOGS);
        }
        return parsed;
      }
    } catch {
      // Ignore malformed logs in storage
      console.warn('Failed to parse stored logs, resetting log storage');
      localStorage.removeItem(LOG_STORAGE_KEY);
    }
  }
  return [];
})();

// Queue for pending logs to be sent to server
let pendingServerLogs: LogEntry[] = [];

/**
 * Persist logs to localStorage (if enabled)
 */
function persistToLocalStorage() {
  if (typeof window !== 'undefined' && SHOULD_PERSIST_TO_LOCAL) {
    try {
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
    } catch {
      // If storage is full, clear old logs and try again
      try {
        localStorage.removeItem(LOG_STORAGE_KEY);
        localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs.slice(-50)));
      } catch {
        // If still failing, just give up on persistence
        console.warn('Failed to persist logs to localStorage');
      }
    }
  }
}

/**
 * Add an entry to the log collection
 */
function addEntry(entry: LogEntry) {
  // Add contextual information
  const enhancedEntry: LogEntry = {
    ...entry,
    sessionId: getSessionId(),
    url: typeof window !== 'undefined' ? sanitizeUrl(window.location.href) : undefined,
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
  };

  // Add to in-memory logs
  logs.push(enhancedEntry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }

  // Persist to localStorage if enabled
  if (SHOULD_PERSIST_TO_LOCAL) {
    persistToLocalStorage();
  }

  // Add to server queue if enabled
  if (SHOULD_SEND_TO_SERVER && SERVER_LOG_ENDPOINT) {
    pendingServerLogs.push(enhancedEntry);

    // Send logs if we've collected enough
    if (pendingServerLogs.length >= LOG_BATCH_SIZE) {
      sendPendingLogsToServer();
    }
  }

  // Output to console if enabled (except in production)
  if (ENABLE_CONSOLE_LOGS) {
    switch (entry.level) {
      case 'info':
        console.info(`[${entry.level.toUpperCase()}] ${entry.message}`);
        break;
      case 'warn':
        console.warn(`[${entry.level.toUpperCase()}] ${entry.message}`);
        break;
      case 'error':
        console.error(`[${entry.level.toUpperCase()}] ${entry.message}`, entry.error);
        break;
      case 'debug':
        console.debug(`[${entry.level.toUpperCase()}] ${entry.message}`);
        break;
    }
  }
}

/**
 * Send pending logs to the server endpoint
 */
async function sendPendingLogsToServer() {
  if (!pendingServerLogs.length || !SERVER_LOG_ENDPOINT) return;

  // Clone and clear pending logs
  const logsToSend = [...pendingServerLogs];
  pendingServerLogs = [];

  try {
    // Get current user from authClient session
    let userId: string | undefined;

    try {
      const session = getSession();
      userId = session?.user?.id;
    } catch (err) {
      console.warn('Failed to fetch user for logging', err);
    }

    if (userId) {
      logsToSend.forEach((log) => {
        log.userId = userId;
      });
    }

    // Send logs to server with CSRF protection
    const csrfProtectedRequest = addCSRFToRequest({
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const headers = new Headers(csrfProtectedRequest.headers);

    if (ENABLE_CONSOLE_LOGS) {
      console.assert(
        headers.get('Content-Type') === 'application/json',
        'Logger request headers missing Content-Type'
      );
      console.assert(headers.has('X-CSRF-Token'), 'Logger request headers missing X-CSRF-Token');
    }

    await fetch(SERVER_LOG_ENDPOINT, {
      method: 'POST',
      ...csrfProtectedRequest,
      headers,
      body: JSON.stringify({
        logs: logsToSend,
        timestamp: new Date().toISOString(),
        sessionId: getSessionId(),
      }),
    });
  } catch (err) {
    console.warn('Failed to send logs to server', err);

    // Put logs back in the queue
    pendingServerLogs = [...logsToSend, ...pendingServerLogs];

    // Cap the queue size to prevent memory issues
    if (pendingServerLogs.length > MAX_LOGS) {
      pendingServerLogs = pendingServerLogs.slice(-MAX_LOGS);
    }
  }
}

/**
 * Log an info message
 */
export function logInfo(message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    level: 'info',
    message,
    timestamp: new Date().toISOString(),
    meta,
  };
  addEntry(entry);
}

/**
 * Log a warning message
 */
export function logWarn(message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    level: 'warn',
    message,
    timestamp: new Date().toISOString(),
    meta,
  };
  addEntry(entry);
}

/**
 * Log an error with sanitized error information
 */
export function logError(message: string, errorDetails?: unknown) {
  // Sanitize error to remove sensitive information
  const sanitizedError = errorDetails ? sanitizeErrorForLogging(errorDetails) : undefined;

  const entry: LogEntry = {
    level: 'error',
    message,
    error: sanitizedError,
    timestamp: new Date().toISOString(),
  };
  addEntry(entry);
}

/**
 * Log a debug message (only appears in development)
 */
export function logDebug(message: string, meta?: Record<string, unknown>) {
  if (import.meta.env.MODE === 'production') return;

  const entry: LogEntry = {
    level: 'debug',
    message,
    timestamp: new Date().toISOString(),
    meta,
  };
  addEntry(entry);
}

/**
 * Get all stored logs
 */
export function getLogs() {
  return [...logs];
}

/**
 * Clear all stored logs
 */
export function clearLogs() {
  logs.length = 0;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LOG_STORAGE_KEY);
  }
}

/**
 * Force send logs to the server endpoint
 */
export async function sendLogsToServer() {
  if (pendingServerLogs.length > 0 || logs.length > 0) {
    // Add all logs to pending
    pendingServerLogs = [...pendingServerLogs, ...logs];

    // Remove duplicates
    const uniqueLogs: Record<string, LogEntry> = {};
    pendingServerLogs.forEach((log) => {
      const key = `${log.timestamp}-${log.level}-${log.message}`;
      uniqueLogs[key] = log;
    });

    pendingServerLogs = Object.values(uniqueLogs);

    // Send logs
    await sendPendingLogsToServer();
    return true;
  }
  return false;
}

// Create flush interval for logs
if (typeof window !== 'undefined' && SHOULD_SEND_TO_SERVER && SERVER_LOG_ENDPOINT) {
  setInterval(() => {
    if (pendingServerLogs.length > 0) {
      sendPendingLogsToServer();
    }
  }, 30000); // Every 30 seconds

  // Send logs before page unload
  window.addEventListener('beforeunload', () => {
    if (pendingServerLogs.length > 0) {
      navigator.sendBeacon(
        SERVER_LOG_ENDPOINT,
        JSON.stringify({
          logs: pendingServerLogs,
          timestamp: new Date().toISOString(),
          sessionId: getSessionId(),
        })
      );
    }
  });
}

// Initialize logs
persistToLocalStorage();

// Expose logs for debugging on localhost only (M7) — never on deployed envs,
// including staging/preview which also build in non-production modes.
if (typeof window !== 'undefined' && IS_LOCALHOST) {
  (window as unknown as Record<string, unknown>).__KOURTI_LOGS__ = {
    getLogs,
    clearLogs,
    sendLogsToServer,
  };
}
