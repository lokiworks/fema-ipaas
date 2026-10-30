import { describe, expect, it } from 'vitest';

import { errorReporting } from '@/lib/error-reporting';

describe('errorReporting.isBenignError', () => {
  it('treats ResizeObserver loop notices as benign', () => {
    expect(
      errorReporting.isBenignError(
        'ResizeObserver loop completed with undelivered notifications.',
      ),
    ).toBe(true);
    expect(
      errorReporting.isBenignError(
        new Error('ResizeObserver loop limit exceeded'),
      ),
    ).toBe(true);
  });

  it('keeps real errors reportable', () => {
    expect(
      errorReporting.isBenignError(new Error('Cannot read properties of null')),
    ).toBe(false);
  });
});
