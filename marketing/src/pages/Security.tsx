import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import MouseFollowGlow from '@/components/ui/MouseFollowGlow';
import SEO from '@/components/SEO';
import {
  Lock,
  KeyRound,
  FileCheck2,
  Quote,
  ServerCog,
  EyeOff,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

const pillars = [
  {
    icon: Lock,
    title: 'Encryption everywhere',
    description:
      'Data is encrypted in transit with TLS and encrypted at rest. Your documents are protected from the moment they leave your device.',
  },
  {
    icon: KeyRound,
    title: 'Role-based access control',
    description:
      'Every member has a defined role. Seat-based team management means access is granted deliberately — and revoked instantly when someone leaves.',
  },
  {
    icon: ShieldCheck,
    title: 'Single sign-on',
    description:
      'Enterprise teams can enforce SSO so access follows your identity provider and your existing security policies.',
  },
  {
    icon: FileCheck2,
    title: 'You own your data',
    description:
      'Your matters, documents, and client records belong to you. Export them whenever you need, and delete them on request.',
  },
  {
    icon: Quote,
    title: 'Auditable AI',
    description:
      'Every AI answer cites the page and verbatim quote it came from, and every AI edit is attributed — so you can verify the work, not just trust it.',
  },
  {
    icon: ServerCog,
    title: 'Managed infrastructure',
    description:
      'Kourti runs on managed cloud infrastructure with isolated environments, automated backups, and monitored access.',
  },
];

const dataPrinciples = [
  {
    title: 'Your content stays in your workspace',
    description:
      'Matter content is processed only to deliver the features you use inside your own account. We never sell your data.',
  },
  {
    title: 'Tenant isolation',
    description:
      'Each organisation’s data is logically isolated. Members only ever see the matters and documents they have been granted access to.',
  },
  {
    title: 'Least-privilege by default',
    description:
      'Access to production systems is restricted, logged, and reviewed. New team members start with no access until a role is assigned.',
  },
];

const Security = () => {
  return (
    <div className="relative min-h-screen bg-background">
      <SEO
        title="Security"
        description="How Kourti Legal protects your matters, documents, and client data — encryption in transit and at rest, role-based access, SSO, tenant isolation, and auditable AI."
        path="/security"
      />
      <MouseFollowGlow />
      <Navigation />

      <main className="relative z-10 pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-radial-glow"></div>
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">Trust &amp; Security</span>
            </div>
            <h1 className="mb-6 text-3xl font-bold leading-tight sm:text-4xl md:text-5xl lg:text-6xl">
              Security your clients can <span className="text-gradient">count on.</span>
            </h1>
            <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg">
              Legal work is confidential by nature. Kourti is built so the most sensitive documents
              in your practice stay protected, isolated, and yours.
            </p>
          </div>
        </section>

        {/* Pillars */}
        <section className="relative bg-background py-12 sm:py-16">
          <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>
          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {pillars.map((p) => {
                const Icon = p.icon;
                return (
                  <div key={p.title} className="card-dark-hover p-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-foreground">{p.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Data handling */}
        <section className="relative bg-muted/20 py-16 sm:py-24">
          <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1">
                <EyeOff className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">
                  How we handle data
                </span>
              </div>
              <h2 className="mb-4 text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">
                Privacy as the default
              </h2>
            </div>
            <div className="space-y-4">
              {dataPrinciples.map((d) => (
                <div
                  key={d.title}
                  className="flex items-start gap-4 rounded-xl border border-border bg-card p-6"
                >
                  <FileCheck2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                  <div>
                    <h3 className="mb-1 font-semibold text-foreground">{d.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{d.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Compliance */}
        <section className="relative py-16 sm:py-24">
          <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="mb-4 text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">
              Compliance &amp; certifications
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-base text-muted-foreground">
              We follow SOC 2-aligned controls across encryption, access management, and monitoring,
              and we are working toward formal SOC 2 Type II certification. If your procurement team
              needs specific documentation, we&apos;re happy to walk through our controls.
            </p>
            <a
              href="/contact"
              className="group inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
            >
              Request a security review
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-cta relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-grid-pattern opacity-30"></div>
          <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="mb-4 text-2xl font-bold leading-tight text-foreground sm:text-3xl md:text-4xl">
              Run your practice on AI, <span className="text-gradient">safely.</span>
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-base text-muted-foreground">
              Review the open-source code, or talk to us about your security and compliance
              requirements.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <button
                className="btn-primary h-12 px-8 text-sm"
                onClick={() => window.open('https://github.com/boyeesu/Kourti', '_blank')}
              >
                View source
              </button>
              <button
                className="btn-secondary h-12 px-8 text-sm"
                onClick={() => (window.location.href = '/contact')}
              >
                Talk to us
              </button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Security;
