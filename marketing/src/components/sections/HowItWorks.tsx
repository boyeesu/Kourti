import { Upload, FileSearch, Bell, CheckCircle } from 'lucide-react';

const HowItWorks = () => {
  const steps = [
    {
      icon: Upload,
      step: '1',
      title: 'Add matters & clients',
      description: 'Import your existing cases or start fresh with our intuitive setup.',
    },
    {
      icon: FileSearch,
      step: '2',
      title: 'Upload contracts & documents',
      description: 'Drag and drop files. We support all common legal document formats.',
    },
    {
      icon: Bell,
      step: '3',
      title: 'Let AI summarize & flag risk',
      description: 'Get instant summaries, key clauses, and risk flags in minutes.',
    },
    {
      icon: CheckCircle,
      step: '4',
      title: 'Track deadlines & automate reminders',
      description: 'Never miss a filing date, renewal, or client follow-up again.',
    },
  ];

  return (
    <section className="py-16 sm:py-20 bg-muted/20 relative overflow-hidden">
      <div className="absolute inset-0 bg-dot-pattern opacity-20"></div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-16 max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 leading-tight">
            How it <span className="text-gradient">works</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Get up and running in minutes, not months.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.step} className="relative group">
                {/* Connector Line (hidden on first item and mobile) */}
                {index > 0 && (
                  <div className="hidden lg:block absolute top-8 -left-4 w-8 h-0.5 bg-border group-hover:bg-primary/30 transition-colors" />
                )}

                <div className="card-dark-hover p-6 text-center h-full">
                  {/* Step Number Badge */}
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold mb-4">
                    {step.step}
                  </div>

                  {/* Icon */}
                  <div className="flex justify-center mb-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
