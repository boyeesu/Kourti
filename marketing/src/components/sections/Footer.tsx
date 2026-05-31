import { Mail, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import kourtiLogo from '@/assets/kourti-logo.png';
import { Mascot } from '@/components/ui/Mascot';

const Footer = () => {
  const quickLinks = [
    { name: 'Features', href: '/features' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'Security', href: '/security' },
    { name: 'Assessment', href: '/assessment' },
    { name: 'Contact', href: '/contact' },
  ];

  return (
    <footer className="bg-card border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
          {/* Mascot Decoration */}
          <div className="absolute -top-24 right-10 hidden lg:block pointer-events-none">
            <Mascot variant="peek" size="md" className="opacity-80 rotate-[-10deg]" />
          </div>

          {/* Brand Section */}
          <div className="md:col-span-1">
            <img src={kourtiLogo} alt="Kourti Legal" className="h-10 w-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              The AI legal practice app for matters, contracts, and deadlines.
            </p>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <a
                href="mailto:support@kourti.com"
                className="flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                support@kourti.com
              </a>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Lagos, NG
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Quick Links</h4>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  {link.href.startsWith('/#') ? (
                    <a
                      href={link.href}
                      onClick={(e) => {
                        e.preventDefault();
                        const targetId = link.href.substring(2);
                        const element = document.getElementById(targetId);
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      to={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Legal</h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/privacy-policy"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  to="/terms-of-use"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link
                  to="/ai-policy"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  AI Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground text-center">
            © {new Date().getFullYear()} Kourti Legal. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
