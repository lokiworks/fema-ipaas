/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowBuilderPage } from '@/app/routes/workflows/id';

import { workflowFixture } from './workflow-fixture';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  isMobile: false,
  getWorkflow: vi.fn(),
  useSampleData: vi.fn(),
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.isMobile }));
vi.mock('@/features/workflows', () => ({
  workflowsApi: { get: mocks.getWorkflow },
  sampleDataHooks: {
    useSampleDataForWorkflow: mocks.useSampleData,
    useSampleDataInputForWorkflow: mocks.useSampleData,
  },
}));
vi.mock('@/app/builder', () => ({
  BuilderPage: () => <p data-testid="editor">editor</p>,
}));
vi.mock('@/app/builder/snapshot-context', () => ({
  BuilderSnapshotProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock('@/app/builder/state/builder-state-provider', () => ({
  BuilderStateProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/features/connectors', () => ({
  stepsHooks: {
    useStepMetadata: () => ({ stepMetadata: undefined, isLoading: false }),
  },
}));
vi.mock('@/hooks/authorization-hooks', () => ({
  useAuthorization: () => ({ checkAccess: () => true }),
}));

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/workflows/wf-1']}>
          <Routes>
            <Route
              path="/workflows/:workflowId"
              element={<WorkflowBuilderPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function pageText() {
  return container.textContent ?? '';
}

function editor() {
  return container.querySelector('[data-testid="editor"]');
}

describe('WorkflowBuilderPage', () => {
  beforeEach(() => {
    mocks.isMobile = false;
    mocks.getWorkflow.mockReset();
    mocks.getWorkflow.mockResolvedValue(workflowFixture.buildWorkflow());
    mocks.useSampleData.mockReset();
    mocks.useSampleData.mockReturnValue({ data: {}, isLoading: false });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders the editor on a desktop or tablet viewport', async () => {
    await renderPage();

    expect(editor()).not.toBeNull();
    expect(pageText()).not.toContain('Please edit on a computer');
  });

  it('renders the read only summary instead of the editor on a phone', async () => {
    mocks.isMobile = true;
    await renderPage();

    expect(editor()).toBeNull();
    expect(pageText()).toContain('Please edit on a computer');
    expect(container.querySelector('h1')?.textContent).toBe('Beisen to Feishu');
  });

  it('does not fetch the sample data of every step on a phone', async () => {
    mocks.isMobile = true;
    await renderPage();

    expect(mocks.getWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.useSampleData).not.toHaveBeenCalled();
  });

  it('still reports a missing workflow on a phone', async () => {
    mocks.isMobile = true;
    mocks.getWorkflow.mockRejectedValue(new Error('not found'));
    await renderPage();

    expect(pageText()).toContain('Workflow not found');
    expect(pageText()).not.toContain('Please edit on a computer');
  });
});
