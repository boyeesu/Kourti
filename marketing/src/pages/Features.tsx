import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  Table2,
  Handshake,
  Bot,
  Sparkles,
  MessageSquare,
  Briefcase,
  Users,
  Bell,
  Mic,
  Calendar,
  BarChart3,
  Shield,
  Check,
  ArrowRight,
} from 'lucide-react';
import SEO from '@/components/SEO';
import MouseFollowGlow from '@/components/ui/MouseFollowGlow';
import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';

const SOURCE_URL = 'https://github.com/boyeesu/Kourti';
const DEMO_URL = 'https://cal.com/kourti-legal/discovery';

/* ── Illustrative mini-UIs (not real product captures — honest representations) ── */

const RedlineVisual = () => (
  <div className="rounded-lg border border-border bg-background/60 p-4 text-[11px] leading-relaxed">
    <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
      Clause 7.2 — Liability
    </p>
    <p className="font-mono text-foreground/90">
      The Supplier's total liability shall{' '}
      <span className="rounded bg-destructive/15 px-1 text-destructive line-through">
        not be limited
      </span>{' '}
      <span className="rounded bg-success/15 px-1 text-success">
        be capped at the fees paid in the prior 12 months
      </span>
      .
    </p>
    <div className="mt-3 flex items-center gap-2">
      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
        Accept
      </span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        Reject
      </span>
      <span className="ml-auto text-[10px] text-muted-foreground">AI · Clause 7.2</span>
    </div>
  </div>
);

const TabularVisual = () => {
  const rows = [
    { doc: 'MSA — Acme', term: '24 mo', cap: true, law: 'Lagos' },
    { doc: 'NDA — Beta', term: '12 mo', cap: false, law: 'England' },
    { doc: 'SOW — Delta', term: '6 mo', cap: true, law: 'Lagos' },
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background/60 text-[11px]">
      <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr] border-b border-border bg-muted/40 font-medium text-muted-foreground">
        <span className="px-2 py-1.5">Document</span>
        <span className="px-2 py-1.5">Term</span>
        <span className="px-2 py-1.5">Liab. cap</span>
        <span className="px-2 py-1.5">Gov. law</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.doc}
          className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr] border-b border-border/60 text-foreground/90 last:border-0"
        >
          <span className="truncate px-2 py-1.5">{r.doc}</span>
          <span className="px-2 py-1.5">{r.term}</span>
          <span className="px-2 py-1.5">
            {r.cap ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )}
          </span>
          <span className="px-2 py-1.5">{r.law}</span>
        </div>
      ))}
      <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
        Every cell cited to a page + verbatim quote.
      </div>
    </div>
  );
};

const NegotiationVisual = () => (
  <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4 text-[11px]">
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-muted px-3 py-2 text-foreground/90">
        <span className="mb-1 block text-[9px] uppercase tracking-wide text-muted-foreground">
          Counterparty redline
        </span>
        Payment terms changed from Net 30 to Net 60.
      </div>
    </div>
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-primary/30 bg-primary/10 px-3 py-2 text-foreground/90">
        <span className="mb-1 block text-[9px] uppercase tracking-wide text-primary">
          Kourti counter
        </span>
        Net 60 adds ~3% carrying cost. Propose Net 45 with a 1.5% early-pay discount.
      </div>
    </div>
    <div className="flex items-center gap-2 pt-1">
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
        Turn 2 of 3
      </span>
      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] text-destructive">
        Cost risk: medium
      </span>
    </div>
  </div>
);

const AgentVisual = () => (
  <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4 text-[11px]">
    <div className="flex items-center justify-between">
      <span className="font-medium text-foreground/90">Matter review — Project Atlas</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Completed
      </span>
    </div>
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="rounded-full bg-muted px-2 py-0.5">Running</span>
      <ArrowRight className="h-3 w-3" />
      <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">Completed</span>
    </div>
    <div className="flex items-center justify-between rounded-md border border-border bg-card/50 px-3 py-2">
      <span className="text-foreground/90">Findings ready for your review</span>
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        4 to approve
      </span>
    </div>
  </div>
);

const IntelligenceVisual = () => {
  const recs: { label: string; sev: 'high' | 'medium' | 'low' }[] = [
    { label: 'Unlimited indemnity exposure in §9', sev: 'high' },
    { label: 'Auto-renewal lacks a notice window', sev: 'medium' },
    { label: 'Governing-law clause differs from MSA', sev: 'low' },
  ];
  const sevClass: Record<string, string> = {
    high: 'bg-destructive/15 text-destructive',
    medium: 'bg-[hsl(45,70%,70%)]/15 icon-pastel-yellow',
    low: 'bg-success/15 text-success',
  };
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background/60 p-4 text-[11px]">
      {recs.map((r) => (
        <div
          key={r.label}
          className="flex items-center justify-between rounded-md border border-border/60 bg-card/50 px-3 py-2"
        >
          <span className="truncate pr-2 text-foreground/90">{r.label}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${sevClass[r.sev]}`}
          >
            {r.sev}
          </span>
        </div>
      ))}
    </div>
  );
};

const AssistantVisual = () => (
  <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4 text-[11px]">
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-muted px-3 py-2 text-foreground/90">
        What's the termination notice period?
      </div>
    </div>
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2 text-foreground/90">
        Either party may terminate on 60 days' written notice.
        <span className="mt-2 flex items-center gap-1">
          <FileText className="h-3 w-3 text-primary" />
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
            source: page 4
          </span>
        </span>
      </div>
    </div>
  </div>
);

interface Capability {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  visual: ReactNode;
}

const capabilities: Capability[] = [
  {
    id: 'redline',
    icon: FileText,
    eyebrow: 'AI Redline',
    title: 'It drafts the edits, not just the flags',
    description:
      'Kourti generates tracked-change edits directly on your DOCX, matching find/replace with surrounding context so nothing lands in the wrong place. You review each edit and accept or reject it, and every change is attributed to either you or the AI.',
    points: [
      'Tracked changes written straight onto your document',
      'Accept or reject each suggested edit individually',
      'Full attribution — always know what was machine vs. human',
    ],
    visual: <RedlineVisual />,
  },
  {
    id: 'tabular-review',
    icon: Table2,
    eyebrow: 'Tabular Review',
    title: 'Answer one question across a whole folder',
    description:
      'Turn a stack of documents into a spreadsheet: documents become rows and your questions become columns. The AI fills every cell and cites the exact page and a verbatim quote, so you can verify each answer at a glance.',
    points: [
      'Documents as rows, your questions as columns',
      'Each cell answered automatically across the set',
      'Every answer cited to a page + verbatim quote',
    ],
    visual: <TabularVisual />,
  },
  {
    id: 'negotiation',
    icon: Handshake,
    eyebrow: 'Negotiation Copilot',
    title: 'Negotiate with the numbers on your side',
    description:
      "Paste the counterparty's redline and Kourti analyses exactly what changed, the risk and cost it introduces, and drafts a counter-position you can send. It tracks every turn and flags escalations as the deal moves.",
    points: [
      'See what changed and what it costs you',
      'Get a drafted counter-position, not just analysis',
      'Track turns and escalations across the negotiation',
    ],
    visual: <NegotiationVisual />,
  },
  {
    id: 'agents',
    icon: Bot,
    eyebrow: 'Autonomous Agents',
    title: 'Hand off the review and stay in control',
    description:
      'Delegate a matter review to a background agent that works asynchronously while you do other things. When it finishes, it surfaces its findings for your approval — nothing acts on your matter without a human sign-off.',
    points: [
      'Runs in the background, asynchronously',
      'Surfaces findings instead of acting silently',
      'You approve before anything is applied',
    ],
    visual: <AgentVisual />,
  },
  {
    id: 'intelligence',
    icon: Sparkles,
    eyebrow: 'Intelligence',
    title: 'Recommendations, ranked by what matters',
    description:
      'Kourti surfaces severity-ranked recommendations — high, medium, and low — across a whole case or deal. You can act on each one or dismiss it, and every decision is tracked so the record stays clean.',
    points: [
      'Severity-ranked across the full case or deal',
      'Act on or dismiss each recommendation',
      'Every action is tracked for an audit trail',
    ],
    visual: <IntelligenceVisual />,
  },
  {
    id: 'assistant',
    icon: MessageSquare,
    eyebrow: 'ReamAI Assistant',
    title: 'A chat that actually knows your matter',
    description:
      'ReamAI is a document-aware assistant that answers in the context of your specific matter, not the open internet. Every answer shows the source passages it relied on, so you can trust and verify what it tells you.',
    points: [
      'Answers grounded in your matter, not generic data',
      'Shows the source passages behind each answer',
      'Verify the citation before you rely on it',
    ],
    visual: <AssistantVisual />,
  },
];

const practiceFeatures: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Briefcase,
    title: 'Matter management',
    description: 'Deadlines, tasks, and custom fields per matter.',
  },
  {
    icon: Users,
    title: 'Client hub',
    description: 'Profiles, documents, notes, and history in one place.',
  },
  {
    icon: Bell,
    title: 'Smart reminders',
    description: 'Alerts before filing dates and renewals turn urgent.',
  },
  {
    icon: Mic,
    title: 'Meeting transcription',
    description: 'Transcripts and action-item summaries from calls.',
  },
  {
    icon: Calendar,
    title: 'Calendar sync',
    description: 'Hearings and deadlines in your existing calendar.',
  },
  {
    icon: BarChart3,
    title: 'Practice analytics',
    description: 'See where time goes and spot bottlenecks.',
  },
  {
    icon: FileText,
    title: 'Contract management',
    description: 'Versions, comparisons, and history without email.',
  },
  {
    icon: Shield,
    title: 'Enterprise security',
    description: 'Encryption in transit and at rest, role-based access.',
  },
];

const Features = () => {
  return (
    <div className="relative min-h-screen bg-background">
      <SEO
        title="Features"
        description="Explore everything Kourti's AI legal associate can do — AI redline, tabular review, negotiation copilot, autonomous agents, intelligence, and a document-aware assistant, on top of full practice management."
        path="/features"
      />
      <MouseFollowGlow />
      <Navigation />
      <main className="relative z-10 pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-dot-pattern opacity-30" />
          <div className="relative z-10 mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">The AI does the work</span>
            </div>
            <h1 className="mb-6 text-3xl font-bold leading-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
              Everything an <span className="text-gradient">AI legal associate</span> can do.
            </h1>
            <p className="mx-auto max-w-3xl text-lg text-muted-foreground sm:text-xl">
              Kourti redlines contracts, reviews documents at scale, negotiates alongside you, and
              works matters in the background — then keeps everything organised in one place. Here's
              how each capability works.
            </p>
          </div>
        </section>

        {/* Deep-dive capabilities */}
        <section className="relative py-8 sm:py-12">
          <div className="mx-auto max-w-7xl space-y-16 px-4 sm:space-y-24 sm:px-6 lg:px-8">
            {capabilities.map((cap, i) => {
              const Icon = cap.icon;
              const reversed = i % 2 === 1;
              return (
                <div
                  key={cap.id}
                  id={cap.id}
                  className="grid scroll-mt-28 grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12"
                >
                  {/* Text */}
                  <div className={reversed ? 'lg:order-2' : ''}>
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium text-primary">{cap.eyebrow}</span>
                    </div>
                    <h2 className="mb-4 text-2xl font-bold leading-tight text-foreground sm:text-3xl md:text-4xl">
                      {cap.title}
                    </h2>
                    <p className="mb-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
                      {cap.description}
                    </p>
                    <ul className="space-y-3">
                      {cap.points.map((point) => (
                        <li key={point} className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success/20">
                            <Check className="h-3.5 w-3.5 text-success" />
                          </span>
                          <span className="text-sm text-muted-foreground sm:text-base">
                            {point}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Visual */}
                  <div className={reversed ? 'lg:order-1' : ''}>
                    <div className="card-dark p-6 sm:p-8">{cap.visual}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Practice-management foundation */}
        <section className="relative py-16 sm:py-24">
          <div className="absolute inset-0 bg-dot-pattern opacity-30" />
          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
              <h2 className="mb-3 text-2xl font-bold leading-tight text-foreground sm:text-3xl md:text-4xl">
                Plus the practice-management <span className="text-gradient">foundation</span>
              </h2>
              <p className="text-base text-muted-foreground sm:text-lg">
                Matters, clients, contracts, and deadlines — managed in the same place the AI works.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {practiceFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card/50 p-4"
                  >
                    <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary/80" />
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Closing CTA band */}
        <section className="relative py-16 sm:py-24">
          <div className="absolute inset-0 bg-radial-glow" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="mb-4 text-2xl font-bold leading-tight text-foreground sm:text-3xl md:text-4xl lg:text-5xl">
              Put an AI legal associate to work today
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Try every capability on your own matters — redline, review, negotiate, and more — with
              no setup headaches.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <button
                className="btn-primary inline-flex h-12 items-center justify-center gap-2 px-6 text-sm"
                onClick={() => window.open(SOURCE_URL, '_blank')}
              >
                View source
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                className="btn-secondary inline-flex h-12 items-center justify-center px-6 text-sm"
                onClick={() => window.open(DEMO_URL, '_blank')}
              >
                Book a demo
              </button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Open source · Guided demos available
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Features;
