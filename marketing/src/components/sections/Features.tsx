import {
  FileSearch,
  FileText,
  Briefcase,
  Bell,
  Users,
  BarChart3,
  Shield,
  Mic,
  Calendar,
} from 'lucide-react';

import { Mascot } from '@/components/ui/Mascot';

const Features = () => {
  const features = [
    {
      icon: FileSearch,
      title: 'AI Document Analysis',
      description:
        'Upload any contract. Get a summary, key clauses, and risk flags in minutes, not hours.',
      color: 'pastel-blue',
    },
    {
      icon: FileText,
      title: 'Smart Contract Management',
      description:
        'Track every version, redline changes, and manage approvals without lost edits or email chaos.',
      color: 'pastel-green',
    },
    {
      icon: Briefcase,
      title: 'Matter Management',
      description:
        'Manage matters with deadlines, tasks, and customizable fields your practice actually needs.',
      color: 'pastel-yellow',
    },
    {
      icon: Bell,
      title: 'Smart Reminders',
      description:
        'AI watches your deadlines and pushes alerts before things become urgent. Never miss a filing date.',
      color: 'pastel-purple',
    },
    {
      icon: Users,
      title: 'Client Hub',
      description:
        'One place for client profiles, matters, documents, notes, and communication history.',
      color: 'pastel-pink',
    },
    {
      icon: BarChart3,
      title: 'Practice Analytics',
      description:
        'See where your time goes, track matter progress, and identify bottlenecks in your workflow.',
      color: 'pastel-cyan',
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description:
        'Bank-grade security with SOC 2 compliance and end-to-end encryption. Your data stays yours.',
      color: 'pastel-blue',
    },
    {
      icon: Mic,
      title: 'Meeting Transcription',
      description:
        'Record client calls. Get instant transcripts and AI-generated summaries with action items.',
      color: 'pastel-green',
    },
    {
      icon: Calendar,
      title: 'Calendar Integration',
      description:
        'Sync hearings, deadlines, and client meetings with your existing calendar. Stay in one workflow.',
      color: 'pastel-yellow',
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
    <section id="features" className="py-16 sm:py-24 bg-background relative">
      <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-16 max-w-3xl mx-auto px-2">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-tight">
            Built for end-to-end <span className="text-gradient">legal practice work.</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            From matter tracking to contract lifecycle and deadline safety. Kourti brings everything
            together.
          </p>
        </div>

        {/* Subtle Mascot Near Features */}
        <div className="absolute -top-8 left-4 hidden xl:block">
          <Mascot variant="wave" size="sm" className="opacity-70" />
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const colorClass = colorClasses[feature.color] || colorClasses['pastel-blue'];

            return (
              <div
                key={feature.title}
                className="card-dark-hover p-6 bg-dot-pattern"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div
                  className={`w-12 h-12 rounded-xl ${colorClass} flex items-center justify-center mb-4`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
