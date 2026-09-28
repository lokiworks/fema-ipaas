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

import { DefaultRoute, UnknownRoute } from './default-route';
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

const AllProjectsPage = lazyWithRetry(
  () =>
    import('../routes/projects').then((m) => ({
      default: m.AllProjectsPage,
    })),
  'all-projects',
);

const RunLogsPage = lazyWithRetry(
  () =>
    import('../routes/runs').then((m) => ({
      default: m.RunsPage,
    })),
  'run-logs',
);

const IssueCenterPage = lazyWithRetry(
  () =>
    import('../routes/issue-center').then((m) => ({
      default: m.IssueCenterPage,
    })),
  'issue-center',
);
const MonitorPage = lazyWithRetry(
  () =>
    import('../routes/monitor').then((m) => ({
      default: m.MonitorPage,
    })),
  'run-monitor',
);

const AccountPage = lazyWithRetry(
  () =>
    import('../routes/account').then((m) => ({
      default: m.AccountPage,
    })),
  'account',
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
    path: '/projects',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <ProjectDashboardLayout>
          <PageTitle title="All projects">
            <Suspense fallback={<RouteLoadingBar />}>
              <AllProjectsPage />
            </Suspense>
          </PageTitle>
        </ProjectDashboardLayout>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
  {
    path: '/logs',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <ProjectDashboardLayout>
          <PageTitle title="Run logs">
            <Suspense fallback={<RouteLoadingBar />}>
              <RunLogsPage />
            </Suspense>
          </PageTitle>
        </ProjectDashboardLayout>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
  {
    path: '/issue-center',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <ProjectDashboardLayout>
          <PageTitle title="Issues">
            <Suspense fallback={<RouteLoadingBar />}>
              <IssueCenterPage />
            </Suspense>
          </PageTitle>
        </ProjectDashboardLayout>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
  {
    path: '/monitor',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <ProjectDashboardLayout>
          <PageTitle title="Run monitoring">
            <Suspense fallback={<RouteLoadingBar />}>
              <MonitorPage />
            </Suspense>
          </PageTitle>
        </ProjectDashboardLayout>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
  {
    path: '/account',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <ProjectDashboardLayout>
          <PageTitle title="Personal settings">
            <Suspense fallback={<RouteLoadingBar />}>
              <AccountPage />
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
      <PageTitle title="Page not found">
        <UnknownRoute />
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
