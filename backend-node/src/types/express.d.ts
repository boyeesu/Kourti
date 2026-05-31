export {};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: {
        userId: string;
        email: string | null;
        organizationId: string;
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
