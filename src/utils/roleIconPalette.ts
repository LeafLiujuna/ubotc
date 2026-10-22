type Alignment = 'good' | 'evil';
type Color = [number, number, number];

function matches(r: number, g: number, b: number, alignment: Alignment): boolean {
  return alignment === 'evil'
    ? r > g * 1.8 && r > b * 1.8 && r - g > 30
    : b > r * 1.25 && b > g * 1.05 && b - r > 30;
}

/** Sample the actual artwork, including its texture's light and dark shades. */
export function sampleAlignmentPalette(pixels: Uint8ClampedArray, alignment: Alignment): Color[] {
  const colors: Color[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, a] = pixels.subarray(i, i + 4);
    if (a > 200 && matches(r, g, b, alignment)) colors.push([r, g, b]);
  }
  return colors.sort((a, b) => Math.max(...a) - Math.max(...b));
}

/** Match the opposite alignment to the native palette by texture brightness. */
export function applyAlignmentPalette(pixels: Uint8ClampedArray, alignment: Alignment, palette: Color[]): void {
  if (!palette.length) return;
  const source = alignment === 'evil' ? 'good' : 'evil';
  const histogram = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, a] = pixels.subarray(i, i + 4);
    if (a > 200 && matches(r, g, b, source)) {
      histogram[Math.max(r, g, b)]++;
      total++;
    }
  }
  if (!total) return;
  const lookup: Color[] = [];
  let cumulative = 0;
  for (let value = 0; value < 256; value++) {
    const rank = (cumulative + histogram[value] / 2) / total;
    lookup[value] = palette[Math.min(palette.length - 1, Math.floor(rank * palette.length))];
    cumulative += histogram[value];
  }
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, a] = pixels.subarray(i, i + 4);
    if (a && matches(r, g, b, source)) pixels.set(lookup[Math.max(r, g, b)], i);
  }
}
