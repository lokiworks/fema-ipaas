import { useQuery } from '@tanstack/react-query';
import i18next from 'i18next';

import { componentsApi } from '../api/components-api';

export const componentsHooks = {
  useComponents: () =>
    useQuery({
      queryKey: ['flow-components', i18next.language],
      queryFn: () => componentsApi.list(),
      staleTime: Infinity,
    }),
};

export function componentLogoUrl(icon: string): string {
  return COMPONENT_ICONS.has(icon)
    ? `/assets/components/${icon}.svg`
    : '/assets/components/fallback.svg';
}

const COMPONENT_ICONS = new Set([
  'clock',
  'calendar-clock',
  'reply',
  'circle-stop',
  'user-check',
  'link',
  'variable',
  'arrow-left-right',
  'filter',
  'braces',
  'type',
  'calendar',
  'list',
]);
