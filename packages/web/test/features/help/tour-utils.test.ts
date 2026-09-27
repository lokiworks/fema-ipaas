import { describe, expect, it } from 'vitest';

import { helpArticles } from '@/features/help/lib/help-articles';
import { tours } from '@/features/help/lib/tours';
import { tourUtils } from '@/features/help/utils/tour-utils';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}

describe('tours', () => {
  it('has three console steps and five editor steps', () => {
    expect(tours.steps('console')).toHaveLength(3);
    expect(tours.steps('editor')).toHaveLength(5);
  });
});

describe('tourUtils.resolveSteps', () => {
  it('skips steps whose targets are not on the page and uses the first visible fallback', () => {
    const resolved = tourUtils.resolveSteps({
      steps: tours.steps('console'),
      isVisible: (target) =>
        target === 'nav-projects' || target === 'home-projects',
    });
    expect(resolved.map((step) => step.target)).toEqual([
      'nav-projects',
      'home-projects',
    ]);
  });
});

describe('tour progress', () => {
  it('stores progress per user', () => {
    const storage = memoryStorage();
    tourUtils.writeProgress({
      storage,
      userId: 'u1',
      tourId: 'console',
      status: 'completed',
    });
    tourUtils.writeProgress({
      storage,
      userId: 'u1',
      tourId: 'editor',
      status: 'dismissed',
    });
    expect(tourUtils.readProgress({ storage, userId: 'u1' })).toEqual({
      console: 'completed',
      editor: 'dismissed',
    });
    expect(tourUtils.readProgress({ storage, userId: 'u2' })).toEqual({});
  });

  it('ignores corrupted values and storage failures', () => {
    expect(
      tourUtils.readProgress({
        storage: memoryStorage({ 'tour-progress:u1': '{not json' }),
        userId: 'u1',
      }),
    ).toEqual({});
    expect(
      tourUtils.readProgress({
        storage: memoryStorage({ 'tour-progress:u1': '{"console":"weird"}' }),
        userId: 'u1',
      }),
    ).toEqual({});
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(tourUtils.readProgress({ storage: throwing, userId: 'u1' })).toEqual(
      {},
    );
    expect(
      tourUtils.writeProgress({
        storage: throwing,
        userId: 'u1',
        tourId: 'console',
        status: 'completed',
      }),
    ).toEqual({ console: 'completed' });
  });
});

describe('tourUtils.cardPosition', () => {
  const viewport = { width: 1280, height: 800 };
  const card = { width: 320, height: 170 };

  it('places the card to the right of the target when there is room', () => {
    expect(
      tourUtils.cardPosition({
        rect: { left: 10, top: 100, width: 200, height: 40 },
        viewport,
        card,
      }),
    ).toEqual({ left: 226, top: 100 });
  });

  it('falls back to the left and keeps the card on screen', () => {
    expect(
      tourUtils.cardPosition({
        rect: { left: 1000, top: 780, width: 260, height: 40 },
        viewport,
        card,
      }),
    ).toEqual({ left: 664, top: 622 });
  });

  it('centres the card when the target is missing', () => {
    expect(tourUtils.cardPosition({ rect: null, viewport, card })).toEqual({
      left: 480,
      top: 315,
    });
  });
});

describe('helpArticles', () => {
  it('covers the nine help topics and is searchable', () => {
    const articles = helpArticles.list();
    expect(articles.map((article) => article.id)).toEqual([
      'quickstart',
      'references',
      'errors',
      'environments',
      'mapping',
      'issues',
      'ai',
      'connections',
      'shortcuts',
    ]);
    expect(helpArticles.search({ articles, query: '' })).toHaveLength(9);
    expect(
      helpArticles
        .search({ articles, query: 'MAPPING TABLE' })
        .map((article) => article.id),
    ).toContain('mapping');
    expect(helpArticles.search({ articles, query: 'zzzz-nothing' })).toEqual(
      [],
    );
  });
});
