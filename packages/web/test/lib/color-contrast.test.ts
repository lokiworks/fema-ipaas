import { describe, expect, it } from 'vitest';

import { colorContrast } from '@/lib/color-contrast';

describe('colorContrast', () => {
  it('computes the WCAG ratio between black and white', () => {
    expect(
      colorContrast.ratio({ foreground: '#000', background: '#ffffff' }),
    ).toBeCloseTo(21, 5);
  });

  it('returns null for colors it cannot parse', () => {
    expect(
      colorContrast.ratio({ foreground: 'teal', background: '#ffffff' }),
    ).toBeNull();
  });

  it('flags light colors as unreadable on white', () => {
    expect(colorContrast.isReadableOnWhite('#ffeb3b')).toBe(false);
    expect(colorContrast.isReadableOnWhite('#1d4ed8')).toBe(true);
  });
});
