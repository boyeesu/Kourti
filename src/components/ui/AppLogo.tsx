import React from 'react';
import { useTheme } from '@/hooks/useTheme';
import logoLight from '@/assets/kourti-legal-logo.png';
import { cn } from '@/lib/utils';

interface AppLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  alt?: string;
}

export function AppLogo({ className, size = 'md', alt = 'Kourti AI' }: AppLogoProps) {
  const { theme } = useTheme();
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    const updateDarkMode = () => {
      if (theme === 'dark') {
        setIsDark(true);
      } else if (theme === 'light') {
        setIsDark(false);
      } else {
        // System theme
        setIsDark(
          typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
        );
      }
    };

    updateDarkMode();

    if (theme === 'system' && typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => updateDarkMode();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  if (isDark) {
    return <img src="/kouti-light.png" alt={alt} className={cn(sizeClasses[size], className)} />;
  }

  return <img src={logoLight} alt={alt} className={cn(sizeClasses[size], className)} />;
}
