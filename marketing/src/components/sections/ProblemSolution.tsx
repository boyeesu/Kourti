import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Clock, Users, DollarSign, MessageCircle } from 'lucide-react';

const ProblemSolution = () => {
  const [visibleMessages, setVisibleMessages] = useState(0);

  const painPoints = [
    {
      icon: RefreshCw,
      title: 'Repetitive Inquiries',
      description: 'Same questions, over and over again',
    },
    {
      icon: Clock,
      title: 'Delayed Responses',
      description: 'Customers waiting hours for simple answers',
    },
    {
      icon: Users,
      title: 'Burnt-Out Teams',
      description: 'Support staff overwhelmed and exhausted',
    },
    {
      icon: DollarSign,
      title: 'Hidden Costs',
      description: 'Scaling support means scaling expenses',
    },
  ];

  const chatMessages = [
    { type: 'user', text: 'Hi, I need help with my order #12345' },
    {
      type: 'agent',
      text: "Hello! I found your order. It's currently being processed and will ship within 24 hours. Would you like tracking updates?",
    },
    { type: 'user', text: 'Yes please, and can I change the delivery address?' },
    {
      type: 'agent',
      text: "Of course! I've enabled tracking notifications. To update your address, I just need the new delivery details. What's the new address?",
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleMessages((prev) => {
        if (prev < chatMessages.length) return prev + 1;
        return prev;
      });
    }, 800);

    return () => clearInterval(timer);
  }, []);

  return (
    <section id="about" className="py-24 bg-background relative">
      <div className="absolute inset-0 bg-dot-pattern opacity-50"></div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16 max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Most Support Teams Are Drowning in
            <span className="block text-gradient mt-2">Repetition, Delays, Costs and Burnout</span>
          </h2>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left Column - Pain Points */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-muted-foreground mb-6">Before MARTHA</h3>
            {painPoints.map((point, index) => {
              const Icon = point.icon;
              return (
                <div
                  key={point.title}
                  className="card-dark p-5 flex items-start gap-4 animate-fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">{point.title}</h4>
                    <p className="text-sm text-muted-foreground">{point.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column - Chat Interface */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-primary mb-6">With MARTHA</h3>
            <div className="card-dark p-6 min-h-[400px]">
              <div className="space-y-4">
                {chatMessages.slice(0, visibleMessages).map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-chat-fade-in`}
                  >
                    <div
                      className={
                        message.type === 'user'
                          ? 'chat-bubble-user max-w-[80%]'
                          : 'chat-bubble-agent max-w-[80%]'
                      }
                    >
                      <p className="text-sm">{message.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat Input Area */}
              <div className="mt-6 pt-4 border-t border-border">
                <Button
                  className="w-full bg-primary/10 hover:bg-primary/20 text-primary rounded-full"
                  onClick={() => setVisibleMessages(0)}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Chat With MARTHA
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSolution;
