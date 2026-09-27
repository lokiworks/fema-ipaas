import { describe, expect, it } from 'vitest';

import { blueprintLineDiff } from '@/features/connector-blueprints/utils/blueprint-line-diff';

describe('blueprintLineDiff', () => {
  it('marks every line as same when before and after are identical', () => {
    const result = blueprintLineDiff.compute({
      before: 'a\nb\nc',
      after: 'a\nb\nc',
    });
    expect(result.before).toEqual([
      { text: 'a', kind: 'same' },
      { text: 'b', kind: 'same' },
      { text: 'c', kind: 'same' },
    ]);
    expect(result.after).toEqual(result.before);
  });

  it('marks added lines when after has extra content', () => {
    const result = blueprintLineDiff.compute({
      before: 'a\nb',
      after: 'a\nb\nc',
    });
    expect(result.before).toEqual([
      { text: 'a', kind: 'same' },
      { text: 'b', kind: 'same' },
    ]);
    expect(result.after).toEqual([
      { text: 'a', kind: 'same' },
      { text: 'b', kind: 'same' },
      { text: 'c', kind: 'added' },
    ]);
  });

  it('marks removed lines when before has extra content', () => {
    const result = blueprintLineDiff.compute({
      before: 'a\nb\nc',
      after: 'a\nc',
    });
    expect(result.before).toEqual([
      { text: 'a', kind: 'same' },
      { text: 'b', kind: 'removed' },
      { text: 'c', kind: 'same' },
    ]);
    expect(result.after).toEqual([
      { text: 'a', kind: 'same' },
      { text: 'c', kind: 'same' },
    ]);
  });

  it('marks a changed line as one removal and one addition', () => {
    const result = blueprintLineDiff.compute({
      before: 'GET /foo',
      after: 'POST /foo',
    });
    expect(result.before).toEqual([{ text: 'GET /foo', kind: 'removed' }]);
    expect(result.after).toEqual([{ text: 'POST /foo', kind: 'added' }]);
  });

  it('treats an empty side as no lines rather than one empty line', () => {
    const result = blueprintLineDiff.compute({ before: '', after: 'a' });
    expect(result.before).toEqual([]);
    expect(result.after).toEqual([{ text: 'a', kind: 'added' }]);
  });
});
