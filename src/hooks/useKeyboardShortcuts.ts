import { useEffect } from 'react';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

export const SHORTCUT_DESCRIPTIONS: ShortcutConfig[] = [
  {
    key: 'k',
    ctrl: true,
    action: () => {},
    description: 'Open search',
  },
  {
    key: 'n',
    ctrl: true,
    action: () => {},
    description: 'New task',
  },
  {
    key: 'd',
    ctrl: true,
    action: () => {},
    description: 'Go to dashboard',
  },
  {
    key: 't',
    ctrl: true,
    action: () => {},
    description: 'Go to tasks',
  },
  {
    key: 'f',
    ctrl: true,
    action: () => {},
    description: 'Go to flocks',
  },
  {
    key: 'e',
    ctrl: true,
    action: () => {},
    description: 'Go to expenses',
  },
  {
    key: '/',
    ctrl: false,
    action: () => {},
    description: 'Focus search',
  },
];
