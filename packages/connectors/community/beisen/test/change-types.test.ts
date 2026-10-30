import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { employeeChanged } from '../src/lib/triggers/employee-changed';

const zh: Record<string, string> = JSON.parse(readFileSync(path.resolve(__dirname, '../src/i18n/zh.json'), 'utf-8'));

describe('employee changed trigger change types', () => {
  const property = employeeChanged.props['changeTypes'];

  it('offers the change type codes the official solutions filter on', () => {
    const options = 'options' in property ? property.options : undefined;
    const values = options !== undefined && 'options' in options ? options.options.map((option) => option.value) : [];
    expect(values).toEqual(['1', '2', '7', '9']);
  });

  it('names every change type in Chinese', () => {
    const options = 'options' in property ? property.options : undefined;
    const labels = options !== undefined && 'options' in options ? options.options.map((option) => option.label) : [];
    expect(labels.map((label) => zh[label])).toEqual(['入职（1）', '重新入职（2）', '调动（7）', '调岗（9）']);
    expect(zh[property.displayName]).toBe('变动类型');
  });
});
