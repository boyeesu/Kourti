import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import type { NextFunction, Request, Response } from 'express';

import { corsOrigins } from './config/env.js';
import { ApiError } from './lib/http.js';
import { checkRateLimit } from './lib/rateLimit.js';
import { isPlatformStaff } from './services/authorization.js';
import { requireAuth } from './middleware/auth.js';
import { requireClientAuth } from './middleware/requireClientAuth.js';
import { requireActiveSubscription } from './middleware/requireActiveSubscription.js';
import { requireFeature } from './middleware/requireFeature.js';
import { adminRateLimit } from './middleware/adminRateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { withRequestContext } from './middleware/requestContext.js';
import { aiRouter } from './routes/api/ai.js';
import { adminRouter } from './routes/api/admin.js';
import { adminBulkRouter } from './routes/api/adminBulk.js';
import { adminFeaturesRouter } from './routes/api/adminFeatures.js';
import { adminImpersonationRouter } from './routes/api/adminImpersonation.js';
import { adminBillingRouter } from './routes/api/adminBilling.js';
import { adminUsageRouter } from './routes/api/adminUsage.js';
import { adminHealthRouter } from './routes/api/adminHealth.js';
import { adminEmailRouter } from './routes/api/adminEmail.js';
import { adminAuditRouter } from './routes/api/adminAudit.js';
import { adminKbRouter } from './routes/api/adminKb.js';
import { adminPortalRouter } from './routes/api/adminPortal.js';
import { adminRulesRouter } from './routes/api/adminRules.js';
import { adminSecurityRouter } from './routes/api/adminSecurity.js';
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
import { portalRouter, portalAuthRouter } from './routes/api/portal.js';
import { portalTeamRouter } from './routes/api/portalTeam.js';
import { portalCalendarRouter } from './routes/api/portalCalendar.js';
import { clientPortalRouter } from './routes/api/clientPortal.js';

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

/**
 * App-wide per-IP rate limit. Generous (catches abuse/DoS, not normal use);
 * specific limiters on auth/AI/billing routes still apply on top. Keyed by
 * client IP so one source can't exhaust the API for everyone.
 */
function globalRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  const result = checkRateLimit(`global:${ip}`, 300, 60_000);
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfter));
    return next(new ApiError('Too many requests. Please slow down.', 429, 'RATE_LIMITED'));
  }
  next();
}

/**
 * Defense-in-depth backstop for the /api/v1/admin surface. Runs after
 * requireAuth and rejects any caller who is not platform staff, even though
 * every sub-route also self-authorizes via requireAdminCapabilityFor.
 */
function requirePlatformStaff(req: Request, _res: Response, next: NextFunction) {
  const auth = req.auth;
  if (!auth) return next(new ApiError('Authentication required', 401, 'AUTH_REQUIRED'));
  isPlatformStaff(auth.userId)
    .then((ok) => {
      if (!ok) return next(new ApiError('Forbidden', 403, 'FORBIDDEN'));
      next();
    })
    .catch(next);
}

/**
 * HTTPS enforcement. Railway terminates TLS upstream, so we trust the proxy
 * (app.set('trust proxy', 1)) and reject plaintext requests in production based
 * on x-forwarded-proto / req.protocol. Health checks are exempt so platform
 * probes (which may hit http internally) keep working.
 */
function enforceHttps(req: Request, _res: Response, next: NextFunction) {
  if (process.env.NODE_ENV !== 'production') return next();
  if (req.path === '/health' || req.path.startsWith('/health/')) return next();
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    (typeof forwardedProto === 'string' ? forwardedProto.split(',')[0]!.trim() : req.protocol) ||
    req.protocol;
  if (proto !== 'https') {
    return next(new ApiError('HTTPS is required', 403, 'HTTPS_REQUIRED'));
  }
  next();
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

  // Reject plaintext requests in production (Railway terminates TLS upstream).
  // Runs before everything else so no handler processes an http request.
  app.use(enforceHttps);

  // App-wide per-IP rate limit across the whole API surface. Generous cap so it
  // only trips on abuse/DoS; route-specific limiters (auth, AI, billing) still
  // apply their tighter limits on top.
  app.use('/api/v1', globalRateLimit);

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
  // Platform-admin surface (/thanos). Each sub-router self-authorizes per route
  // via requireAdminCapabilityFor, so they only need requireAuth upstream. All
  // share the /api/v1/admin prefix with distinct, non-colliding path segments.
  // Single auth pass + a blanket per-admin rate limit across the whole admin
  // surface (every mutation is also capability-gated + audited downstream).
  // Routers are chained so requireAuth/authenticateRequest runs once per request
  // rather than once per mounted router.
  app.use(
    '/api/v1/admin',
    requireAuth,
    requirePlatformStaff,
    adminRateLimit('admin_surface', 240, 60_000),
    adminRouter,
    adminFeaturesRouter,
    adminImpersonationRouter,
    adminBillingRouter,
    adminUsageRouter,
    adminHealthRouter,
    adminEmailRouter,
    adminAuditRouter,
    adminKbRouter,
    adminPortalRouter,
    adminRulesRouter,
    adminSecurityRouter
  );
  // Bulk ops and CSV exports are heavier + more sensitive — tighter cap on top.
  app.use(
    '/api/v1/admin',
    requireAuth,
    requirePlatformStaff,
    adminRateLimit('bulk', 30, 60_000),
    adminBulkRouter
  );
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
  // Automation suite — also gated on the plan feature (Professional+).
  app.use(
    '/api/v1/agents',
    requireAuth,
    requireActiveSubscription,
    requireFeature('agents'),
    agentsRouter
  );
  app.use(
    '/api/v1/negotiations',
    requireAuth,
    requireActiveSubscription,
    requireFeature('negotiations'),
    negotiationsRouter
  );
  app.use(
    '/api/v1/playbooks',
    requireAuth,
    requireActiveSubscription,
    requireFeature('playbooks'),
    playbooksRouter
  );
  app.use(
    '/api/v1/intelligence',
    requireAuth,
    requireActiveSubscription,
    requireFeature('intelligence'),
    intelligenceRouter
  );
  app.use(
    '/api/v1/documents/:id/versions',
    requireAuth,
    requireActiveSubscription,
    documentVersionsRouter
  );
  app.use(
    '/api/v1/redline',
    requireAuth,
    requireActiveSubscription,
    requireFeature('redline'),
    redlineRouter
  );
  app.use(
    '/api/v1/tabular-reviews',
    requireAuth,
    requireActiveSubscription,
    requireFeature('tabular_review'),
    tabularReviewsRouter
  );

  // ── Client Portal ──────────────────────────────────────────────────
  // Client-facing surface. Its own auth (client_users), NOT staff requireAuth.
  // The unauthenticated auth sub-router (login / accept-invite / reset) is
  // mounted FIRST so it isn't caught by requireClientAuth on the parent path.
  app.use('/api/v1/portal/auth', portalAuthRouter);
  // requireClientAuth runs once for the whole authenticated portal surface;
  // the feature routers (matters, team, calendar) are then layered on the
  // same base path.
  app.use('/api/v1/portal', requireClientAuth);
  app.use('/api/v1/portal', portalRouter);
  app.use('/api/v1/portal', portalTeamRouter);
  app.use('/api/v1/portal', portalCalendarRouter);
  // Staff-side management of the portal. Gated to Professional+ via the
  // 'client_portal' feature, like the rest of the automation suite.
  app.use(
    '/api/v1/client-portal',
    requireAuth,
    requireActiveSubscription,
    requireFeature('client_portal'),
    clientPortalRouter
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
