/**
 * useVisualViewport — track the visible-viewport height through keyboard
 * open/close events on mobile.
 *
 * Why: when a soft keyboard opens, window.innerHeight stays the same on
 * iOS/Android Chrome but visualViewport.height shrinks. Components that
 * pin their own layout to that smaller value (e.g. a chat container that
 * wants to keep the latest message visible above the keyboard) need the
 * shrunken value, not the full innerHeight.
 *
 * Falls back to window.innerHeight on platforms without VisualViewport
 * (older browsers; SSR).
 *
 * Per docs/BRIEF_PHASE_3_MOBILE_UX.md (#MOB-B).
 */

import { useEffect, useState } from 'react';

export function useVisualViewport(): { height: number; width: number } {
  const initial = (() => {
    if (typeof window === 'undefined') return { height: 0, width: 0 };
    const vv = window.visualViewport;
    return {
      height: vv?.height ?? window.innerHeight,
      width: vv?.width ?? window.innerWidth,
    };
  })();

  const [size, setSize] = useState(initial);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setSize({ height: vv.height, width: vv.width });
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize); // some Android Chromes only fire scroll
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  return size;
}

/**
 * useKeyboardOpen — convenience wrapper. Returns true when the visual
 * viewport is meaningfully shorter than the layout viewport, indicating
 * the soft keyboard is open. Threshold is 150px to avoid false positives
 * from browser chrome auto-hide.
 */
export function useKeyboardOpen(): boolean {
  const { height } = useVisualViewport();
  if (typeof window === 'undefined') return false;
  return window.innerHeight - height > 150;
}
