import { t } from 'i18next';
import { useLayoutEffect, useRef, useState } from 'react';

import { colorContrast } from '@/lib/color-contrast';
import { colorsUtils } from '@/lib/color-utils';
import { primaryColorUtils } from '@/lib/primary-color-utils';

import { SignInForm } from '../sign-in-form';

import { AuthHeading, AuthModeSwitch } from './auth-drawer-body';
import { BrandPanelContent } from './auth-landing';

export function LoginPagePreview({
  productName,
  welcomeText,
  color,
  iconUrl,
  emailAuthEnabled,
  openSignUpEnabled,
}: LoginPagePreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);

  useLayoutEffect(() => {
    const element = frameRef.current;
    if (!element) {
      return;
    }
    if (pageRef.current) {
      pageRef.current.inert = true;
    }
    const observer = new ResizeObserver(() =>
      setFrameWidth(element.clientWidth),
    );
    observer.observe(element);
    setFrameWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const scale = frameWidth > 0 ? frameWidth / PAGE_WIDTH : 0;
  const name = productName.trim().length > 0 ? productName : t('Product name');
  const colorVariables = buildColorVariables({ color });

  return (
    <div
      ref={frameRef}
      className="relative w-full overflow-hidden rounded-lg border bg-background"
      style={{ height: PAGE_HEIGHT * scale }}
    >
      <div
        aria-hidden
        ref={pageRef}
        className="pointer-events-none absolute left-0 top-0 grid select-none grid-cols-[5fr_7fr] bg-background text-foreground"
        style={{
          ...colorVariables,
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <aside className="flex flex-col justify-between gap-8 border-r bg-sidebar p-12">
          <BrandPanelContent
            productName={name}
            iconUrl={iconUrl}
            welcomeText={welcomeText}
          />
        </aside>
        <main className="flex items-start p-16">
          <section className="w-full max-w-[400px] overflow-hidden rounded-2xl border bg-background shadow-sm">
            <div className="flex w-full flex-col px-8 pb-7 pt-9">
              {emailAuthEnabled ? (
                <>
                  <AuthHeading title={t('Welcome back')} />
                  <SignInForm />
                  {openSignUpEnabled && (
                    <AuthModeSwitch mode="signin" onSwitch={noop} />
                  )}
                </>
              ) : (
                <>
                  <AuthHeading title={t('Sign-in is turned off')} />
                  <p className="text-sm text-muted-foreground">
                    {t(
                      'This tenant does not allow signing in with an email address. Ask an administrator to turn it back on.',
                    )}
                  </p>
                </>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function buildColorVariables({
  color,
}: {
  color: string;
}): Record<string, string> {
  if (!colorContrast.isReadableOnWhite(color)) {
    return {};
  }
  return {
    '--primary': colorsUtils.hexToHslString(color),
    '--primary-foreground': colorsUtils.hexToHslString(
      primaryColorUtils.readableForeground({ hex: color }),
    ),
  };
}

function noop() {
  return undefined;
}

const PAGE_WIDTH = 820;
const PAGE_HEIGHT = 460;

type LoginPagePreviewProps = {
  productName: string;
  welcomeText: string;
  color: string;
  iconUrl: string;
  emailAuthEnabled: boolean;
  openSignUpEnabled: boolean;
};
