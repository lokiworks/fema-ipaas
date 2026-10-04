import { t } from 'i18next';
import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@/components/providers/theme-provider';
import { Button } from '@/components/ui/button';

export function AuthThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={
        dark ? t('Switch to the light theme') : t('Switch to the dark theme')
      }
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
