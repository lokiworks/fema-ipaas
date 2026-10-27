import { t } from 'i18next';
import { Check, LucideIcon, Monitor, Moon, Sun } from 'lucide-react';
import React from 'react';

import { useTheme } from '@/components/providers/theme-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export function AppearanceCard({ children }: { children?: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Appearance')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>{t('Theme')}</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {THEME_OPTIONS.map(({ value, label, Icon }) => (
              <Button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                variant={theme === value ? 'default' : 'outline'}
                onClick={() => setTheme(value)}
              >
                <Icon className="size-4" />
                {label()}
                {theme === value && <Check className="size-4" />}
              </Button>
            ))}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

const THEME_OPTIONS: {
  value: 'light' | 'dark' | 'system';
  label: () => string;
  Icon: LucideIcon;
}[] = [
  { value: 'light', label: () => t('Light'), Icon: Sun },
  { value: 'dark', label: () => t('Dark'), Icon: Moon },
  { value: 'system', label: () => t('Follow system'), Icon: Monitor },
];
