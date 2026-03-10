import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface UseUnsavedChangesOptions {
  hasUnsavedChanges: boolean;
  message?: string;
  enabled?: boolean;
}

export function useUnsavedChanges({
  hasUnsavedChanges,
  message = 'You have unsaved changes. Are you sure you want to leave?',
  enabled = true,
}: UseUnsavedChangesOptions) {
  const navigate = useNavigate();
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, message]);

  const handleNavigation = (targetPath: string) => {
    if (hasUnsavedChangesRef.current && enabled) {
      const confirmed = window.confirm(message);
      if (!confirmed) {
        return false;
      }
    }
    navigate(targetPath);
    return true;
  };

  const showUnsavedWarning = () => {
    if (hasUnsavedChanges && enabled) {
      toast.success('Unsaved Changes', { description: message, duration: 5000 });
    }
  };

  return {
    handleNavigation,
    showUnsavedWarning,
    hasUnsavedChanges: hasUnsavedChangesRef.current,
  };
}
