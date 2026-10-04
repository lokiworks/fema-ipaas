import { ServiceConfigSource, ServiceSettingView } from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ServiceSourceBadge({
  setting,
}: {
  setting: ServiceSettingView;
}) {
  switch (setting.source) {
    case ServiceConfigSource.ENVIRONMENT:
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="accent">
              <Lock />
              {t('From environment variables')}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {t(
              'Set through environment variables, which take priority. Change them there and restart the app; this page cannot edit them.',
            )}
          </TooltipContent>
        </Tooltip>
      );
    case ServiceConfigSource.SAVED:
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="info">{t('Saved here')}</Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {savedText({ setting })}
          </TooltipContent>
        </Tooltip>
      );
    case ServiceConfigSource.NONE:
      return null;
  }
}

function savedText({ setting }: { setting: ServiceSettingView }): string {
  if (!setting.updated) {
    return t('Saved on this page');
  }
  const time = dayjs(setting.updated).format('YYYY-MM-DD HH:mm');
  return setting.updatedBy
    ? t('Saved {time} by {email}', { time, email: setting.updatedBy })
    : t('Saved {time}', { time });
}
