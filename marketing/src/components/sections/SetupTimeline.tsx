const SetupTimeline = () => {
  const steps = [
    { number: 1, title: 'Create an account', description: 'Sign up in seconds' },
    { number: 2, title: 'Upload Your Knowledge', description: 'Add your FAQs and docs' },
    { number: 3, title: 'Let MARTHA Take Over', description: 'Watch the magic happen' },
  ];

  return (
    <section id="how-it-works" className="py-24 bg-muted/30 relative">
      <div className="absolute inset-0 bg-grid-pattern opacity-30"></div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 leading-tight">
            No Complex Setup. Just <span className="text-gradient">Pure Clarity.</span>
          </h2>
        </div>

        {/* Timeline */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              {/* Step */}
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-xl bg-card border border-border flex items-center justify-center mb-4 hover:border-primary/50 transition-colors">
                  <span className="text-2xl font-bold text-foreground">{step.number}</span>
                </div>
                <h3 className="font-semibold text-foreground mb-1">{step.title}</h3>
                <p className="text-sm text-muted-foreground max-w-[150px]">{step.description}</p>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="hidden md:block w-24 lg:w-32 h-px bg-border mx-4 mt-[-40px]"></div>
              )}
            </div>
          ))}
        </div>

        {/* Reassurance Text */}
        <p className="text-center text-muted-foreground mt-12 text-sm">
          You're not managing a bot. You're upgrading your operations.
        </p>
      </div>
    </section>
  );
};

export default SetupTimeline;
