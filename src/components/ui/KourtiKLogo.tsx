import React from 'react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface KourtiKLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  alt?: string;
}

export function KourtiKLogo({ className, size = 'md', alt = 'KOURTI' }: KourtiKLogoProps) {
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
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
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
    sm: 'h-8',
    md: 'h-12',
    lg: 'h-16',
  };

  if (isDark) {
    return (
      <img
        src="/kourti-dark-full.png"
        alt={alt}
        className={cn(sizeClasses[size], 'w-auto object-contain', className)}
      />
    );
  }

  return (
    <img
      src="/kourti-light-full.png"
      alt={alt}
      className={cn(sizeClasses[size], 'w-auto object-contain', className)}
    />
  );
}
