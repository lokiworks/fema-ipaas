import { describe, expect, it } from 'vitest';

import { colorContrast } from '@/lib/color-contrast';
import { primaryColorUtils } from '@/lib/primary-color-utils';

describe('primaryColorUtils.onDarkSurface', () => {
  it('lightens a brand color until it is readable as text on a dark surface', () => {
    const adjusted = primaryColorUtils.onDarkSurface({ hex: '#2d6cdf' });
    expect(adjusted).not.toBe('#2d6cdf');
    expect(
      colorContrast.ratio({ foreground: adjusted, background: '#0a0a0a' }),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a color that is already readable', () => {
    expect(primaryColorUtils.onDarkSurface({ hex: '#93c5fd' })).toBe('#93c5fd');
  });
});

describe('primaryColorUtils.readableForeground', () => {
  it('uses light text on a dark brand color and dark text on a light one', () => {
    expect(primaryColorUtils.readableForeground({ hex: '#1d4ed8' })).toBe(
      '#fafafa',
    );
    expect(primaryColorUtils.readableForeground({ hex: '#fde047' })).toBe(
      '#0a0a0a',
    );
  });
});
