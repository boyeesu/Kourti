export type LogLevel = 'info' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  error?: unknown;
  timestamp: string;
}

const logs: LogEntry[] = [];

export function logInfo(message: string) {
  const entry: LogEntry = {
    level: 'info',
    message,
    timestamp: new Date().toISOString(),
  };
  logs.push(entry);
  console.info(message);
}

export function logError(message: string, error?: unknown) {
  const entry: LogEntry = {
    level: 'error',
    message,
    error,
    timestamp: new Date().toISOString(),
  };
  logs.push(entry);
  console.error(message, error);
}

export function getLogs() {
  return logs;
}

if (typeof window !== 'undefined') {
  // expose logs for easy inspection in the browser console
  (window as any).__APP_LOGS__ = logs;
}
