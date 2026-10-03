import { colorContrast } from '@/lib/color-contrast';
import { colorsUtils } from '@/lib/color-utils';

function onDarkSurface({ hex }: { hex: string }): string {
  const { hue, saturation, lightness } = colorsUtils.parseToHsl(hex);
  const candidates = Array.from({ length: MAX_STEPS }, (_, step) =>
    Math.min(1, lightness + step * LIGHTNESS_STEP),
  );
  const readable = candidates
    .map((value) => hslToHex({ hue, saturation, lightness: value }))
    .find(
      (candidate) =>
        (colorContrast.ratio({
          foreground: candidate,
          background: DARK_SURFACE,
        }) ?? 0) >= DARK_TEXT_CONTRAST,
    );
  return readable ?? hex;
}

function readableForeground({ hex }: { hex: string }): string {
  const onLight =
    colorContrast.ratio({ foreground: LIGHT_FOREGROUND, background: hex }) ?? 0;
  const onDark =
    colorContrast.ratio({ foreground: DARK_FOREGROUND, background: hex }) ?? 0;
  return onLight >= TEXT_CONTRAST || onLight >= onDark
    ? LIGHT_FOREGROUND
    : DARK_FOREGROUND;
}

function hslToHex({
  hue,
  saturation,
  lightness,
}: {
  hue: number;
  saturation: number;
  lightness: number;
}): string {
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const position = (offset + hue / 30) % 12;
    const value =
      lightness -
      amplitude *
        Math.max(-1, Math.min(position - 3, Math.min(9 - position, 1)));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const DARK_SURFACE = '#0a0a0a';
const LIGHT_FOREGROUND = '#fafafa';
const DARK_FOREGROUND = '#0a0a0a';
const TEXT_CONTRAST = 4.5;
const DARK_TEXT_CONTRAST = 5.5;
const LIGHTNESS_STEP = 0.02;
const MAX_STEPS = 40;

export const primaryColorUtils = { onDarkSurface, readableForeground };
