import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './button';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import kourtiLogo from '@/assets/kourti-logo.png';

const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);

  const handleHashNavigation = (href: string) => {
    if (href.startsWith('/#')) {
      const targetId = href.substring(2);
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
    setIsOpen(false);
  };

  const navItems = [
    { name: 'Features', href: '/#features', isExternal: true },
    { name: 'Pricing', href: '/pricing', isExternal: false },
    { name: 'About', href: '/about', isExternal: false },
    { name: 'Assessment', href: '/assessment', isExternal: false },
    { name: 'Contact', href: '/contact', isExternal: false },
  ];

  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-5xl">
      <div className="nav-container px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="block">
              <img src={kourtiLogo} alt="Kourti Legal Hub" className="h-10 sm:h-12 w-auto" />
            </Link>
          </div>

          {/* Desktop Navigation - Center */}
          <div className="hidden md:flex items-center space-x-8">
            {navItems.map((item) =>
              item.isExternal ? (
                <a
                  key={item.name}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    handleHashNavigation(item.href);
                  }}
                  className="nav-link text-sm font-medium cursor-pointer"
                >
                  {item.name}
                </a>
              ) : (
                <Link key={item.name} to={item.href} className="nav-link text-sm font-medium">
                  {item.name}
                </Link>
              )
            )}
          </div>

          {/* CTA Buttons - Right */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground px-4 font-medium"
              onClick={() => window.open('https://app.kourti.com', '_blank')}
            >
              Log In
            </Button>
            <Button
              size="sm"
              className="bg-foreground text-background hover:bg-foreground/90 rounded-full px-5 font-semibold"
              onClick={() => window.open('https://app.kourti.com', '_blank')}
            >
              Start free trial
            </Button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(!isOpen)}
              className="text-foreground"
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div
          className={cn(
            'md:hidden transition-all duration-300 ease-in-out overflow-hidden',
            isOpen ? 'max-h-80 opacity-100 pb-4' : 'max-h-0 opacity-0'
          )}
        >
          <div className="space-y-1 pt-2">
            {navItems.map((item) =>
              item.isExternal ? (
                <a
                  key={item.name}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    handleHashNavigation(item.href);
                  }}
                  className="block px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-smooth cursor-pointer text-sm"
                >
                  {item.name}
                </a>
              ) : (
                <Link
                  key={item.name}
                  to={item.href}
                  className="block px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-smooth text-sm"
                  onClick={() => setIsOpen(false)}
                >
                  {item.name}
                </Link>
              )
            )}
            <div className="pt-2 px-3 flex flex-col gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-foreground font-medium"
                onClick={() => window.open('https://app.kourti.com', '_blank')}
              >
                Log In
              </Button>
              <Button
                size="sm"
                className="w-full bg-foreground text-background hover:bg-foreground/90 rounded-full font-semibold"
                onClick={() => window.open('https://app.kourti.com', '_blank')}
              >
                Start free trial
              </Button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
