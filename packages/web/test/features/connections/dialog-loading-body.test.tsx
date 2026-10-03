/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DialogLoadingBody } from '@/features/connections/components/dialog-loading-body';

describe('DialogLoadingBody', () => {
  it('keeps the dialog labelled for screen readers while the details load', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Dialog open>
          <DialogContent>
            <DialogLoadingBody />
          </DialogContent>
        </Dialog>,
      );
    });
    const dialog = document.querySelector('[role=dialog]');
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog?.getAttribute('aria-describedby')).toBeTruthy();
    expect(dialog?.textContent).toContain('Loading');
    const accessibilityErrors = error.mock.calls.filter((call) =>
      String(call[0]).includes('DialogTitle'),
    );
    expect(accessibilityErrors).toEqual([]);
    await act(async () => root.unmount());
    error.mockRestore();
  });
});
