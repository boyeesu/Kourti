import { Link } from 'react-router-dom';
import {
  FileText,
  Table2,
  Handshake,
  Bot,
  Sparkles,
  MessageSquare,
  Briefcase,
  Bell,
  Users,
  BarChart3,
  Shield,
  Mic,
  Calendar,
  ArrowRight,
  Check,
} from 'lucide-react';
import { Mascot } from '@/components/ui/Mascot';

/* ── Illustrative mini-UIs (not screenshots — honest representations of the work) ── */

const RedlineVisual = () => (
  <div className="rounded-lg border border-border bg-background/60 p-4 text-[11px] leading-relaxed font-mono">
    <p className="text-muted-foreground mb-2 font-sans text-[10px] uppercase tracking-wide">
      Clause 7.2 — Liability
    </p>
    <p className="text-foreground/90">
      The Supplier's total liability shall{' '}
      <span className="rounded bg-destructive/15 px-1 text-destructive line-through">
        not be limited
      </span>{' '}
      <span className="rounded bg-success/15 px-1 text-success underline decoration-success/60">
        be capped at the fees paid in the prior 12 months
      </span>
      .
    </p>
    <div className="mt-3 flex items-center gap-2">
      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-sans font-medium text-success">
        Accept
      </span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-sans font-medium text-muted-foreground">
        Reject
      </span>
      <span className="ml-auto font-sans text-[10px] text-muted-foreground">AI suggested</span>
    </div>
  </div>
);

const TabularVisual = () => {
  const rows = [
    { doc: 'MSA — Acme', term: '24 mo', cap: '✓', law: 'Lagos' },
    { doc: 'NDA — Beta', term: '12 mo', cap: '—', law: 'England' },
    { doc: 'SOW — Delta', term: '6 mo', cap: '✓', law: 'Lagos' },
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
          className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr] border-b border-border/60 last:border-0 text-foreground/90"
        >
          <span className="truncate px-2 py-1.5">{r.doc}</span>
          <span className="px-2 py-1.5">{r.term}</span>
          <span className="px-2 py-1.5">
            {r.cap === '✓' ? (
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

const flagships = [
  {
    icon: FileText,
    eyebrow: 'AI Redline',
    title: 'It drafts the edits, not just the flags',
    description:
      'Kourti proposes tracked changes directly on your DOCX — find/replace with full context — then you accept or reject each one. Every edit is attributed, so you always know what was machine vs. human.',
    visual: <RedlineVisual />,
  },
  {
    icon: Table2,
    eyebrow: 'Tabular Review',
    title: 'Answer one question across a whole folder',
    description:
      'Turn a folder of documents into a spreadsheet: documents as rows, your questions as columns. The AI fills every cell and cites the exact page and quote it pulled from.',
    visual: <TabularVisual />,
  },
];

const aiCapabilities = [
  {
    icon: MessageSquare,
    title: 'ReamAI Assistant',
    description:
      'A document-aware assistant that reads your matter and answers in context — with the source passages it relied on.',
    color: 'pastel-blue',
  },
  {
    icon: Handshake,
    title: 'Negotiation Copilot',
    description:
      'Paste the counterparty’s redline. Kourti analyses what changed, what it costs you, and drafts a counter-position.',
    color: 'pastel-green',
  },
  {
    icon: Bot,
    title: 'Autonomous Agents',
    description:
      'Hand off a matter review and let an agent work in the background, then surface findings for your approval.',
    color: 'pastel-purple',
  },
  {
    icon: Sparkles,
    title: 'Intelligence',
    description:
      'Ranked, severity-scored recommendations across a case or deal — act on them or dismiss, all tracked.',
    color: 'pastel-yellow',
  },
];

const practiceFeatures = [
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
    description: 'Alerts before filing dates and renewals become urgent.',
  },
  {
    icon: Mic,
    title: 'Meeting transcription',
    description: 'Record calls; get transcripts and action-item summaries.',
  },
  {
    icon: Calendar,
    title: 'Calendar sync',
    description: 'Hearings, deadlines, and meetings in your existing calendar.',
  },
  {
    icon: BarChart3,
    title: 'Practice analytics',
    description: 'See where time goes and spot workflow bottlenecks.',
  },
  {
    icon: FileText,
    title: 'Contract management',
    description: 'Versions, comparisons, and history without email chaos.',
  },
  {
    icon: Shield,
    title: 'Enterprise security',
    description: 'Encryption in transit and at rest, with role-based access.',
  },
];

const colorClasses: Record<string, string> = {
  'pastel-blue': 'icon-pastel-blue bg-[hsl(210,60%,75%)]/10',
  'pastel-green': 'icon-pastel-green bg-[hsl(145,50%,65%)]/10',
  'pastel-yellow': 'icon-pastel-yellow bg-[hsl(45,70%,70%)]/10',
  'pastel-purple': 'icon-pastel-purple bg-[hsl(270,50%,70%)]/10',
};

const Features = () => {
  return (
    <section id="features" className="relative bg-background py-16 sm:py-24">
      <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-12 max-w-3xl px-2 text-center sm:mb-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">The AI does the work</span>
          </div>
          <h2 className="mb-4 text-2xl font-bold leading-tight sm:mb-6 sm:text-3xl md:text-4xl lg:text-5xl">
            Not a filing cabinet. <span className="text-gradient">An AI legal associate.</span>
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg">
            Most legal tools just store your work. Kourti redlines contracts, reviews documents at
            scale, and negotiates alongside you — then keeps everything organised.
          </p>
        </div>

        {/* Subtle Mascot */}
        <div className="absolute -top-8 left-4 hidden xl:block">
          <Mascot variant="wave" size="sm" className="opacity-70" />
        </div>

        {/* Flagship spotlight cards */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {flagships.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="card-dark flex flex-col gap-5 p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {f.eyebrow}
                  </span>
                </div>
                <div>
                  <h3 className="mb-2 text-xl font-semibold text-foreground">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
                </div>
                <div className="mt-auto">{f.visual}</div>
              </div>
            );
          })}
        </div>

        {/* Secondary AI capabilities */}
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {aiCapabilities.map((feature) => {
            const Icon = feature.icon;
            const colorClass = colorClasses[feature.color] || colorClasses['pastel-blue'];
            return (
              <div key={feature.title} className="card-dark-hover p-6">
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${colorClass}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/features"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
          >
            See how each capability works
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Practice-management foundation */}
        <div className="mt-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="mb-3 text-xl font-bold leading-tight sm:text-2xl md:text-3xl">
              Plus everything your practice runs on
            </h2>
            <p className="text-sm text-muted-foreground sm:text-base">
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
                    <h4 className="text-sm font-semibold text-foreground">{feature.title}</h4>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
