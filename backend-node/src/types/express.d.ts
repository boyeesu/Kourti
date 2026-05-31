export {};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: {
        userId: string;
        email: string | null;
        organizationId: string;
        // Present only when the request is authenticated via a platform-admin
        // "View as" token. `userId`/`organizationId` are the impersonated
        // subject; `by` is the admin actually driving the session.
        impersonation?: {
          sessionId: string;
          by: string;
          scope: 'read' | 'write';
        };
      };
      // Set by middleware/requireClientAuth for the client portal surface.
      // Deliberately separate from `auth` — client tokens are NOT staff tokens.
      clientAuth?: {
        clientUserId: string;
        email: string;
      };
    }
  }
}
