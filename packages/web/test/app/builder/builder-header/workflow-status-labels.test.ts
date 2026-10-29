import { describe, expect, it } from 'vitest';

import { workflowStatusLabels } from '@/app/builder/builder-header/workflow-status-labels';

describe('workflowStatusLabels.runState', () => {
  it('says production is not running instead of implying nothing ever ran', () => {
    expect(
      workflowStatusLabels.runState({ running: false, hasProduction: false }),
    ).toBe('Not running in production');
  });

  it('keeps running and stopped for a published workflow', () => {
    expect(
      workflowStatusLabels.runState({ running: true, hasProduction: true }),
    ).toBe('Running');
    expect(
      workflowStatusLabels.runState({ running: false, hasProduction: true }),
    ).toBe('Stopped');
  });
});
