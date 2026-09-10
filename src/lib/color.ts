import Color from 'colorjs.io';
export type RGB = [number, number, number];
export const isRGB = (rgb: unknown): rgb is RGB =>
  Array.isArray(rgb) &&
  rgb.length === 3 &&
  rgb.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
export function toHex(rgb: RGB): string {
  return (
    '#' +
    rgb
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}
export function fromHex(value: string): RGB | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  return [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16)) as RGB;
}
export function colorDifference(target: RGB, guess: RGB): number {
  if (!isRGB(target) || !isRGB(guess))
    throw new RangeError('RGB channels must be integers between 0 and 255.');
  return new Color(
    'srgb',
    target.map((v) => v / 255) as [number, number, number],
  ).deltaE(
    new Color('srgb', guess.map((v) => v / 255) as [number, number, number]),
    '2000',
  );
}
export function scoreColor(target: RGB, guess: RGB): number {
  const difference = colorDifference(target, guess);
  if (target.every((v, i) => v === guess[i])) return 100;
  return Math.min(
    99,
    Math.max(0, Math.round(100 * Math.exp(-difference / 32))),
  );
}
export function randomColor(random: () => number = Math.random): RGB {
  const hue = random() * 6;
  const saturation = 0.3 + random() * 0.6;
  const value = 0.45 + random() * 0.5;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const m = value - chroma;
  const sectors = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ];
  return sectors[Math.min(5, Math.floor(hue))].map((c) =>
    Math.round((c + m) * 255),
  ) as RGB;
}
