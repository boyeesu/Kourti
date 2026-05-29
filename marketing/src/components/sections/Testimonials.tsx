import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const Testimonials = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const testimonials = [
    {
      name: 'David Idang',
      title: 'Senior Partner',
      company: 'Obidike & Idang LP',
      firmType: 'Law Firm',
      outcome: '15+ hours saved per week',
      quote:
        'Kourti has completely redefined how we manage case files and client communications. What used to take our associates an entire day now happens in minutes — our clients notice the difference.',
      avatar: 'DI',
    },
    {
      name: 'Ibitayo Ibitoye',
      title: 'Principal Partner',
      company: 'Courtland Partners',
      firmType: 'Law Firm',
      outcome: '60% faster contract review',
      quote:
        'We handle high-volume commercial transactions and Kourti keeps everything running seamlessly. Contract review turnaround dropped by 60%, and our team finally has time for the work that actually matters.',
      avatar: 'II',
    },
    {
      name: 'Ayisha Hammed',
      title: 'Legal',
      company: 'Interswitch Group',
      firmType: 'In-House',
      outcome: 'Zero missed deadlines',
      quote:
        "Managing regulatory compliance across multiple jurisdictions used to be our biggest headache. Since adopting Kourti, we haven't missed a single deadline and our reporting is airtight.",
      avatar: 'AH',
    },
  ];

  useEffect(() => {
    if (!isAutoPlaying) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [isAutoPlaying, testimonials.length]);

  const goToPrevious = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  const goToNext = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const goToSlide = (index: number) => {
    setIsAutoPlaying(false);
    setCurrentIndex(index);
  };

  return (
    <section id="testimonials" className="py-16 sm:py-24 bg-background relative">
      <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-16 max-w-3xl mx-auto px-2">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 leading-tight">
            Trusted by <span className="text-gradient">firms and in-house teams.</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            From solo practitioners to enterprise legal operations.
          </p>
        </div>

        {/* Testimonial Carousel */}
        <div className="relative">
          {/* Cards Container */}
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
              {testimonials.map((testimonial, index) => (
                <div key={testimonial.name} className="w-full flex-shrink-0 px-4">
                  <div className="card-dark p-8 md:p-10 max-w-2xl mx-auto border border-border/50 relative">
                    {/* Quote Icon */}
                    <div className="absolute top-6 right-6 opacity-10">
                      <Quote className="w-16 h-16 text-primary" />
                    </div>

                    {/* Outcome Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
                      <span className="text-xs sm:text-sm font-semibold text-primary">
                        {testimonial.outcome}
                      </span>
                    </div>

                    <p className="text-lg md:text-xl text-foreground mb-8 leading-relaxed relative z-10">
                      "{testimonial.quote}"
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <Avatar className="h-12 w-12 border-2 border-primary/20">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                            {testimonial.avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold text-foreground">{testimonial.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {testimonial.title} at {testimonial.company}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground hidden sm:inline-block">
                        {testimonial.firmType}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation Arrows */}
          <button
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 md:-translate-x-4 bg-card border border-border hover:bg-muted hover:border-primary/30 h-10 w-10 rounded-lg inline-flex items-center justify-center transition-all duration-200"
            onClick={goToPrevious}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 md:translate-x-4 bg-card border border-border hover:bg-muted hover:border-primary/30 h-10 w-10 rounded-lg inline-flex items-center justify-center transition-all duration-200"
            onClick={goToNext}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Dot Indicators */}
        <div className="flex justify-center gap-2 mt-8">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'bg-primary w-6'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
