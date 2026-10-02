/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { MonitorStatCard } from '@/features/run-monitor/components/monitor-stat-card';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: () => null,
}));

describe('MonitorStatCard', () => {
  it('keeps a long caption inside the card and exposes it as a tooltip', async () => {
    const caption = '53 workflows · 1 executing right now in this project';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MonitorStatCard label="Running" value="18" delta={caption} />,
      );
    });

    const delta = container.querySelector(`[title="${caption}"]`);
    expect(delta).not.toBeNull();
    expect(delta?.className).toContain('truncate');
    expect(delta?.className).toContain('w-full');

    await act(async () => root.unmount());
    container.remove();
  });
});
