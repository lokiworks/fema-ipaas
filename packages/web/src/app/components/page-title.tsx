import { t } from 'i18next';
import { useEffect } from 'react';

import { flagsHooks } from '@/hooks/flags-hooks';

import { pageHeading } from './page-heading';

type PageTitleProps = {
  title: string;
  children: React.ReactNode;
};

const PageTitle = ({ title, children }: PageTitleProps) => {
  const websiteBranding = flagsHooks.useWebsiteBranding();
  const hasOwnHeading = pageHeading.usePageHasOwnHeading();

  useEffect(() => {
    document.title = `${t(title)} | ${websiteBranding.websiteName}`;
  }, [title, websiteBranding.websiteName]);

  return (
    <>
      {!hasOwnHeading && (
        <h1 className="sr-only" data-page-title="">
          {t(title)}
        </h1>
      )}
      {children}
    </>
  );
};

PageTitle.displayName = 'PageTitle';

export { PageTitle };
