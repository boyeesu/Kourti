import { User, Building2, Scale, ArrowRight } from 'lucide-react';

const personas = [
  {
    icon: User,
    audience: 'Solo & small practice',
    headline: 'Bill more, admin less',
    description:
      'Run matters, draft and review contracts, and never miss a deadline — without hiring an associate to do the busywork.',
    points: ['AI document review', 'Matter & client management', 'Deadline reminders'],
  },
  {
    icon: Building2,
    audience: 'Growing firms',
    headline: 'Scale output, not headcount',
    description:
      'Review contracts at volume with tabular review, redline faster, and keep the whole team working from one source of truth.',
    points: ['Tabular review at scale', 'AI redline & negotiation', 'Team seats & analytics'],
    highlight: true,
  },
  {
    icon: Scale,
    audience: 'In-house teams',
    headline: 'Stay ahead of the business',
    description:
      'Turn a flood of incoming contracts into structured answers, track obligations, and keep compliance airtight across the org.',
    points: ['Negotiation copilot', 'Playbooks & agents', 'SSO & enterprise controls'],
  },
];

const Personas = () => {
  return (
    <section className="relative bg-background py-16 sm:py-24">
      <div className="absolute inset-0 bg-dot-pattern opacity-20"></div>
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <h2 className="mb-4 text-2xl font-bold leading-tight sm:text-3xl md:text-4xl lg:text-5xl">
            Built for how <span className="text-gradient">you practice.</span>
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg">
            From solo practitioners to enterprise legal operations — start where you are and grow
            into the rest.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {personas.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.audience}
                className={`flex flex-col rounded-2xl border bg-card p-6 sm:p-8 ${
                  p.highlight ? 'border-primary/40 shadow-glow' : 'border-border'
                }`}
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {p.audience}
                </span>
                <h3 className="mb-2 mt-1 text-xl font-semibold text-foreground">{p.headline}</h3>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  {p.description}
                </p>
                <ul className="mt-auto space-y-2">
                  {p.points.map((point) => (
                    <li key={point} className="flex items-center gap-2 text-sm text-foreground/90">
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <a
            href="https://github.com/boyeesu/Kourti"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
          >
            Explore the open-source project
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
        </div>
      </div>
    </section>
  );
};

export default Personas;
