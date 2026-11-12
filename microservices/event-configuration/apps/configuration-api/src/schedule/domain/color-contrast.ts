const WHITE_LUMINANCE = 1;

export function contrastRatioAgainstWhite(hexColor: string): number {
  const normalized = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return 0;

  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (WHITE_LUMINANCE + 0.05) / (luminance + 0.05);
}

export function hasAccessibleContrast(hexColor: string): boolean {
  return contrastRatioAgainstWhite(hexColor) >= 4.5;
}
