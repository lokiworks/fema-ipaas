/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import {
  RateLimitUnit,
  ReliabilityEventKind,
  RunMonitorHandled,
} from '@fema-ipaas/shared';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { MonitorHandledCard } from '@/features/run-monitor/components/monitor-handled-card';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const HANDLED: RunMonitorHandled = {
  duplicateEvents: 4,
  mergedFailures: 9,
  mergedIssues: 2,
  rateLimitWaits: 6,
  rateLimitedRuns: 3,
  rateLimitSources: [
    {
      connectorName: '@fema-ipaas/connector-feishu',
      unit: RateLimitUnit.PER_API_APP_TENANT,
      count: 5,
    },
    {
      connectorName: '@fema-ipaas/connector-beisen',
      unit: RateLimitUnit.PER_ENTERPRISE,
      count: 1,
    },
  ],
  autoRetries: 8,
  retriedRuns: 4,
  caughtUpEvents: 0,
};

async function render({
  handled,
  onOpenHandled,
}: {
  handled: RunMonitorHandled;
  onOpenHandled: (kind: ReliabilityEventKind) => void;
}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MonitorHandledCard
        handled={handled}
        rangeLabel="Last 7 days"
        connectorName={(name) => name.replace('@fema-ipaas/connector-', '')}
        onOpenDuplicates={null}
        onOpenIssues={() => undefined}
        onOpenHandled={onOpenHandled}
      />,
    );
  });
  return container;
}

describe('MonitorHandledCard', () => {
  it('shows the three reliability counts with the rate limit counted in the unit the other system declared', async () => {
    const view = await render({
      handled: HANDLED,
      onOpenHandled: vi.fn(),
    });

    expect(
      view.querySelector('[data-testid=handled-rate-limit]')?.textContent,
    ).toBe('6');
    expect(
      view.querySelector('[data-testid=handled-retries]')?.textContent,
    ).toBe('8');
    expect(
      view.querySelector('[data-testid=handled-catch-up]')?.textContent,
    ).toBe('0');
    const detail =
      view.querySelector('[data-testid=handled-rate-limit-detail]')
        ?.textContent ?? '';
    expect(detail).toContain('feishu');
    expect(detail).toContain('counted per API, app and tenant');
    expect(detail).toContain('counted per enterprise');
  });

  it('opens the runs behind a count and has nothing to open for a zero count', async () => {
    const onOpenHandled = vi.fn();
    const view = await render({ handled: HANDLED, onOpenHandled });
    const buttonOf = (testId: string) =>
      view
        .querySelector(`[data-testid=${testId}]`)
        ?.parentElement?.querySelector('button');

    await act(async () => {
      buttonOf('handled-retries')?.click();
    });

    expect(onOpenHandled).toHaveBeenCalledWith(ReliabilityEventKind.AUTO_RETRY);
    expect(buttonOf('handled-catch-up')?.disabled).toBe(true);
  });
});
