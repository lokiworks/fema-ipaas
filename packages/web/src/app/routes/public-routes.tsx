import React, { Suspense } from 'react';

import { PageTitle } from '@/app/components/page-title';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';
import { lazyWithRetry } from '@/lib/lazy-with-retry';

import { WorkspaceDashboardLayout } from '../components/workspace-layout';
import { TemplateDetailsWrapper } from '../guards/template-details-wrapper';

import NotFoundPage from './404-page';
import AuthenticatePage from './authenticate';
import { RedirectPage } from './redirect';

const FormPage = lazyWithRetry(
  () => import('./forms').then((m) => ({ default: m.FormPage })),
  'public-form',
);
const TemplatesPage = lazyWithRetry(
  () => import('./templates').then((m) => ({ default: m.TemplatesPage })),
  'public-templates',
);

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteLoadingBar />}>{children}</Suspense>;
}

export const publicRoutes = [
  {
    path: '/authenticate',
    element: <AuthenticatePage />,
  },
  {
    path: '/templates',
    element: (
      <WorkspaceDashboardLayout>
        <PageTitle title="Templates">
          <SuspenseWrapper>
            <TemplatesPage />
          </SuspenseWrapper>
        </PageTitle>
      </WorkspaceDashboardLayout>
    ),
  },
  {
    path: '/templates/:templateId',
    element: <TemplateDetailsWrapper />,
  },
  {
    path: '/forms/:flowId',
    element: (
      <PageTitle title="Forms">
        <SuspenseWrapper>
          <FormPage />
        </SuspenseWrapper>
      </PageTitle>
    ),
  },
  {
    path: '/redirect',
    element: <RedirectPage></RedirectPage>,
  },
  {
    path: '/404',
    element: (
      <PageTitle title="Not Found">
        <NotFoundPage />
      </PageTitle>
    ),
  },
];
