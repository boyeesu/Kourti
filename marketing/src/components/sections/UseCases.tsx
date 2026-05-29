import {
  ShoppingCart,
  Landmark,
  Truck,
  Building2,
  Headphones,
  Rocket,
  Heart,
  GraduationCap,
} from 'lucide-react';

const UseCases = () => {
  const categories = [
    { icon: ShoppingCart, label: 'Ecommerce brands' },
    { icon: Landmark, label: 'Fintech teams' },
    { icon: Truck, label: 'Logistics & Startups' },
    { icon: Building2, label: 'Institutions' },
    { icon: Headphones, label: 'Internal service teams' },
    { icon: Rocket, label: 'Founder-led businesses' },
    { icon: Heart, label: 'Health & appointments' },
    { icon: GraduationCap, label: 'Education platforms' },
  ];

  return (
    <section className="py-24 bg-background relative">
      <div className="absolute inset-0 bg-dot-pattern opacity-30"></div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 leading-tight">
            Built for Operators in
            <span className="block text-gradient mt-2">High-Signal Companies</span>
          </h2>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6">
          {categories.map((category, index) => {
            const Icon = category.icon;
            return (
              <div
                key={category.label}
                className="flex flex-col items-center p-6 rounded-xl bg-card border border-border hover:border-primary/30 transition-all duration-300 group"
              >
                <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
                  <Icon className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <span className="text-sm text-muted-foreground text-center group-hover:text-foreground transition-colors">
                  {category.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default UseCases;
