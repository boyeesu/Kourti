import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  // Update isDark when theme changes
  useEffect(() => {
    const updateIsDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    // Initial check
    updateIsDark();

    // Watch for class changes on the document element
    const observer = new MutationObserver(updateIsDark);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [theme]);

  const toggleTheme = () => {
    // Get current actual theme from DOM
    const currentlyDark = document.documentElement.classList.contains('dark');
    setTheme(currentlyDark ? 'light' : 'dark');
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-8 w-8 rounded-md border border-border bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isDark ? 'Switch to light mode' : 'Switch to dark mode'}</p>
      </TooltipContent>
    </Tooltip>
  );
}
