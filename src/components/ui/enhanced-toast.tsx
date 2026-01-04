import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { Undo2 } from 'lucide-react';

interface ToastOptions {
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  undo?: {
    label: string;
    onClick: () => void;
  };
}

export function useEnhancedToast() {
  const { toast } = useToast();

  const success = ({ title, description, duration = 5000, undo }: ToastOptions & { undo?: { label: string; onClick: () => void } }) => {
    toast({
      title,
      description,
      duration,
      action: undo ? (
        <ToastAction altText={undo.label} onClick={undo.onClick} className="border-primary/20 hover:bg-primary/10">
          <Undo2 className="h-4 w-4 mr-2" />
          {undo.label}
        </ToastAction>
      ) : undefined,
    });
  };

  const error = ({ title, description, duration = 7000, action }: ToastOptions) => {
    toast({
      variant: 'destructive',
      title,
      description,
      duration,
      action: action ? (
        <ToastAction altText={action.label} onClick={action.onClick}>
          {action.label}
        </ToastAction>
      ) : undefined,
    });
  };

  const warning = ({ title, description, duration = 5000 }: ToastOptions) => {
    toast({
      title,
      description,
      duration,
    });
  };

  const info = ({ title, description, duration = 5000 }: ToastOptions) => {
    toast({
      title,
      description,
      duration,
    });
  };

  return {
    success,
    error,
    warning,
    info,
    toast
  };
}

