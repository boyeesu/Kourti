/**
 * Public, unauthenticated endpoints for the marketing site (kourti.com).
 *
 * - GET  /plans       — live pricing, the single source of truth that the
 *                       platform admin edits via /api/v1/admin/plans*.
 * - POST /contact     — contact-form lead capture.
 * - POST /assessment  — legal-practice maturity assessment lead capture.
 *
 * No auth (the marketing site has no users). IP rate-limited to deter spam.
 * The marketing origin must be present in CORS_ORIGINS for the browser to read
 * these cross-origin. Lead notifications go out via Resend; the contact is
 * mirrored to Brevo for CRM — both fire-and-forget so a provider outage never
 * fails the form.
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import {
  sendAssessmentLeadNotification,
  sendAssessmentResultEmail,
  sendContactLeadNotification,
} from '../../services/email.js';
import { brevoSyncMarketingLead, logBrevoError } from '../../services/brevo.js';

export const publicRouter = Router();

function enforceRateLimit(identifier: string, max: number, windowMs: number) {
  const result = checkRateLimit(identifier, max, windowMs);
  if (!result.allowed) {
    throw new ApiError(
      `Too many requests. Try again in ${result.retryAfter}s.`,
      429,
      'RATE_LIMITED'
    );
  }
}

function clientIp(req: { ip?: string; socket: { remoteAddress?: string } }): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// ── Plans ────────────────────────────────────────────────────────────────────

interface PlanRow {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  plan_type: string;
  features: string[] | null;
  price_monthly: number | string | null;
  price_yearly: number | string | null;
  currency: string | null;
  highlight: boolean | null;
  sort_order: number | null;
  // feature_key list enabled for this plan_type (from public.plan_features).
  included_features: string[] | null;
}

publicRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    // included_features comes from the plan_features entitlement matrix
    // (admin-editable) so the marketing comparison table reflects exactly what
    // each tier unlocks. LEFT JOIN keeps plans even if the matrix is empty.
    const result = await db
      .query<PlanRow>(
        `select up.id, up.name, up.display_name, up.description, up.plan_type, up.features,
                up.price_monthly, up.price_yearly, up.currency, up.highlight, up.sort_order,
                coalesce(pf.keys, array[]::text[]) as included_features
           from public.user_plans up
           left join (
             select plan_type, array_agg(feature_key) as keys
               from public.plan_features
              where enabled = true
              group by plan_type
           ) pf on pf.plan_type = up.plan_type
          where up.is_active = true
          order by coalesce(up.sort_order, 99) asc, up.price_monthly asc nulls last`
      )
      .catch(() => ({ rows: [] as PlanRow[] }));

    res.status(200).json(
      result.rows.map((p) => ({
        id: p.id,
        name: p.name,
        display_name: p.display_name ?? p.name,
        description: p.description,
        plan_type: p.plan_type,
        features: Array.isArray(p.features) ? p.features : [],
        included_features: Array.isArray(p.included_features) ? p.included_features : [],
        // numeric columns come back as strings from pg; normalise to number|null.
        price_monthly: p.price_monthly == null ? null : Number(p.price_monthly),
        price_yearly: p.price_yearly == null ? null : Number(p.price_yearly),
        currency: p.currency ?? 'USD',
        highlight: p.highlight ?? false,
      }))
    );
  })
);

// ── Contact form ──────────────────────────────────────────────────────────────

const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  firmSize: z.string().trim().max(50).optional(),
  interest: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(5000),
});

publicRouter.post(
  '/contact',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`public-contact:${clientIp(req)}`, 5, 60_000);
    const lead = contactSchema.parse(req.body);
    const email = lead.email.toLowerCase();

    await db.query(
      `insert into public.contact_submissions
         (first_name, last_name, email, company, phone, firm_size, interest, message, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'contact')`,
      [
        lead.firstName,
        lead.lastName,
        email,
        lead.company ?? null,
        lead.phone ?? null,
        lead.firmSize ?? null,
        lead.interest,
        lead.message,
      ]
    );

    // Notify sales + mirror to CRM — never block the response on either.
    void sendContactLeadNotification({ ...lead, email }).catch((err) =>
      console.error('[public/contact] notification email failed:', err)
    );
    void brevoSyncMarketingLead(email, {
      firstName: lead.firstName,
      lastName: lead.lastName,
      firmName: lead.company,
    }).catch(logBrevoError);

    res.status(200).json({
      success: true,
      message: "Thanks for reaching out! We'll get back to you within 24 hours.",
    });
  })
);

// ── Maturity assessment ─────────────────────────────────────────────────────

const assessmentSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(200).optional(),
  tier: z.string().trim().min(1).max(100),
  totalScore: z.number().int().min(0).max(10_000),
  maxScore: z.number().int().min(1).max(10_000),
  // Answers are score values (numbers) but accept strings too for resilience.
  answers: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  dimensionScores: z.record(z.string(), z.number()),
});

publicRouter.post(
  '/assessment',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`public-assessment:${clientIp(req)}`, 5, 60_000);
    const lead = assessmentSchema.parse(req.body);
    const email = lead.email.toLowerCase();

    await db.query(
      `insert into public.contact_submissions
         (first_name, last_name, email, company, interest, message, source, metadata)
       values ($1,$2,$3,$4,'assessment',$5,'assessment',$6::jsonb)`,
      [
        lead.firstName,
        lead.lastName,
        email,
        lead.company ?? null,
        `Assessment completed. Tier: ${lead.tier}, Score: ${lead.totalScore}/${lead.maxScore}.`,
        JSON.stringify({
          tier: lead.tier,
          totalScore: lead.totalScore,
          maxScore: lead.maxScore,
          dimensionScores: lead.dimensionScores,
          answers: lead.answers ?? {},
        }),
      ]
    );

    const emailLead = {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email,
      company: lead.company ?? null,
      tier: lead.tier,
      totalScore: lead.totalScore,
      maxScore: lead.maxScore,
      dimensionScores: lead.dimensionScores,
    };

    void sendAssessmentResultEmail(emailLead).catch((err) =>
      console.error('[public/assessment] result email failed:', err)
    );
    void sendAssessmentLeadNotification(emailLead).catch((err) =>
      console.error('[public/assessment] notification email failed:', err)
    );
    void brevoSyncMarketingLead(email, {
      firstName: lead.firstName,
      lastName: lead.lastName,
      firmName: lead.company,
    }).catch(logBrevoError);

    res.status(200).json({ success: true });
  })
);
