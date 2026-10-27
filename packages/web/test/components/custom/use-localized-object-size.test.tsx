// @vitest-environment jsdom
import { readFileSync } from 'fs';
import path from 'path';

import i18n from 'i18next';
import { useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import ReactJson from 'react-json-view';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { useLocalizedObjectSize } from '@/components/custom/use-localized-object-size';

function Viewer({ src }: { src: object }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLocalizedObjectSize(containerRef);
  return (
    <div ref={containerRef}>
      <ReactJson src={src} name={false} />
    </div>
  );
}

function mountViewer(src: object): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(<Viewer src={src} />));
  return container;
}

describe('useLocalizedObjectSize', () => {
  beforeAll(async () => {
    const zh = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../../public/locales/zh/translation.json'),
        'utf-8',
      ),
    );
    i18n.addResourceBundle('zh', 'translation', zh, true, true);
    await i18n.changeLanguage('zh');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('writes object and array sizes in Chinese', async () => {
    const container = mountViewer({ list: [1, 2], single: [1], empty: [] });
    await vi.waitFor(() =>
      expect(container.querySelector('.object-size')?.textContent).toBe('3 项'),
    );
    const sizes = Array.from(container.querySelectorAll('.object-size')).map(
      (element) => element.textContent,
    );
    expect(sizes).toContain('3 项');
    expect(sizes).toContain('2 项');
    expect(sizes).toContain('1 项');
    expect(sizes).toContain('0 项');
    expect(sizes.some((size) => /items?$/.test(size ?? ''))).toBe(false);
  });
});
