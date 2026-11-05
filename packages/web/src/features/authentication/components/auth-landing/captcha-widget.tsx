import { CaptchaProvider, FlagId } from '@fema-ipaas/shared';

import { flagsHooks } from '@/hooks/flags-hooks';

import { captchaUtils } from '../../utils/captcha-utils';

import { PowCaptchaWidget } from './pow-captcha-widget';
import { TurnstileWidget, useTurnstileSiteKey } from './turnstile-widget';

function useCaptchaMode(): CaptchaProvider {
  const { data: provider } = flagsHooks.useFlag<string>(
    FlagId.CAPTCHA_PROVIDER,
  );
  const turnstileSiteKey = useTurnstileSiteKey();
  return captchaUtils.resolveMode({ provider, turnstileSiteKey });
}

function CaptchaWidget(props: CaptchaWidgetProps) {
  const mode = useCaptchaMode();
  return mode === CaptchaProvider.TURNSTILE ? (
    <TurnstileWidget {...props} />
  ) : (
    <PowCaptchaWidget {...props} />
  );
}

export { CaptchaWidget, useCaptchaMode };

type CaptchaWidgetProps = {
  onToken: (token: string | undefined) => void;
  onUnavailable: () => void;
  resetSignal: number;
};
