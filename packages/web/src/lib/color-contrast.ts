export const colorContrast = {
  ratio,
  isReadableOnWhite,
};

function ratio({
  foreground,
  background,
}: {
  foreground: string;
  background: string;
}): number | null {
  const front = luminance(foreground);
  const back = luminance(background);
  if (front === null || back === null) {
    return null;
  }
  const lighter = Math.max(front, back);
  const darker = Math.min(front, back);
  return (lighter + 0.05) / (darker + 0.05);
}

function isReadableOnWhite(color: string): boolean {
  const value = ratio({ foreground: color, background: '#ffffff' });
  return value === null || value >= MIN_UI_CONTRAST;
}

function luminance(hex: string): number | null {
  const channels = parseHex(hex);
  if (channels === null) {
    return null;
  }
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseHex(hex: string): number[] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return null;
  }
  const digits =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : match[1];
  return [0, 2, 4].map((offset) =>
    parseInt(digits.slice(offset, offset + 2), 16),
  );
}

export const MIN_UI_CONTRAST = 3;
