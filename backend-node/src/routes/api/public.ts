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
import { applyUnsubscribe, recordConsent, consentContext } from '../../services/consent.js';
import { streamChatCompletion } from '../../lib/openai.js';
import { searchMarketingKb, ingestKnowledge } from '../../services/marketingKb.js';
import { KOURTI_KNOWLEDGE, type KnowledgeEntry } from '../../data/kourtiKnowledge.js';
import { env } from '../../config/env.js';

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
  // limit_key -> cap (null = unlimited), from public.plan_limits.
  limits: Record<string, number | string | null> | null;
}

function normaliseLimits(
  raw: Record<string, number | string | null> | null
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) out[k] = v == null ? null : Number(v);
  }
  return out;
}

publicRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    // included_features comes from the plan_features entitlement matrix and
    // limits from plan_limits (both admin-editable) so the marketing comparison
    // reflects exactly what each tier unlocks. LEFT JOINs keep plans even when a
    // matrix is empty; a missing limit key (or null) means unlimited.
    const result = await db
      .query<PlanRow>(
        `select up.id, up.name, up.display_name, up.description, up.plan_type, up.features,
                up.price_monthly, up.price_yearly, up.currency, up.highlight, up.sort_order,
                coalesce(pf.keys, array[]::text[]) as included_features,
                pl.limits as limits
           from public.user_plans up
           left join (
             select plan_type, array_agg(feature_key) as keys
               from public.plan_features
              where enabled = true
              group by plan_type
           ) pf on pf.plan_type = up.plan_type
           left join (
             select plan_type, json_object_agg(limit_key, limit_value) as limits
               from public.plan_limits
              where limit_value is not null
              group by plan_type
           ) pl on pl.plan_type = up.plan_type
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
        limits: normaliseLimits(p.limits),
        // numeric columns come back as strings from pg; normalise to number|null.
        price_monthly: p.price_monthly == null ? null : Number(p.price_monthly),
        price_yearly: p.price_yearly == null ? null : Number(p.price_yearly),
        currency: p.currency ?? 'USD',
        highlight: p.highlight ?? false,
      }))
    );
  })
);

// ── Marketing unsubscribe (one-click, stateless token) ─────────────────────
// Linked from the footer of every marketing email. Validates an HMAC token so
// no login is required, then suppresses the address everywhere we track it.
const unsubscribeSchema = z.object({
  email: z.string().trim().email().max(254),
  token: z.string().min(1).max(200),
});

async function handleUnsubscribe(email: string, token: string, res: import('express').Response) {
  const ok = await applyUnsubscribe(email, token);
  if (!ok) {
    res
      .status(400)
      .type('html')
      .send('<h1>Invalid unsubscribe link</h1><p>This link is invalid or expired.</p>');
    return;
  }
  res
    .status(200)
    .type('html')
    .send(
      '<h1>You have been unsubscribed</h1><p>You will no longer receive marketing emails from Kourti. Transactional messages (security, billing) may still be sent.</p>'
    );
}

publicRouter.get(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const parsed = unsubscribeSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).type('html').send('<h1>Invalid unsubscribe link</h1>');
      return;
    }
    await handleUnsubscribe(parsed.data.email, parsed.data.token, res);
  })
);

publicRouter.post(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const { email, token } = unsubscribeSchema.parse(req.body ?? {});
    const ok = await applyUnsubscribe(email, token);
    res.status(ok ? 200 : 400).json({ success: ok });
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
  // Explicit, optional marketing opt-in (GDPR Art. 7). Submitting the form to
  // get a reply is the contract/legitimate-interest basis; adding the lead to
  // the marketing CRM requires this separate consent.
  marketingConsent: z.boolean().optional(),
  // Honeypot: a hidden field real users never fill. Bots that auto-fill every
  // input trip it. Accepted then silently dropped (we don't 4xx, to avoid
  // signalling the trap).
  website: z.string().max(200).optional(),
});

/** True when a honeypot field was filled — treat as a bot, drop silently. */
function isHoneypotTripped(value: string | undefined): boolean {
  return !!value && value.trim().length > 0;
}

const HONEYPOT_OK = {
  success: true,
  message: "Thanks for reaching out! We'll get back to you within 24 hours.",
};

publicRouter.post(
  '/contact',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`public-contact:${clientIp(req)}`, 5, 60_000);
    const lead = contactSchema.parse(req.body);
    if (isHoneypotTripped(lead.website)) {
      res.status(200).json(HONEYPOT_OK);
      return;
    }
    const email = lead.email.toLowerCase();

    const marketingConsent = lead.marketingConsent === true;

    await db.query(
      `insert into public.contact_submissions
         (first_name, last_name, email, company, phone, firm_size, interest, message, source, marketing_consent)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'contact',$9)`,
      [
        lead.firstName,
        lead.lastName,
        email,
        lead.company ?? null,
        lead.phone ?? null,
        lead.firmSize ?? null,
        lead.interest,
        lead.message,
        marketingConsent,
      ]
    );

    const { ip, userAgent } = consentContext(req);
    void recordConsent({
      subjectType: 'lead',
      email,
      consentType: 'marketing',
      granted: marketingConsent,
      source: 'contact_form',
      ip,
      userAgent,
    });

    // Notify sales — never block the response. This is the legitimate-interest
    // basis (responding to an enquiry), not marketing, so it always runs.
    void sendContactLeadNotification({ ...lead, email }).catch((err) =>
      console.error('[public/contact] notification email failed:', err)
    );
    // Mirror to the marketing CRM ONLY with explicit opt-in.
    if (marketingConsent) {
      void brevoSyncMarketingLead(email, {
        firstName: lead.firstName,
        lastName: lead.lastName,
        firmName: lead.company,
      }).catch(logBrevoError);
    }

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
  marketingConsent: z.boolean().optional(),
  website: z.string().max(200).optional(), // honeypot
});

publicRouter.post(
  '/assessment',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`public-assessment:${clientIp(req)}`, 5, 60_000);
    const lead = assessmentSchema.parse(req.body);
    if (isHoneypotTripped(lead.website)) {
      res.status(200).json({ success: true });
      return;
    }
    const email = lead.email.toLowerCase();

    const marketingConsent = lead.marketingConsent === true;

    await db.query(
      `insert into public.contact_submissions
         (first_name, last_name, email, company, interest, message, source, metadata, marketing_consent)
       values ($1,$2,$3,$4,'assessment',$5,'assessment',$6::jsonb,$7)`,
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
        marketingConsent,
      ]
    );

    const { ip, userAgent } = consentContext(req);
    void recordConsent({
      subjectType: 'lead',
      email,
      consentType: 'marketing',
      granted: marketingConsent,
      source: 'assessment',
      ip,
      userAgent,
    });

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
    if (marketingConsent) {
      void brevoSyncMarketingLead(email, {
        firstName: lead.firstName,
        lastName: lead.lastName,
        firmName: lead.company,
      }).catch(logBrevoError);
    }

    res.status(200).json({ success: true });
  })
);

// ── MARTHA chatbot (public RAG) ──────────────────────────────────────────────

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      })
    )
    .max(12)
    .optional(),
});

/** Build a short, always-current pricing summary from the live plans table. */
async function buildPlanSummary(): Promise<string> {
  const result = await db
    .query<PlanRow>(
      `select name, display_name, description, plan_type, price_monthly,
              price_yearly, currency, sort_order
         from public.user_plans
        where is_active = true
        order by coalesce(sort_order, 99) asc, price_monthly asc nulls last`
    )
    .catch(() => ({ rows: [] as PlanRow[] }));

  if (!result.rows.length) return '';

  return result.rows
    .map((p) => {
      const name = p.display_name ?? p.name;
      const currency = p.currency ?? 'USD';
      const monthly =
        p.price_monthly == null
          ? 'custom pricing — contact sales'
          : `${currency} ${Number(p.price_monthly)} per seat / month`;
      const yearly =
        p.price_yearly == null ? '' : `, or ${currency} ${Number(p.price_yearly)} per seat / year`;
      const desc = p.description ? ` — ${p.description}` : '';
      return `- ${name}: ${monthly}${yearly}${desc}`;
    })
    .join('\n');
}

publicRouter.post(
  '/chat',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`public-chat:${clientIp(req)}`, 20, 60_000);
    const { message, history = [] } = chatSchema.parse(req.body);

    // Retrieve grounding context and live pricing in parallel; both degrade to
    // empty so a failure in either never blocks the answer.
    const [matches, planSummary] = await Promise.all([
      searchMarketingKb(message, 5).catch(() => []),
      buildPlanSummary().catch(() => ''),
    ]);

    const context = matches
      .map((m, i) => `[Source ${i + 1}: ${m.title}]\n${m.content}`)
      .join('\n\n');
    const sources = Array.from(new Set(matches.map((m) => m.title)));

    const system = [
      'You are MARTHA, the friendly and knowledgeable AI assistant on the Kourti website (kourti.com).',
      'Kourti is an AI-powered legal operations platform for law firms and in-house legal teams.',
      'You help prospective and current customers understand Kourti — its product, features, pricing, and how to get started.',
      '',
      'Rules:',
      '- Answer using ONLY the CONTEXT and CURRENT PRICING below. Do not invent features, prices, integrations, or claims.',
      "- If the answer isn't in the context, say so briefly and point them to the contact page (kourti.com/contact) or suggest starting a free trial.",
      '- Be concise, warm, and helpful. Use short paragraphs or bullet points. Avoid legal jargon.',
      '- You are a product assistant, not a lawyer — never give legal advice; for legal questions, suggest they consult a qualified lawyer or use Kourti once signed in.',
      '- When relevant, gently encourage next steps: starting a free trial, viewing pricing, or contacting the team.',
      '- For exact prices, always use the CURRENT PRICING section (it is live and authoritative).',
      '',
      'CURRENT PRICING:',
      planSummary ||
        'Pricing details are on kourti.com/pricing — invite the user to view them or contact the team.',
      '',
      'CONTEXT:',
      context ||
        '(no specific context retrieved — answer from general Kourti knowledge in these instructions, and recommend the contact page for specifics)',
    ].join('\n');

    const messages = [
      { role: 'system', content: system },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ] as Parameters<typeof streamChatCompletion>[0];

    // Stream the answer as Server-Sent Events (same frame shape as the in-app
    // AI assistant: {type:'delta'|'done'|'error'}).
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      await streamChatCompletion(
        messages,
        (delta) => {
          res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
        },
        700
      );
      res.write(`data: ${JSON.stringify({ type: 'done', sources })}\n\n`);
    } catch (err) {
      // Log the real error server-side; send a generic message to the public
      // client so internal/provider error details never leak.
      console.error('[public/chat] stream failed:', err instanceof Error ? err.message : err);
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: 'The assistant is briefly unavailable. Please try again.' })}\n\n`
      );
    } finally {
      res.end();
    }
  })
);

// ── KB sync (CI → backend) ───────────────────────────────────────────────────
// Nightly GitHub Action extracts copy from the marketing source and POSTs it
// here; we merge in curated supplements and re-embed using the already-configured
// embedding model. Guarded by a shared secret so the DB never leaves the backend.

const kbSyncSchema = z.object({
  entries: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(500),
        category: z.enum(['product', 'pricing', 'faq', 'company']),
        content: z.string().trim().min(1).max(20_000),
      })
    )
    .max(200),
});

publicRouter.post(
  '/kb/sync',
  asyncHandler(async (req, res) => {
    if (!env.KB_SYNC_SECRET) {
      throw new ApiError('KB sync is not configured', 503, 'KB_SYNC_DISABLED');
    }
    const auth = req.header('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== env.KB_SYNC_SECRET) {
      throw new ApiError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { entries } = kbSyncSchema.parse(req.body);

    // Site copy is primary; curated supplements fill gaps. Curated wins on id
    // collisions. Prune anything no longer present so removed pages drop out.
    const byId = new Map<string, KnowledgeEntry>();
    for (const e of entries) byId.set(e.id, e);
    for (const e of KOURTI_KNOWLEDGE) byId.set(e.id, e);
    const merged = [...byId.values()];

    // Embedding can take tens of seconds; run it in the background and ack now.
    void ingestKnowledge(merged, { prune: true })
      .then((written) =>
        console.log(`[kb/sync] Re-embedded ${written} chunk(s) from ${merged.length} entries.`)
      )
      .catch((err) => console.error('[kb/sync] Ingest failed:', err));

    res.status(202).json({ accepted: true, entries: merged.length });
  })
);
