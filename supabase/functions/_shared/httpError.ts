export type ErrorDetails = Record<string, unknown> | undefined;

export class HttpError extends Error {
  status: number;
  code: string;
  details?: ErrorDetails;

  constructor(message: string, status = 500, code = 'INTERNAL_ERROR', details?: ErrorDetails) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createErrorResponse(
  error: unknown,
  corsHeaders: Record<string, string>,
  fallbackMessage = 'Internal Server Error',
) {
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (error instanceof HttpError) {
    const payload: Record<string, unknown> = {
      success: false,
      error: error.message || fallbackMessage,
      errorCode: error.code,
    };

    if (error.details && Object.keys(error.details).length > 0) {
      payload.details = error.details;
    }

    return new Response(JSON.stringify(payload), {
      status: error.status,
      headers,
    });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;

  return new Response(JSON.stringify({
    success: false,
    error: message || fallbackMessage,
    errorCode: 'INTERNAL_ERROR',
  }), {
    status: 500,
    headers,
  });
}
