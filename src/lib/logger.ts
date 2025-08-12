export type LogLevel = 'info' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  error?: unknown;
  timestamp: string;
}

const MAX_LOGS = 500;
const LOG_STORAGE_KEY = 'app_logs';

const logs: LogEntry[] = (() => {
  if (typeof window !== 'undefined') {
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
      // ignore malformed logs in storage
    }
  }
  return [];
})();

function persist() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
    } catch {
      // ignore persistence errors
    }
  }
}

persist();

function addEntry(entry: LogEntry) {
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  persist();
}

export function logInfo(message: string) {
  const entry: LogEntry = {
    level: 'info',
    message,
    timestamp: new Date().toISOString(),
  };
  addEntry(entry);
  console.info(message);
}

export function logError(message: string, error?: unknown) {
  const entry: LogEntry = {
    level: 'error',
    message,
    error,
    timestamp: new Date().toISOString(),
  };
  addEntry(entry);
  console.error(message, error);
}

export function getLogs() {
  return logs;
}

export function clearLogs() {
  logs.length = 0;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LOG_STORAGE_KEY);
  }
}

export async function sendLogsToEndpoint(url: string) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logs),
    });
  } catch (err) {
    console.error('Failed to send logs to endpoint', err);
  }
}

if (typeof window !== 'undefined') {
  // expose logs for easy inspection in the browser console
  (window as any).__APP_LOGS__ = logs;
}
