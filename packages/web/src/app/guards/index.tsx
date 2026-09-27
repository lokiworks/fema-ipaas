import { lazy, Suspense } from 'react';
import {
  RouterProvider,
  createBrowserRouter,
  createMemoryRouter,
} from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { authRoutes } from '@/app/routes/auth-routes';
import { projectRoutes } from '@/app/routes/project-routes';
import { publicRoutes } from '@/app/routes/public-routes';
import { tenantRoutes } from '@/app/routes/tenant-routes';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';
import { useEmbedding } from '@/components/providers/embed-provider';
import { lazyWithRetry } from '@/lib/lazy-with-retry';
import { WORKSPACE_HOME_ROUTE } from '@/lib/route-utils';

import { AllowOnlyLoggedInUserOnlyGuard } from '../components/allow-logged-in-user-only-guard';
import { RouteErrorBoundary } from '../components/global-error-boundary';
import { ProjectDashboardLayout } from '../components/project-layout';

import { DefaultRoute } from './default-route';
import { TokenCheckerWrapper } from './project-route-wrapper';

const CrashTestPage = import.meta.env.DEV
  ? lazy(() =>
      import('../routes/crash-test').then((m) => ({
        default: m.CrashTestPage,
      })),
    )
  : null;

const WorkspaceHomePage = lazyWithRetry(
  () =>
    import('../routes/workspace-home').then((m) => ({
      default: m.WorkspaceHomePage,
    })),
  'workspace-home',
);

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
  ...tenantRoutes,
  {
    path: WORKSPACE_HOME_ROUTE,
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <ProjectDashboardLayout>
          <PageTitle title="Home">
            <Suspense fallback={<RouteLoadingBar />}>
              <WorkspaceHomePage />
            </Suspense>
          </PageTitle>
        </ProjectDashboardLayout>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
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

const AppRouter = () => {
  const { embedState } = useEmbedding();
  const router = embedState.isEmbedded ? memoryRouter : browserRouter;
  return <RouterProvider router={router}></RouterProvider>;
};

export { AppRouter };
