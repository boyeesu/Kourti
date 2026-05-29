import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { corsOrigins } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { requireActiveSubscription } from './middleware/requireActiveSubscription.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { withRequestContext } from './middleware/requestContext.js';
import { aiRouter } from './routes/api/ai.js';
import { adminRouter } from './routes/api/admin.js';
import { authRouter } from './routes/api/authRoutes.js';
import { casesRouter } from './routes/api/cases.js';
import { chatRouter } from './routes/api/chat.js';
import { clientsRouter } from './routes/api/clients.js';
import { dashboardRouter } from './routes/api/dashboard.js';
import { documentsRouter } from './routes/api/documents.js';
import { filesRouter } from './routes/api/files.js';
import { invoicesRouter } from './routes/api/invoices.js';
import { miscRouter } from './routes/api/misc.js';
import { paystackWebhookRouter } from './routes/api/paystackWebhook.js';
import { onboardingRouter } from './routes/api/onboarding.js';
import { billingRouter } from './routes/api/billing.js';
import { plansRouter } from './routes/api/plans.js';
import { publicRouter } from './routes/api/public.js';
import { calendarRouter } from './routes/api/calendar.js';
import { organizationsRouter } from './routes/api/organizations.js';
import { notificationsRouter } from './routes/api/notifications.js';
import { invitationsRouter } from './routes/api/invitations.js';
import { profilesRouter } from './routes/api/profiles.js';
import { rolesRouter } from './routes/api/roles.js';
import { searchRouter } from './routes/api/search.js';
import { tasksRouter } from './routes/api/tasks.js';
import { usersRouter } from './routes/api/users.js';
import { healthRouter } from './routes/health.js';
import { contractsRouter } from './routes/api/contracts.js';
import { agentsRouter } from './routes/api/agents.js';
import { negotiationsRouter } from './routes/api/negotiations.js';
import { playbooksRouter } from './routes/api/playbooks.js';
import { intelligenceRouter } from './routes/api/intelligence.js';
import { documentVersionsRouter } from './routes/api/documentVersions.js';
import { redlineRouter } from './routes/api/redline.js';
import { tabularReviewsRouter } from './routes/api/tabularReviews.js';

function stripNullsInPlace(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) stripNullsInPlace(item);
    return;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (obj[key] === null) delete obj[key];
      else stripNullsInPlace(obj[key]);
    }
  }
}

export function createApp() {
  const app = express();

  // Trust Railway/proxy headers for correct client IP in rate limiting
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins.length ? corsOrigins : false,
      credentials: true,
    })
  );
  app.use(cookieParser());

  // Webhooks must run BEFORE the JSON parser so the raw body is available
  // for HMAC verification. Each webhook router applies its own parser.
  app.use('/api/v1/webhooks', paystackWebhookRouter);

  app.use(express.json({ limit: '2mb' }));
  // Strip nulls from request bodies so zod `.optional()` schemas accept
  // frontends that send `field: null` instead of omitting the key.
  app.use((req, _res, next) => {
    if (req.body && typeof req.body === 'object') {
      stripNullsInPlace(req.body);
    }
    next();
  });
  app.use(morgan('combined'));
  app.use(withRequestContext);

  app.get('/', (_req, res) => {
    res.status(200).json({ ok: true, service: 'kourti-backend-node' });
  });

  app.use('/health', healthRouter);

  // Auth routes are public (no requireAuth)
  app.use('/api/v1/auth', authRouter);
  // Files router handles its own auth (signed URLs are public, uploads need auth)
  app.use('/api/v1/files', filesRouter);
  // Public marketing-site endpoints (live pricing + lead capture). No auth;
  // rate-limited per IP. Marketing origin must be in CORS_ORIGINS.
  app.use('/api/v1/public', publicRouter);

  // Ungated (always reachable so users can pay, manage org, see banner).
  app.use('/api/v1/admin', requireAuth, adminRouter);
  app.use('/api/v1/dashboard', requireAuth, dashboardRouter);
  app.use('/api/v1/misc', requireAuth, miscRouter);
  app.use('/api/v1/onboarding', requireAuth, onboardingRouter);
  app.use('/api/v1/billing', requireAuth, billingRouter);
  app.use('/api/v1/plans', requireAuth, plansRouter);
  app.use('/api/v1/notifications', requireAuth, notificationsRouter);
  app.use('/api/v1/invitations', requireAuth, invitationsRouter);
  app.use('/api/v1/profiles', requireAuth, profilesRouter);
  app.use('/api/v1/tasks', requireAuth, tasksRouter);
  app.use('/api/v1/organizations', requireAuth, organizationsRouter);
  app.use('/api/v1/roles', requireAuth, rolesRouter);
  app.use('/api/v1/users', requireAuth, usersRouter);

  // Gated behind active subscription / live trial.
  app.use('/api/v1/contracts', requireAuth, requireActiveSubscription, contractsRouter);
  app.use('/api/v1/cases', requireAuth, requireActiveSubscription, casesRouter);
  app.use('/api/v1/documents', requireAuth, requireActiveSubscription, documentsRouter);
  app.use('/api/v1/search', requireAuth, requireActiveSubscription, searchRouter);
  app.use('/api/v1/ai', requireAuth, requireActiveSubscription, aiRouter);
  app.use('/api/v1/calendar', requireAuth, requireActiveSubscription, calendarRouter);
  app.use('/api/v1/chat', requireAuth, requireActiveSubscription, chatRouter);
  app.use('/api/v1/clients', requireAuth, requireActiveSubscription, clientsRouter);
  app.use('/api/v1/invoices', requireAuth, requireActiveSubscription, invoicesRouter);
  app.use('/api/v1/agents', requireAuth, requireActiveSubscription, agentsRouter);
  app.use('/api/v1/negotiations', requireAuth, requireActiveSubscription, negotiationsRouter);
  app.use('/api/v1/playbooks', requireAuth, requireActiveSubscription, playbooksRouter);
  app.use('/api/v1/intelligence', requireAuth, requireActiveSubscription, intelligenceRouter);
  app.use(
    '/api/v1/documents/:id/versions',
    requireAuth,
    requireActiveSubscription,
    documentVersionsRouter
  );
  app.use('/api/v1/redline', requireAuth, requireActiveSubscription, redlineRouter);
  app.use('/api/v1/tabular-reviews', requireAuth, requireActiveSubscription, tabularReviewsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
