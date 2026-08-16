import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import { Button } from '@/components/ui/button';
import {
  Scale,
  Target,
  Eye,
  Sparkles,
  Shield,
  Users,
  Zap,
  Award,
  Heart,
  Globe,
  ArrowRight,
  Check,
} from 'lucide-react';
import MouseFollowGlow from '@/components/ui/MouseFollowGlow';
import { Mascot } from '@/components/ui/Mascot';
import SEO from '@/components/SEO';

const About = () => {
  const values = [
    {
      icon: Scale,
      title: 'Legal First Approach',
      description:
        "Every feature is designed with legal workflows in mind. We don't retrofit generic tools; we build purpose-driven solutions for legal professionals.",
      color: 'pastel-blue',
    },
    {
      icon: Shield,
      title: 'Uncompromising Security',
      description:
        "Your client data is sacred. Built on SOC 2-aligned infrastructure with encryption in transit and at rest — and we're working toward formal SOC 2 Type II certification.",
      color: 'pastel-green',
    },
    {
      icon: Zap,
      title: 'AI That Actually Helps',
      description:
        "Our AI doesn't just automate; it augments. Smart summaries, risk flagging, and document analysis that save hours, not minutes.",
      color: 'pastel-yellow',
    },
    {
      icon: Users,
      title: 'Built for Teams',
      description:
        'From solo practitioners to large firms, our platform scales with your practice without sacrificing simplicity.',
      color: 'pastel-purple',
    },
  ];

  const differentiators = [
    'Founded by former legal practitioners who understand real legal workflows',
    'AI models specifically trained on legal documents and terminology',
    'Seamless migration from legacy practice management tools',
    'White-glove onboarding and continuous support from legal tech experts',
    'Regular feature updates based on direct feedback from legal professionals',
    'Open-source development shaped by feedback from legal professionals',
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
    <div className="min-h-screen bg-background relative">
      <SEO
        title="About Us"
        description="Kourti Legal is built by former legal practitioners who understand real legal workflows. Learn about our mission to eliminate administrative burden with AI-powered legal software."
        path="/about"
      />
      <MouseFollowGlow />
      <Navigation />
      <main className="pt-24 relative z-10">
        {/* Hero Section */}
        <section className="py-16 sm:py-24 bg-gradient-subtle relative overflow-hidden">
          <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>

          {/* Floating Mascot */}
          <div className="absolute top-[15%] right-[8%] hidden lg:block z-20 opacity-70 hover:opacity-100 transition-opacity">
            <Mascot variant="float" size="md" />
          </div>

          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-8 animate-fade-in">
              <Scale className="h-4 w-4 text-primary" />
              <span className="text-sm text-primary font-medium">
                Built by Former Legal Practitioners
              </span>
            </div>

            <h1
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight animate-fade-in"
              style={{ animationDelay: '0.1s' }}
            >
              Legal Software by People Who
              <span className="block text-gradient mt-2 pb-2">Actually Practiced Law.</span>
            </h1>

            <p
              className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8 leading-relaxed animate-fade-in"
              style={{ animationDelay: '0.2s' }}
            >
              We lived the frustrations of clunky legal software, missed deadlines buried in emails,
              and hours lost on administrative tasks. That's why we built Kourti Legal.
            </p>

            <div
              className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in"
              style={{ animationDelay: '0.3s' }}
            >
              <Button
                size="lg"
                className="btn-primary h-12 px-6 text-sm group"
                onClick={() => window.open('https://github.com/boyeesu/Kourti', '_blank')}
              >
                View Source
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="btn-secondary h-12 px-6 text-sm"
                onClick={() => window.open('https://cal.com/kourti-legal/discovery', '_blank')}
              >
                Book a Demo
              </Button>
            </div>
          </div>
        </section>

        {/* Vision & Mission Section */}
        <section className="py-16 sm:py-24 bg-background relative">
          <div className="absolute inset-0 bg-grid-pattern opacity-20"></div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              {/* Vision Card */}
              <div className="card-dark p-8 sm:p-10 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-primary/10 to-transparent rounded-bl-[100px] transition-all group-hover:from-primary/20"></div>

                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-[hsl(210,60%,75%)]/10 flex items-center justify-center mb-6">
                    <Eye className="h-7 w-7 icon-pastel-blue" />
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                    Our <span className="text-gradient">Vision</span>
                  </h2>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    To become the operating system for modern legal practice, where every legal
                    professional has access to intelligent tools that amplify their expertise and
                    free them to focus on what truly matters: serving their clients and upholding
                    justice.
                  </p>

                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="h-5 w-5 text-primary" />
                    <span className="text-muted-foreground">Empowering legal teams worldwide</span>
                  </div>
                </div>
              </div>

              {/* Mission Card */}
              <div className="card-dark p-8 sm:p-10 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-primary/10 to-transparent rounded-bl-[100px] transition-all group-hover:from-primary/20"></div>

                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-[hsl(145,50%,65%)]/10 flex items-center justify-center mb-6">
                    <Target className="h-7 w-7 icon-pastel-green" />
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                    Our <span className="text-gradient">Mission</span>
                  </h2>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    To eliminate the administrative burden that drains legal professionals,
                    replacing outdated workflows with AI-powered solutions that are secure,
                    intuitive, and designed from the ground up for how lawyers actually work.
                  </p>

                  <div className="flex items-center gap-3 text-sm">
                    <Heart className="h-5 w-5 text-primary" />
                    <span className="text-muted-foreground">Putting legal professionals first</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Our Story Section */}
        <section className="py-16 sm:py-24 bg-muted/30 relative">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-6">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm text-primary font-medium">Our Story</span>
              </div>

              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 leading-tight">
                From Frustration to <span className="text-gradient">Innovation</span>
              </h2>
            </div>

            <div className="card-dark p-8 sm:p-12">
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                  Kourti Legal was born in the trenches of legal practice. Our founding team spent
                  years in active practice navigating the chaos of traditional legal work: juggling
                  spreadsheets for matter tracking, hunting through endless email threads for
                  document versions, and manually monitoring deadlines that should never be missed.
                </p>

                <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                  We asked ourselves: why should legal professionals, some of the most highly
                  trained minds in the world, spend so much time on administrative work that
                  technology could handle better?
                </p>

                <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                  So we built Kourti Legal. Not as a generic SaaS platform with legal features
                  bolted on, but as a purpose-built solution designed from day one for lawyers, by
                  former lawyers. Every feature, every workflow, every AI capability was crafted
                  with deep understanding of how legal work actually happens.
                </p>

                <p className="text-foreground text-lg leading-relaxed font-medium">
                  Today, legal teams across the globe use Kourti to reclaim their time, reduce risk,
                  and deliver better outcomes for their clients. And we're just getting started.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Core Values Section */}
        <section className="py-16 sm:py-24 bg-background relative">
          <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
                What Drives <span className="text-gradient">Everything We Do</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Our core values shape every product decision, every customer interaction, and every
                line of code.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {values.map((value, index) => {
                const Icon = value.icon;
                const colorClass = colorClasses[value.color] || colorClasses['pastel-blue'];

                return (
                  <div
                    key={value.title}
                    className="card-dark-hover p-6 sm:p-8"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div
                      className={`w-14 h-14 rounded-xl ${colorClass} flex items-center justify-center mb-5`}
                    >
                      <Icon className="h-7 w-7" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-3">{value.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{value.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Why We Stand Out Section */}
        <section className="py-16 sm:py-24 bg-muted/30 relative overflow-hidden">
          <div className="absolute top-1/2 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl -translate-y-1/2"></div>
          <div className="absolute top-1/2 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl -translate-y-1/2"></div>

          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-6">
                <Award className="h-4 w-4 text-primary" />
                <span className="text-sm text-primary font-medium">Why Kourti Legal</span>
              </div>

              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
                What Makes Us <span className="text-gradient">Different</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                We're not just another legal tech company. Here's what sets Kourti apart.
              </p>
            </div>

            <div className="card-dark p-8 sm:p-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {differentiators.map((item, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="h-4 w-4 text-success" />
                    </div>
                    <p className="text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 sm:py-24 bg-background relative">
          <div className="absolute inset-0 bg-radial-glow"></div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
              Ready to Transform Your <span className="text-gradient">Legal Practice?</span>
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join thousands of legal professionals who have already made the switch to smarter,
              AI-powered practice management.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="gradient-primary text-primary-foreground hover:shadow-glow"
                onClick={() => window.open('https://github.com/boyeesu/Kourti', '_blank')}
              >
                View Source
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => window.open('https://cal.com/kourti-legal/discovery', '_blank')}
              >
                Schedule a Demo
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mt-6">
              Open source · Full access to the codebase
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;
