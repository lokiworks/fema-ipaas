/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/flags-hooks', () => ({
  flagsHooks: { useWebsiteBranding: () => ({ websiteName: 'Console' }) },
}));

import { pageHeading } from '@/app/components/page-heading';
import { PageTitle } from '@/app/components/page-title';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PageTitle', () => {
  it('adds a visually hidden page heading when the page has none', () => {
    act(() => {
      root.render(
        <PageTitle title="Runs">
          <div>content</div>
        </PageTitle>,
      );
    });
    const headings = container.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveProperty('textContent', 'Runs');
    expect(headings[0].className).toContain('sr-only');
    expect(document.title).toBe('Runs | Console');
  });

  it('does not add a second h1 when the page renders its own', () => {
    act(() => {
      root.render(
        <PageTitle title="Issues">
          <h1>Issue list</h1>
        </PageTitle>,
      );
    });
    const headings = container.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveProperty('textContent', 'Issue list');
  });

  it('drops the hidden heading once the page loads its own', async () => {
    function LateHeading({ ready }: { ready: boolean }) {
      return (
        <PageTitle title="Variables">
          {ready ? <h1>Variables</h1> : <div>loading</div>}
        </PageTitle>
      );
    }
    act(() => root.render(<LateHeading ready={false} />));
    expect(container.querySelectorAll('h1[data-page-title]')).toHaveLength(1);
    act(() => root.render(<LateHeading ready={true} />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelectorAll('h1[data-page-title]')).toHaveLength(0);
  });
});

describe('pageHeading.hasOwnHeading', () => {
  it('ignores the generated page title heading', () => {
    const element = document.createElement('div');
    element.innerHTML = '<h1 data-page-title="">Runs</h1><h2>Section</h2>';
    expect(pageHeading.hasOwnHeading(element)).toBe(false);
    element.innerHTML += '<h1>Real</h1>';
    expect(pageHeading.hasOwnHeading(element)).toBe(true);
  });
});
