'use client';

import { useEffect, useState } from 'react';

const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA'
];

export function useKonamiCode(callback: () => void) {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setKeys((prevKeys) => {
        const newKeys = [...prevKeys, event.code];

        // Keep only the last N keys where N is the length of the Konami code
        const trimmedKeys = newKeys.slice(-KONAMI_CODE.length);

        // Check if the sequence matches
        if (JSON.stringify(trimmedKeys) === JSON.stringify(KONAMI_CODE)) {
          callback();
          return []; // Reset after successful match
        }

        return trimmedKeys;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callback]);

  return keys;
}
