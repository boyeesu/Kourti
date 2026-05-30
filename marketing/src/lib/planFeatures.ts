/**
 * Comparison-table catalog for the pricing page.
 *
 * Inclusion of each capability per plan is NOT hardcoded here — it comes from
 * the backend `included_features` (the admin-editable plan_features matrix).
 * This file only holds the human-readable labels, descriptions, grouping, and
 * the curated non-entitlement rows (support tiers etc.).
 *
 * Capability `key`s must match the backend feature_keys in
 * backend-node/src/services/entitlements.ts (FEATURE_KEYS).
 */

export type CellValue = boolean | string;

export type ComparisonRow =
  | { kind: 'feature'; key: string; label: string; description?: string }
  | { kind: 'value'; label: string; description?: string; values: Record<string, CellValue> }
  | {
      kind: 'limit';
      limitKey: string;
      label: string;
      description?: string;
      format?: 'count' | 'storage';
    };

export interface ComparisonCategory {
  name: string;
  rows: ComparisonRow[];
}

/** Render a limit cap for display. undefined/null = unlimited. */
export function formatLimit(
  value: number | null | undefined,
  format: 'count' | 'storage' = 'count'
): string {
  if (value == null) return 'Unlimited';
  if (format === 'storage') {
    return value >= 1024
      ? `${value % 1024 === 0 ? value / 1024 : (value / 1024).toFixed(1)} GB`
      : `${value} MB`;
  }
  return value.toLocaleString();
}

/** Tagline shown under each plan's name. Keyed by plan_type. */
export const PLAN_TAGLINES: Record<string, string> = {
  starter: 'For solo practitioners and small teams getting started with AI.',
  professional: 'For growing firms that need automation and deeper AI.',
  enterprise: 'For legal operations running at scale with security & control.',
};

/** CTA label override per plan_type (price === null already maps to sales). */
export const PLAN_CTA: Record<string, string> = {
  starter: 'Start free trial',
  professional: 'Start free trial',
  enterprise: 'Talk to sales',
};

/**
 * Curated perks to append to a plan card's highlight list — things not captured
 * by the entitlement matrix (support tier, SLA, etc.). Keyed by plan_type.
 */
export const PLAN_CARD_EXTRAS: Record<string, string[]> = {
  starter: ['Email support'],
  professional: ['Audit logs', 'Priority support'],
  enterprise: ['Custom data retention', 'Dedicated success manager', '99.9% uptime SLA'],
};

export const COMPARISON: ComparisonCategory[] = [
  {
    name: 'Usage & limits',
    rows: [
      {
        kind: 'limit',
        limitKey: 'cases',
        label: 'Active matters / cases',
        format: 'count',
      },
      { kind: 'limit', limitKey: 'clients', label: 'Clients', format: 'count' },
      {
        kind: 'limit',
        limitKey: 'storage_mb',
        label: 'Document storage',
        format: 'storage',
      },
      {
        kind: 'limit',
        limitKey: 'ai_reviews_month',
        label: 'AI document reviews / month',
        format: 'count',
      },
      {
        kind: 'limit',
        limitKey: 'ai_messages_month',
        label: 'AI assistant messages / month',
        format: 'count',
      },
    ],
  },
  {
    name: 'Practice management',
    rows: [
      {
        kind: 'feature',
        key: 'cases',
        label: 'Case & matter management',
        description: 'Track matters, statuses, hearings, parties and custom fields.',
      },
      { kind: 'feature', key: 'clients', label: 'Client management (CRM)' },
      {
        kind: 'feature',
        key: 'calendar',
        label: 'Calendar, deadlines & reminders',
        description: 'Court dates, limitation deadlines and automated reminders.',
      },
      { kind: 'feature', key: 'documents', label: 'Document management' },
      {
        kind: 'feature',
        key: 'contracts',
        label: 'Contract lifecycle management',
        description: 'Draft, version, track and renew contracts in one place.',
      },
      { kind: 'feature', key: 'search', label: 'Global search across your workspace' },
      { kind: 'feature', key: 'invoices', label: 'Invoicing & billing' },
      { kind: 'feature', key: 'voice', label: 'Voice notes & transcription' },
    ],
  },
  {
    name: 'AI & automation',
    rows: [
      {
        kind: 'feature',
        key: 'chat',
        label: 'AI legal assistant',
        description: 'Ask questions across your matters, documents and contracts.',
      },
      {
        kind: 'feature',
        key: 'ai_review',
        label: 'AI document review',
        description: 'Summarise, extract and flag risks in uploaded documents.',
      },
      {
        kind: 'feature',
        key: 'redline',
        label: 'AI redlining & comparison',
        description: 'Compare versions and auto-suggest edits against your positions.',
      },
      {
        kind: 'feature',
        key: 'tabular_review',
        label: 'Tabular / bulk document review',
        description: 'Run structured questions across many documents at once.',
      },
      {
        kind: 'feature',
        key: 'agents',
        label: 'Autonomous AI agents',
        description: 'Delegate multi-step legal workflows to supervised agents.',
      },
      { kind: 'feature', key: 'negotiations', label: 'Negotiation workspace' },
      { kind: 'feature', key: 'playbooks', label: 'Playbook automation' },
      { kind: 'feature', key: 'intelligence', label: 'Practice intelligence & analytics' },
    ],
  },
  {
    name: 'Security & administration',
    rows: [
      {
        kind: 'value',
        label: 'Role-based access control',
        values: { starter: true, professional: true, enterprise: true },
      },
      {
        kind: 'feature',
        key: 'sso',
        label: 'SSO / SAML single sign-on',
      },
      {
        kind: 'value',
        label: 'Audit logs',
        values: { starter: false, professional: true, enterprise: true },
      },
      {
        kind: 'value',
        label: 'Custom data retention',
        values: { starter: false, professional: false, enterprise: true },
      },
    ],
  },
  {
    name: 'Support & onboarding',
    rows: [
      {
        kind: 'value',
        label: 'Support',
        values: {
          starter: 'Email',
          professional: 'Priority email & chat',
          enterprise: 'Dedicated success manager',
        },
      },
      {
        kind: 'value',
        label: 'Onboarding',
        values: { starter: 'Self-serve', professional: 'Guided setup', enterprise: 'White-glove' },
      },
      {
        kind: 'value',
        label: 'Uptime SLA',
        values: { starter: false, professional: false, enterprise: '99.9% uptime SLA' },
      },
    ],
  },
  // NOTE: a "Usage & limits" category (active matters, document storage, AI
  // review volume, etc.) is intentionally not yet here — those limits are being
  // reworked to be tiered (no longer "unlimited" across plans) and will be wired
  // from the backend once finalised.
];

/** Map a feature_key to its display label (for plan-card highlight lists). */
export function featureLabel(key: string): string | null {
  for (const cat of COMPARISON) {
    for (const row of cat.rows) {
      if (row.kind === 'feature' && row.key === key) return row.label;
    }
  }
  return null;
}
