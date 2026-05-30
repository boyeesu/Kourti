/**
 * Streaming client for the public marketing chatbot (MARTHA).
 *
 * Talks to the backend's unauthenticated `POST /api/v1/public/chat` endpoint,
 * which performs RAG over the Kourti knowledge base and streams the answer back
 * as Server-Sent Events. We deliberately avoid the shared `request()` helper in
 * `api.ts` because that one buffers the full body; here we need to read the
 * response stream incrementally so the UI can render tokens as they arrive.
 */

const BACKEND_API_URL = (import.meta.env.VITE_BACKEND_API_URL || '').replace(/\/$/, '');

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamHandlers {
  /** Fired for every token/delta as it streams in. */
  onDelta: (text: string) => void;
  /** Fired once when the stream finishes cleanly. */
  onDone?: (meta: { sources?: string[] }) => void;
  /** Fired on any transport/parse/upstream error. */
  onError?: (message: string) => void;
}

/**
 * Send a question (plus prior turns for context) and stream the answer.
 * Returns an `abort()` function so the caller can cancel an in-flight request
 * (e.g. when the user closes the widget or sends a new message).
 */
export function streamChat(
  message: string,
  history: ChatTurn[],
  handlers: StreamHandlers
): () => void {
  const controller = new AbortController();

  void (async () => {
    if (!BACKEND_API_URL) {
      handlers.onError?.('Chat is not configured. Please try again later.');
      return;
    }

    try {
      const res = await fetch(`${BACKEND_API_URL}/api/v1/public/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        // Try to surface a structured error message if the server sent one.
        let msg = `Request failed (${res.status})`;
        try {
          const data = await res.json();
          msg = (data && (data.error || data.message)) || msg;
        } catch {
          /* non-JSON error body — keep the generic message */
        }
        handlers.onError?.(msg);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sources: string[] | undefined;

      // SSE frames are separated by a blank line; each frame is `data: <json>`.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);

          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;

          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const evt = JSON.parse(payload) as {
              type: 'delta' | 'done' | 'error';
              content?: string;
              error?: string;
              sources?: string[];
            };
            if (evt.type === 'delta' && evt.content) {
              handlers.onDelta(evt.content);
            } else if (evt.type === 'done') {
              sources = evt.sources;
            } else if (evt.type === 'error') {
              handlers.onError?.(evt.error || 'Something went wrong.');
              return;
            }
          } catch {
            /* ignore malformed frame */
          }
        }
      }

      handlers.onDone?.({ sources });
    } catch (err) {
      if (controller.signal.aborted) return; // intentional cancel — stay quiet
      handlers.onError?.(err instanceof Error ? err.message : 'Network error. Please try again.');
    }
  })();

  return () => controller.abort();
}
