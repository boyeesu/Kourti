import { useEffect } from 'react';

/**
 * Custom hook for registering keyboard shortcuts
 * 
 * @param keys - Array of key combinations (e.g., ['Meta+k', 'Control+k'] for CMD+K on Mac or CTRL+K on Windows)
 * @param callback - Function to execute when the shortcut is triggered
 * @param preventDefault - Whether to prevent the default browser action (default: true)
 * @param stopPropagation - Whether to stop event propagation (default: true)
 */
export function useKeyboardShortcut(
  keys: string[], 
  callback: (e: KeyboardEvent) => void,
  preventDefault: boolean = true,
  stopPropagation: boolean = true
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if within input, textarea, or select elements
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        // Allow the '/' shortcut to work even in input fields if it's specifically registered
        if (!(event.key === '/' && keys.includes('/'))) {
          return;
        }
      }

      // Convert the pressed key combination to a string
      let pressedCombo = '';
      
      if (event.metaKey) pressedCombo += 'Meta+';
      if (event.ctrlKey) pressedCombo += 'Control+';
      if (event.altKey) pressedCombo += 'Alt+';
      if (event.shiftKey) pressedCombo += 'Shift+';
      
      // Add the key itself
      pressedCombo += event.key.toLowerCase();
      
      // Special case for '/' key
      if (event.key === '/' && keys.includes('/')) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        callback(event);
        return;
      }

      // Check if the pressed combo matches any of the registered shortcuts
      const matches = keys.some(key => {
        // Format the key string for comparison
        const formattedKey = key
          .split('+')
          .map(part => part.toLowerCase())
          .join('+');
        
        return pressedCombo === formattedKey.toLowerCase();
      });

      if (matches) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        callback(event);
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [keys, callback, preventDefault, stopPropagation]);
}