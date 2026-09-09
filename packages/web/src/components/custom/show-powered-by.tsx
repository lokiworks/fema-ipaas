import { t } from 'i18next';

import { flagsHooks } from '@/hooks/flags-hooks';
import { cn } from '@/lib/utils';

const ShowPoweredBy = ({ show, position = 'sticky' }: ShowPoweredByProps) => {
  const branding = flagsHooks.useWebsiteBranding();
  if (!show) {
    return null;
  }
  return (
    <div
      data-powered-by-branding="true"
      className={cn('bottom-0 right-3 pointer-events-none z-40', position, {
        '-mt-[30px]': position === 'sticky',
        'mr-5': position === 'sticky',
      })}
    >
      <div
        className={cn(
          'justify-end text-muted-foreground/70 text-sm items-center flex gap-1 transition group ',
          {
            'justify-center': position === 'static',
          },
        )}
      >
        <div className=" text-sm transition">{t('Built with')}</div>
        <div className="justify-center flex items-center gap-1">
          <img
            src={branding.logos.logoIconUrl}
            alt=""
            className="size-[15px] shrink-0"
            draggable={false}
          />
          <div className="font-semibold">{branding.websiteName}</div>
        </div>
      </div>
    </div>
  );
};

ShowPoweredBy.displayName = 'ShowPoweredBy';
export { ShowPoweredBy };

type ShowPoweredByProps = {
  show: boolean;
  position?: 'sticky' | 'absolute' | 'static';
};
