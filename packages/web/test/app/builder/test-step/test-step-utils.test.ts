import { describe, expect, it } from 'vitest';

import { testStepUtils } from '@/app/builder/test-step/utils/test-step-utils';

describe('testStepUtils.knownStepErrorOf', () => {
  it('recognises the loop error the engine sends as JSON', () => {
    const known = testStepUtils.knownStepErrorOf(
      JSON.stringify({
        message: 'The items you have selected must be a list.',
      }),
    );
    expect(known?.title).toBe('Loop items must be a list');
  });

  it('leaves other errors to the generic views', () => {
    expect(testStepUtils.knownStepErrorOf('Request failed')).toBeNull();
    expect(testStepUtils.knownStepErrorOf(null)).toBeNull();
  });
});
