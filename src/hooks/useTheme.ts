import { useCallback, useEffect, useState } from 'react';
import type { ThemeMode } from '../types/jarvis';

const STORAGE_KEY = 'jarvis_theme_mode';

function getStoredTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  } catch {
    // Ignore storage access errors
  }
  return 'dark';
}

function resolveSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let themeTransitionTimer: number | null = null;

export function applyThemeToDocument(
  mode: ThemeMode,
  animate = false
): 'dark' | 'light' {
  const resolved = mode === 'system' ? resolveSystemTheme() : mode;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    const currentlyDark = root.classList?.contains?.('dark') ?? false;
    const willBeDark = resolved === 'dark';

    if (animate && currentlyDark !== willBeDark) {
      root.classList.add('theme-transition');
      void root.offsetHeight;
      if (
        themeTransitionTimer !== null &&
        typeof window !== 'undefined' &&
        typeof window.clearTimeout === 'function'
      ) {
        window.clearTimeout(themeTransitionTimer);
      }
      if (
        typeof window !== 'undefined' &&
        typeof window.setTimeout === 'function'
      ) {
        themeTransitionTimer = window.setTimeout(() => {
          root.classList.remove('theme-transition');
          themeTransitionTimer = null;
        }, 340);
      }
    }

    if (willBeDark) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', willBeDark ? '#04070D' : '#F8FAFC');
    }
  }
  return resolved;
}

export function useTheme() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() =>
    applyThemeToDocument(getStoredTheme(), false)
  );

  const setThemeMode = useCallback((next: ThemeMode) => {
    setThemeModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures
    }
    setResolvedTheme(applyThemeToDocument(next, true));
  }, []);

  useEffect(() => {
    setResolvedTheme(applyThemeToDocument(themeMode, false));
    if (themeMode !== 'system' || !window.matchMedia) return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setResolvedTheme(applyThemeToDocument('system', true));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themeMode]);

  return {
    themeMode,
    resolvedTheme,
    setThemeMode,
  };
}
