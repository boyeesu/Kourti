import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import MouseFollowGlow from '@/components/ui/MouseFollowGlow';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowRight,
  Download,
  FileText,
  Search,
  Scale,
  Brain,
  Shield,
  BarChart3,
  ChevronDown,
  ChevronRight,
  BookOpen,
  TrendingUp,
  Globe,
  Gavel,
  Users,
  Building2,
  Landmark,
  AlertTriangle,
  Lightbulb,
  Rocket,
  CheckCircle,
  Clock,
  MapPin,
  Mail,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { postJson } from '@/lib/api';

/* ────────────────────────────────────────────
   Animated Counter Hook
   ──────────────────────────────────────────── */
function useCountUp(end: number, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startOnView) {
      setStarted(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) setStarted(true);
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started, startOnView]);

  useEffect(() => {
    if (!started) return;
    let startTime: number;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [started, end, duration]);

  return { count, ref };
}

/* ────────────────────────────────────────────
   Section: Report Hero
   ──────────────────────────────────────────── */
const ReportHero = ({ onDownloadClick }: { onDownloadClick: () => void }) => (
  <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-halftone">
    <div className="absolute inset-0 bg-dot-pattern"></div>
    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
    <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>

    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-40 sm:pt-48 pb-16 sm:pb-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left: Copy */}
        <div className="text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 border border-border/50 backdrop-blur-sm mb-6 animate-fade-in">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-xs sm:text-sm text-muted-foreground">Q1 2026 Report</span>
          </div>

          <h1
            className="text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-bold leading-[1.15] mb-6 tracking-tight animate-fade-in"
            style={{ animationDelay: '0.1s' }}
          >
            The State of Technology in <span className="text-gradient">Legal Practice</span> in
            Nigeria
          </h1>

          <p
            className="text-base sm:text-lg text-muted-foreground mb-8 max-w-xl leading-relaxed animate-fade-in"
            style={{ animationDelay: '0.2s' }}
          >
            Transformation, Challenges, and the Path Forward. A comprehensive 21-page analysis by
            Kourti AI covering AI adoption, court digitisation, regulatory tech, and the future of
            Nigerian legal practice.
          </p>

          <div
            className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start animate-fade-in"
            style={{ animationDelay: '0.3s' }}
          >
            <Button
              size="lg"
              className="btn-primary h-12 px-6 text-sm group"
              onClick={onDownloadClick}
            >
              Download Free Report
              <Download className="ml-2 h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="btn-secondary h-12 px-6 text-sm"
              onClick={() =>
                document.getElementById('report-highlights')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Read Summary
            </Button>
          </div>

          <p
            className="text-xs text-muted-foreground mt-4 animate-fade-in"
            style={{ animationDelay: '0.35s' }}
          >
            21 pages &middot; Free download &middot; No spam
          </p>
        </div>

        {/* Right: 3D Report Cover Mockup */}
        <div
          className="flex justify-center lg:justify-end animate-slide-up"
          style={{ animationDelay: '0.4s' }}
        >
          <div className="relative group">
            {/* Glow behind */}
            <div className="absolute -inset-6 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-3xl blur-2xl group-hover:blur-3xl transition-all duration-500"></div>

            {/* Report Card */}
            <div
              className="relative w-[280px] sm:w-[320px] md:w-[360px] rounded-xl overflow-hidden border border-border/50 shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]"
              style={{
                transform: 'perspective(1000px) rotateY(-5deg) rotateX(2deg)',
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Cover design */}
              <div className="bg-gradient-to-b from-[hsl(215,50%,15%)] via-[hsl(220,40%,12%)] to-[hsl(240,10%,6%)] p-8 sm:p-10 min-h-[400px] sm:min-h-[460px] flex flex-col justify-between">
                {/* Top section */}
                <div>
                  <p className="text-xs font-semibold text-primary/80 tracking-widest uppercase mb-1">
                    Kourti AI
                  </p>
                  <p className="text-[10px] text-muted-foreground italic">
                    Unlock the Power of AI and Automation in Your Legal Workflows
                  </p>
                </div>

                {/* Middle */}
                <div className="my-8">
                  <div className="w-12 h-0.5 bg-primary mb-6"></div>
                  <p className="text-[10px] text-primary/70 uppercase tracking-wider mb-2">
                    Q1 2026 Report
                  </p>
                  <h3 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
                    The State of Technology in Legal Practice and Functions in Nigeria
                  </h3>
                  <p className="text-xs text-muted-foreground mt-3 italic">
                    Transformation, Challenges, and the Path Forward
                  </p>
                </div>

                {/* Bottom */}
                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-muted-foreground">
                    Published by Kourti AI | Q1 2026
                  </p>
                  <p className="text-[9px] text-muted-foreground">kourti.com</p>
                </div>
              </div>

              {/* Page edge effect */}
              <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-white/5 to-transparent"></div>
              <div className="absolute right-1 top-2 bottom-2 w-px bg-white/10"></div>
              <div className="absolute right-2 top-4 bottom-4 w-px bg-white/5"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

/* ────────────────────────────────────────────
   Section: Key Stats
   ──────────────────────────────────────────── */
const ReportStats = () => {
  const stat1 = useCountUp(220, 1500);
  const stat2 = useCountUp(18, 1500);
  const stat3 = useCountUp(60, 1500);
  const stat4 = useCountUp(42, 1500);

  const stats = [
    {
      ref: stat1.ref,
      value: `${stat1.count}K+`,
      label: 'Registered Lawyers',
      description: 'in Nigeria',
    },
    {
      ref: stat2.ref,
      value: `~${stat2.count}%`,
      label: 'Firms Using CMS',
      description: 'Case management software',
    },
    {
      ref: stat3.ref,
      value: `${stat3.count}%+`,
      label: 'Courts with E-Filing',
      description: 'Partial capability',
    },
    {
      ref: stat4.ref,
      value: `$${stat4.count / 10}B`,
      label: 'Africa LegalTech Market',
      description: 'Projected by 2030',
    },
  ];

  return (
    <section className="py-12 sm:py-16 bg-muted/30 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-30"></div>
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              ref={stat.ref}
              className="card-dark-hover p-4 sm:p-6 text-center group"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="text-2xl sm:text-4xl md:text-5xl font-bold text-gradient mb-2 group-hover:scale-110 transition-transform duration-300">
                {stat.value}
              </div>
              <div className="text-sm sm:text-base font-semibold text-foreground mb-1">
                {stat.label}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground">{stat.description}</div>
            </div>
          ))}
        </div>
        <p className="text-center text-[10px] sm:text-xs text-muted-foreground mt-6">
          Sources: NBA (2024); Grand View Research (2024); Kourti AI Market Intelligence (Q4 2025)
        </p>
      </div>
    </section>
  );
};

/* ────────────────────────────────────────────
   Section: What's Inside (Highlights)
   ──────────────────────────────────────────── */
const ReportHighlights = () => {
  const highlights = [
    {
      icon: Search,
      title: 'Legal Research & AI',
      description:
        'How AI-powered platforms like LawPavilion and SodaLex are cutting research time by up to 60% on complex matters.',
      color: 'pastel-blue',
    },
    {
      icon: FileText,
      title: 'Document Automation',
      description:
        'Contract lifecycle management, AI-powered review, and the tools transforming Nigerian document workflows.',
      color: 'pastel-green',
    },
    {
      icon: Gavel,
      title: 'Court E-Filing Systems',
      description:
        'A jurisdiction-by-jurisdiction breakdown of e-filing, virtual hearings, and digital case tracking across Nigerian courts.',
      color: 'pastel-yellow',
    },
    {
      icon: Shield,
      title: 'Cybersecurity & NDPA',
      description:
        'How the Nigeria Data Protection Act 2023 is reshaping law firm obligations and driving privacy compliance tooling.',
      color: 'pastel-purple',
    },
    {
      icon: BarChart3,
      title: 'Tech Adoption by Sector',
      description:
        'Detailed adoption mapping across large firms, mid-tier, sole practitioners, in-house teams, and the judiciary.',
      color: 'pastel-pink',
    },
    {
      icon: Rocket,
      title: 'Future Outlook 2030',
      description:
        'Generative AI at scale, smart contracts, virtual courts, legal marketplaces, and the path to technology parity.',
      color: 'pastel-cyan',
    },
  ];

  const colorClasses: Record<string, string> = {
    'pastel-blue': 'icon-pastel-blue bg-[hsl(210,60%,75%)]/10',
    'pastel-green': 'icon-pastel-green bg-[hsl(145,50%,65%)]/10',
    'pastel-yellow': 'icon-pastel-yellow bg-[hsl(45,70%,70%)]/10',
    'pastel-purple': 'icon-pastel-purple bg-[hsl(270,50%,70%)]/10',
    'pastel-pink': 'icon-pastel-pink bg-[hsl(330,50%,75%)]/10',
    'pastel-cyan': 'icon-pastel-cyan bg-[hsl(180,50%,65%)]/10',
  };

  return (
    <section id="report-highlights" className="py-16 sm:py-24 bg-background relative">
      <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16 max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-tight">
            What's inside <span className="text-gradient">the report.</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            21 pages of market intelligence covering the six key dimensions of Nigeria's legal
            technology landscape.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {highlights.map((item, index) => {
            const Icon = item.icon;
            const colorClass = colorClasses[item.color];
            return (
              <div
                key={item.title}
                className="card-dark-hover p-6 bg-dot-pattern"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div
                  className={`w-12 h-12 rounded-xl ${colorClass} flex items-center justify-center mb-4`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/* ────────────────────────────────────────────
   Section: Key Findings
   ──────────────────────────────────────────── */
const ReportFindings = () => {
  const aiUsage = useCountUp(67, 1800);
  const policyGap = useCountUp(12, 1800);
  const researchSavings = useCountUp(60, 1800);

  const adoptionData = [
    {
      segment: 'In-House (Fintechs & Tech)',
      level: 'Very High',
      percent: 90,
      tools: 'Modern SaaS Stack, AI Tools',
    },
    {
      segment: 'Large Commercial Firms (Top 20)',
      level: 'High',
      percent: 75,
      tools: 'AI Research, CLM, DMS, Analytics',
    },
    {
      segment: 'In-House (Banks & Telcos)',
      level: 'High',
      percent: 70,
      tools: 'CLM, RegTech, E-Sign, Analytics',
    },
    {
      segment: 'Mid-Tier Firms',
      level: 'Moderate',
      percent: 45,
      tools: 'LawPavilion, E-Filing, PMS',
    },
    {
      segment: 'Judiciary (Federal Courts)',
      level: 'Moderate',
      percent: 40,
      tools: 'E-Filing, Virtual Hearings',
    },
    {
      segment: 'Small Firms',
      level: 'Low-Moderate',
      percent: 25,
      tools: 'Basic DMS, Google Workspace',
    },
    { segment: 'Sole Practitioners', level: 'Low', percent: 15, tools: 'Word, Email, WhatsApp' },
    {
      segment: 'Judiciary (State Courts)',
      level: 'Low',
      percent: 10,
      tools: 'Minimal Digital Penetration',
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-muted/30 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-30"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16 max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-tight">
            Key findings <span className="text-gradient">at a glance.</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Data-driven insights from our Q4 2025 survey of senior legal practitioners at major
            Nigerian law firms.
          </p>
        </div>

        {/* Insight Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div ref={aiUsage.ref} className="card-dark p-6 text-center">
            <div className="text-4xl sm:text-5xl font-bold text-gradient mb-2">
              {aiUsage.count}%
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Used AI Tools</p>
            <p className="text-xs text-muted-foreground">
              Senior practitioners who used an AI research or drafting tool in the prior 6 months
            </p>
          </div>
          <div ref={policyGap.ref} className="card-dark p-6 text-center relative overflow-hidden">
            <div className="absolute top-3 right-3">
              <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
            </div>
            <div className="text-4xl sm:text-5xl font-bold text-[hsl(var(--warning))] mb-2">
              {policyGap.count}%
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Have AI Policy</p>
            <p className="text-xs text-muted-foreground">
              A significant gap between adoption and governance across the sector
            </p>
          </div>
          <div ref={researchSavings.ref} className="card-dark p-6 text-center">
            <div className="text-4xl sm:text-5xl font-bold text-[hsl(var(--success))] mb-2">
              {researchSavings.count}%
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Research Time Saved</p>
            <p className="text-xs text-muted-foreground">
              Reduction in research time on complex matters with AI-assisted tools
            </p>
          </div>
        </div>

        {/* Adoption Table */}
        <div className="card-dark overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-border">
            <h3 className="text-lg font-semibold text-foreground">
              Technology Adoption by Segment
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Current state across key segments as at Q1 2026
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Segment
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                    Adoption
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Level
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                    Primary Tools
                  </th>
                </tr>
              </thead>
              <tbody>
                {adoptionData.map((row) => (
                  <tr
                    key={row.segment}
                    className="border-b border-border/50 hover:bg-muted/10 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-3 text-sm text-foreground font-medium">
                      {row.segment}
                    </td>
                    <td className="px-4 sm:px-6 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[120px]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-1000"
                            style={{ width: `${row.percent}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-muted-foreground w-8">{row.percent}%</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.level === 'Very High'
                            ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]'
                            : row.level === 'High'
                              ? 'bg-primary/10 text-primary'
                              : row.level === 'Moderate'
                                ? 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]'
                                : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {row.level}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-xs text-muted-foreground hidden md:table-cell">
                      {row.tools}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ────────────────────────────────────────────
   Section: Digital Transformation Timeline
   ──────────────────────────────────────────── */
const ReportTimeline = () => {
  const phases = [
    {
      period: 'Pre-2010',
      title: 'The Paper Era',
      icon: FileText,
      description:
        'Thoroughly paper-based practice. Court processes, case files, contracts, and research conducted manually. Shelves of case reporters and ring-binders.',
      color: 'pastel-blue',
    },
    {
      period: '2010-2018',
      title: 'Basic Digitalisation',
      icon: Globe,
      description:
        'Email adoption, digital document storage, rudimentary practice management software. LawPavilion emerges. Lagos State launches first e-Filing portal.',
      color: 'pastel-green',
    },
    {
      period: '2018-2023',
      title: 'Ecosystem Emergence',
      icon: TrendingUp,
      description:
        'Legal tech startups emerge. COVID-19 accelerates virtual hearings and remote work. Digital workflows dismantle years of resistance.',
      color: 'pastel-yellow',
    },
    {
      period: '2023-Present',
      title: 'AI & Automation',
      icon: Brain,
      description:
        'AI-assisted legal research, document drafting, contract review, and litigation strategy enter the mainstream. The conversation shifts from whether to adopt AI, to how.',
      color: 'pastel-purple',
    },
  ];

  const iconColorMap: Record<string, string> = {
    'pastel-blue': 'icon-pastel-blue bg-[hsl(210,60%,75%)]/10 border-[hsl(210,60%,75%)]/30',
    'pastel-green': 'icon-pastel-green bg-[hsl(145,50%,65%)]/10 border-[hsl(145,50%,65%)]/30',
    'pastel-yellow': 'icon-pastel-yellow bg-[hsl(45,70%,70%)]/10 border-[hsl(45,70%,70%)]/30',
    'pastel-purple': 'icon-pastel-purple bg-[hsl(270,50%,70%)]/10 border-[hsl(270,50%,70%)]/30',
  };

  return (
    <section className="py-16 sm:py-24 bg-background relative">
      <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16 max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-tight">
            The digital transformation <span className="text-gradient">journey.</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Four phases of technology adoption in Nigerian legal practice.
          </p>
        </div>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 sm:left-8 top-0 bottom-0 w-px bg-border hidden sm:block"></div>

          <div className="space-y-8">
            {phases.map((phase, index) => {
              const Icon = phase.icon;
              const colorClass = iconColorMap[phase.color];
              return (
                <div key={phase.period} className="relative flex gap-4 sm:gap-6 items-start group">
                  {/* Timeline dot */}
                  <div
                    className={`relative z-10 w-12 h-12 sm:w-16 sm:h-16 rounded-xl ${colorClass} border flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>

                  {/* Content */}
                  <div className="card-dark-hover p-4 sm:p-6 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-mono text-primary/80 bg-primary/10 px-2 py-0.5 rounded">
                        {phase.period}
                      </span>
                      {index === phases.length - 1 && (
                        <span className="text-[10px] font-semibold text-[hsl(var(--success))] bg-[hsl(var(--success))]/10 px-2 py-0.5 rounded">
                          CURRENT
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      Phase {index + 1}: {phase.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {phase.description}
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

/* ────────────────────────────────────────────
   Section: Report Preview (TOC Accordion)
   ──────────────────────────────────────────── */
const ReportPreview = ({ onDownloadClick }: { onDownloadClick: () => void }) => {
  const [openSection, setOpenSection] = useState<number | null>(null);

  const chapters = [
    {
      number: 1,
      title: 'Introduction',
      icon: BookOpen,
      preview:
        "The legal profession globally is experiencing a technological renaissance. Nigeria's legal ecosystem is vast and diverse, spanning the Supreme Court to customary courts, elite commercial firms to sole practitioners. Each segment has a different relationship with technology.",
    },
    {
      number: 2,
      title: "Overview of Nigeria's Legal Ecosystem",
      icon: Landmark,
      preview:
        'Over 220,000 enrolled legal practitioners, 130 NBA branches, and in-house legal functions across banking, oil & gas, telecoms, fintech, and FMCG sectors. The judiciary spans federal, state, and customary tiers with varying digital readiness.',
    },
    {
      number: 3,
      title: 'The Digital Transformation Journey',
      icon: TrendingUp,
      preview:
        'From the Paper Era (Pre-2010) through Basic Digitalisation (2010-2018) and Ecosystem Emergence (2018-2023) to the current AI and Intelligent Automation phase (2023-Present).',
    },
    {
      number: 4,
      title: 'Key Technology Areas Reshaping Legal Practice',
      icon: Brain,
      preview:
        'Deep dives into legal research platforms, document automation, contract intelligence, court e-filing systems, AI in legal functions, cybersecurity, NDPA compliance, and legal analytics.',
    },
    {
      number: 5,
      title: 'Regulatory & Compliance Technology Landscape',
      icon: Scale,
      preview:
        "CAMA 2020, Finance Acts, NDPA 2023, Investment and Securities Act 2024, and FIRS digitisation. Plus the NBA's technology initiatives and their impact on practice.",
    },
    {
      number: 6,
      title: 'Technology Adoption by Sector',
      icon: Building2,
      preview:
        'Detailed adoption mapping across 9 segments from large commercial firms (High) to sole practitioners (Low), with primary tools used and key barriers identified for each.',
    },
    {
      number: 7,
      title: 'Challenges and Barriers to Adoption',
      icon: AlertTriangle,
      preview:
        'Infrastructure deficits, cost and affordability, skills gaps, cultural resistance, data security concerns, regulatory ambiguity, and vendor ecosystem immaturity.',
    },
    {
      number: 8,
      title: 'Opportunities and Recommendations',
      icon: Lightbulb,
      preview:
        'Targeted recommendations for law firms, in-house legal teams, the NBA and regulatory bodies, and legal technology vendors. Every barrier is also a market opportunity.',
    },
    {
      number: 9,
      title: 'The Future of Legal Technology in Nigeria',
      icon: Rocket,
      preview:
        'Generative AI at scale, smart contracts and blockchain, virtual courts, legal marketplaces, data-driven practice management, and RegTech integration through 2030.',
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-muted/30 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-30"></div>
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16 max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-tight">
            Explore the <span className="text-gradient">table of contents.</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Click any chapter to preview what's covered. Download the full report for the complete
            analysis.
          </p>
        </div>

        <div className="space-y-3">
          {chapters.map((chapter) => {
            const Icon = chapter.icon;
            const isOpen = openSection === chapter.number;
            return (
              <div key={chapter.number} className="card-dark overflow-hidden">
                <button
                  onClick={() => setOpenSection(isOpen ? null : chapter.number)}
                  className="w-full flex items-center gap-4 p-4 sm:p-5 text-left hover:bg-muted/10 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground font-mono">
                      Section {chapter.number}
                    </span>
                    <h4 className="text-sm sm:text-base font-semibold text-foreground truncate">
                      {chapter.title}
                    </h4>
                  </div>
                  <div
                    className={`shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                  >
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    isOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0">
                    <div className="pl-12 border-l-2 border-primary/20">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {chapter.preview}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Inline CTA */}
        <div className="text-center mt-10">
          <Button
            size="lg"
            className="btn-primary h-12 px-8 text-sm group"
            onClick={onDownloadClick}
          >
            Download Full Report
            <Download className="ml-2 h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
          </Button>
        </div>
      </div>
    </section>
  );
};

/* ────────────────────────────────────────────
   Section: E-Filing Status Table
   ──────────────────────────────────────────── */
const CourtDigitisation = () => {
  const courts = [
    {
      name: 'Lagos State High Court',
      efiling: 'Active',
      hearings: 'Active',
      tracking: 'Active',
      status: 'leading',
    },
    {
      name: 'Federal High Court',
      efiling: 'Active (Lagos, Abuja)',
      hearings: 'Available',
      tracking: 'Active',
      status: 'leading',
    },
    {
      name: 'Court of Appeal',
      efiling: 'Partial',
      hearings: 'Available',
      tracking: 'Partial',
      status: 'moderate',
    },
    {
      name: 'Supreme Court of Nigeria',
      efiling: 'Limited',
      hearings: 'Ad hoc',
      tracking: 'Partial',
      status: 'developing',
    },
    {
      name: 'Rivers State High Court',
      efiling: 'Developing',
      hearings: 'Limited',
      tracking: 'Limited',
      status: 'developing',
    },
    {
      name: 'Magistrate Courts',
      efiling: 'Minimal',
      hearings: 'Rare',
      tracking: 'Minimal',
      status: 'low',
    },
  ];

  const statusColor = (status: string) => {
    switch (status) {
      case 'leading':
        return 'text-[hsl(var(--success))]';
      case 'moderate':
        return 'text-primary';
      case 'developing':
        return 'text-[hsl(var(--warning))]';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <section className="py-16 sm:py-24 bg-background relative">
      <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16 max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-tight">
            Court digitisation <span className="text-gradient">status.</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            E-filing, virtual hearings, and digital case tracking across Nigerian courts.
          </p>
        </div>

        <div className="card-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Court / Jurisdiction
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    E-Filing
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                    Virtual Hearings
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                    Case Tracking
                  </th>
                </tr>
              </thead>
              <tbody>
                {courts.map((court) => (
                  <tr
                    key={court.name}
                    className="border-b border-border/50 hover:bg-muted/10 transition-colors"
                  >
                    <td
                      className={`px-4 sm:px-6 py-3 text-sm font-medium ${statusColor(court.status)}`}
                    >
                      {court.name}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-sm text-muted-foreground">
                      {court.efiling}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                      {court.hearings}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-sm text-muted-foreground hidden md:table-cell">
                      {court.tracking}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 sm:px-6 py-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground">
              Source: Federal High Court Digital Transformation Report 2024; Lagos State Judiciary
              e-Filing Annual Report 2024.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ────────────────────────────────────────────
   Section: Challenges → Opportunities
   ──────────────────────────────────────────── */
const ChallengesOpportunities = () => {
  const items = [
    {
      challenge: 'Infrastructure Deficits',
      challengeDesc: 'Unreliable power, inconsistent broadband, high data costs',
      opportunity: 'Demand for offline-capable, low-bandwidth legal tools',
      icon: Globe,
    },
    {
      challenge: 'Cost & Affordability',
      challengeDesc: 'Enterprise tools beyond reach of small firms',
      opportunity: 'Affordable, naira-denominated SaaS solutions',
      icon: TrendingUp,
    },
    {
      challenge: 'Skills & Digital Literacy',
      challengeDesc: 'Limited technology training in legal education',
      opportunity: 'Legal technology training and consulting market',
      icon: Users,
    },
    {
      challenge: 'Cultural Resistance',
      challengeDesc: 'Conservatism in senior leadership',
      opportunity: 'Next-gen practitioners demanding modern tools',
      icon: Building2,
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-muted/30 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-30"></div>
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16 max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-tight">
            Every challenge is <span className="text-gradient">an opportunity.</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Nigeria's legal technology ecosystem is not yet saturated. It is waiting to be built.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.challenge} className="card-dark-hover p-6 group">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[hsl(var(--destructive))]/10 flex items-center justify-center shrink-0 group-hover:bg-[hsl(var(--success))]/10 transition-colors duration-500">
                    <Icon className="h-5 w-5 text-[hsl(var(--destructive))] group-hover:text-[hsl(var(--success))] transition-colors duration-500" />
                  </div>
                  <div className="flex-1">
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-[hsl(var(--destructive))]/80 uppercase tracking-wider mb-1">
                        Challenge
                      </p>
                      <h4 className="text-base font-semibold text-foreground">{item.challenge}</h4>
                      <p className="text-sm text-muted-foreground">{item.challengeDesc}</p>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <ChevronRight className="h-3 w-3 text-primary" />
                      <p className="text-xs font-semibold text-[hsl(var(--success))] uppercase tracking-wider">
                        Opportunity
                      </p>
                    </div>
                    <p className="text-sm text-foreground font-medium">{item.opportunity}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/* ────────────────────────────────────────────
   Section: Download CTA (Gated Form)
   ──────────────────────────────────────────── */
const ReportDownloadCTA = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    role: '',
    website: '', // honeypot
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Capture the lead via the backend public API.
      await postJson('/api/v1/public/contact', {
        ...formData,
        interest: 'report-download',
        message: 'Downloaded Q1 2026 LegalTech Nigeria Report',
      });

      // Trigger download
      const link = document.createElement('a');
      link.href = '/Kourti_Q1_2026_LegalTech_Nigeria.pdf';
      link.download = 'Kourti_Q1_2026_LegalTech_Nigeria.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setIsDownloaded(true);
      toast({
        title: 'Report downloading!',
        description: "Check your downloads folder. We've also sent a copy to your email.",
      });
    } catch (error: any) {
      // Still allow download even if tracking fails
      const link = document.createElement('a');
      link.href = '/Kourti_Q1_2026_LegalTech_Nigeria.pdf';
      link.download = 'Kourti_Q1_2026_LegalTech_Nigeria.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setIsDownloaded(true);
      toast({
        title: 'Report downloading!',
        description: 'Check your downloads folder.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      id="download-report"
      className="py-16 sm:py-24 bg-gradient-cta relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-grid-pattern opacity-30"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Copy */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Download className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-primary font-medium">Free Download</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4 leading-tight">
              Get the full <span className="text-gradient">21-page report.</span>
            </h2>
            <p className="text-base text-muted-foreground mb-6">
              The most comprehensive analysis of technology adoption in Nigerian legal practice.
              Data-driven insights, sector mapping, and actionable recommendations.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                'Market data from 220K+ practitioners',
                '9 sector adoption profiles',
                '15 cited references and sources',
                'Actionable recommendations for every segment',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: Form */}
          <div className="card-dark p-6 sm:p-8">
            {isDownloaded ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-[hsl(var(--success))]" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Report Downloaded!</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Check your downloads folder. Want to see how Kourti AI can transform your
                  practice?
                </p>
                <Button
                  className="btn-primary h-12 px-6 text-sm group"
                  onClick={() => window.open('https://cal.com/kourti-legal/discovery', '_blank')}
                >
                  Book a Kourti AI Demo
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-1">Download the Report</h3>
                <p className="text-xs text-muted-foreground mb-6">
                  Fill in your details to get instant access.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Honeypot: hidden from users, catches form-filling bots. */}
                  <input
                    type="text"
                    id="website"
                    name="website"
                    value={formData.website || ''}
                    onChange={handleInputChange}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: '-9999px',
                      width: 1,
                      height: 1,
                      opacity: 0,
                    }}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="firstName"
                        className="block text-xs font-medium text-foreground mb-1.5"
                      >
                        First Name *
                      </label>
                      <Input
                        id="firstName"
                        placeholder="John"
                        required
                        value={formData.firstName}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="lastName"
                        className="block text-xs font-medium text-foreground mb-1.5"
                      >
                        Last Name *
                      </label>
                      <Input
                        id="lastName"
                        placeholder="Doe"
                        required
                        value={formData.lastName}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-xs font-medium text-foreground mb-1.5"
                    >
                      Work Email *
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@lawfirm.com"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="company"
                      className="block text-xs font-medium text-foreground mb-1.5"
                    >
                      Firm / Organization
                    </label>
                    <Input
                      id="company"
                      placeholder="Doe & Associates"
                      value={formData.company}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="role"
                      className="block text-xs font-medium text-foreground mb-1.5"
                    >
                      Role
                    </label>
                    <Select
                      value={formData.role}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, role: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="partner">Partner / Principal</SelectItem>
                        <SelectItem value="associate">Associate</SelectItem>
                        <SelectItem value="in-house">In-House Counsel</SelectItem>
                        <SelectItem value="legal-ops">Legal Operations</SelectItem>
                        <SelectItem value="academic">Academic / Researcher</SelectItem>
                        <SelectItem value="student">Law Student</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full btn-primary h-12 text-sm group"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Preparing download...' : 'Download Report — Free'}
                    {!isSubmitting && (
                      <Download className="ml-2 h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
                    )}
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    No spam. We respect your privacy. By downloading, you agree to our{' '}
                    <Link to="/privacy-policy" className="underline hover:text-foreground">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ────────────────────────────────────────────
   Section: About Kourti AI
   ──────────────────────────────────────────── */
const AboutKourtiAI = () => (
  <section className="py-16 sm:py-20 bg-background relative">
    <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>
    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 leading-tight">
        About <span className="text-gradient">Kourti AI</span>
      </h2>
      <p className="text-base text-muted-foreground mb-6 max-w-2xl mx-auto leading-relaxed">
        Kourti AI is a next-generation legal operations platform built for Africa's legal
        professionals and organisations. We combine deep legal domain expertise with cutting-edge
        artificial intelligence to deliver tools, insights, and services that help lawyers work
        smarter, clients achieve better outcomes, and institutions operate with greater certainty.
      </p>
      <p className="text-sm text-muted-foreground mb-8 max-w-2xl mx-auto">
        Our work spans legal research, contract intelligence, compliance technology, and legal
        operations &mdash; all designed with the African legal market as a first-class design
        consideration.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
        <a
          href="https://kourti.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          <Globe className="h-4 w-4" />
          kourti.com
        </a>
        <a
          href="mailto:support@kourti.com"
          className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          <Mail className="h-4 w-4" />
          support@kourti.com
        </a>
      </div>

      {/* Quote */}
      <div className="mt-12 card-dark p-6 sm:p-8 max-w-2xl mx-auto relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/80 to-primary/40"></div>
        <blockquote className="text-base sm:text-lg font-semibold text-foreground italic leading-relaxed">
          "The future of Nigerian legal practice belongs to those who combine legal excellence with
          technological intelligence."
        </blockquote>
        <p className="text-xs text-primary mt-4 font-semibold">KOURTI AI | Q1 2026</p>
      </div>
    </div>
  </section>
);

/* ────────────────────────────────────────────
   Main Report Page
   ──────────────────────────────────────────── */
const Report = () => {
  const scrollToDownload = () => {
    document.getElementById('download-report')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background relative">
      <SEO
        title="LegalTech in Nigeria Q1 2026 Report"
        description="The State of Technology in Legal Practice in Nigeria — Q1 2026. Download the free report covering AI adoption, court digitisation, cybersecurity challenges, and practice management trends."
        path="/report/legaltech-nigeria-q1-2026"
      />
      <MouseFollowGlow />
      <Navigation />
      <main className="relative z-10">
        <ReportHero onDownloadClick={scrollToDownload} />
        <ReportStats />
        <ReportHighlights />
        <ReportFindings />
        <ReportTimeline />
        <CourtDigitisation />
        <ChallengesOpportunities />
        <ReportPreview onDownloadClick={scrollToDownload} />
        <ReportDownloadCTA />
        <AboutKourtiAI />
      </main>
      <Footer />
    </div>
  );
};

export default Report;
