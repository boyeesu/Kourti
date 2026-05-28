import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  /** Constrain inner content width. Default = no extra constraint (uses shell's 1440px). */
  size?: 'default' | 'narrow' | 'wide';
}

const sizeClasses = {
  default: '',
  narrow: 'max-w-4xl mx-auto w-full',
  wide: 'max-w-6xl mx-auto w-full',
};

export function PageContainer({ children, className, size = 'default' }: PageContainerProps) {
  return <div className={cn('space-y-6', sizeClasses[size], className)}>{children}</div>;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  /** Optional back-navigation arrow. String = router path, function = custom handler. */
  backHref?: string | (() => void);
  /** Optional leading slot (icon, avatar, badge) rendered before the title block. */
  leading?: ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
  backHref,
  leading,
}: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (typeof backHref === 'function') {
      backHref();
    } else if (typeof backHref === 'string') {
      navigate(backHref);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {backHref !== undefined && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            aria-label="Go back"
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm sm:text-base text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
