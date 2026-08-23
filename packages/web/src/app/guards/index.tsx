import { lazy, Suspense } from 'react';
import {
  RouterProvider,
  createBrowserRouter,
  createMemoryRouter,
} from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { authRoutes } from '@/app/routes/auth-routes';
import { platformRoutes } from '@/app/routes/platform-routes';
import { projectRoutes } from '@/app/routes/project-routes';
import { publicRoutes } from '@/app/routes/public-routes';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';
import { useEmbedding } from '@/components/providers/embed-provider';

import { RouteErrorBoundary } from '../components/global-error-boundary';

import { DefaultRoute } from './default-route';
import { TokenCheckerWrapper } from './project-route-wrapper';

const CrashTestPage = import.meta.env.DEV
  ? lazy(() =>
      import('../routes/crash-test').then((m) => ({
        default: m.CrashTestPage,
      })),
    )
  : null;

const devRoutes =
  import.meta.env.DEV && CrashTestPage
    ? [
        {
          path: '/__crashtest',
          element: (
            <Suspense fallback={<RouteLoadingBar />}>
              <CrashTestPage />
            </Suspense>
          ),
        },
      ]
    : [];

const routes = [
  ...devRoutes,
  ...publicRoutes,
  ...projectRoutes,
  ...authRoutes,
  ...platformRoutes,
  {
    path: '/projects/:projectId',
    element: (
      <TokenCheckerWrapper>
        <DefaultRoute></DefaultRoute>
      </TokenCheckerWrapper>
    ),
  },
  {
    path: '/*',
    element: (
      <PageTitle title="Redirect">
        <DefaultRoute></DefaultRoute>
      </PageTitle>
    ),
  },
];

const routesWithErrorBoundary = routes.map((route) => ({
  errorElement: <RouteErrorBoundary />,
  ...route,
}));

export const memoryRouter = createMemoryRouter(routesWithErrorBoundary);
const browserRouter = createBrowserRouter(routesWithErrorBoundary);

const ApRouter = () => {
  const { embedState } = useEmbedding();
  const router = embedState.isEmbedded ? memoryRouter : browserRouter;
  return <RouterProvider router={router}></RouterProvider>;
};

export { ApRouter };
