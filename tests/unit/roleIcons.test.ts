import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const externalUrl = 'https://example.invalid/washerwoman.png';
let blockedExternal = true;
let unavailableExternal = false;
let stalledExternal = false;
const decoded: string[] = [];

beforeEach(() => {
  vi.resetModules();
  decoded.length = 0;
  blockedExternal = true;
  unavailableExternal = false;
  stalledExternal = false;
  vi.stubGlobal('Image', class {
    src = '';
    crossOrigin = '';
    naturalWidth = 1;
    naturalHeight = 1;
    async decode() {
      decoded.push(this.src);
      if (this.src.startsWith('https:')) {
        if (stalledExternal) await new Promise(() => {});
        if (unavailableExternal) throw new Error('Image unavailable');
        if (blockedExternal && this.crossOrigin === 'anonymous') throw new Error('CORS blocked');
      }
    }
  });
  const sources = new WeakMap<HTMLCanvasElement, string>();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return {
      drawImage: (image: { src: string }) => sources.set(this, image.src),
      getImageData: () => ({ data: new Uint8ClampedArray(
        sources.get(this)?.includes('/imp.png') ? [125, 12, 15, 255] : [0, 115, 180, 255],
      ) }),
      putImageData: vi.fn(),
    } as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    return `data:image/png;source=${sources.get(this)}`;
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('normal alignment preserves the external artwork without a canvas read', async () => {
  const { loadRoleIconUrl } = await import('@/utils/roleIcons');
  expect(await loadRoleIconUrl({ id: 'washerwoman', image: externalUrl }, { allowExternalImage: true, isImageOptIn: true })).toBe(externalUrl);
  expect(decoded).toEqual([externalUrl]);
  expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
});

test.each([
  ['chambermaid_g.webp', 'chambermaid'],
  ['dreamer_g.webp', 'dreamer'],
  ['philosopher_g.webp', 'philosopher'],
  ['villageidiot_g.webp', 'villageidiot'],
  ['mathematician_g.webp', 'mathematician'],
  ['boffin_e.webp', 'boffin'],
])('normal alignment replaces unavailable %s with its original bundled artwork', async (file, asset) => {
  unavailableExternal = true;
  const { loadRoleIconUrl, getRoleIconFilter } = await import('@/utils/roleIcons');
  const role = { id: 'renamed-script-character', imageAlt: 'good', image: `https://example.invalid/${file}` };
  const url = await loadRoleIconUrl(role, { allowExternalImage: true, isImageOptIn: true });
  expect(url).toMatch(new RegExp(`/icons/${asset}\\.png(?:\\?.*)?$`));
  expect(url.startsWith('data:')).toBe(false);
  expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
  expect(getRoleIconFilter(role, url, 'normal-icon')).toBeUndefined();
});

test('normal alignment falls back when an external image never finishes loading', async () => {
  stalledExternal = true;
  const { loadRoleIconUrl } = await import('@/utils/roleIcons');
  vi.useFakeTimers();
  const result = loadRoleIconUrl({ id: 'renamed-role', image: externalUrl }, { allowExternalImage: true, isImageOptIn: true });
  await vi.advanceTimersByTimeAsync(2500);
  expect(await result).toMatch(/\/icons\/washerwoman\.png(?:\?.*)?$/);
});

test.each(['good', 'evil'])('blocked external artwork uses the matching bundled character for %s', async alignment => {
  const { loadRoleIconUrl } = await import('@/utils/roleIcons');
  const url = await loadRoleIconUrl({ id: 'washerwoman', image: externalUrl, alignment }, { allowExternalImage: true, isImageOptIn: true });
  expect(url).toMatch(/^data:image\/png;source=.*\/washerwoman\.png/);
  expect(decoded).toContain(externalUrl);
});

test('readable external artwork keeps its own design when recolored', async () => {
  blockedExternal = false;
  const { loadRoleIconUrl } = await import('@/utils/roleIcons');
  expect(await loadRoleIconUrl({ id: 'washerwoman', image: externalUrl, alignment: 'evil' }, { allowExternalImage: true, isImageOptIn: true }))
    .toBe(`data:image/png;source=${externalUrl}`);
  expect(decoded.some(url => url.includes('/washerwoman.png') && !url.startsWith('https:'))).toBe(false);
});

test('an unknown custom character retains its external image instead of becoming a team placeholder', async () => {
  const { loadRoleIconUrl } = await import('@/utils/roleIcons');
  const customUrl = 'https://example.invalid/custom-art.png';
  expect(await loadRoleIconUrl({ id: 'unknown-custom-role', imageAlt: 'good', team: 'townsfolk', image: customUrl, alignment: 'evil' }, { allowExternalImage: true, isImageOptIn: true })).toBe(customUrl);
});

test('renamed script roles resolve their image filename instead of the generic team imageAlt', async () => {
  const { loadRoleIconUrl } = await import('@/utils/roleIcons');
  const url = await loadRoleIconUrl({ id: 'renamed-script-character111', imageAlt: 'good', image: `${externalUrl}?version=1`, alignment: 'evil' }, { allowExternalImage: true, isImageOptIn: true });
  expect(url).toMatch(/^data:image\/png;source=.*\/washerwoman\.png/);
  expect(decoded.some(source => source.includes('/good.png'))).toBe(false);
});

test.each([
  ['https://example.invalid/fortune_teller.png', 'fortuneteller'],
  ['https://example.invalid/high_priestess.png', 'highpriestess'],
  ['https://example.invalid/archive/20250103031516%21Wizard.png', 'wizard'],
  ['https://example.invalid/thumb/Townsfolk.png/120px-Townsfolk.png', 'townsfolks'],
  ['https://example.invalid/chambermaid_g.webp', 'chambermaid'],
  ['https://example.invalid/boffin_e.webp', 'boffin'],
])('imported artwork filename %s finds the corresponding bundled icon', async (image, asset) => {
  const { loadRoleIconUrl } = await import('@/utils/roleIcons');
  const url = await loadRoleIconUrl({ id: 'renamed-role', imageAlt: 'good', image, alignment: 'evil' }, { allowExternalImage: true, isImageOptIn: true });
  expect(url).toContain(`/icons/${asset}.png`);
  expect(url.startsWith('data:image/png;')).toBe(true);
});

test.each(['good', 'evil'])('unreadable custom artwork gets a display filter for %s without losing its design', async alignment => {
  const { loadRoleIconUrl, getRoleIconFilter } = await import('@/utils/roleIcons');
  const role = { id: 'original-custom-character', image: 'https://example.invalid/custom.jpg', alignment };
  const url = await loadRoleIconUrl(role, { allowExternalImage: true, isImageOptIn: true });
  expect(url).toBe(role.image);
  expect(getRoleIconFilter(role, url, 'unique-icon')).toBe('url("#unique-icon")');
  expect(getRoleIconFilter({ ...role, alignment: undefined }, url, 'unique-icon')).toBeUndefined();
  expect(getRoleIconFilter(role, 'data:image/png;base64,converted', 'unique-icon')).toBeUndefined();
});

test('external image permission remains required when an alignment is selected', async () => {
  const { loadRoleIconUrl } = await import('@/utils/roleIcons');
  expect(await loadRoleIconUrl({ id: 'washerwoman', image: externalUrl, alignment: 'evil' }, { allowExternalImage: true, isImageOptIn: false }))
    .toMatch(/^data:image\/png;source=.*\/washerwoman\.png/);
  expect(decoded).not.toContain(externalUrl);
});
