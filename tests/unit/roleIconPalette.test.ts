import { expect, test } from 'vitest';
import { applyAlignmentPalette, sampleAlignmentPalette } from '@/utils/roleIconPalette';

test('uses native evil shades while retaining neutral details and transparency', () => {
  const reference = new Uint8ClampedArray([
    80, 8, 10, 255, 125, 12, 15, 255, 175, 17, 22, 255,
    240, 234, 220, 255, 75, 69, 57, 255,
  ]);
  const pixels = new Uint8ClampedArray([
    0, 85, 140, 255, 0, 115, 180, 255, 0, 145, 220, 255,
    240, 234, 220, 255, 75, 69, 57, 255, 0, 115, 180, 80,
  ]);
  applyAlignmentPalette(pixels, 'evil', sampleAlignmentPalette(reference, 'evil'));
  expect(Array.from(pixels.slice(0, 12))).toEqual(Array.from(reference.slice(0, 12)));
  expect(Array.from(pixels.slice(12, 20))).toEqual(Array.from(reference.slice(12, 20)));
  expect(Array.from(pixels.slice(20))).toEqual([125, 12, 15, 80]);
});

test('can recolor native evil artwork to good without touching existing good pixels', () => {
  const reference = new Uint8ClampedArray([0, 115, 180, 255]);
  const pixels = new Uint8ClampedArray([125, 12, 15, 255, 0, 130, 200, 255]);
  applyAlignmentPalette(pixels, 'good', sampleAlignmentPalette(reference, 'good'));
  expect(Array.from(pixels)).toEqual([0, 115, 180, 255, 0, 130, 200, 255]);
});

test('preserves native evil colors and tolerates artwork without an alignment color', () => {
  const pixels = new Uint8ClampedArray([125, 12, 15, 255, 240, 234, 220, 255]);
  const original = pixels.slice();
  applyAlignmentPalette(pixels, 'evil', [[80, 8, 10]]);
  expect(pixels).toEqual(original);
  applyAlignmentPalette(pixels, 'good', []);
  expect(pixels).toEqual(original);
});
