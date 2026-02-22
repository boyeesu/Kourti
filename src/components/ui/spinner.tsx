import React from 'react';

interface SpinnerProps {
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ className = 'h-8 w-8 border-b-2 border-primary rounded-full' }) => (
  <div className={`animate-spin ${className}`} />
);
