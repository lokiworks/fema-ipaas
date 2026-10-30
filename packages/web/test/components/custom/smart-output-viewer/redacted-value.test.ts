// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { truncateValue } from '@/components/custom/smart-output-viewer/shared-value-rendering';

describe('truncateValue', () => {
  it('shows a redacted connection as hidden instead of the engine placeholder', () => {
    expect(truncateValue('**REDACTED**')).toBe('Hidden');
    expect(truncateValue('oc_hr_notice')).toBe('oc_hr_notice');
  });
});
