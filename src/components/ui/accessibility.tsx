// Accessibility utilities and components

import { useEffect, useRef } from "react";

// Skip to main content link
export function SkipToMainContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg"
    >
      Skip to main content
    </a>
  );
}

// Focus trap hook for modals
export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener("keydown", handleTab);
    firstElement?.focus();

    return () => {
      container.removeEventListener("keydown", handleTab);
    };
  }, [isActive]);

  return containerRef;
}

// Announce changes to screen readers
export function useScreenReaderAnnouncement() {
  const announceRef = useRef<HTMLDivElement>(null);

  const announce = (message: string, priority: "polite" | "assertive" = "polite") => {
    if (announceRef.current) {
      announceRef.current.setAttribute("aria-live", priority);
      announceRef.current.textContent = message;
      // Clear after announcement
      setTimeout(() => {
        if (announceRef.current) {
          announceRef.current.textContent = "";
        }
      }, 1000);
    }
  };

  return {
    announce,
    AnnouncementRegion: () => (
      <div
        ref={announceRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      />
    ),
  };
}

// Keyboard navigation helper
export function useKeyboardNavigation<T>(
  items: T[],
  onSelect: (item: T) => void,
  isActive: boolean = true
) {
  const [focusedIndex, setFocusedIndex] = React.useState(-1);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        onSelect(items[focusedIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [items, focusedIndex, onSelect, isActive]);

  return { focusedIndex, setFocusedIndex };
}

import React from "react";

