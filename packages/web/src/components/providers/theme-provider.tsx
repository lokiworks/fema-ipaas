import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import * as RippleHook from 'use-ripple-hook';

import { flagsHooks } from '@/hooks/flags-hooks';
import { colorsUtils } from '@/lib/color-utils';
import { primaryColorUtils } from '@/lib/primary-color-utils';

type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: Theme) => void;
  forceLightMode: boolean;
  setForceLightMode: (value: boolean) => void;
};

const initialState: ThemeProviderState = {
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => null,
  forceLightMode: false,
  setForceLightMode: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

function subscribeToColorScheme(onChange: () => void) {
  const query = window.matchMedia(DARK_COLOR_SCHEME_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function prefersDarkColorScheme() {
  return window.matchMedia(DARK_COLOR_SCHEME_QUERY).matches;
}

const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const setFavicon = (url: string) => {
  document.querySelectorAll("link[rel*='icon']").forEach((el) => el.remove());
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = url;
  document.head.appendChild(link);
};

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'fema.theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );
  const [forceLightMode, setForceLightMode] = useState(false);
  const systemPrefersDark = useSyncExternalStore(
    subscribeToColorScheme,
    prefersDarkColorScheme,
  );
  const branding = flagsHooks.useWebsiteBranding();
  const resolvedTheme = forceLightMode
    ? 'light'
    : theme === 'system'
    ? systemPrefersDark
      ? 'dark'
      : 'light'
    : theme;
  useEffect(() => {
    if (!branding) {
      console.warn('Website brand is not defined');
      return;
    }
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');
    const primaryHex =
      resolvedTheme === 'dark'
        ? primaryColorUtils.onDarkSurface({
            hex: branding.colors.primary.default,
          })
        : branding.colors.primary.default;
    document.documentElement.style.setProperty(
      '--primary',
      colorsUtils.hexToHslString(primaryHex),
    );
    document.documentElement.style.setProperty(
      '--primary-foreground',
      colorsUtils.hexToHslString(
        primaryColorUtils.readableForeground({ hex: primaryHex }),
      ),
    );

    setFavicon(branding.logos.favIconUrl);
    switch (resolvedTheme) {
      case 'light': {
        document.documentElement.style.setProperty(
          '--primary-100',
          colorsUtils.hexToHslString(branding.colors.primary.light),
        );
        document.documentElement.style.setProperty(
          '--primary-300',
          colorsUtils.hexToHslString(branding.colors.primary.dark),
        );
        break;
      }
      case 'dark': {
        document.documentElement.style.setProperty(
          '--primary-100',
          colorsUtils.hexToHslString(branding.colors.primary.dark),
        );
        document.documentElement.style.setProperty(
          '--primary-300',
          colorsUtils.hexToHslString(branding.colors.primary.light),
        );
        break;
      }
      default:
        break;
    }

    root.classList.add(resolvedTheme);
  }, [branding, resolvedTheme]);

  const value = {
    theme,
    resolvedTheme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
    forceLightMode,
    setForceLightMode,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};

export const useApRipple = () => {
  const { theme } = useTheme();
  return RippleHook.default({
    color:
      theme === 'dark'
        ? 'rgba(233, 233, 233, 0.2)'
        : 'rgba(155, 155, 155, 0.2)',
    cancelAutomatically: true,
  });
};
