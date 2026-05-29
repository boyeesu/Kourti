import React from 'react';
import { cn } from '@/lib/utils';

interface MascotProps {
  className?: string;
  variant?: 'float' | 'static' | 'peek' | 'wave' | 'bounce';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  glow?: boolean;
}

export const Mascot = ({ className, variant = 'float', size = 'md', glow = true }: MascotProps) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'float':
        return { animation: 'float 3s ease-in-out infinite' };
      case 'peek':
        return {
          transform: 'translateY(25%)',
          transition: 'transform 0.5s ease-out',
        };
      case 'wave':
        return { animation: 'wiggle 2s ease-in-out infinite' };
      case 'bounce':
        return { animation: 'bounce-subtle 2s ease-in-out infinite' };
      default:
        return {};
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'w-12 h-12';
      case 'md':
        return 'w-24 h-24';
      case 'lg':
        return 'w-32 h-32';
      case 'xl':
        return 'w-48 h-48';
      default:
        return 'w-24 h-24';
    }
  };

  const glowStyle: React.CSSProperties = glow
    ? {
        filter: 'drop-shadow(0 0 10px hsl(215 70% 76% / 0.4))',
      }
    : {};

  return (
    <div
      className={cn('relative select-none pointer-events-none', className)}
      style={getVariantStyles()}
    >
      <img
        src="/mascot.png"
        alt="Kourti Mascot"
        className={cn('object-contain', getSizeClasses())}
        style={glowStyle}
      />
    </div>
  );
};
