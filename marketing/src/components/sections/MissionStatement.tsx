import { Zap } from 'lucide-react';

const MissionStatement = () => {
  return (
    <section className="py-32 bg-background relative overflow-hidden">
      {/* Background Abstract Element */}
      <div className="absolute inset-0 flex items-center justify-center opacity-5">
        <div className="w-[600px] h-[600px] border-[40px] border-primary rounded-full"></div>
        <div className="absolute w-[400px] h-[400px] border-[30px] border-primary/50 rounded-full"></div>
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-8 animate-float">
          <Zap className="h-10 w-10 text-primary" />
        </div>

        {/* Statement */}
        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
          She doesn't talk.
          <span className="block text-gradient mt-2">She executes.</span>
        </h2>
      </div>
    </section>
  );
};

export default MissionStatement;
