import { t } from 'i18next';

import { flagsHooks } from '@/hooks/flags-hooks';
import { cn } from '@/lib/utils';

const FullLogo = ({ className }: { className?: string }) => {
  const branding = flagsHooks.useWebsiteBranding();
  const usesDefaultFullLogo =
    branding.logos.fullLogoUrl === DEFAULT_FULL_LOGO_URL;

  if (usesDefaultFullLogo) {
    return (
      <div className={cn('flex h-[60px] items-center gap-2', className)}>
        <img
          className="h-full max-h-9 rounded-md object-contain"
          src={branding.logos.logoIconUrl}
          alt=""
        />
        <span className="min-w-0 break-words text-base font-semibold">
          {branding.websiteName}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('h-[60px]', className)}>
      <img
        className="h-full"
        src={branding.logos.fullLogoUrl}
        alt={t('logo')}
      />
    </div>
  );
};
FullLogo.displayName = 'FullLogo';

const DEFAULT_FULL_LOGO_URL = '/assets/full-logo.svg';

export { FullLogo };
