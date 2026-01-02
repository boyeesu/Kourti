import { useEffect, useState } from 'react';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const shortcuts: Shortcut[] = [
  { keys: ['Meta+k', 'Control+k'], description: 'Open command palette', category: 'Navigation' },
  { keys: ['/', 'Meta+f', 'Control+f'], description: 'Open search', category: 'Navigation' },
  { keys: ['Meta+b', 'Control+b'], description: 'Toggle sidebar', category: 'Navigation' },
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'Help' },
  { keys: ['Escape'], description: 'Close dialogs/modals', category: 'Navigation' },
];

export function useKeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useKeyboardShortcut(['?'], () => {
    setOpen(true);
  });

  const formatKeys = (keys: string[]) => {
    return keys.map(key => {
      if (key === 'Meta') return '⌘';
      if (key === 'Control') return 'Ctrl';
      return key.charAt(0).toUpperCase() + key.slice(1);
    }).join(' + ');
  };

  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  return {
    open,
    setOpen,
    shortcuts: groupedShortcuts,
    formatKeys
  };
}

export function KeyboardShortcutsDialog() {
  const { open, setOpen, shortcuts, formatKeys } = useKeyboardShortcuts();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate and interact with the application faster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 mt-4">
          {Object.entries(shortcuts).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                {category}
              </h3>
              <div className="space-y-2">
                {items.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm text-foreground">{shortcut.description}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <Badge
                          key={keyIndex}
                          variant="outline"
                          className="font-mono text-xs px-2 py-1"
                        >
                          {formatKeys([key])}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Separator className="mt-4" />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

