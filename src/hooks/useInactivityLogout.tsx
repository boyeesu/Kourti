import { useEffect, useRef } from "react";

/**
 * Hook to automatically invoke onLogout after a period of inactivity.
 */
export function useInactivityLogout({
  onLogout,
  delay = 10 * 60 * 1000, // 10 minutes
}: {
  onLogout: () => void;
  delay?: number;
}) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const reset = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(onLogout, delay);
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    events.forEach((e) => window.addEventListener(e, reset));
    reset();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [onLogout, delay]);
}
