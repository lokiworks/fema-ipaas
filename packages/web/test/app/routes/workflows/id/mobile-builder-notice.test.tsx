/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import { WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileBuilderNotice } from '@/app/routes/workflows/id/mobile-builder-notice';

import { workflowFixture } from './workflow-fixture';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const environment = vi.hoisted(() => ({
  canReadRuns: true,
  disableNavigationInBuilder: false,
}));

vi.mock('@/features/connectors', () => ({
  stepsHooks: {
    useStepMetadata: ({ step }: { step: { name: string } }) => ({
      stepMetadata: { displayName: `Type of ${step.name}`, logoUrl: '' },
      isLoading: false,
    }),
  },
}));
vi.mock('@/hooks/authorization-hooks', () => ({
  useAuthorization: () => ({ checkAccess: () => environment.canReadRuns }),
}));
vi.mock('@/components/providers/embed-provider', () => ({
  useEmbedding: () => ({
    embedState: {
      disableNavigationInBuilder: environment.disableNavigationInBuilder,
    },
  }),
}));

let container: HTMLDivElement;
let root: Root;

async function renderNotice({
  workflow = workflowFixture.buildWorkflow(),
}: {
  workflow?: ReturnType<typeof workflowFixture.buildWorkflow>;
} = {}) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <MobileBuilderNotice workflow={workflow} />
      </MemoryRouter>,
    );
  });
}

function rows() {
  return Array.from(container.querySelectorAll('li')).map((row) => ({
    text: row.textContent ?? '',
    depth: Number(row.getAttribute('data-depth')),
  }));
}

function hrefs() {
  return Array.from(container.querySelectorAll('a')).map((link) =>
    link.getAttribute('href'),
  );
}

describe('MobileBuilderNotice', () => {
  beforeEach(() => {
    environment.canReadRuns = true;
    environment.disableNavigationInBuilder = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows the workflow name, its status and the ask to edit on a computer', async () => {
    await renderNotice();

    const text = container.textContent ?? '';
    expect(container.querySelector('h1')?.textContent).toBe('Beisen to Feishu');
    expect(text).toContain('Draft');
    expect(text).toContain('Disabled');
    expect(text).toContain('Please edit on a computer');
  });

  it('shows Published and Enabled for the live version', async () => {
    const workflow = workflowFixture.buildWorkflow({
      state: WorkflowVersionState.LOCKED,
      status: WorkflowStatus.ENABLED,
      publishedVersionId: 'version-1',
    });
    await renderNotice({ workflow });

    const text = container.textContent ?? '';
    expect(text).toContain('Published');
    expect(text).toContain('Enabled');
    expect(text).not.toContain('Draft');
  });

  it('lists every step in execution order, branches and loops included', async () => {
    await renderNotice();

    expect(rows().map((row) => row.text)).toEqual([
      '1. Title triggerType of trigger',
      '2. Title loopType of loop',
      '3. Title build_payloadType of build_payload',
      '4. Title send_messageType of send_message',
      '5. Title routerType of router',
      'Branch: Manager6. Title notify_hrType of notify_hr',
      '7. Title log_hrType of log_hr',
      'Branch: Default8. Title notify_teamType of notify_team',
      '9. Title finishType of finish',
    ]);
  });

  it('indents steps that sit inside a loop or a router branch, not the ones that follow them', async () => {
    await renderNotice();

    expect(rows().map((row) => row.depth)).toEqual([0, 0, 1, 1, 0, 1, 1, 1, 0]);
  });

  it('shows how many steps there are', async () => {
    await renderNotice();

    expect(container.querySelector('h2')?.textContent).toBe('Steps (9)');
  });

  it('links back to the workflow list and to the run logs of this workflow', async () => {
    await renderNotice();

    expect(hrefs()).toEqual([
      '/projects/project-1/automations',
      '/projects/project-1/runs?workflowId=wf-1',
    ]);
  });

  it('hides the run logs link when the user may not read runs', async () => {
    environment.canReadRuns = false;
    await renderNotice();

    expect(hrefs()).toEqual(['/projects/project-1/automations']);
  });

  it('hides both links when the host app disabled navigation in the builder', async () => {
    environment.disableNavigationInBuilder = true;
    await renderNotice();

    expect(hrefs()).toEqual([]);
  });
});
