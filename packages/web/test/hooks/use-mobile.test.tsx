/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useIsCompact, useIsMobile } from '@/hooks/use-mobile';

let container: HTMLDivElement;
let root: Root;
let seen: { mobile: boolean; compact: boolean };

function Probe() {
  seen = { mobile: useIsMobile(), compact: useIsCompact() };
  return null;
}

function renderAtWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true,
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  act(() => root.render(<Probe />));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe('viewport hooks', () => {
  it('treats 768 as a tablet: not mobile, but compact so the project column folds away', () => {
    renderAtWidth(768);
    expect(seen).toEqual({ mobile: false, compact: true });
  });

  it('treats a phone as both mobile and compact', () => {
    renderAtWidth(390);
    expect(seen).toEqual({ mobile: true, compact: true });
  });

  it('keeps the full layout from 1024 up', () => {
    renderAtWidth(1024);
    expect(seen).toEqual({ mobile: false, compact: false });
  });
});
