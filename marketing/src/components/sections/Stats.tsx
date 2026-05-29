const Stats = () => {
  const stats = [
    {
      value: '80%',
      label: 'Time Saved',
      description: 'On first-pass contract review',
    },
    {
      value: '99.9%',
      label: 'Analysis Precision',
      description: 'On supported document types',
    },
    {
      value: '3x',
      label: 'Faster Turnaround',
      description: 'On matter completion times',
    },
    {
      value: 'Zero',
      label: 'Missed Deadlines',
      description: 'With smart reminder automation',
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-muted/30 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-30"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-16 max-w-3xl mx-auto px-2">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 leading-tight">
            Faster review. Fewer mistakes.{' '}
            <span className="text-gradient">More billable time.</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Based on outcomes from legal teams using Kourti for contract review and matter
            management.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="card-dark-hover p-4 sm:p-6 text-center group"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="text-2xl sm:text-4xl md:text-5xl font-bold text-gradient mb-2 group-hover:scale-110 transition-transform duration-300">
                {stat.value}
              </div>
              <div className="text-sm sm:text-lg font-semibold text-foreground mb-1">
                {stat.label}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground">{stat.description}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
